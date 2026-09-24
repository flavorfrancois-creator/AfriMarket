import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import api, { apiErr, downloadFile } from "@/lib/api";
import { money } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { usePrivateClient } from "@/context/PrivateClientContext";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, StatCard, EmptyState, Loading } from "@/components/common";
import { StatusBadge } from "@/components/StatusBadge";
import { TrackingButton } from "@/components/OrderTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Home, ShoppingBag, Heart, Gift, Wallet, Users, Banknote, User, Copy, TrendingUp, UserPlus, FileText, Printer, Tag, ScanLine, Trash2, Truck,
} from "lucide-react";

export function ClientLayout() {
  const { t } = useI18n();
  const nav = [
    { to: "/account", label: t("dashboard"), icon: Home, testid: "overview" },
    { to: "/account/orders", label: t("my_orders"), icon: ShoppingBag, testid: "orders" },
    { to: "/account/favorites", label: t("favorites"), icon: Heart, testid: "favorites" },
    { to: "/account/private-client", label: "Mon client", icon: UserPlus, testid: "private-client" },
    { to: "/account/scan", label: "Scanner", icon: ScanLine, testid: "scan" },
    { to: "/account/wallet", label: t("my_wallet"), icon: Wallet, testid: "wallet" },
    { to: "/account/withdrawals", label: t("my_withdrawals"), icon: Banknote, testid: "withdrawals" },
    { to: "/account/invitation", label: t("my_invitation"), icon: Users, testid: "invitation" },
    { to: "/account/profile", label: t("profile"), icon: User, testid: "profile" },
  ];
  return <DashboardShell nav={nav} title="Espace Client" subtitle="AfriMarket" />;
}

export function ClientOverview() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data.orders)).catch(() => {});
    api.get("/wallet").then((r) => setWallet(r.data)).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title={`Bonjour, ${user?.name?.split(" ")[0]} 👋`} subtitle="Voici un aperçu de votre compte" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Commandes" value={orders.length} icon={ShoppingBag} />
        <StatCard label="Solde disponible" value={money(wallet?.total_available, user?.currency)} icon={Wallet} accent="bg-green-100 text-green-700" />
        <StatCard label="En attente" value={money(wallet?.total_pending, user?.currency)} icon={TrendingUp} accent="bg-amber-100 text-amber-700" />
        <StatCard label="Bonus promo" value={money(wallet?.wallets?.bonus_promo?.available, user?.currency)} icon={Gift} accent="bg-primary/10 text-primary" />
      </div>
      <h2 className="font-display font-bold mt-8 mb-4">Commandes récentes</h2>
      {orders.length === 0 ? (
        <EmptyState title="Aucune commande" description="Parcourez la marketplace et passez votre première commande." action={<Link to="/products"><Button className="rounded-full">Voir les produits</Button></Link>} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Réf.</TableHead><TableHead>Boutique</TableHead><TableHead>Total</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
            <TableBody>
              {orders.slice(0, 5).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.ref}</TableCell>
                  <TableCell>{o.shop_name}</TableCell>
                  <TableCell className="font-mono text-right">{money(o.total, o.currency)}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ClientOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [label, setLabel] = useState(null);
  const load = () => api.get("/orders/mine").then((r) => setOrders(r.data.orders)).catch(() => setOrders([]));
  useEffect(() => { load(); }, []);
  const confirmReceipt = async (o) => {
    const code = window.prompt(`Scannez / saisissez le numéro de suivi de la commande ${o.ref} :`, o.tracking_number);
    if (!code) return;
    try { await api.post(`/orders/${o.id}/confirm-receipt`, { code }); toast.success("Réception confirmée"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (orders === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Mes commandes" />
      {orders.length === 0 ? <EmptyState title="Aucune commande" /> : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-card border border-border rounded-xl p-4" data-testid={`order-${o.ref}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-mono text-sm font-semibold">{o.ref}</span>
                  <span className="text-muted-foreground text-xs ml-2">{o.shop_name} · {o.created_at?.slice(0, 10)}</span>
                  {o.is_private && <span className="ml-2 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">Client : {o.private_client?.name}</span>}
                  {o.delivered_confirmed && <span className="ml-2 text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">Réception confirmée</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={o.status} />
                  <TrackingButton order={o} />
                  <Button size="sm" variant="outline" className="rounded-full h-8" onClick={() => setInvoice(o)} data-testid={`invoice-${o.ref}`}><FileText className="w-3.5 h-3.5 mr-1" /> Facture</Button>
                  <Button size="sm" variant="outline" className="rounded-full h-8" onClick={() => setLabel(o)} data-testid={`label-${o.ref}`}><Tag className="w-3.5 h-3.5 mr-1" /> Étiquette</Button>
                  {["EXPEDIEE", "LIVREE"].includes(o.status) && !o.delivered_confirmed && (
                    <Button size="sm" className="rounded-full h-8" onClick={() => confirmReceipt(o)} data-testid={`scan-${o.ref}`}><ScanLine className="w-3.5 h-3.5 mr-1" /> Scanner réception</Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {o.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <img src={it.image} alt="" className="w-9 h-9 rounded object-cover" />
                    <span>{it.name} × {it.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                <span className="text-muted-foreground">Total (dont livraison {money(o.shipping, o.currency)})</span>
                <span className="font-mono font-semibold">{money(o.total, o.currency)}</span>
              </div>
              {o.bonus_total > 0 && <div className="text-xs text-primary mt-1">Bonus généré : {money(o.bonus_total, o.currency)}</div>}
              {o.margin_total > 0 && <div className="text-xs text-green-600 mt-1">Marge revendeur : {money(o.margin_total, o.currency)}</div>}
            </div>
          ))}
        </div>
      )}
      <InvoiceDialog order={invoice} onClose={() => setInvoice(null)} accountName={user?.name} />
      <LabelDialog order={label} onClose={() => setLabel(null)} accountName={user?.name} />
    </div>
  );
}

function InvoiceDialog({ order, onClose, accountName }) {
  if (!order) return null;
  const to = order.is_private ? order.private_client : { name: accountName, phone: "", city: order.address, address: order.address };
  const delivered = order.status === "LIVREE";
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Facture — {order.ref}</DialogTitle>
          <DialogDescription>Facture de la commande {order.ref} — {order.shop_name}</DialogDescription>
        </DialogHeader>
        <div id="invoice-print" className="text-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-display font-extrabold text-lg">AfriMarket</div>
              <div className="text-xs text-muted-foreground">{order.shop_name}</div>
            </div>
            <div className="text-right text-xs">
              <div className="font-mono font-semibold">{order.ref}</div>
              <div className="text-muted-foreground">{order.created_at?.slice(0, 10)}</div>
            </div>
          </div>
          <div className={`inline-block text-xs font-bold px-2 py-1 rounded mb-3 ${delivered ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {delivered ? "LIVRÉ" : "NON LIVRÉ"}
          </div>
          <div className="bg-muted/50 rounded-lg p-3 mb-4">
            <div className="text-xs text-muted-foreground mb-1">Facturé à</div>
            <div className="font-medium">{to?.name}</div>
            {to?.phone && <div className="text-xs">{to.phone}</div>}
            {to?.city && <div className="text-xs">{to.city}</div>}
            {order.is_private && <div className="text-[10px] text-primary mt-1">Prix client simple — commande pour compte de tiers</div>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-1">Article</th><th className="text-center">Qté</th><th className="text-right">P.U.</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i} className="border-b border-border/40"><td className="py-1.5">{it.name}</td><td className="text-center">{it.qty}</td><td className="text-right font-mono">{money(it.unit_price, order.currency)}</td><td className="text-right font-mono">{money(it.line_total, order.currency)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sous-total</span><span className="font-mono">{money(order.subtotal, order.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Livraison</span><span className="font-mono">{money(order.shipping, order.currency)}</span></div>
            <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total</span><span className="font-mono">{money(order.total, order.currency)}</span></div>
          </div>
        </div>
        {delivered ? (
          <Button className="rounded-full" onClick={() => downloadFile(`/orders/${order.id}/invoice`, `Facture-${order.ref}.pdf`)} data-testid="download-invoice-pdf"><FileText className="w-4 h-4 mr-2" /> Télécharger la facture (PDF)</Button>
        ) : (
          <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">Le PDF sera téléchargeable une fois la commande <strong>livrée</strong>.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LabelDialog({ order, onClose, accountName }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (order && svgRef.current) {
      try { JsBarcode(svgRef.current, order.tracking_number || order.ref, { format: "CODE128", displayValue: true, height: 60, fontSize: 14 }); }
      catch {}
    }
  }, [order]);
  if (!order) return null;
  const to = order.is_private ? order.private_client : { name: accountName, city: order.address };
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Étiquette d'expédition</DialogTitle>
          <DialogDescription>Étiquette de la commande {order.ref}</DialogDescription>
        </DialogHeader>
        <div id="invoice-print" className="border border-border rounded-lg p-4 text-sm">
          <div className="flex items-center gap-2 mb-2"><Truck className="w-4 h-4 text-primary" /><span className="font-display font-bold">AfriMarket · {order.shop_name}</span></div>
          <div className="text-xs text-muted-foreground">Destinataire</div>
          <div className="font-semibold">{to?.name}</div>
          {to?.phone && <div className="text-xs">{to.phone}</div>}
          <div className="text-xs">{order.private_client?.address || order.address || to?.city || "—"}</div>
          <div className="mt-3 flex justify-center"><svg ref={svgRef} /></div>
          <div className="text-center text-xs mt-1">N° de suivi : <span className="font-mono font-semibold">{order.tracking_number}</span></div>
          <div className="text-[10px] text-muted-foreground text-center mt-2">Le client scanne ce code à la réception pour confirmer sa commande.</div>
        </div>
        <Button variant="outline" className="rounded-full" onClick={() => window.print()} data-testid="print-label"><Printer className="w-4 h-4 mr-2" /> Imprimer l'étiquette</Button>
      </DialogContent>
    </Dialog>
  );
}

export function ClientPrivateClient() {
  const { user } = useAuth();
  const { client, setClient, active, clear } = usePrivateClient();
  const navigate = useNavigate();
  const [f, setF] = useState(client || { name: "", phone: "", city: "", address: "" });
  const [book, setBook] = useState([]);
  const [saveToBook, setSaveToBook] = useState(true);
  const canBook = user?.is_partner || ["PARTENAIRE", "PROFESSIONNEL", "ENTREPRISE"].includes(user?.role);
  const upd = (k, v) => setF({ ...f, [k]: v });
  const loadBook = () => api.get("/private-clients").then((r) => setBook(r.data.clients)).catch(() => {});
  useEffect(() => { loadBook(); }, []);

  const activateWith = (c) => { setClient(c); toast.success(`Mode client activé pour ${c.name}`); navigate("/products"); };
  const activate = async () => {
    if (!f.name.trim()) { toast.error("Le nom du client est requis"); return; }
    if (saveToBook) { try { await api.post("/private-clients", f); loadBook(); } catch {} }
    activateWith(f);
  };
  const del = async (id) => { await api.delete(`/private-clients/${id}`); loadBook(); };

  return (
    <div>
      <PageHeader title="Mon client" subtitle="Commandez pour un client privé, au prix client simple, sans créer de profil" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <div className="space-y-4">
          {active ? (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-5">
              <div className="text-sm text-primary font-semibold mb-2">✓ Mode client actif</div>
              <div className="text-sm"><strong>{client?.name}</strong>{client?.phone ? ` · ${client.phone}` : ""}{client?.city ? ` · ${client.city}` : ""}</div>
              <p className="text-xs text-muted-foreground mt-2">Articles facturés au prix client simple, au nom de ce client. Votre marge revendeur est créditée dans votre portefeuille après livraison.</p>
              <div className="flex gap-2 mt-4">
                <Button className="rounded-full" onClick={() => navigate("/products")} data-testid="go-products">Choisir des articles</Button>
                <Button variant="outline" className="rounded-full" onClick={clear} data-testid="clear-private">Désactiver</Button>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <p className="text-sm text-muted-foreground">Renseignez les informations de votre client. Aucun compte ne sera créé pour lui.</p>
              <div><Label>Nom du client *</Label><Input value={f.name} onChange={(e) => upd("name", e.target.value)} className="mt-1" data-testid="pc-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Téléphone</Label><Input value={f.phone} onChange={(e) => upd("phone", e.target.value)} className="mt-1" data-testid="pc-phone" /></div>
                <div><Label>Ville</Label><Input value={f.city} onChange={(e) => upd("city", e.target.value)} className="mt-1" data-testid="pc-city" /></div>
              </div>
              <div><Label>Adresse</Label><Input value={f.address} onChange={(e) => upd("address", e.target.value)} className="mt-1" data-testid="pc-address" /></div>
              {canBook && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={saveToBook} onChange={(e) => setSaveToBook(e.target.checked)} data-testid="save-to-book" /> Enregistrer dans mon carnet de clients
                </label>
              )}
              <Button className="rounded-full w-full" onClick={activate} data-testid="activate-private-client">Activer et choisir les articles</Button>
              {!canBook && <p className="text-[11px] text-muted-foreground">Astuce : après votre première commande revendeur, vous devenez Partenaire et pourrez enregistrer un carnet de clients.</p>}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-3">Carnet de clients</h3>
          {!canBook ? (
            <p className="text-sm text-muted-foreground">Réservé aux Partenaires, Professionnels et Entreprises.</p>
          ) : book.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun client enregistré pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {book.map((c) => (
                <div key={c.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2" data-testid={`book-${c.id}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[c.phone, c.city].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="rounded-full h-8" onClick={() => activateWith(c)} data-testid={`use-${c.id}`}>Utiliser</Button>
                    <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => del(c.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const WALLET_LABEL = {
  general: "Solde général", bonus_promo: "Bonus promotionnel", earning_partner: "Recette partenaire",
  earning_pro: "Recette professionnel", earning_enterprise: "Recette entreprise",
};

export function ClientWallet() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/wallet").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader title="Mon portefeuille" subtitle="Ledger financier — soldes virtuels" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-primary text-primary-foreground rounded-xl p-6">
          <div className="text-sm opacity-90">Solde disponible au retrait</div>
          <div className="text-3xl font-display font-extrabold font-mono mt-1">{money(data.total_available, user?.currency)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground">Solde en attente</div>
          <div className="text-3xl font-display font-extrabold font-mono mt-1">{money(data.total_pending, user?.currency)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {Object.entries(data.wallets).map(([k, v]) => (
          <div key={k} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground">{WALLET_LABEL[k]}</div>
            <div className="font-mono font-bold mt-1">{money(v.available, user?.currency)}</div>
            {v.pending > 0 && <div className="text-[11px] text-amber-600">+{money(v.pending, user?.currency)} en attente</div>}
          </div>
        ))}
      </div>
      <h2 className="font-display font-bold mb-3">Historique</h2>
      {data.transactions.length === 0 ? <EmptyState title="Aucune transaction" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Portefeuille</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Montant</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs">{tx.created_at?.slice(0, 10)}</TableCell>
                  <TableCell className="text-sm">{tx.description}</TableCell>
                  <TableCell className="text-xs">{WALLET_LABEL[tx.wallet] || tx.wallet}</TableCell>
                  <TableCell><StatusBadge status={tx.status} /></TableCell>
                  <TableCell className={`text-right font-mono ${tx.kind === "WITHDRAWAL" ? "text-red-600" : "text-green-600"}`}>
                    {tx.kind === "WITHDRAWAL" ? "-" : "+"}{money(tx.amount, tx.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ClientWithdrawals() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("MOBILE_MONEY");
  const [dest, setDest] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    api.get("/withdrawals/mine").then((r) => setList(r.data.withdrawals)).catch(() => setList([]));
    api.get("/wallet").then((r) => setWallet(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post("/withdrawals", { amount: parseFloat(amount), method, destination: dest, bank_name: bankName, account_name: accountName });
      toast.success("Demande de retrait enregistrée");
      setOpen(false); setAmount(""); setDest(""); setBankName(""); setAccountName("");
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  };

  if (list === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Mes retraits" subtitle={`Solde disponible : ${money(wallet?.total_available, user?.currency)}`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="rounded-full" data-testid="new-withdrawal-btn">Demander un retrait</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Demande de retrait</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Montant ({user?.currency})</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="withdrawal-amount" className="mt-1" /></div>
                <div><Label>Méthode</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="mt-1" data-testid="withdrawal-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                      <SelectItem value="BANK">Compte bancaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {method === "BANK" ? (
                  <>
                    <div><Label>Banque</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1" data-testid="withdrawal-bank" /></div>
                    <div><Label>Titulaire du compte</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="mt-1" /></div>
                    <div><Label>N° de compte / IBAN</Label><Input value={dest} onChange={(e) => setDest(e.target.value)} className="mt-1" data-testid="withdrawal-dest" /></div>
                  </>
                ) : (
                  <div><Label>N° Mobile Money</Label><Input value={dest} onChange={(e) => setDest(e.target.value)} className="mt-1" data-testid="withdrawal-dest" /></div>
                )}
                <p className="text-xs text-muted-foreground">Le retrait vers un compte bancaire/mobile est soumis à l'approbation de l'administrateur, qui joindra un justificatif.</p>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={loading} className="rounded-full" data-testid="submit-withdrawal">Confirmer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {list.length === 0 ? <EmptyState title="Aucune demande de retrait" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Montant</TableHead><TableHead>Méthode</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-xs">{w.created_at?.slice(0, 10)}</TableCell>
                  <TableCell className="font-mono">{money(w.amount, w.currency)}</TableCell>
                  <TableCell className="text-sm">{w.method}</TableCell>
                  <TableCell><StatusBadge status={w.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ClientInvitation() {
  const { user } = useAuth();
  const copy = () => { navigator.clipboard.writeText(user?.invite_code || ""); toast.success("Code copié !"); };
  return (
    <div>
      <PageHeader title="Mon invitation" subtitle="Parrainez et devenez Partenaire" />
      <div className="bg-card border border-border rounded-xl p-8 max-w-lg">
        <div className="text-sm text-muted-foreground mb-2">Votre code d'invitation personnel</div>
        <div className="flex items-center gap-3">
          <div className="font-mono text-2xl font-bold bg-accent text-accent-foreground px-4 py-3 rounded-lg flex-1 text-center" data-testid="invite-code">{user?.invite_code}</div>
          <Button size="icon" className="rounded-full h-12 w-12" onClick={copy} data-testid="copy-invite"><Copy className="w-5 h-5" /></Button>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Partagez ce code. Lorsqu'un nouvel utilisateur s'inscrit avec, vous devenez automatiquement <span className="font-semibold text-primary">Partenaire</span> et bénéficiez de recettes sur vos achats.
        </p>
        {user?.is_partner && <div className="mt-4 inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">✓ Vous êtes Partenaire</div>}
      </div>
    </div>
  );
}

export function ClientProfile() {
  const { user } = useAuth();
  const rows = [["Nom", user?.name], ["E-mail", user?.email], ["Téléphone", user?.phone || "—"], ["Pays", user?.country || "—"], ["Monnaie", user?.currency || "—"], ["Téléphone vérifié", user?.phone_verified ? "Oui" : "Non"], ["E-mail vérifié", user?.email_verified ? "Oui" : "Non"]];
  return (
    <div>
      <PageHeader title="Mon profil" />
      <div className="bg-card border border-border rounded-xl divide-y divide-border max-w-lg">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between px-5 py-3 text-sm">
            <span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClientScan() {
  const videoRef = useRef(null);
  const [supported, setSupported] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const stop = () => {
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stop(), []);

  const confirm = async (value) => {
    try {
      const { data } = await api.post("/orders/confirm-by-tracking", { code: value });
      setResult({ ok: true, msg: `${data.message} (${data.ref})` });
      toast.success(data.message);
      stop();
    } catch (e) { setResult({ ok: false, msg: apiErr(e) }); toast.error(apiErr(e)); }
  };

  const start = async () => {
    if (!("BarcodeDetector" in window)) { setSupported(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["code_128", "qr_code", "ean_13"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) { await confirm(codes[0].rawValue); return; }
        } catch {}
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { setSupported(false); }
  };

  return (
    <div>
      <PageHeader title="Scanner une réception" subtitle="Confirmez la réception en scannant le code-barres de l'étiquette" />
      <div className="max-w-md space-y-4">
        <div className="bg-black rounded-xl overflow-hidden aspect-[3/4] relative grid place-items-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!scanning && <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Caméra inactive</div>}
          {scanning && <div className="absolute inset-x-6 top-1/2 h-0.5 bg-primary animate-pulse" />}
        </div>
        {supported ? (
          scanning
            ? <Button variant="outline" className="w-full rounded-full" onClick={stop}>Arrêter</Button>
            : <Button className="w-full rounded-full" onClick={start} data-testid="start-scan">Activer la caméra</Button>
        ) : (
          <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
            La caméra/scan n'est pas disponible sur cet appareil. Saisissez le numéro de suivi manuellement ci-dessous.
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-4">
          <Label>Saisie manuelle du n° de suivi</Label>
          <div className="flex gap-2 mt-1">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AM..." data-testid="scan-manual-input" />
            <Button className="rounded-full" onClick={() => confirm(code)} data-testid="scan-manual-confirm">Confirmer</Button>
          </div>
        </div>
        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`} data-testid="scan-result">
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientFavorites() {
  const [favs, setFavs] = useState([]);
  useEffect(() => {
    try { setFavs(JSON.parse(localStorage.getItem("am_favs") || "[]")); } catch { setFavs([]); }
  }, []);
  return (
    <div>
      <PageHeader title="Favoris" />
      {favs.length === 0 ? <EmptyState title="Aucun favori" description="Ajoutez des produits à vos favoris depuis la marketplace." action={<Link to="/products"><Button className="rounded-full">Explorer</Button></Link>} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {favs.map((f) => <Link key={f.id} to={`/products/${f.id}`} className="bg-card border border-border rounded-xl p-3">{f.name}</Link>)}
        </div>
      )}
    </div>
  );
}
