import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, EmptyState } from "@/components/common";
import { StatusBadge } from "@/components/StatusBadge";
import { RouteEvents } from "@/components/OrderTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScanLine, Package, MapPin, Navigation, Pencil, Mail, UserCog } from "lucide-react";

const isRelay = (u) => u?.role === "RELAY_MANAGER";

export function PartnerLayout() {
  const { user } = useAuth();
  const nav = [
    { to: "/partner", label: "Scanner un colis", icon: ScanLine, testid: "scan", end: true },
    { to: "/partner/parcels", label: "Mes colis", icon: Package, testid: "parcels" },
    { to: "/partner/relay-points", label: "Points relais", icon: MapPin, testid: "relay-points" },
    { to: "/partner/messages", label: "Messages", icon: Mail, testid: "messages" },
    { to: "/partner/account", label: "Mon compte", icon: UserCog, testid: "account" },
  ];
  return <DashboardShell nav={nav} title={isRelay(user) ? "Point relais" : "Transporteur"} subtitle="AfriMarket Logistique" />;
}

function CameraScanner({ onCode }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(true);
  const stop = () => {
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stop(), []);
  const start = async () => {
    if (!("BarcodeDetector" in window)) { setSupported(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["code_128", "qr_code", "ean_13"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes?.length) { stop(); onCode(codes[0].rawValue, "SCAN"); return; }
        } catch {}
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { setSupported(false); }
  };
  return (
    <div className="space-y-3">
      <div className="bg-black rounded-xl overflow-hidden aspect-video relative grid place-items-center">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {!scanning && <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Caméra inactive</div>}
        {scanning && <div className="absolute inset-x-6 top-1/2 h-0.5 bg-primary animate-pulse" />}
      </div>
      {supported ? (
        scanning ? <Button variant="outline" className="w-full rounded-full" onClick={stop}>Arrêter</Button>
          : <Button className="w-full rounded-full" onClick={start} data-testid="partner-start-scan"><ScanLine className="w-4 h-4 mr-2" /> Activer la caméra</Button>
      ) : (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="partner-scan-unsupported">
          Scan caméra indisponible sur cet appareil. Utilisez une douchette ou la saisie ci-dessous.
        </div>
      )}
    </div>
  );
}

function RelayActions({ parcel, act, couriers }) {
  const [courierId, setCourierId] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3" data-testid="relay-actions">
      <Input placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="event-note" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => act("ARRIVED", { note })} data-testid="event-arrived">Signaler l'arrivée</Button>
        <Button variant="outline" className="rounded-full" onClick={() => act("DEPARTED", { note })} data-testid="event-departed">Départ du colis</Button>
        <Button className="rounded-full" onClick={() => act("AVAILABLE_PICKUP", { note })} data-testid="event-pickup">Disponible pour retrait</Button>
      </div>
      <div className="flex gap-2">
        <Select value={courierId} onValueChange={setCourierId}>
          <SelectTrigger data-testid="event-courier-select"><SelectValue placeholder="Livreur local recensé" /></SelectTrigger>
          <SelectContent>{couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}{c.city ? ` (${c.city})` : ""}</SelectItem>)}</SelectContent>
        </Select>
        <Button className="rounded-full shrink-0" disabled={!courierId} onClick={() => act("HANDED_LOCAL_COURIER", { courier_id: courierId, note })} data-testid="event-handover">Remettre au livreur</Button>
      </div>
    </div>
  );
}

function CarrierActions({ act, points }) {
  const [type, setType] = useState("POSITION");
  const [pointId, setPointId] = useState("");
  const [location, setLocation] = useState("");
  const [gps, setGps] = useState(null);
  const locate = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation indisponible"); return; }
    navigator.geolocation.getCurrentPosition((p) => setGps({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => toast.error("Position refusée ou indisponible"));
  };
  return (
    <div className="space-y-3" data-testid="carrier-actions">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger data-testid="carrier-event-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="POSITION">Position en route</SelectItem>
            <SelectItem value="ARRIVED">Arrivé à un point relais</SelectItem>
            <SelectItem value="DEPARTED">Parti d'un point relais</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pointId || "NONE"} onValueChange={(v) => setPointId(v === "NONE" ? "" : v)}>
          <SelectTrigger data-testid="carrier-point-select"><SelectValue placeholder="Point relais" /></SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="NONE">Aucun point relais</SelectItem>
            {points.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.city}, {p.country}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Lieu (ville, axe routier...)" value={location} onChange={(e) => setLocation(e.target.value)} data-testid="carrier-location" />
        <Button variant="outline" className="rounded-full shrink-0" onClick={locate} data-testid="carrier-gps"><Navigation className="w-4 h-4 mr-1" /> GPS</Button>
      </div>
      {gps && <div className="text-xs text-muted-foreground" data-testid="carrier-gps-value">Position : {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</div>}
      <Button className="w-full rounded-full" onClick={async () => { if (await act(type, { relay_point_id: pointId || null, location, ...(gps || {}) })) { setLocation(""); setGps(null); } }} data-testid="carrier-submit">
        {type === "POSITION" ? "Mettre à jour la position" : type === "ARRIVED" ? "Enregistrer l'arrivée" : "Enregistrer le départ"}
      </Button>
    </div>
  );
}

function PartnerCounters() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const load = () => api.get("/partner/stats").then((r) => setS(r.data)).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);
  if (!s) return null;
  return (
    <div className="grid grid-cols-3 gap-3 mb-6" data-testid="partner-counters">
      {s.counters.map((c) => (
        <div key={c.key} className={`rounded-xl border p-4 ${c.key === "late" && c.value > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`} data-testid={`counter-${c.key}`}>
          <div className={`text-3xl font-display font-extrabold ${c.key === "late" && c.value > 0 ? "text-destructive" : ""}`}>{c.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export function PartnerScan() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [parcel, setParcel] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [points, setPoints] = useState([]);
  useEffect(() => {
    if (isRelay(user)) api.get("/partner/local-couriers").then((r) => setCouriers(r.data.couriers)).catch(() => {});
    else api.get("/partner/relay-points").then((r) => setPoints(r.data.relay_points)).catch(() => {});
  }, [user]);

  const post = async (c, type, extra = {}, method = "MANUAL") => {
    const { data } = await api.post(`/partner/parcels/${encodeURIComponent(c)}/events`, { type, method, ...extra });
    setParcel(data.parcel);
    toast.success(data.message);
  };
  const lookup = async (value, method) => {
    const c = (value || "").trim();
    if (!c) return;
    setCode(c);
    try {
      const { data } = await api.get(`/partner/parcels/${encodeURIComponent(c)}`);
      setParcel(data.parcel);
      if (method === "SCAN" && isRelay(user) && !data.parcel.last_mile) await post(c, "ARRIVED", {}, "SCAN");
    } catch (e) { setParcel(null); toast.error(apiErr(e)); }
  };
  const act = async (type, extra) => {
    try { await post(parcel.tracking_number || parcel.ref, type, extra); return true; } catch (e) { toast.error(apiErr(e)); return false; }
  };

  return (
    <div>
      <PageHeader title="Scanner un colis" subtitle={isRelay(user) ? "Le scan enregistre automatiquement l'arrivée du colis à votre point relais" : "Mettez à jour la position des colis confiés à votre transporteur"} />
      <PartnerCounters />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <CameraScanner onCode={lookup} />
          <form className="bg-card border border-border rounded-xl p-4" onSubmit={(e) => { e.preventDefault(); lookup(code, "MANUAL"); }}>
            <Label>N° de suivi ou référence (saisie / douchette)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AM... ou CMD-..." data-testid="partner-code-input" autoFocus />
              <Button type="submit" className="rounded-full" data-testid="partner-code-submit">Rechercher</Button>
            </div>
          </form>
        </div>
        {parcel ? (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="parcel-panel">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono font-semibold" data-testid="parcel-ref">{parcel.ref}</div>
                <div className="text-xs text-muted-foreground">{parcel.shop_name} → {parcel.customer_name} · {parcel.items_count} article(s)</div>
                <div className="text-xs text-muted-foreground">{parcel.address}</div>
              </div>
              <StatusBadge status={parcel.status} />
            </div>
            {parcel.current_location && <div className="text-sm" data-testid="parcel-location"><MapPin className="w-4 h-4 inline mr-1 text-primary" />{parcel.current_location}</div>}
            {parcel.last_mile ? (
              <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-3" data-testid="parcel-last-mile">
                Dernière étape enregistrée — en attente de la confirmation du client avec son code de réception.
              </div>
            ) : isRelay(user) ? <RelayActions parcel={parcel} act={act} couriers={couriers} /> : <CarrierActions act={act} points={points} />}
            <RouteEvents events={parcel.route_events} />
          </div>
        ) : (
          <EmptyState title="Aucun colis sélectionné" description="Scannez l'étiquette ou saisissez le numéro de suivi." />
        )}
      </div>
    </div>
  );
}

export function PartnerParcels() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/partner/parcels").then((r) => setRows(r.data.parcels)).catch(() => setRows([])); }, []);
  return (
    <div>
      <PageHeader title="Mes colis" subtitle="Colis passés par votre point relais ou confiés à votre transporteur" />
      <PartnerCounters />
      {rows && rows.length === 0 && <EmptyState title="Aucun colis" description="Les colis scannés apparaîtront ici." />}
      <div className="space-y-3">
        {(rows || []).map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4" data-testid={`parcel-row-${p.ref}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-sm font-semibold">{p.ref} <span className="text-xs text-muted-foreground font-sans">{p.tracking_number}</span></div>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">{p.current_location || "Pas encore de position"} · {p.route_events.length} étape(s)</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const POINT_KEYS = [["name", "Nom"], ["city", "Ville"], ["address", "Adresse"], ["phone", "Téléphone"], ["opening_hours", "Horaires"]];

function PointEditDialog({ point, onClose, onSaved }) {
  const [f, setF] = useState(point);
  useEffect(() => { setF(point); }, [point]);
  if (!point) return null;
  const save = async () => {
    const payload = {};
    POINT_KEYS.forEach(([k]) => { if ((f[k] || "") !== (point[k] || "")) payload[k] = f[k] || ""; });
    try { const { data } = await api.put(`/partner/relay-points/${point.id}`, payload); toast.success(data.message); onSaved(); onClose(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <Dialog open={!!point} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier « {point.name} »</DialogTitle>
          <DialogDescription>La suppression d'un point relais est réservée à l'administrateur.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {POINT_KEYS.map(([k, l]) => (
            <div key={k}><Label className="text-xs">{l}</Label><Input className="mt-1" value={f?.[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`point-edit-${k}`} /></div>
          ))}
          <Button className="w-full rounded-full mt-2" onClick={save} data-testid="point-edit-save">Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MODE_TEXT = {
  NONE: "Vous n'êtes pas autorisé à modifier les points relais.",
  APPROVAL: "Vos modifications sont envoyées à l'administrateur pour validation.",
  DIRECT: "Vos modifications s'appliquent directement.",
};

export function PartnerRelayPoints() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [points, setPoints] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => {
    api.get("/partner/me").then((r) => setMe(r.data)).catch(() => {});
    api.get("/partner/relay-points").then((r) => setPoints(r.data.relay_points)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const mode = me?.account?.relay_edit_mode || "NONE";
  const canEdit = (p) => mode !== "NONE" && (!isRelay(user) || p.id === me?.account?.relay_point_id);
  return (
    <div>
      <PageHeader title="Points relais" subtitle={MODE_TEXT[mode]} />
      {me?.relay_point && <div className="mb-4 text-sm" data-testid="my-relay-point">Votre point relais : <strong>{me.relay_point.name}</strong> — {me.relay_point.city}, {me.relay_point.country}</div>}
      {me?.carrier && <div className="mb-4 text-sm" data-testid="my-carrier">Votre transporteur : <strong>{me.carrier.name}</strong></div>}
      <div className="grid md:grid-cols-2 gap-3">
        {points.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex justify-between gap-2" data-testid={`partner-point-${p.id}`}>
            <div className="text-sm">
              <div className="font-semibold">{p.name} <span className="font-mono text-xs text-muted-foreground">{p.code}</span></div>
              <div className="text-muted-foreground text-xs">{p.address} — {p.city}, {p.country}</div>
              {p.opening_hours && <div className="text-xs">{p.opening_hours}</div>}
            </div>
            {canEdit(p) && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEdit(p)} data-testid={`partner-point-edit-${p.id}`}><Pencil className="w-3.5 h-3.5 mr-1" /> Modifier</Button>}
          </div>
        ))}
      </div>
      {me?.change_requests?.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display font-bold mb-2">Mes demandes de modification</h3>
          {me.change_requests.map((r) => (
            <div key={r.id} className="text-sm border-b border-border py-2" data-testid={`my-change-${r.id}`}>
              {r.relay_name} — {Object.keys(r.changes).join(", ")} — <strong>{r.status === "PENDING" ? "en attente" : r.status === "APPROVED" ? "acceptée" : "refusée"}</strong>
            </div>
          ))}
        </div>
      )}
      <PointEditDialog point={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}

export function PartnerMessages() {
  const [data, setData] = useState(null);
  const load = () => api.get("/notifications").then((r) => setData(r.data)).catch(() => setData({ notifications: [], unread: 0 }));
  useEffect(() => { load(); }, []);
  const read = async (n) => { if (!n.read) { await api.put(`/notifications/${n.id}/read`).catch(() => {}); load(); } };
  const readAll = async () => { await api.put("/notifications/read-all").catch(() => {}); load(); };
  return (
    <div>
      <PageHeader title="Messages" subtitle={data ? `${data.unread} non lu(s)` : ""} />
      {data?.unread > 0 && <Button variant="outline" className="rounded-full mb-4" onClick={readAll} data-testid="messages-read-all">Tout marquer comme lu</Button>}
      {data && data.notifications.length === 0 && <EmptyState title="Aucun message" description="Les alertes colis et les messages de l'administrateur apparaîtront ici." />}
      <div className="space-y-2">
        {(data?.notifications || []).map((n) => (
          <button key={n.id} type="button" onClick={() => read(n)} data-testid={`message-${n.id}`}
            className={`w-full text-left border rounded-xl p-4 transition-colors ${n.read ? "bg-card border-border" : "bg-primary/5 border-primary/30"}`}>
            <div className="flex justify-between gap-2">
              <span className="font-semibold text-sm">{n.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{new Date(n.created_at).toLocaleString("fr-FR")}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{n.message}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
