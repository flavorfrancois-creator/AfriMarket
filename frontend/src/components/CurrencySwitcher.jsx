import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useFx } from "@/context/CurrencyContext";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Coins } from "lucide-react";

export function CurrencySwitcher() {
  const { visitorCurrency, setVisitorCurrency, rates } = useFx();
  const [currencies, setCurrencies] = useState([]);
  useEffect(() => {
    api.get("/config/currencies").then((r) => setCurrencies(r.data.currencies || [])).catch(() => {});
  }, []);
  const list = currencies.filter((c) => !rates || rates[c.code]);
  return (
    <Select value={visitorCurrency || "SHOP"} onValueChange={(v) => setVisitorCurrency(v === "SHOP" ? "" : v)}>
      <SelectTrigger className="h-9 w-auto gap-1 rounded-full border-border px-3 text-xs font-medium" data-testid="currency-switcher">
        <Coins className="w-3.5 h-3.5 text-primary" />
        <span>{visitorCurrency || "Devise"}</span>
      </SelectTrigger>
      <SelectContent className="max-h-72" align="end">
        <SelectItem value="SHOP" data-testid="currency-option-shop">Devise boutique</SelectItem>
        {list.map((c) => (
          <SelectItem key={c.code} value={c.code} data-testid={`currency-option-${c.code}`}>{c.code} — {c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
