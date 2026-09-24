import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anon, obj = authed
  const [token, setToken] = useState(localStorage.getItem("am_token") || null);

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem("am_token");
    if (!t) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      localStorage.removeItem("am_token");
      setToken(null);
      setUser(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = (tok, u) => {
    localStorage.setItem("am_token", tok);
    setToken(tok);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("am_token");
    setToken(null);
    setUser(false);
  };

  const refresh = loadMe;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
