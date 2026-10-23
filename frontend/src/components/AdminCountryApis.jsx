import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2, Star, Lock } from "lucide-react";

const KIND_LABELS = { PAYMENT: "Paiement", WITHDRAWAL: "Retrait", BOTH: "Paiement + retrait" };
const EMPTY = { name: "", provider: "", kind: "BOTH", mode: "TEST", api_url: "", merchant_id: "", api_key: "", secret_key: "", countries: [] };

function ApiForm({ initial, global, countries, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, api_key: "", secret_key: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const toggleCountry = (c) => setF({ ...f, countries: f.countries.includes(c) ? f.countries.filter((x) => x !== c) : [...f.countries, c] });
  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-accent/20" data-testid="pay-api-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label className="text-xs">Nom affiché</Label><Input value={f.name} onChange={set("name")} className="mt-1" data-testid="pay-api-name" placeholder="Ex. Orange Money" /></div>
        <div><Label className="text-xs">Fournisseur</Label><Input value={f.provider} onChange={set("provider")} className="mt-1" data-testid="pay-api-provider" /></div>
        <div><Label className="text-xs">Type</Label>
          <Select value={f.kind} onValueChange={set("kind")}>
            <SelectTrigger className="mt-1" data-testid="pay-api-kind"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Mode</Label>
          <Select value={f.mode} onValueChange={set("mode")}>
            <SelectTrigger className="mt-1" data-testid="pay-api-mode"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TEST">Test</SelectItem><SelectItem value="LIVE">Production</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">URL de l'API</Label><Input value={f.api_url} onChange={set("api_url")} className="mt-1" data-testid="pay-api-url" placeholder="https://..." /></div>
        <div><Label className="text-xs">Identifiant marchand</Label><Input value={f.merchant_id} onChange={set("merchant_id")} className="mt-1" data-testid="pay-api-merchant" /></div>
        <div><Label className="text-xs">Clé API {initial?.api_key_masked && <span className="text-muted-foreground">({initial.api_key_masked})</span>}</Label>
          <Input type="password" autoComplete="new-password" value={f.api_key} onChange={set("api_key")} className="mt-1" data-testid="pay-api-key" placeholder={initial?.api_key_masked ? "Laisser vide pour conserver" : ""} /></div>
        <div><Label className="text-xs">Clé secrète {initial?.secret_key_masked && <span className="text-muted-foreground">({initial.secret_key_masked})</span>}</Label>
          <Input type="password" autoComplete="new-password" value={f.secret_key} onChange={set("secret_key")} className="mt-1" data-testid="pay-api-secret" placeholder={initial?.secret_key_masked ? "Laisser vide pour conserver" : ""} /></div>
      </div>
      {global && (
        <div>
          <Label className="text-xs">Pays où cette API est utilisée par défaut ({f.countries.length})</Label>
          <div className="mt-1 max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1 border border-border rounded-md p-2 bg-background" data-testid="pay-api-countries">
            {countries.map((c) => (
              <label key={c.name} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={f.countries.includes(c.name)} onCheckedChange={() => toggleCountry(c.name)} data-testid={`pay-api-country-${c.name}`} />{c.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="pay-api-cancel">Annuler</Button>
        <Button size="sm" onClick={() => onSave(f)} data-testid="pay-api-save">Enregistrer</Button>
      </div>
    </div>
  );
}

function ApiRow({ a, canEdit, onEdit, onToggle, onDelete }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 text-sm" data-testid={`pay-api-row-${a.id}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{a.name} {a.provider && <span className="text-muted-foreground font-normal">· {a.provider}</span>}</div>
        <div className="text-xs text-muted-foreground">{KIND_LABELS[a.kind]} · {a.mode === "LIVE" ? "Production" : "Test"}{a.api_key_masked ? ` · clé ${a.api_key_masked}` : ""}{a.secret_key_masked ? ` · secret ${a.secret_key_masked}` : ""}</div>
        {a.scope === "GLOBAL" && <div className="text-xs text-muted-foreground truncate">{(a.countries || []).length} pays : {(a.countries || []).join(", ") || "aucun"}</div>}
      </div>
      {canEdit ? (
        <>
          <Switch checked={!!a.active} onCheckedChange={onToggle} data-testid={`pay-api-active-${a.id}`} />
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`pay-api-edit-${a.id}`}><Pencil className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`pay-api-delete-${a.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </>
      ) : <Badge variant="secondary">{a.active ? "Active" : "Inactive"}</Badge>}
    </div>
  );
}

function ApiList({ apis, max, canEdit, global, countries, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null);
  const save = async (f) => {
    const ok = editing === "new" ? await onCreate(f) : await onUpdate(editing.id, f);
    if (ok) setEditing(null);
  };
  return (
    <div>
      {apis.length === 0 && <p className="text-sm text-muted-foreground py-2">Aucune API configurée.</p>}
      {apis.map((a) => editing?.id === a.id
        ? <ApiForm key={a.id} initial={a} global={global} countries={countries} onSave={save} onCancel={() => setEditing(null)} />
        : <ApiRow key={a.id} a={a} canEdit={canEdit} onEdit={() => setEditing(a)} onToggle={(v) => onUpdate(a.id, { active: v })} onDelete={() => onDelete(a.id)} />)}
      {canEdit && (editing === "new"
        ? <div className="mt-3"><ApiForm global={global} countries={countries} onSave={save} onCancel={() => setEditing(null)} /></div>
        : <Button size="sm" variant="outline" className="mt-3 rounded-full" disabled={max != null && apis.length >= max} onClick={() => setEditing("new")} data-testid="pay-api-add-btn">
            <Plus className="w-4 h-4 mr-1" />Ajouter une API {max != null && `(${apis.length}/${max})`}
          </Button>)}
    </div>
  );
}

const call = async (fn, msg) => {
  try { await fn(); toast.success(msg); return true; } catch (e) { toast.error(apiErr(e)); return false; }
};

function CountryApisDialog({ country, onClose, reload }) {
  const [apis, setApis] = useState([]);
  const load = () => api.get(`/admin/countries/${encodeURIComponent(country.name)}/pay-apis`).then((r) => setApis(r.data.apis)).catch(() => setApis([]));
  useEffect(() => { load(); }, [country.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = (ok) => { if (ok) { load(); reload(); } return ok; };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="country-apis-dialog">
        <DialogHeader><DialogTitle>API financières — {country.name} ({country.currency})</DialogTitle></DialogHeader>
        {!country.enabled && <p className="text-xs bg-amber-100 text-amber-900 rounded-md px-3 py-2">Pays désactivé : les API sont conservées mais suspendues.</p>}
        <ApiList apis={apis} max={15} canEdit
          onCreate={async (f) => after(await call(() => api.post(`/admin/countries/${encodeURIComponent(country.name)}/pay-apis`, f), "API ajoutée"))}
          onUpdate={async (id, f) => after(await call(() => api.put(`/admin/pay-apis/${id}`, f), "API mise à jour"))}
          onDelete={async (id) => { if (window.confirm("Supprimer cette API ?")) after(await call(() => api.delete(`/admin/pay-apis/${id}`), "API supprimée")); }} />
      </DialogContent>
    </Dialog>
  );
}

function GlobalApis({ data, reload }) {
  const can = data.can_manage_global;
  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid="global-pay-apis">
      <div className="flex items-center gap-2 mb-1"><Star className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">API générales par défaut</h3>
        {!can && <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" />Réservé au super-administrateur</span>}</div>
      <p className="text-xs text-muted-foreground mb-3">Proposées et présélectionnées dans les pays choisis, en plus des API propres au pays.</p>
      <ApiList apis={data.global_apis} canEdit={can} global countries={data.countries}
        onCreate={async (f) => (await call(() => api.post("/admin/global-pay-apis", f), "API générale ajoutée")) && (reload() || true)}
        onUpdate={async (id, f) => (await call(() => api.put(`/admin/pay-apis/${id}`, f), "API mise à jour")) && (reload() || true)}
        onDelete={async (id) => { if (window.confirm("Supprimer cette API générale ?") && await call(() => api.delete(`/admin/pay-apis/${id}`), "API supprimée")) reload(); }} />
    </div>
  );
}

export function AdminCountryApis() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const load = () => api.get("/admin/countries/overview").then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const toggle = (c, v) => call(() => api.put(`/admin/countries/${encodeURIComponent(c.name)}/status`, { enabled: v }), v ? `${c.name} activé` : `${c.name} désactivé`).then(load);
  const rows = data.countries.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const off = data.countries.filter((c) => !c.enabled).length;
  return (
    <div className="space-y-6">
      <GlobalApis data={data} reload={load} />
      <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="countries-table">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 justify-between">
          <div className="font-display font-bold">Pays, statut et API financières <span className="text-xs font-normal text-muted-foreground">({off} désactivé{off > 1 ? "s" : ""})</span></div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pays" className="max-w-xs h-9" data-testid="countries-search" />
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Pays</TableHead><TableHead>Devise</TableHead><TableHead>API (actives/total)</TableHead><TableHead>Par défaut</TableHead><TableHead className="text-center">Actif</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((c) => (
              <TableRow key={c.name} className={c.enabled ? "" : "opacity-60"} data-testid={`country-row-${c.name}`}>
                <TableCell className="text-sm font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-sm">{c.currency}</TableCell>
                <TableCell className="text-sm" data-testid={`country-api-count-${c.name}`}>{c.api_active}/{c.api_total}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{c.default_apis.join(", ") || "—"}</TableCell>
                <TableCell className="text-center"><Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} data-testid={`country-toggle-${c.name}`} /></TableCell>
                <TableCell><Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(c)} data-testid={`country-apis-btn-${c.name}`}>Gérer les API</Button></TableCell>
              </TableRow>))}
            </TableBody>
          </Table>
        </div>
      </div>
      {open && <CountryApisDialog country={data.countries.find((c) => c.name === open.name) || open} onClose={() => setOpen(null)} reload={load} />}
    </div>
  );
}
