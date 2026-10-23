import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Check, X, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const POINT_FIELDS = [["name", "Nom"], ["code", "Code"], ["city", "Ville"], ["address", "Adresse"], ["phone", "Téléphone"], ["opening_hours", "Horaires"], ["lat", "Latitude"], ["lon", "Longitude"]];
const MODES = [["NONE", "Aucune modification"], ["APPROVAL", "Avec validation admin"], ["DIRECT", "Modification directe"]];
const ROLE_LABEL = { RELAY_MANAGER: "Point relais", CARRIER_AGENT: "Transporteur" };

function CountrySelect({ value, onChange, countries, testid }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger data-testid={testid}><SelectValue placeholder="Pays" /></SelectTrigger>
      <SelectContent className="max-h-64">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function PointDialog({ point, countries, onClose, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { setF(point || {}); }, [point]);
  if (!point) return null;
  const save = async () => {
    const payload = { ...f };
    ["lat", "lon"].forEach((k) => { payload[k] = payload[k] === "" || payload[k] == null ? null : parseFloat(payload[k]); });
    try {
      if (point.id) await api.put(`/admin/relay-points/${point.id}`, payload); else await api.post("/admin/relay-points", payload);
      toast.success("Point relais enregistré"); onSaved(); onClose();
    } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <Dialog open={!!point} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{point.id ? "Modifier le point relais" : "Nouveau point relais"}</DialogTitle><DialogDescription>Nom, ville et pays sont obligatoires.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><Label className="text-xs">Pays</Label><CountrySelect value={f.country} onChange={(v) => setF({ ...f, country: v })} countries={countries} testid="point-country" /></div>
          {POINT_FIELDS.map(([k, l]) => (
            <div key={k}><Label className="text-xs">{l}</Label><Input className="mt-1" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`point-${k}`} /></div>
          ))}
        </div>
        <Button className="rounded-full mt-2" onClick={save} data-testid="point-save">Enregistrer</Button>
      </DialogContent>
    </Dialog>
  );
}

function PointsTab({ points, countries, reload }) {
  const [edit, setEdit] = useState(null);
  const del = async (p) => {
    if (!window.confirm(`Supprimer le point relais « ${p.name} » ?`)) return;
    try { await api.delete(`/admin/relay-points/${p.id}`); toast.success("Point relais supprimé"); reload(); } catch (e) { toast.error(apiErr(e)); }
  };
  const toggle = async (p, v) => { try { await api.put(`/admin/relay-points/${p.id}`, { active: v }); reload(); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="space-y-3">
      <Button className="rounded-full" onClick={() => setEdit({})} data-testid="point-add"><Plus className="w-4 h-4 mr-1" /> Ajouter un point relais</Button>
      {points.map((p) => (
        <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3" data-testid={`admin-point-${p.id}`}>
          <div className="flex-1 text-sm">
            <div className="font-semibold">{p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span></div>
            <div className="text-xs text-muted-foreground">{p.address} — {p.city}, {p.country}</div>
          </div>
          <Switch checked={p.active !== false} onCheckedChange={(v) => toggle(p, v)} data-testid={`admin-point-toggle-${p.id}`} />
          <Button size="icon" variant="ghost" onClick={() => setEdit(p)} data-testid={`admin-point-edit-${p.id}`}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p)} data-testid={`admin-point-del-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <PointDialog point={edit} countries={countries} onClose={() => setEdit(null)} onSaved={reload} />
    </div>
  );
}

function NewAccountForm({ points, carriers, countries, onCreated }) {
  const [f, setF] = useState({ role: "RELAY_MANAGER", relay_edit_mode: "NONE" });
  const create = async () => {
    try { await api.post("/admin/logistics/accounts", f); toast.success("Compte créé"); setF({ role: "RELAY_MANAGER", relay_edit_mode: "NONE" }); onCreated(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2 items-end" data-testid="partner-create-form">
      <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
        <SelectTrigger data-testid="partner-new-role"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="RELAY_MANAGER">Gestionnaire point relais</SelectItem><SelectItem value="CARRIER_AGENT">Transporteur</SelectItem></SelectContent>
      </Select>
      <Input placeholder="Nom" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="partner-new-name" />
      <Input placeholder="E-mail" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="partner-new-email" />
      <Input placeholder="Mot de passe" type="password" value={f.password || ""} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="partner-new-password" />
      <Input placeholder="Téléphone" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="partner-new-phone" />
      <CountrySelect value={f.country} onChange={(v) => setF({ ...f, country: v })} countries={countries} testid="partner-new-country" />
      {f.role === "RELAY_MANAGER" ? (
        <Select value={f.relay_point_id || ""} onValueChange={(v) => setF({ ...f, relay_point_id: v })}>
          <SelectTrigger data-testid="partner-new-point"><SelectValue placeholder="Point relais" /></SelectTrigger>
          <SelectContent>{points.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.city}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Select value={f.carrier_id || ""} onValueChange={(v) => setF({ ...f, carrier_id: v })}>
          <SelectTrigger data-testid="partner-new-carrier"><SelectValue placeholder="Transporteur" /></SelectTrigger>
          <SelectContent>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Button className="rounded-full" onClick={create} data-testid="partner-new-submit">Créer le compte</Button>
    </div>
  );
}

function AccountRow({ a, points, carriers, reload }) {
  const upd = async (patch, msg) => {
    try { await api.put(`/admin/logistics/accounts/${a.id}`, patch); if (msg) toast.success(msg); reload(); } catch (e) { toast.error(apiErr(e)); }
  };
  const link = a.role === "RELAY_MANAGER" ? points.find((p) => p.id === a.relay_point_id)?.name : carriers.find((c) => c.id === a.carrier_id)?.name;
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2" data-testid={`partner-account-${a.id}`}>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="text-sm">
          <span className="font-semibold">{a.name}</span> <span className="text-xs text-muted-foreground">{a.email} · {ROLE_LABEL[a.role]}</span>
          <div className="text-xs">Rattaché à : <strong>{link || "—"}</strong>{a.proposed_relay && !a.relay_point_id && <> · Proposé : {a.proposed_relay.name} ({a.proposed_relay.city})</>}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "ACTIVE" ? "bg-green-100 text-green-800" : a.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-gray-100"}`} data-testid={`partner-status-${a.id}`}>{a.status}</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {a.status === "PENDING" && (
          <>
            <Button size="sm" className="rounded-full" onClick={() => upd({ status: "ACTIVE", create_proposed_point: !!a.proposed_relay && !a.relay_point_id }, "Compte validé")} data-testid={`partner-approve-${a.id}`}><Check className="w-3.5 h-3.5 mr-1" /> Valider</Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => upd({ status: "REJECTED" }, "Inscription refusée")} data-testid={`partner-reject-${a.id}`}><X className="w-3.5 h-3.5 mr-1" /> Refuser</Button>
          </>
        )}
        {a.status === "ACTIVE" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => upd({ status: "SUSPENDED" }, "Compte suspendu")} data-testid={`partner-suspend-${a.id}`}>Suspendre</Button>}
        {a.status === "SUSPENDED" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => upd({ status: "ACTIVE" }, "Compte réactivé")} data-testid={`partner-reactivate-${a.id}`}>Réactiver</Button>}
        <Select value={a.relay_edit_mode || "NONE"} onValueChange={(v) => upd({ relay_edit_mode: v }, "Autorisation mise à jour")}>
          <SelectTrigger className="w-56 h-8 text-xs" data-testid={`partner-mode-${a.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>{MODES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {a.role === "RELAY_MANAGER" ? (
          <Select value={a.relay_point_id || ""} onValueChange={(v) => upd({ relay_point_id: v }, "Rattachement mis à jour")}>
            <SelectTrigger className="w-56 h-8 text-xs" data-testid={`partner-link-${a.id}`}><SelectValue placeholder="Rattacher à un point" /></SelectTrigger>
            <SelectContent>{points.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.city}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Select value={a.carrier_id || ""} onValueChange={(v) => upd({ carrier_id: v }, "Rattachement mis à jour")}>
            <SelectTrigger className="w-56 h-8 text-xs" data-testid={`partner-link-${a.id}`}><SelectValue placeholder="Rattacher à un transporteur" /></SelectTrigger>
            <SelectContent>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function RequestsTab({ requests, reload }) {
  const decide = async (r, decision) => {
    try { await api.put(`/admin/relay-change-requests/${r.id}`, { decision }); toast.success(decision === "APPROVE" ? "Modification appliquée" : "Demande refusée"); reload(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (!requests.length) return <div className="text-sm text-muted-foreground" data-testid="requests-empty">Aucune demande en attente.</div>;
  return requests.map((r) => (
    <div key={r.id} className="bg-card border border-border rounded-xl p-4 mb-3 text-sm" data-testid={`change-request-${r.id}`}>
      <div className="font-semibold">{r.relay_name} <span className="text-xs text-muted-foreground font-normal">par {r.requester_name} ({ROLE_LABEL[r.requester_role]})</span></div>
      {Object.entries(r.changes).map(([k, v]) => <div key={k} className="text-xs"><span className="text-muted-foreground">{k} :</span> <s>{String(r.previous?.[k] ?? "")}</s> → <strong>{String(v)}</strong></div>)}
      <div className="flex gap-2 mt-2">
        <Button size="sm" className="rounded-full" onClick={() => decide(r, "APPROVE")} data-testid={`change-approve-${r.id}`}>Accepter</Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => decide(r, "REJECT")} data-testid={`change-reject-${r.id}`}>Refuser</Button>
      </div>
    </div>
  ));
}

function CouriersTab({ couriers, points, countries, reload }) {
  const [f, setF] = useState({});
  const add = async () => {
    try { await api.post("/admin/local-couriers", f); toast.success("Livreur recensé"); setF({}); reload(); } catch (e) { toast.error(apiErr(e)); }
  };
  const del = async (c) => { try { await api.delete(`/admin/local-couriers/${c.id}`); reload(); } catch (e) { toast.error(apiErr(e)); } };
  const toggle = async (c, v) => { try { await api.put(`/admin/local-couriers/${c.id}`, { active: v }); reload(); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2 items-end" data-testid="courier-form">
        <Input placeholder="Nom du livreur" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="courier-name" />
        <Input placeholder="Téléphone" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="courier-phone" />
        <Input placeholder="Ville / zone" value={f.city || ""} onChange={(e) => setF({ ...f, city: e.target.value })} data-testid="courier-city" />
        <CountrySelect value={f.country} onChange={(v) => setF({ ...f, country: v })} countries={countries} testid="courier-country" />
        <Button className="rounded-full" onClick={add} data-testid="courier-add">Recenser</Button>
      </div>
      {couriers.map((c) => (
        <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 text-sm" data-testid={`courier-row-${c.id}`}>
          <div className="flex-1"><strong>{c.name}</strong> — {c.phone} <span className="text-xs text-muted-foreground">{c.city}{c.country ? `, ${c.country}` : ""}</span></div>
          <Switch checked={c.active} onCheckedChange={(v) => toggle(c, v)} data-testid={`courier-toggle-${c.id}`} />
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(c)} data-testid={`courier-del-${c.id}`}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function RemindersCard() {
  const [r, setR] = useState(null);
  const [days, setDays] = useState(3);
  const load = () => api.get("/admin/logistics/reminders").then((x) => { setR(x.data); setDays(x.data.not_collected_days); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!r) return null;
  const save = async () => { try { await api.put("/admin/logistics/reminders", { not_collected_days: parseInt(days, 10) }); toast.success("Délai enregistré"); load(); } catch (e) { toast.error(apiErr(e)); } };
  const run = async () => {
    try { const { data } = await api.post("/admin/logistics/reminders/run"); toast.success(`${data.stats.not_collected} colis non retiré(s), ${data.stats.late} retard(s) signalé(s)`); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3" data-testid="reminders-card">
      <div className="flex-1 min-w-[240px] text-sm">
        <div className="font-semibold">Rappels automatiques — {r.schedule}</div>
        <div className="text-xs text-muted-foreground">« Colis non retiré » aux points relais et « Retard de livraison » aux transporteurs, une fois par jour et par colis.</div>
        <div className="text-xs mt-1" data-testid="reminders-last-run">Dernier passage : {r.last_run ? `${new Date(r.last_run).toLocaleString("fr-FR")} (${r.last_stats?.not_collected ?? 0} non retirés, ${r.last_stats?.late ?? 0} retards)` : "jamais"}</div>
      </div>
      <div><Label className="text-xs">Non retiré après (jours)</Label><Input type="number" min={1} max={60} className="w-28 mt-1" value={days} onChange={(e) => setDays(e.target.value)} data-testid="reminders-days" /></div>
      <Button variant="outline" className="rounded-full" onClick={save} data-testid="reminders-save">Enregistrer</Button>
      <Button className="rounded-full" onClick={run} data-testid="reminders-run">Lancer maintenant</Button>
    </div>
  );
}

const TARGETS = [["ALL_RELAYS", "Tous les points relais"], ["ALL_CARRIERS", "Tous les transporteurs"], ["RELAY_POINT", "Un point relais"], ["CARRIER", "Un transporteur"], ["ACCOUNT", "Un compte précis"]];

function BroadcastTab({ points, carriers, accounts }) {
  const [f, setF] = useState({ target: "ALL_RELAYS", target_id: "", subject: "", body: "", email: true });
  const [history, setHistory] = useState([]);
  const load = () => api.get("/admin/logistics/broadcasts").then((r) => setHistory(r.data.broadcasts)).catch(() => {});
  useEffect(() => { load(); }, []);
  const options = f.target === "RELAY_POINT" ? points.map((p) => [p.id, `${p.name} — ${p.city}`])
    : f.target === "CARRIER" ? carriers.map((c) => [c.id, c.name])
    : f.target === "ACCOUNT" ? accounts.filter((a) => a.status === "ACTIVE").map((a) => [a.id, `${a.name} (${ROLE_LABEL[a.role]})`]) : [];
  const label = (b) => {
    const t = TARGETS.find((x) => x[0] === b.target)?.[1];
    const name = b.target === "RELAY_POINT" ? points.find((p) => p.id === b.target_id)?.name : b.target === "CARRIER" ? carriers.find((c) => c.id === b.target_id)?.name
      : b.target === "ACCOUNT" ? accounts.find((a) => a.id === b.target_id)?.name : null;
    return name ? `${t} : ${name}` : t;
  };
  const send = async () => {
    try { const { data } = await api.post("/admin/logistics/broadcast", f); toast.success(data.message); setF({ ...f, subject: "", body: "" }); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3" data-testid="broadcast-form">
        <div className="grid md:grid-cols-2 gap-2">
          <Select value={f.target} onValueChange={(v) => setF({ ...f, target: v, target_id: "" })}>
            <SelectTrigger data-testid="broadcast-target"><SelectValue /></SelectTrigger>
            <SelectContent>{TARGETS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          {options.length > 0 || ["RELAY_POINT", "CARRIER", "ACCOUNT"].includes(f.target) ? (
            <Select value={f.target_id} onValueChange={(v) => setF({ ...f, target_id: v })}>
              <SelectTrigger data-testid="broadcast-target-id"><SelectValue placeholder="Choisir le destinataire" /></SelectTrigger>
              <SelectContent className="max-h-64">{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          ) : <div />}
        </div>
        <Input placeholder="Objet" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="broadcast-subject" />
        <Textarea rows={4} placeholder="Votre message" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} data-testid="broadcast-body" />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.email} onCheckedChange={(v) => setF({ ...f, email: v })} data-testid="broadcast-email" /> Envoyer aussi par e-mail</label>
          <Button className="rounded-full" onClick={send} data-testid="broadcast-send"><Send className="w-4 h-4 mr-1" /> Envoyer</Button>
        </div>
      </div>
      {history.map((b) => (
        <div key={b.id} className="bg-card border border-border rounded-xl p-4 text-sm" data-testid={`broadcast-${b.id}`}>
          <div className="flex justify-between gap-2"><span className="font-semibold">{b.subject}</span><span className="text-xs text-muted-foreground">{new Date(b.at).toLocaleString("fr-FR")}</span></div>
          <div className="text-xs text-muted-foreground">{label(b)} · {b.recipients} destinataire(s){b.email ? " · e-mail" : ""}</div>
          <div className="mt-1 whitespace-pre-line">{b.body}</div>
        </div>
      ))}
    </div>
  );
}

export function AdminLogistics() {
  const [points, setPoints] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [countries, setCountries] = useState([]);
  const load = () => {
    api.get("/admin/relay-points").then((r) => setPoints(r.data.relay_points)).catch(() => {});
    api.get("/admin/logistics/accounts").then((r) => setAccounts(r.data.accounts)).catch(() => {});
    api.get("/admin/relay-change-requests").then((r) => setRequests(r.data.requests)).catch(() => {});
    api.get("/admin/local-couriers").then((r) => setCouriers(r.data.couriers)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get("/logistics/carriers").then((r) => setCarriers(r.data.carriers)).catch(() => {});
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
  }, []);
  const pending = accounts.filter((a) => a.status === "PENDING").length;
  return (
    <div>
      <PageHeader title="Réseau logistique" subtitle="Points relais, comptes partenaires, demandes de modification et livreurs locaux" />
      <RemindersCard />
      <Tabs defaultValue="points">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="points" data-testid="tab-points">Points relais ({points.length})</TabsTrigger>
          <TabsTrigger value="accounts" data-testid="tab-accounts">Comptes partenaires{pending ? ` (${pending} en attente)` : ""}</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">Demandes ({requests.length})</TabsTrigger>
          <TabsTrigger value="couriers" data-testid="tab-couriers">Livreurs locaux ({couriers.length})</TabsTrigger>
          <TabsTrigger value="broadcast" data-testid="tab-broadcast">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="points" className="mt-4"><PointsTab points={points} countries={countries} reload={load} /></TabsContent>
        <TabsContent value="accounts" className="mt-4 space-y-3">
          <NewAccountForm points={points} carriers={carriers} countries={countries} onCreated={load} />
          {accounts.map((a) => <AccountRow key={a.id} a={a} points={points} carriers={carriers} reload={load} />)}
        </TabsContent>
        <TabsContent value="requests" className="mt-4"><RequestsTab requests={requests} reload={load} /></TabsContent>
        <TabsContent value="couriers" className="mt-4"><CouriersTab couriers={couriers} points={points} countries={countries} reload={load} /></TabsContent>
        <TabsContent value="broadcast" className="mt-4"><BroadcastTab points={points} carriers={carriers} accounts={accounts} /></TabsContent>
      </Tabs>
    </div>
  );
}
