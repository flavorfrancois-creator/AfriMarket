import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Trash2, RotateCcw, Send, Pencil } from "lucide-react";

const LANG_LABEL = { fr: "Français", en: "English", es: "Español" };
const AUDIENCES = [["client", "Clients"], ["merchant", "Commerçants"], ["carrier", "Transporteurs"], ["relay", "Points relais"]];

function EmailProvider() {
  const [s, setS] = useState(null);
  const [secret, setSecret] = useState("");
  useEffect(() => { api.get("/admin/comm/email").then((r) => setS(r.data.email)).catch(() => {}); }, []);
  if (!s) return null;
  const set = (k, v) => setS({ ...s, [k]: v });
  const save = async () => {
    const body = { ...s };
    if (s.provider === "resend" && secret) body.resend_api_key = secret;
    if (s.provider === "smtp" && secret) body.smtp_password = secret;
    try { const { data } = await api.put("/admin/comm/email", body); setS(data.email); setSecret(""); toast.success("Fournisseur e-mail enregistré"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const test = async () => {
    try { const { data } = await api.post("/admin/comm/email/test"); data.sent ? toast.success(`E-mail de test envoyé à ${data.to}`) : toast.error("Envoi échoué — vérifiez la configuration"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const stored = s.provider === "resend" ? s.has_resend_key : s.has_smtp_password;
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3" data-testid="email-provider">
      <div className="flex items-center justify-between">
        <div className="font-display font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> API E-mail</div>
        <label className="flex items-center gap-2 text-sm">Activée <Switch checked={!!s.enabled} onCheckedChange={(v) => set("enabled", v)} data-testid="email-enabled" /></label>
      </div>
      <p className="text-xs text-muted-foreground">Tant qu'aucune API n'est activée, l'envoi par défaut de la plateforme est utilisé. Les clés sont chiffrées et ne sont jamais réaffichées.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <div><Label className="text-xs">Fournisseur</Label>
          <Select value={s.provider} onValueChange={(v) => set("provider", v)}>
            <SelectTrigger className="mt-1" data-testid="email-provider-type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Envoi par défaut</SelectItem><SelectItem value="resend">Resend (API)</SelectItem><SelectItem value="smtp">SMTP</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Adresse d'expédition</Label><Input className="mt-1" placeholder="AfriMarket <no-reply@votre-domaine.com>" value={s.from_email || ""} onChange={(e) => set("from_email", e.target.value)} data-testid="email-from" /></div>
        {s.provider === "resend" && (
          <div className="md:col-span-2"><Label className="text-xs">Clé API Resend</Label><Input className="mt-1" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={stored ? "Clé enregistrée (laisser vide pour conserver)" : "re_..."} data-testid="email-resend-key" /></div>
        )}
        {s.provider === "smtp" && (
          <>
            <div><Label className="text-xs">Serveur SMTP</Label><Input className="mt-1" value={s.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} data-testid="email-smtp-host" /></div>
            <div><Label className="text-xs">Port</Label><Input className="mt-1" type="number" value={s.smtp_port} onChange={(e) => set("smtp_port", parseInt(e.target.value || "587", 10))} data-testid="email-smtp-port" /></div>
            <div><Label className="text-xs">Identifiant</Label><Input className="mt-1" value={s.smtp_username || ""} onChange={(e) => set("smtp_username", e.target.value)} data-testid="email-smtp-user" /></div>
            <div><Label className="text-xs">Mot de passe</Label><Input className="mt-1" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={stored ? "Enregistré (laisser vide pour conserver)" : ""} data-testid="email-smtp-password" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!s.smtp_starttls} onCheckedChange={(v) => set("smtp_starttls", v)} data-testid="email-smtp-tls" /> STARTTLS</label>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Button className="rounded-full" onClick={save} data-testid="email-save">Enregistrer</Button>
        <Button variant="outline" className="rounded-full" onClick={test} data-testid="email-test"><Send className="w-3.5 h-3.5 mr-1" /> Envoyer un test</Button>
      </div>
    </div>
  );
}

function CountryPicker({ value, onChange, countries, testid }) {
  return (
    <div className="space-y-1">
      <Select value="" onValueChange={(v) => !value.includes(v) && onChange([...value, v])}>
        <SelectTrigger data-testid={testid}><SelectValue placeholder={value.length ? "Ajouter un pays" : "Pays (vide = tous)"} /></SelectTrigger>
        <SelectContent className="max-h-64">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex flex-wrap gap-1">
        {value.map((c) => (
          <button key={c} type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-[11px] bg-accent px-2 py-0.5 rounded-full hover:bg-destructive/10" data-testid={`${testid}-chip-${c}`}>{c} ×</button>
        ))}
      </div>
    </div>
  );
}

const EMPTY = { name: "", provider_type: "", sender: "", api_url: "", account_id: "", api_key: "", countries: [] };

function ProviderForm({ channel, countries, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const add = async () => {
    try { await api.post("/admin/comm/providers", { ...f, channel, enabled: false }); toast.success("API ajoutée (désactivée)"); setF(EMPTY); onCreated(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-start border-t border-border pt-3" data-testid={`provider-form-${channel}`}>
      <Input placeholder={channel === "sms" ? "Nom (ex. Orange SMS Sénégal)" : "Nom (ex. WhatsApp Business Côte d'Ivoire)"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid={`provider-${channel}-name`} />
      <Input placeholder="Fournisseur (Twilio, Orange, Meta...)" value={f.provider_type} onChange={(e) => setF({ ...f, provider_type: e.target.value })} data-testid={`provider-${channel}-type`} />
      <Input placeholder={channel === "sms" ? "Expéditeur SMS" : "N° WhatsApp expéditeur"} value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} data-testid={`provider-${channel}-sender`} />
      <Input placeholder="URL de l'API" value={f.api_url} onChange={(e) => setF({ ...f, api_url: e.target.value })} data-testid={`provider-${channel}-url`} />
      <Input placeholder="Identifiant de compte" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })} data-testid={`provider-${channel}-account`} />
      <Input type="password" placeholder="Clé / jeton API" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} data-testid={`provider-${channel}-key`} />
      <CountryPicker value={f.countries} onChange={(v) => setF({ ...f, countries: v })} countries={countries} testid={`provider-${channel}-country`} />
      <Button className="rounded-full" onClick={add} data-testid={`provider-${channel}-add`}>Ajouter l'API</Button>
    </div>
  );
}

function ProviderEdit({ p, countries, onDone }) {
  const [f, setF] = useState({ sender: p.sender || "", api_url: p.api_url || "", account_id: p.account_id || "", api_key: "", countries: p.countries || [] });
  const save = async () => {
    const body = { ...f };
    if (!body.api_key) delete body.api_key;
    try { await api.put(`/admin/comm/providers/${p.id}`, body); toast.success("API mise à jour"); onDone(); } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full pt-2" data-testid={`provider-edit-${p.id}`}>
      <Input placeholder="Expéditeur" value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} data-testid={`provider-edit-sender-${p.id}`} />
      <Input placeholder="URL de l'API" value={f.api_url} onChange={(e) => setF({ ...f, api_url: e.target.value })} />
      <Input placeholder="Identifiant de compte" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })} />
      <Input type="password" placeholder={p.has_api_key ? "Clé enregistrée (laisser vide pour conserver)" : "Clé / jeton API"} value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} data-testid={`provider-edit-key-${p.id}`} />
      <CountryPicker value={f.countries} onChange={(v) => setF({ ...f, countries: v })} countries={countries} testid={`provider-edit-country-${p.id}`} />
      <Button size="sm" className="rounded-full" onClick={save} data-testid={`provider-edit-save-${p.id}`}>Enregistrer</Button>
    </div>
  );
}

function ChannelProviders({ channel, title, providers, countries, reload }) {
  const list = providers.filter((p) => p.channel === channel);
  const [editing, setEditing] = useState(null);
  const upd = async (p, patch) => { try { await api.put(`/admin/comm/providers/${p.id}`, patch); reload(); } catch (e) { toast.error(apiErr(e)); } };
  const del = async (p) => { if (!window.confirm(`Supprimer l'API « ${p.name} » ?`)) return; try { await api.delete(`/admin/comm/providers/${p.id}`); reload(); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3" data-testid={`providers-${channel}`}>
      <div className="font-display font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> {title}</div>
      <p className="text-xs text-muted-foreground">Une API par pays (ou pour tous les pays). Le message part par l'API active du pays du destinataire. Envoi actuellement <strong>simulé</strong> (journalisé) tant que la connexion réelle n'est pas branchée.</p>
      {list.length === 0 && <div className="text-xs text-muted-foreground" data-testid={`providers-${channel}-empty`}>Aucune API enregistrée.</div>}
      {list.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm border border-border rounded-lg p-3" data-testid={`provider-row-${p.id}`}>
          <div className="flex-1 min-w-[200px]">
            <div className="font-medium">{p.name} <span className="text-xs text-muted-foreground">{p.provider_type}</span></div>
            <div className="text-xs text-muted-foreground">{p.countries?.length ? p.countries.join(", ") : "Tous les pays"} · {p.sender || "—"} · clé {p.has_api_key ? "enregistrée" : "absente"}</div>
          </div>
          <Switch checked={!!p.enabled} onCheckedChange={(v) => upd(p, { enabled: v })} data-testid={`provider-toggle-${p.id}`} />
          <Button size="icon" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)} data-testid={`provider-edit-btn-${p.id}`}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p)} data-testid={`provider-del-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
          {editing === p.id && <ProviderEdit p={p} countries={countries} onDone={() => { setEditing(null); reload(); }} />}
        </div>
      ))}
      <ProviderForm channel={channel} countries={countries} onCreated={reload} />
    </div>
  );
}

export function ApiProvidersTab() {
  const [data, setData] = useState({ providers: [], log: [] });
  const [countries, setCountries] = useState([]);
  const load = () => api.get("/admin/comm/providers").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {}); }, []);
  return (
    <div className="space-y-5">
      <EmailProvider />
      <ChannelProviders channel="sms" title="API SMS" providers={data.providers} countries={countries} reload={load} />
      <ChannelProviders channel="whatsapp" title="API WhatsApp" providers={data.providers} countries={countries} reload={load} />
      {data.log.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5" data-testid="message-log">
          <div className="font-display font-bold mb-2 text-sm">Derniers envois (API personnalisées)</div>
          {data.log.map((l) => <div key={l.id} className="text-xs border-b border-border/50 py-1">{new Date(l.at).toLocaleString("fr-FR")} · {l.channel} · {l.provider || "—"} · {l.to} · <strong>{l.status}</strong></div>)}
        </div>
      )}
    </div>
  );
}

export function SmsRelaysTab({ countries }) {
  const [relays, setRelays] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [revealedKeys, setRevealedKeys] = useState({});
  const [passwordRelayId, setPasswordRelayId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/comm/relays");
      setRelays(data.relays || []);
      setRoutes(data.routes || []);
    } catch (e) { toast.error(apiErr(e)); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/admin/comm/relays", { phone, password });
      setRevealedKeys((keys) => ({ ...keys, [data.relay.id]: data.connection_key }));
      setPhone("");
      setPassword("");
      toast.success("Compte téléphone relais créé");
      await load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  };

  const setStatus = async (relay, status) => {
    try {
      await api.put(`/admin/comm/relays/${relay.id}`, { status });
      await load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const changePassword = async (relay) => {
    try {
      await api.put(`/admin/comm/relays/${relay.id}/password`, { password: newPassword });
      setNewPassword("");
      setPasswordRelayId("");
      toast.success("Mot de passe modifié. Le téléphone devra se reconnecter.");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const deleteRelay = async (relay) => {
    if (!window.confirm(`Supprimer le compte relais ${relay.phone} ? Ses affectations SIM et son historique SMS seront également supprimés.`)) return;
    try {
      await api.delete(`/admin/comm/relays/${relay.id}`);
      setRevealedKeys((keys) => { const next = { ...keys }; delete next[relay.id]; return next; });
      toast.success("Compte téléphone relais supprimé");
      await load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const rotateKey = async (relay) => {
    if (!window.confirm(`Générer une nouvelle clé pour ${relay.phone} ? L'ancienne clé sera immédiatement invalidée.`)) return;
    try {
      const { data } = await api.post(`/admin/comm/relays/${relay.id}/rotate-key`);
      setRevealedKeys((keys) => ({ ...keys, [relay.id]: data.connection_key }));
      toast.success("Nouvelle clé générée. Copiez-la maintenant.");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const saveRoute = async (country, value, enabled = true) => {
    const current = routes.find((route) => route.country === country);
    try {
      if (!value) {
        if (current) await api.delete(`/admin/comm/relay-routes/${encodeURIComponent(country)}`);
      } else {
        const [relay_id, sim_id] = value.split(":");
        await api.put(`/admin/comm/relay-routes/${encodeURIComponent(country)}`, { relay_id, sim_id, enabled });
      }
      await load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const availableCountries = [...new Set(relays.filter((r) => r.status === "ACTIVE").flatMap((r) => r.countries || []))];
  const countryNames = Object.fromEntries(countries.map((c) => [c.name, c.iso2]));
  const allSims = relays.filter((r) => r.status === "ACTIVE").flatMap((r) =>
    (r.sims || []).map((sim) => ({ ...sim, relay_id: r.id, relay_phone: r.phone })));

  return (
    <div className="space-y-5" data-testid="sms-relays">
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="font-display font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Créer un compte téléphone relais</div>
        <p className="text-xs text-muted-foreground">Le téléphone se connecte avec son numéro, son mot de passe et la clé unique remise à sa création. La clé ne sera plus visible après fermeture de cet écran.</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div><Label htmlFor="relay-phone">N° de téléphone</Label><Input id="relay-phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221..." data-testid="relay-create-phone" /></div>
          <div><Label htmlFor="relay-password">Mot de passe (8 caractères minimum)</Label><Input id="relay-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="relay-create-password" /></div>
          <Button className="rounded-full" disabled={loading || phone.trim().length < 6 || password.length < 8} onClick={create} data-testid="relay-create">Créer le compte</Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="font-display font-bold">Téléphones et cartes SIM enregistrés</div>
        {relays.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte relais créé.</p>}
        {relays.map((relay) => (
          <div key={relay.id} className="border border-border rounded-lg p-4 space-y-3" data-testid={`relay-row-${relay.id}`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold">{relay.phone} <span className={`text-xs ${relay.online ? "text-green-600" : "text-muted-foreground"}`}>· {relay.online ? "En ligne" : "Hors ligne"}</span></div>
                <div className="text-xs text-muted-foreground">Vu : {relay.last_seen ? new Date(relay.last_seen).toLocaleString("fr-FR") : "jamais"} · {relay.status === "ACTIVE" ? "Actif" : "Suspendu"}</div>
              </div>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => rotateKey(relay)} data-testid={`relay-rotate-key-${relay.id}`}>Nouvelle clé</Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setPasswordRelayId(passwordRelayId === relay.id ? "" : relay.id); setNewPassword(""); }} data-testid={`relay-change-password-${relay.id}`}>Modifier le mot de passe</Button>
              <Button size="sm" variant="destructive" className="rounded-full" onClick={() => deleteRelay(relay)} data-testid={`relay-delete-${relay.id}`}><Trash2 className="w-3.5 h-3.5 mr-1" /> Supprimer</Button>
              <Button size="sm" variant={relay.status === "ACTIVE" ? "destructive" : "outline"} className="rounded-full" onClick={() => setStatus(relay, relay.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")} data-testid={`relay-status-${relay.id}`}>
                {relay.status === "ACTIVE" ? "Suspendre" : "Réactiver"}
              </Button>
            </div>
            {passwordRelayId === relay.id && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
                <div className="flex-1 min-w-[220px]">
                  <Label htmlFor={`relay-new-password-${relay.id}`}>Nouveau mot de passe (8 caractères minimum)</Label>
                  <Input id={`relay-new-password-${relay.id}`} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} data-testid={`relay-new-password-${relay.id}`} />
                </div>
                <Button size="sm" className="rounded-full" disabled={newPassword.length < 8} onClick={() => changePassword(relay)} data-testid={`relay-save-password-${relay.id}`}>Enregistrer le mot de passe</Button>
              </div>
            )}
            {revealedKeys[relay.id] && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950">
                Clé de connexion à transmettre au téléphone (affichée une seule fois) :
                <code className="block break-all font-mono mt-1 select-all" data-testid={`relay-key-${relay.id}`}>{revealedKeys[relay.id]}</code>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-semibold">SIM détectées</div>
              {(relay.sims || []).length === 0 && <div className="text-xs text-muted-foreground">Aucune SIM communiquée par l’application.</div>}
              {(relay.sims || []).map((sim) => (
                <div key={sim.id} className="flex flex-wrap justify-between gap-2 text-xs border-t border-border/60 pt-2" data-testid={`relay-sim-${sim.id}`}>
                  <span className="font-medium">#{sim.phone || relay.phone}-{countryNames[sim.country] || sim.country}-{sim.operator}#</span>
                  <span className="text-muted-foreground">{sim.message_counts?.sent || 0} envoyé(s) · {sim.message_counts?.failed || 0} échec(s) · {sim.message_counts?.queued || 0} en attente</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="font-display font-bold">Affecter une SIM à chaque pays</div>
        <p className="text-xs text-muted-foreground">Les OTP SMS du pays sont envoyés par l’application relais via la SIM sélectionnée. Une seule SIM est affectée par pays. Sans affectation active, le fournisseur SMS configuré reste utilisé.</p>
        {availableCountries.length === 0 && <p className="text-sm text-muted-foreground">Les pays apparaîtront après leur sélection dans l’application relais.</p>}
        {availableCountries.map((country) => {
          const route = routes.find((item) => item.country === country);
          const value = route ? `${route.relay_id}:${route.sim_id}` : "";
          const options = allSims.filter((sim) => sim.country === country);
          return (
            <div key={country} className="grid grid-cols-1 md:grid-cols-[minmax(150px,0.7fr)_1fr_auto] items-center gap-3 border-t border-border/60 pt-3" data-testid={`relay-route-${country}`}>
              <div className="text-sm font-medium">{country}</div>
              <Select value={value} onValueChange={(v) => saveRoute(country, v)}>
                <SelectTrigger data-testid={`relay-route-select-${country}`}><SelectValue placeholder="Sélectionner une SIM" /></SelectTrigger>
                <SelectContent>
                  {options.map((sim) => {
                    const label = `#${sim.phone || sim.relay_phone}-${countryNames[country] || country}-${sim.operator}#`;
                    return <SelectItem key={`${sim.relay_id}:${sim.id}`} value={`${sim.relay_id}:${sim.id}`}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {route && <label className="flex items-center gap-2 text-xs"><Switch checked={!!route.enabled} onCheckedChange={(v) => saveRoute(country, value, v)} data-testid={`relay-route-enabled-${country}`} /> Envoi actif</label>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateEditor({ t, onSaved }) {
  const [lang, setLang] = useState("fr");
  const [c, setC] = useState(t.content);
  useEffect(() => { setC(t.content); }, [t]);
  const save = async (patch) => {
    try { const { data } = await api.put(`/admin/comm/templates/${t.key}`, patch); onSaved(data.template); toast.success("Message enregistré"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const reset = async () => { try { const { data } = await api.post(`/admin/comm/templates/${t.key}/reset`); onSaved(data.template); toast.success("Message par défaut restauré"); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2" data-testid={`template-${t.key}`}>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <div className="font-semibold text-sm">{t.label} {t.customized && <span className="text-[10px] bg-accent px-1.5 rounded-full">modifié</span>}</div>
          <div className="text-[11px] text-muted-foreground">Variables : {t.variables.map((v) => `{${v}}`).join(" ")}{t.scheduled_only && " · envoi automatique à venir (tâche planifiée)"}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {t.critical ? <span className="text-[11px] text-muted-foreground" data-testid={`template-critical-${t.key}`}>Toujours actif (indispensable)</span> : (
            <>
              <label className="flex items-center gap-1">Actif <Switch checked={t.enabled} onCheckedChange={(v) => save({ enabled: v })} data-testid={`template-enabled-${t.key}`} /></label>
              <label className="flex items-center gap-1">E-mail <Switch checked={t.email_enabled} onCheckedChange={(v) => save({ email_enabled: v })} data-testid={`template-email-${t.key}`} /></label>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        {Object.keys(LANG_LABEL).map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)} className={`text-xs px-2.5 py-1 rounded-full transition-colors ${lang === l ? "bg-primary text-primary-foreground" : "bg-muted"}`} data-testid={`template-lang-${t.key}-${l}`}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <Input value={c[lang]?.subject || ""} onChange={(e) => setC({ ...c, [lang]: { ...c[lang], subject: e.target.value } })} data-testid={`template-subject-${t.key}`} />
      <Textarea rows={3} value={c[lang]?.body || ""} onChange={(e) => setC({ ...c, [lang]: { ...c[lang], body: e.target.value } })} data-testid={`template-body-${t.key}`} />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" onClick={() => save({ content: { [lang]: c[lang] } })} data-testid={`template-save-${t.key}`}>Enregistrer</Button>
        {t.customized && <Button size="sm" variant="ghost" className="rounded-full" onClick={reset} data-testid={`template-reset-${t.key}`}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Par défaut</Button>}
      </div>
    </div>
  );
}

export function TemplatesTab({ audiences }) {
  const [templates, setTemplates] = useState([]);
  const [aud, setAud] = useState(audiences[0][0]);
  useEffect(() => { api.get("/admin/comm/templates").then((r) => setTemplates(r.data.templates)).catch(() => {}); }, []);
  const onSaved = (nt) => setTemplates((ts) => ts.map((t) => (t.key === nt.key ? nt : t)));
  const list = templates.filter((t) => t.audience === aud);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Chaque message part dans la langue du compte du destinataire (notification dans l'application + e-mail).</p>
      {audiences.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {audiences.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setAud(v)} className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${aud === v ? "bg-primary text-primary-foreground border-primary" : "border-border"}`} data-testid={`audience-${v}`}>
              {l} ({templates.filter((t) => t.audience === v).length})
            </button>
          ))}
        </div>
      )}
      {list.map((t) => <TemplateEditor key={t.key} t={t} onSaved={onSaved} />)}
    </div>
  );
}

export const AUTH_AUDIENCE = [["auth", "Authentification"]];
export const BUSINESS_AUDIENCES = AUDIENCES;
