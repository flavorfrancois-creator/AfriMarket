import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { useAuth } from "@/context/AuthContext";

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const { user } = useAuth();
  const [fx, setFx] = useState(null);
  const [visitorCurrency, setVisitorCurrencyState] = useState(() => localStorage.getItem("am_currency") || "");
  useEffect(() => {
    api.get("/fx/rates").then((r) => setFx(r.data)).catch(() => setFx(null));
  }, []);
  const setVisitorCurrency = useCallback((c) => {
    setVisitorCurrencyState(c);
    if (c) localStorage.setItem("am_currency", c); else localStorage.removeItem("am_currency");
  }, []);
  const target = user?.currency || (!user ? visitorCurrency : "");
  const convert = useCallback((amount, from) => {
    const rates = fx?.rates;
    if (!target || !from || from === target || !rates?.[from] || !rates?.[target]) return { amount: Number(amount || 0), currency: from };
    return { amount: Number(amount || 0) * (rates[target] / rates[from]), currency: target };
  }, [fx, target]);
  const fmt = useCallback((amount, from) => {
    const c = convert(amount, from);
    return formatMoney(c.amount, c.currency);
  }, [convert]);
  return (
    <CurrencyContext.Provider value={{ target, convert, fmt, updatedAt: fx?.updated_at, visitorCurrency, setVisitorCurrency, rates: fx?.rates }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useFx = () => useContext(CurrencyContext);
