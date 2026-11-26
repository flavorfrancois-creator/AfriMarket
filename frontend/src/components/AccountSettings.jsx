import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, ACCOUNT_REQ_LABELS } from "@/components/StatusBadge";
import { KeyRound, Mail, Phone, Trash2 } from "lucide-react";

const Card = ({ icon: Icon, title, sub, children, testid }) => (
  <div className="bg-card border border-border rounded-xl p-5" data-testid={testid}>
    <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">{title}</h3></div>
    {sub && <p className="text-xs text-muted-foreground mb-4">{sub}</p>}
    {children}
  </div>
);

function PasswordCard() {
  const { login, user } = useAuth();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (f.next !== f.confirm) { toast.error("Les deux nouveaux mots de passe ne correspondent pas"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/account/password", { current_password: f.current, new_password: f.next });
      login(data.token, user); toast.success(data.message); setF({ current: "", next: "", confirm: "" });
    } catch (e) { toast.error(apiErr(e)); } finally { setBusy(false); }
  };
  return (
    <Card icon={KeyRound} title="Changer de mot de passe" sub="Vos autres sessions seront déconnectées." testid="change-password-card">
      <div className="grid sm:grid-cols-3 gap-3">
        <div><Label className="text-xs">Mot de passe actuel</Label><Input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} className="mt-1" data-testid="pwd-current" /></div>
        <div><Label className="text-xs">Nouveau mot de passe</Label><Input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className="mt-1" data-testid="pwd-new" /></div>
        <div><Label className="text-xs">Confirmer</Label><Input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className="mt-1" data-testid="pwd-confirm" /></div>
      </div>
      <Button className="mt-4 rounded-full" disabled={busy || !f.current || !f.next} onClick={submit} data-testid="pwd-submit">Modifier le mot de passe</Button>
    </Card>
  );
}

function ContactChange({ kind }) {
  const { user, login, refresh } = useAuth();
  const [value, setValue] = useState("");
  const [pwd, setPwd] = useState("");
  const [ch, setCh] = useState(null);
  const [code, setCode] = useState("");
  const isEmail = kind === "email";
  const request = async () => {
    try {
      const { data } = await api.post("/account/contact/request", { kind, value, current_password: pwd });
      setCh(data); toast.success(data.message + (data.dev_code ? ` — code de test : ${data.dev_code}` : ""));
    } catch (e) { toast.error(apiErr(e)); }
  };
  const confirm = async () => {
    try {
      const { data } = await api.post("/account/contact/confirm", { challenge_id: ch.challenge_id, code });
      if (data.token) login(data.token, user);
      await refresh(); toast.success(data.message);
      setCh(null); setValue(""); setPwd(""); setCode("");
    } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <Card icon={isEmail ? Mail : Phone} title={isEmail ? "Changer d'adresse e-mail" : "Changer de numéro de téléphone"}
      sub={`Actuel : ${(isEmail ? user?.email : user?.phone) || "—"}. Un code est envoyé au nouveau ${isEmail ? "e-mail" : "numéro (SMS simulé)"}.`} testid={`change-${kind}-card`}>
      {!ch ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">{isEmail ? "Nouvel e-mail" : "Nouveau numéro"}</Label><Input type={isEmail ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" data-testid={`${kind}-new-value`} /></div>
          <div><Label className="text-xs">Mot de passe actuel</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="mt-1" data-testid={`${kind}-password`} /></div>
          <div><Button className="rounded-full" disabled={!value || !pwd} onClick={request} data-testid={`${kind}-send-code`}>Recevoir un code</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Code reçu sur {ch.value}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-40 font-mono" data-testid={`${kind}-code`} /></div>
          <Button className="rounded-full" disabled={code.length < 6} onClick={confirm} data-testid={`${kind}-confirm`}>Confirmer</Button>
          <Button variant="ghost" onClick={() => setCh(null)} data-testid={`${kind}-cancel`}>Annuler</Button>
        </div>
      )}
    </Card>
  );
}

const DEL_STATUS = { PENDING: "En attente de 2 administrateurs", AWAITING_USER: "Approuvée — confirmez via le lien reçu par e-mail",
  REJECTED: "Refusée", CANCELLED: "Annulée", COMPLETED: "Effectuée" };

function DeletionCard() {
  const [req, setReq] = useState(undefined);
  const [pwd, setPwd] = useState("");
  const [reason, setReason] = useState("");
  const load = () => api.get("/account/deletion").then((r) => setReq(r.data.request)).catch(() => setReq(null));
  useEffect(() => { load(); }, []);
  const active = req && ["PENDING", "AWAITING_USER"].includes(req.status);
  const submit = async () => {
    if (!window.confirm("Confirmer la demande de suppression de votre compte ?")) return;
    try { const { data } = await api.post("/account/deletion", { current_password: pwd, reason }); toast.success(data.message); setPwd(""); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const cancel = async () => { try { await api.delete("/account/deletion"); toast.success("Demande annulée"); load(); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <Card icon={Trash2} title="Supprimer mon compte" testid="delete-account-card"
      sub="La demande doit être approuvée par 2 administrateurs, puis vous confirmez vous-même via un lien reçu par e-mail. Vos données personnelles sont effacées ; vous pouvez demander une restauration pendant 3 mois.">
      {req && (
        <div className="mb-3 text-sm flex flex-wrap items-center gap-2" data-testid="deletion-status">
          <StatusBadge status={req.status} label={ACCOUNT_REQ_LABELS[req.status]} /><span>{DEL_STATUS[req.status]}</span>
          {req.status === "PENDING" && <span className="text-muted-foreground">({req.approvals.length}/2 approbations)</span>}
          {req.status === "REJECTED" && req.reject_note && <span className="text-muted-foreground">— {req.reject_note}</span>}
        </div>
      )}
      {active ? (
        <Button variant="outline" className="rounded-full" onClick={cancel} data-testid="deletion-cancel">Annuler ma demande</Button>
      ) : (
        <div className="space-y-3">
          <div><Label className="text-xs">Raison (facultatif)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" data-testid="deletion-reason" /></div>
          <div className="flex flex-wrap items-end gap-3">
            <div><Label className="text-xs">Mot de passe actuel</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="mt-1" data-testid="deletion-password" /></div>
            <Button variant="destructive" className="rounded-full" disabled={!pwd} onClick={submit} data-testid="deletion-submit">Demander la suppression</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddressesCard() {
  const { user, refresh } = useAuth();
  const empty = { label: "", address: "", city: "", country: user?.country || "", phone: user?.phone || "", is_default: false };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);
  const list = user?.addresses || [];
  const done = async () => { setF(empty); setEditing(null); if (refresh) await refresh(); };
  const submit = async () => {
    try {
      if (editing) await api.put(`/me/addresses/${editing}`, f); else await api.post("/me/addresses", f);
      toast.success("Adresse enregistrée"); await done();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const makeDefault = async (a) => { try { await api.put(`/me/addresses/${a.id}`, { ...a, is_default: true }); await done(); } catch (e) { toast.error(apiErr(e)); } };
  const remove = async (a) => { try { await api.delete(`/me/addresses/${a.id}`); await done(); } catch (e) { toast.error(apiErr(e)); } };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card icon={Mail} title="Adresses de livraison" testid="addresses-card"
      sub="Une adresse par défaut est obligatoire. Vous pouvez en ajouter plusieurs.">
      {list.length === 0 && <p className="text-sm text-red-600 mb-3">Aucune adresse enregistrée : ajoutez-en une.</p>}
      <div className="space-y-2 mb-4">
        {list.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 border border-border rounded-lg p-3 text-sm">
            <div>
              <div className="font-medium">{a.label || "Adresse"} {a.is_default && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Par défaut</span>}</div>
              <div className="text-muted-foreground">{a.address}, {a.city}{a.country ? `, ${a.country}` : ""}{a.phone ? ` · ${a.phone}` : ""}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              {!a.is_default && <Button size="sm" variant="outline" onClick={() => makeDefault(a)}>Par défaut</Button>}
              <Button size="sm" variant="outline" onClick={() => { setEditing(a.id); setF({ ...a }); }}>Modifier</Button>
              {!a.is_default && <Button size="sm" variant="outline" onClick={() => remove(a)}><Trash2 className="w-4 h-4" /></Button>}
            </div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Input placeholder="Nom (Maison, Bureau…)" value={f.label} onChange={set("label")} />
        <Input placeholder="Adresse (quartier, rue, repères) *" value={f.address} onChange={set("address")} data-testid="addr-address" />
        <Input placeholder="Ville *" value={f.city} onChange={set("city")} data-testid="addr-city" />
        <Input placeholder="Pays" value={f.country} onChange={set("country")} />
        <Input placeholder="Téléphone" value={f.phone} onChange={set("phone")} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} /> Définir par défaut</label>
      </div>
      <div className="flex gap-2 mt-3">
        <Button onClick={submit} data-testid="addr-save">{editing ? "Mettre à jour" : "Ajouter l'adresse"}</Button>
        {editing && <Button variant="outline" onClick={() => { setEditing(null); setF(empty); }}>Annuler</Button>}
      </div>
    </Card>
  );
}

export function AccountSettings() {
  const { user } = useAuth();
  return (
    <div data-testid="account-settings-page">
      <PageHeader title="Mon compte" subtitle={user?.email} />
      <div className="space-y-5 max-w-3xl">
        <AddressesCard />
        <PasswordCard />
        {user?.role === "CLIENT" && <><ContactChange kind="email" /><ContactChange kind="phone" /></>}
        <DeletionCard />
      </div>
    </div>
  );
}
