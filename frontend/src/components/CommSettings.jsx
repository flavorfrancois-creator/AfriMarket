import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, MessageSquare, Trash2, RotateCcw, Send, Pencil } from "lucide-react";

const LANG_LABEL = { fr: "Français", en: "English", es: "Español" };
const AUDIENCES = [["client", "Clients"], ["merchant", "Commerçants"], ["carrier", "Transporteurs"], ["relay", "Points relais"]];

function EmailProvider() {
  const empty = { name: "", countries: [], provider: "smtp", enabled: false, from_email: "", smtp_host: "", smtp_port: 587, smtp_username: "", smtp_starttls: true, smtp_password: "", resend_api_key: "" };
  const [profiles, setProfiles] = useState([]);
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState("");
  const load = () => api.get("/admin/comm/email").then((r) => setProfiles(r.data.profiles || [])).catch((e) => toast.error(apiErr(e)));
  useEffect(() => {
    load();
    api.get("/config/countries").then((r) => setCountries(r.data.countries || [])).catch((e) => toast.error(apiErr(e)));
  }, []);
  const set = (k, v) => setForm((current) => ({ ...current, [k]: v }));
  const save = async () => {
    const body = { ...form };
    if (!body.smtp_password) delete body.smtp_password;
    if (!body.resend_api_key) delete body.resend_api_key;
    try {
      if (editing) await api.put(`/admin/comm/email/profiles/${editing}`, body);
      else await api.post("/admin/comm/email/profiles", body);
      toast.success(editing ? "Profil e-mail mis à jour" : "Profil e-mail ajouté");
      setForm(empty);
      setEditing("");
      await load();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const edit = (profile) => {
    setEditing(profile.id);
    setForm({ ...empty, ...profile, countries: profile.countries || [], smtp_password: "", resend_api_key: "" });
  };
  const updateEnabled = async (profile, enabled) => {
    try { await api.put(`/admin/comm/email/profiles/${profile.id}`, { enabled }); await load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (profile) => {
    if (!window.confirm(`Supprimer le profil « ${profile.name} » ?`)) return;
    try { await api.delete(`/admin/comm/email/profiles/${profile.id}`); await load(); toast.success("Profil e-mail supprimé"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const test = async (profile) => {
    try {
      const { data } = await api.post(`/admin/comm/email/profiles/${profile.id}/test`);
      data.sent ? toast.success(`E-mail de test envoyé à ${data.to}`) : toast.error("Envoi échoué — vérifiez ce profil");
    } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="email-provider">
      <div className="font-display font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Profils d'envoi e-mail</div>
      <p className="text-xs text-muted-foreground">Enregistrez plusieurs profils SMTP ou Resend et affectez-les à leurs pays. Tous les profils actifs disponibles pour le pays du destinataire sont utilisés par défaut; vous pouvez choisir un ou plusieurs profils par pays et par modèle de message. Les identifiants sont chiffrés et ne sont jamais réaffichés.</p>
      <div className="space-y-2">
        {profiles.map((profile) => (
          <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg p-3" data-testid={`email-profile-${profile.id}`}>
            <div className="min-w-0">
              <div className="font-medium text-sm">{profile.name} <span className="text-xs text-muted-foreground">· {profile.provider === "smtp" ? "SMTP" : "Resend"}</span></div>
              <div className="text-xs text-muted-foreground">{profile.countries?.length ? profile.countries.join(", ") : "Tous les pays"} · {profile.from_email || "Expéditeur absent"} · {profile.provider === "smtp" ? `${profile.smtp_host || "Serveur absent"}:${profile.smtp_port} · ${profile.smtp_username || "Identifiant absent"} · mot de passe ${profile.has_smtp_password ? "enregistré" : "absent"}` : `clé API ${profile.has_resend_key ? "enregistrée" : "absente"}`}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs"><Switch checked={!!profile.enabled} onCheckedChange={(v) => updateEnabled(profile, v)} data-testid={`email-profile-enabled-${profile.id}`} /> Actif</label>
              <Button size="sm" variant="outline" onClick={() => test(profile)} disabled={!profile.enabled} data-testid={`email-profile-test-${profile.id}`}><Send className="w-3.5 h-3.5 mr-1" /> Tester</Button>
              <Button size="icon" variant="ghost" onClick={() => edit(profile)} data-testid={`email-profile-edit-${profile.id}`}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(profile)} data-testid={`email-profile-delete-${profile.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && <p className="text-sm text-muted-foreground">Aucun profil enregistré.</p>}
      </div>
      <div className="border-t border-border pt-3 space-y-3">
        <div className="font-semibold text-sm">{editing ? "Modifier le profil" : "Ajouter un profil"}</div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><Label className="text-xs">Pays de service (vide = tous les pays)</Label><CountryPicker value={form.countries} onChange={(v) => set("countries", v)} countries={countries} testid="email-profile-countries" /></div>
        <div><Label className="text-xs">Nom du profil</Label><Input className="mt-1" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. E-mail transactionnel" data-testid="email-profile-name" /></div>
        <div><Label className="text-xs">Fournisseur</Label>
          <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
            <SelectTrigger className="mt-1" data-testid="email-provider-type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="resend">Resend (API)</SelectItem><SelectItem value="smtp">SMTP</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Adresse d'expédition</Label><Input className="mt-1" placeholder="AfriMarket <no-reply@votre-domaine.com>" value={form.from_email || ""} onChange={(e) => set("from_email", e.target.value)} data-testid="email-from" /></div>
        {form.provider === "resend" && (
          <div className="md:col-span-2"><Label className="text-xs">Clé API Resend</Label><Input className="mt-1" type="password" value={form.resend_api_key} onChange={(e) => set("resend_api_key", e.target.value)} placeholder={editing && profiles.find((p) => p.id === editing)?.has_resend_key ? "Clé enregistrée (laisser vide pour conserver)" : "re_..."} data-testid="email-resend-key" /></div>
        )}
        {form.provider === "smtp" && (
          <>
            <div><Label className="text-xs">Serveur SMTP</Label><Input className="mt-1" value={form.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} data-testid="email-smtp-host" /></div>
            <div><Label className="text-xs">Port</Label><Input className="mt-1" type="number" value={form.smtp_port} onChange={(e) => set("smtp_port", parseInt(e.target.value || "587", 10))} data-testid="email-smtp-port" /></div>
            <div><Label className="text-xs">Identifiant</Label><Input className="mt-1" value={form.smtp_username || ""} onChange={(e) => set("smtp_username", e.target.value)} data-testid="email-smtp-user" /></div>
            <div><Label className="text-xs">Mot de passe</Label><Input className="mt-1" type="password" value={form.smtp_password} onChange={(e) => set("smtp_password", e.target.value)} placeholder={editing && profiles.find((p) => p.id === editing)?.has_smtp_password ? "Enregistré (laisser vide pour conserver)" : ""} data-testid="email-smtp-password" /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.smtp_starttls} onCheckedChange={(v) => set("smtp_starttls", v)} data-testid="email-smtp-tls" /> STARTTLS</label>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.enabled} onCheckedChange={(v) => set("enabled", v)} data-testid="email-profile-form-enabled" /> Profil actif</label>
        <Button className="rounded-full" onClick={save} data-testid="email-save">{editing ? "Mettre à jour" : "Enregistrer le profil"}</Button>
        {editing && <Button variant="outline" className="rounded-full" onClick={() => { setForm(empty); setEditing(""); }}>Annuler</Button>}
      </div>
      </div>
    </div>
  );
}

function CountryPicker({ value, onChange, countries, testid }) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2" data-testid={testid}>
      <label className="flex items-center gap-2 py-1 text-xs font-medium cursor-pointer">
        <Checkbox checked={value.length === 0} onCheckedChange={(checked) => checked === true && onChange([])} data-testid={`${testid}-all`} />
        Tous les pays
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        {countries.map((country) => (
          <label key={country.name} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
            <Checkbox
              checked={value.includes(country.name)}
              onCheckedChange={(checked) => onChange(checked === true
                ? [...value, country.name]
                : value.filter((name) => name !== country.name))}
              data-testid={`${testid}-${country.name}`}
            />
            {country.name}
          </label>
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

function TemplateEditor({ t, onSaved, emailProfiles, countries }) {
  const [lang, setLang] = useState("fr");
  const [c, setC] = useState(t.content);
  const [profileMap, setProfileMap] = useState(t.email_provider_ids_by_country || {});
  useEffect(() => { setC(t.content); setProfileMap(t.email_provider_ids_by_country || {}); }, [t]);
  const save = async (patch) => {
    try { const { data } = await api.put(`/admin/comm/templates/${t.key}`, patch); onSaved(data.template); toast.success("Message enregistré"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const reset = async () => { try { const { data } = await api.post(`/admin/comm/templates/${t.key}/reset`); onSaved(data.template); toast.success("Message par défaut restauré"); } catch (e) { toast.error(apiErr(e)); } };
  const selectedCountries = countries.filter((item) => Object.prototype.hasOwnProperty.call(profileMap, item.name));
  const updateCountry = (country, checked) => {
    const nextMap = { ...profileMap };
    if (checked) {
      const eligibleIds = emailProfiles
        .filter((profile) => profile.enabled && (!profile.countries?.length || profile.countries.includes(country)))
        .filter((profile) => (t.email_provider_ids || []).includes(profile.id))
        .map((profile) => profile.id);
      nextMap[country] = eligibleIds;
    }
    else delete nextMap[country];
    setProfileMap(nextMap);
    save({ email_provider_ids_by_country: nextMap });
  };
  const updateCountryProfiles = (country, profileId, checked, selectedIds) => {
    const next = checked ? [...selectedIds, profileId] : selectedIds.filter((id) => id !== profileId);
    const nextMap = { ...profileMap, [country]: next };
    setProfileMap(nextMap);
    save({ email_provider_ids_by_country: nextMap });
  };
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
      <div className="space-y-1">
        <Label className="text-xs">Pays et profils utilisés pour cet e-mail</Label>
        <p className="text-[11px] text-muted-foreground">Cochez un ou plusieurs pays, puis choisissez pour chacun un ou plusieurs services actifs. Seuls les profils affectés au pays (ou disponibles dans tous les pays) sont proposés. Les pays non cochés gardent le routage existant.</p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2" data-testid={`template-countries-${t.key}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            {countries.map((item) => (
              <label key={item.name} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                <Checkbox
                  checked={Object.prototype.hasOwnProperty.call(profileMap, item.name)}
                  onCheckedChange={(checked) => updateCountry(item.name, checked === true)}
                  data-testid={`template-country-${t.key}-${item.name}`}
                />
                {item.name}
              </label>
            ))}
          </div>
        </div>
        {selectedCountries.map(({ name: country }) => {
          const assignedProfiles = emailProfiles.filter((profile) => profile.enabled && (!profile.countries?.length || profile.countries.includes(country)));
          const selectedForCountry = (profileMap[country] || []).filter((id) => assignedProfiles.some((profile) => profile.id === id));
          return (
            <div key={country} className="rounded-md border border-border p-2 space-y-2" data-testid={`template-country-services-${t.key}-${country}`}>
              <div className="text-xs font-medium">{country}</div>
              {assignedProfiles.length === 0
                ? <p className="text-xs text-muted-foreground">Aucun profil actif disponible pour ce pays; l’envoi e-mail par défaut de la plateforme sera utilisé.</p>
                : <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {assignedProfiles.map((profile) => (
                    <label key={profile.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={selectedForCountry.includes(profile.id)}
                        onCheckedChange={(checked) => updateCountryProfiles(country, profile.id, checked === true, selectedForCountry)}
                        data-testid={`template-email-profile-${t.key}-${country}-${profile.id}`}
                      />
                      {profile.name}
                    </label>
                  ))}
                </div>}
              <p className="text-[11px] text-muted-foreground">Si aucun service n’est coché, tous les services actifs éligibles sont utilisés.</p>
            </div>
          );
        })}
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
  const [emailProfiles, setEmailProfiles] = useState([]);
  const [countries, setCountries] = useState([]);
  const [aud, setAud] = useState(audiences[0][0]);
  useEffect(() => {
    api.get("/admin/comm/templates").then((r) => setTemplates(r.data.templates)).catch(() => {});
    api.get("/admin/comm/email").then((r) => setEmailProfiles(r.data.profiles || [])).catch(() => {});
    api.get("/config/countries").then((r) => setCountries(r.data.countries || [])).catch(() => {});
  }, []);
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
      {list.map((t) => <TemplateEditor key={t.key} t={t} onSaved={onSaved} emailProfiles={emailProfiles} countries={countries} />)}
    </div>
  );
}

export const AUTH_AUDIENCE = [["auth", "Authentification"]];
export const BUSINESS_AUDIENCES = AUDIENCES;
