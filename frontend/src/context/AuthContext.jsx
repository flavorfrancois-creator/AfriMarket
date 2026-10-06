import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anon, obj = authed
  const [token, setToken] = useState(localStorage.getItem("am_token") || null);
  const [userLocation, setUserLocation] = useState(null);

  const detectLocation = useCallback(async () => {
    try {
      const { data } = await api.get("/location/detect");
      if (data.country) {
        setUserLocation(data);
        if (user && user.id) {
          try {
            await api.post("/location/set", data);
          } catch (e) {
            console.error("Failed to save location:", e);
          }
        }
      }
    } catch (e) {
      console.error("Geolocation detection failed:", e);
    }
  }, [user]);

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem("am_token");
    if (!t) {
      setUser(false);
      await detectLocation();
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      if (data.user?.location) {
        setUserLocation(data.user.location);
      } else {
        await detectLocation();
      }
    } catch {
      localStorage.removeItem("am_token");
      setToken(null);
      setUser(false);
      await detectLocation();
    }
  }, [detectLocation]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = (tok, u) => {
    localStorage.setItem("am_token", tok);
    setToken(tok);
    setUser(u);
    if (u?.location) {
      setUserLocation(u.location);
    } else {
      detectLocation();
    }
  };

  const logout = () => {
    localStorage.removeItem("am_token");
    setToken(null);
    setUser(false);
  };

  const refresh = loadMe;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refresh, setUser, userLocation, setUserLocation, detectLocation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
