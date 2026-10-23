import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, CreditCard } from "lucide-react";

export function PayApiPicker({ kind, value, onChange, onLoaded }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/pay-apis", { params: { kind } }).then((r) => {
      setData(r.data);
      onChange(r.data.default_id || r.data.apis[0]?.id || null);
      if (onLoaded) onLoaded(r.data);
    }).catch(() => setData({ apis: [], country_enabled: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  if (!data || data.apis.length === 0) return null;
  return (
    <div className="space-y-2" data-testid={`pay-api-picker-${kind.toLowerCase()}`}>
      <div className="text-sm font-medium">{kind === "PAYMENT" ? "Moyen de paiement" : "Service de retrait"}</div>
      {data.apis.map((a) => (
        <label key={a.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${value === a.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
          data-testid={`pay-api-option-${a.id}`}>
          <input type="radio" name={`pay-api-${kind}`} checked={value === a.id} onChange={() => onChange(a.id)} className="accent-current" />
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm flex-1">{a.name}{a.provider ? <span className="text-muted-foreground"> · {a.provider}</span> : null}</span>
          {a.is_default && <span className="text-[10px] uppercase tracking-wide bg-secondary px-2 py-0.5 rounded-full">Par défaut</span>}
          {a.mode === "TEST" && <span className="text-[10px] uppercase tracking-wide text-amber-700">Test</span>}
        </label>
      ))}
    </div>
  );
}

export function CountryDisabledBanner() {
  const { user } = useAuth();
  const [off, setOff] = useState([]);
  useEffect(() => {
    if (!user?.country) { return; }
    api.get("/config/disabled-countries").then((r) => setOff(r.data.countries)).catch(() => {});
  }, [user?.country]);
  if (!user?.country || !off.includes(user.country)) return null;
  return (
    <div className="bg-amber-100 text-amber-900 border-b border-amber-300 px-4 py-2 text-sm flex items-center gap-2 justify-center" data-testid="country-disabled-banner">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      Le service est temporairement suspendu dans votre pays ({user.country}) : boutiques, commandes, paiements et retraits sont indisponibles.
    </div>
  );
}
