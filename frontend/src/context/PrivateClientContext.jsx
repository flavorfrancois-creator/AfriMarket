import React, { createContext, useContext, useState, useCallback } from "react";

const PrivateClientContext = createContext(null);

export function PrivateClientProvider({ children }) {
  const [client, setClientState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("am_private_client") || "null");
    } catch {
      return null;
    }
  });

  const setClient = useCallback((c) => {
    setClientState(c);
    if (c) localStorage.setItem("am_private_client", JSON.stringify(c));
    else localStorage.removeItem("am_private_client");
  }, []);

  const clear = useCallback(() => setClient(null), [setClient]);

  return (
    <PrivateClientContext.Provider value={{ client, setClient, clear, active: !!client }}>
      {children}
    </PrivateClientContext.Provider>
  );
}

export function usePrivateClient() {
  return useContext(PrivateClientContext);
}
