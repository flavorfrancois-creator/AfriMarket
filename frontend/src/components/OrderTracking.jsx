import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  MapPin, Truck, PackageCheck, Package, ClipboardCheck, ShoppingBag, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Clock, Route,
} from "lucide-react";

const FLOW = [
  { key: "NOUVELLE", label: "Commande passée", icon: ShoppingBag, aliases: ["NOUVELLE", "EN_ATTENTE"] },
  { key: "APPROUVEE", label: "Commande confirmée", icon: ClipboardCheck, aliases: ["APPROUVEE"] },
  { key: "EN_PREPARATION", label: "En préparation", icon: Package, aliases: ["EN_PREPARATION"] },
  { key: "PRETE", label: "Prête à expédier", icon: PackageCheck, aliases: ["PRETE"] },
  { key: "EXPEDIEE", label: "Expédiée", icon: Truck, aliases: ["EXPEDIEE"] },
  { key: "LIVREE", label: "Livrée", icon: MapPin, aliases: ["LIVREE"] },
];

const TERMINAL = {
  ANNULEE: { label: "Commande annulée", icon: XCircle, tone: "text-gray-600", bg: "bg-gray-100" },
  REJETEE: { label: "Commande rejetée", icon: XCircle, tone: "text-red-700", bg: "bg-red-100" },
  REMBOURSEE: { label: "Commande remboursée", icon: RotateCcw, tone: "text-orange-700", bg: "bg-orange-100" },
  PARTIELLEMENT_REMBOURSEE: { label: "Partiellement remboursée", icon: RotateCcw, tone: "text-orange-700", bg: "bg-orange-100" },
};

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function RouteEvents({ events }) {
  if (!events?.length) return null;
  const list = [...events].reverse();
  return (
    <div className="mt-4" data-testid="route-events">
      <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Route className="w-4 h-4 text-primary" /> Parcours du colis</div>
      <ol className="border-l-2 border-primary/30 ml-2 space-y-3">
        {list.map((e, i) => (
          <li key={e.id} className="pl-4 relative" data-testid={`route-event-${e.id}`}>
            <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${i === 0 ? "bg-primary ring-4 ring-primary/20" : "bg-primary/40"}`} />
            <div className="text-sm font-medium">{e.label}{e.method === "SCAN" && <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">scan</span>}</div>
            <div className="text-xs text-muted-foreground">{e.location}</div>
            {e.courier_name && <div className="text-xs">Livreur local : <strong>{e.courier_name}</strong> ({e.courier_phone})</div>}
            {e.note && <div className="text-xs italic">{e.note}</div>}
            <div className="text-[11px] text-muted-foreground">{fmtDateTime(e.at)} · {e.by_role === "CARRIER_AGENT" ? "Transporteur" : "Point relais"}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TrackingTimeline({ order }) {
  const history = order.status_history || [];
  const dateOf = (aliases) => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (aliases.includes(history[i].status)) return history[i].at;
    }
    return null;
  };
  const status = order.status;
  const terminal = TERMINAL[status];
  const currentIndex = FLOW.findIndex((s) => s.aliases.includes(status));
  const isLate = order.expected_delivery && status === "EXPEDIEE" && !order.delivered_confirmed
    && new Date(order.expected_delivery) < new Date();

  return (
    <div data-testid="tracking-timeline">
      {/* Header info */}
      <div className="bg-muted/50 rounded-xl p-4 mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Truck className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Transporteur :</span>
          <span className="font-semibold" data-testid="tracking-carrier">{order.carrier_name || "Non assigné"}</span>
        </div>
        {order.tracking_number && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-primary shrink-0" />
            <span className="text-muted-foreground">N° de suivi :</span>
            <span className="font-mono font-semibold" data-testid="tracking-number">{order.tracking_number}</span>
          </div>
        )}
        {status === "LIVREE" ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-semibold" data-testid="tracking-delivered">Livrée le {fmtDate(dateOf(["LIVREE"]))}</span>
          </div>
        ) : order.expected_delivery ? (
          <div className={`flex items-center gap-2 text-sm ${isLate ? "text-red-700" : "text-foreground"}`}>
            <Clock className="w-4 h-4 shrink-0" />
            <span className="text-muted-foreground">Livraison estimée :</span>
            <span className="font-semibold capitalize" data-testid="tracking-eta">{fmtDate(order.expected_delivery)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 shrink-0" />
            <span data-testid="tracking-eta-pending">Date de livraison estimée disponible après expédition</span>
          </div>
        )}
      </div>

      {isLate && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 mb-4 text-sm" data-testid="tracking-late-alert">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Livraison en retard — l'échéance estimée est dépassée.
        </div>
      )}

      {terminal ? (
        <div className={`flex items-center gap-3 rounded-xl p-4 ${terminal.bg}`} data-testid="tracking-terminal">
          <terminal.icon className={`w-6 h-6 ${terminal.tone}`} />
          <div>
            <div className={`font-semibold ${terminal.tone}`}>{terminal.label}</div>
            <div className="text-xs text-muted-foreground">{fmtDateTime(dateOf([status]))}</div>
          </div>
        </div>
      ) : (
        <ol className="relative">
          {FLOW.map((step, idx) => {
            const at = dateOf(step.aliases);
            const done = idx < currentIndex || (idx === currentIndex);
            const isCurrent = idx === currentIndex;
            const reached = !!at || idx < currentIndex;
            const Icon = step.icon;
            const isLast = idx === FLOW.length - 1;
            return (
              <li key={step.key} className="flex gap-4 pb-6 last:pb-0 relative" data-testid={`tracking-step-${step.key}`}>
                {!isLast && (
                  <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${reached && idx < currentIndex ? "bg-primary" : "bg-border"}`} />
                )}
                <div className={`relative z-10 w-8 h-8 rounded-full grid place-items-center shrink-0 transition-colors
                  ${isCurrent ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : reached ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="pt-1 min-w-0">
                  <div className={`text-sm font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                    {isCurrent && status !== "LIVREE" && <span className="ml-2 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full align-middle">En cours</span>}
                  </div>
                  {at ? (
                    <div className="text-xs text-muted-foreground">{fmtDateTime(at)}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground/60">En attente</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {order.last_mile && order.status === "EXPEDIEE" && (
        <div className="mt-4 text-sm bg-green-50 border border-green-200 rounded-lg p-3" data-testid="tracking-last-mile">
          {order.last_mile === "AVAILABLE_PICKUP" ? "Votre colis vous attend au point relais." : "Votre colis est en cours de remise par un livreur local."}{" "}
          Confirmez la réception avec votre code <strong className="font-mono">{order.tracking_number || order.ref}</strong>.
        </div>
      )}
      <RouteEvents events={order.route_events} />
    </div>
  );
}

export function TrackingDialog({ order, onClose }) {
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suivi de commande — {order.ref}</DialogTitle>
          <DialogDescription>{order.shop_name} · {order.items?.length || 0} article(s)</DialogDescription>
        </DialogHeader>
        <TrackingTimeline order={order} />
      </DialogContent>
    </Dialog>
  );
}

export function TrackingButton({ order, size = "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="outline" className="rounded-full h-8" onClick={() => setOpen(true)} data-testid={`track-${order.ref}`}>
        <MapPin className="w-3.5 h-3.5 mr-1" /> Suivre
      </Button>
      <TrackingDialog order={open ? order : null} onClose={() => setOpen(false)} />
    </>
  );
}
