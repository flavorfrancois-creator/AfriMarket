import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2, RefreshCw, Trash2, Truck } from "lucide-react";

const INTL_FIELDS = [
  ["intl_shipping_base", "Forfait de base"],
  ["intl_shipping_per_kg", "Par kg"],
  ["intl_shipping_per_km", "Par km"],
  ["intl_default_weight_kg", "Poids par défaut (kg)"],
];

function FxStatus() {
  const [info, setInfo] = useState(null);
  const load = () => api.get("/fx/rates").then((r) => setInfo(r.data)).catch(() => setInfo(null));
  useEffect(() => { load(); }, []);
  const refresh = async () => {
    try { await api.post("/admin/fx/refresh"); toast.success("Taux de change actualisés"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 text-sm" data-testid="fx-status">
      <span className="text-muted-foreground">
        Taux ExchangeRate-API : {info ? <>{Object.keys(info.rates).length} devises, mis à jour le <strong>{new Date(info.updated_at).toLocaleString("fr-FR")}</strong></> : "indisponibles"}
      </span>
      <Button size="sm" variant="outline" className="rounded-full" onClick={refresh} data-testid="fx-refresh"><RefreshCw className="w-3 h-3 mr-1" /> Actualiser</Button>
    </div>
  );
}

function TransportSettings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data.settings)).catch(() => {}); }, []);
  if (!s) return null;
  const save = async () => {
    const payload = { intl_shipping_currency: s.intl_shipping_currency, customs_enabled: !!s.customs_enabled };
    INTL_FIELDS.forEach(([k]) => { payload[k] = parseFloat(s[k]) || 0; });
    try { await api.put("/admin/settings", payload); toast.success("Tarifs transport international enregistrés"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="border border-border rounded-lg p-4" data-testid="intl-transport">
      <div className="font-medium text-sm flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-primary" /> Transport international (pays boutique ≠ pays client)</div>
      <p className="text-xs text-muted-foreground mb-3">Frais = forfait + (par kg × poids des articles) + (par km × distance entre pays). En national, les frais de livraison saisis par le commerçant restent appliqués.</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div><Label className="text-xs">Devise des tarifs</Label><Input className="mt-1" value={s.intl_shipping_currency || ""} onChange={(e) => setS({ ...s, intl_shipping_currency: e.target.value.toUpperCase() })} data-testid="intl-currency" /></div>
        {INTL_FIELDS.map(([k, l]) => (
          <div key={k}><Label className="text-xs">{l}</Label><Input className="mt-1" type="number" step="any" value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} data-testid={`intl-${k}`} /></div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!s.customs_enabled} onCheckedChange={(v) => setS({ ...s, customs_enabled: v })} data-testid="customs-enabled-toggle" /> Frais de douane activés</label>
        <Button className="rounded-full" onClick={save} data-testid="intl-save">Enregistrer</Button>
      </div>
    </div>
  );
}

function CustomsRules({ countries }) {
  const [rules, setRules] = useState([]);
  const [nr, setNr] = useState({ country: "", rate_percent: "" });
  const load = () => api.get("/admin/customs").then((r) => setRules(r.data.rules)).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!nr.country || nr.rate_percent === "") { toast.error("Pays et taux requis"); return; }
    try { await api.post("/admin/customs", { country: nr.country, rate_percent: parseFloat(nr.rate_percent) }); setNr({ country: "", rate_percent: "" }); toast.success("Taux de douane ajouté"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const upd = async (id, patch) => { try { await api.put(`/admin/customs/${id}`, patch); load(); } catch (e) { toast.error(apiErr(e)); } };
  const del = async (id) => { try { await api.delete(`/admin/customs/${id}`); load(); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="border border-border rounded-lg p-4" data-testid="customs-rules">
      <div className="font-medium text-sm mb-1">Frais de douane par pays de destination</div>
      <p className="text-xs text-muted-foreground mb-3">Pourcentage appliqué au montant des articles quand la boutique est dans un autre pays. Collectés par la plateforme, hors commission vendeur.</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end mb-3">
        <div className="md:col-span-2">
          <Select value={nr.country} onValueChange={(v) => setNr({ ...nr, country: v })}>
            <SelectTrigger data-testid="customs-new-country"><SelectValue placeholder="Pays de destination" /></SelectTrigger>
            <SelectContent className="max-h-64">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input type="number" placeholder="Taux (%)" value={nr.rate_percent} onChange={(e) => setNr({ ...nr, rate_percent: e.target.value })} data-testid="customs-new-rate" />
        <Button className="rounded-full" onClick={add} data-testid="customs-add">Ajouter</Button>
      </div>
      {rules.length === 0 ? <div className="text-xs text-muted-foreground" data-testid="customs-empty">Aucun taux : pas de frais de douane.</div> : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm" data-testid={`customs-row-${r.id}`}>
              <span className="flex-1">{r.country}</span>
              <Input type="number" className="w-24 h-8" defaultValue={r.rate_percent} onBlur={(e) => upd(r.id, { rate_percent: parseFloat(e.target.value) || 0 })} data-testid={`customs-rate-${r.id}`} />
              <span>%</span>
              <Switch checked={r.enabled} onCheckedChange={(v) => upd(r.id, { enabled: v })} data-testid={`customs-toggle-${r.id}`} />
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del(r.id)} data-testid={`customs-del-${r.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrossBorderSettings({ countries }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="cross-border-settings">
      <h3 className="font-display font-bold flex items-center gap-2"><Globe2 className="w-4 h-4 text-primary" /> Devises, transport international & douane</h3>
      <FxStatus />
      <TransportSettings />
      <CustomsRules countries={countries} />
    </div>
  );
}
