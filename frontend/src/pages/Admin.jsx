import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr, downloadFile } from "@/lib/api";
import { money } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, StatCard, EmptyState, Loading } from "@/components/common";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Home, Store, Users, ShoppingCart, Banknote, Globe, FileText, TrendingUp, Package,
  CheckCircle2, XCircle, ShieldCheck, ShieldAlert, UserCog, ScrollText, Trash2, KeyRound, Truck, Clock,
  BarChart3, Download, Calendar as CalendarIcon, Trophy,
} from "lucide-react";

const ROLE_LABELS = {
  SUPER_ADMIN: "Super-administrateur", ADMIN: "Administrateur", SHOP_ADMIN: "Admin boutique",
  PRODUCT_MANAGER: "Gestionnaire produits", ORDER_MANAGER: "Gestionnaire commandes/SAV",
  MODERATOR: "Modérateur", ACCOUNTANT: "Comptable/Finance",
};

export function AdminLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const isSuper = user?.role === "SUPER_ADMIN";
  const isAdminLevel = isSuper || user?.role === "ADMIN";
  const can = (mod) => isSuper || perms.includes(mod);

  const allNav = [
    { to: "/admin", label: t("dashboard"), icon: Home, testid: "overview", show: can("overview") },
    { to: "/admin/shops", label: t("shops"), icon: Store, testid: "shops", show: can("shops") },
    { to: "/admin/products", label: "Modération produits", icon: Package, testid: "products", show: can("products") },
    { to: "/admin/reports", label: "Signalements", icon: ShieldAlert, testid: "reports", show: can("moderation") },
    { to: "/admin/users", label: t("users"), icon: Users, testid: "users", show: can("users") },
    { to: "/admin/orders", label: t("orders"), icon: ShoppingCart, testid: "orders", show: can("orders") },
    { to: "/admin/reporting", label: "Reporting ventes", icon: BarChart3, testid: "reporting", show: can("reporting") },
    { to: "/admin/withdrawals", label: t("withdrawals"), icon: Banknote, testid: "withdrawals", show: can("finance") },
    { to: "/admin/payouts", label: "Reversements", icon: Banknote, testid: "payouts", show: can("finance") },
    { to: "/admin/earnings", label: "Validation gains", icon: CheckCircle2, testid: "earnings", show: can("finance") },
    { to: "/admin/approvals", label: "Validations", icon: ShieldAlert, testid: "approvals", show: isAdminLevel },
    { to: "/admin/staff", label: "Gestionnaires", icon: UserCog, testid: "staff", show: isSuper },
    { to: "/admin/security", label: "Sécurité & 2FA", icon: KeyRound, testid: "security", show: can("settings") },
    { to: "/admin/journal", label: "Journal connexions", icon: ScrollText, testid: "journal", show: can("audit") },
    { to: "/admin/countries", label: t("countries_currencies"), icon: Globe, testid: "countries", show: can("settings") },
    { to: "/admin/settings-global", label: "Paramétrage global", icon: FileText, testid: "settings-global", show: can("settings") },
    { to: "/admin/carriers", label: "Transporteurs", icon: Truck, testid: "carriers", show: can("settings") },
    { to: "/admin/audit", label: t("audit_log"), icon: FileText, testid: "audit", show: can("audit") },
  ];
  const nav = allNav.filter((n) => n.show);
  return <DashboardShell nav={nav} title={isSuper ? "Super Admin" : ROLE_LABELS[user?.role] || "Admin"} subtitle="AfriMarket" />;
}

export function AdminOverview() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/overview").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <Loading />;
  return (
    <div>
      <PageHeader title="Dashboard global" subtitle="Vue d'ensemble de la plateforme" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Utilisateurs" value={d.total_users} icon={Users} />
        <StatCard label="Clients" value={d.clients} icon={Users} accent="bg-blue-100 text-blue-700" />
        <StatCard label="Commerçants" value={d.merchants} icon={Store} accent="bg-purple-100 text-purple-700" />
        <StatCard label="Boutiques" value={d.shops_approved} sub={`${d.shops_pending} en attente`} icon={Store} accent="bg-primary/10 text-primary" />
        <StatCard label="Produits" value={d.products} icon={Package} />
        <StatCard label="Commandes" value={d.orders_total} icon={ShoppingCart} />
        <StatCard label="CA global" value={money(d.ca_global, "")} icon={TrendingUp} accent="bg-green-100 text-green-700" />
        <StatCard label="Revenus commission" value={money(d.commission_total, "")} icon={Banknote} accent="bg-primary/10 text-primary" />
        <StatCard label="Retraits en attente" value={d.withdrawals_pending} icon={Banknote} accent="bg-amber-100 text-amber-700" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border rounded-xl p-5" data-testid="commission-by-shop">
          <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-primary" /> Revenus de commission par boutique</h3>
          {(!d.commission_by_shop || d.commission_by_shop.length === 0) ? (
            <p className="text-sm text-muted-foreground">Aucune commission enregistrée pour l'instant.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Boutique</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Commission</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.commission_by_shop.map((b) => (
                  <TableRow key={b.shop_id} data-testid={`commission-shop-${b.shop_id}`}>
                    <TableCell className="text-sm font-medium">{b.shop_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{money(b.ca, b.currency)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-primary">{money(b.commission, b.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-3">Fidélité (plateforme)</h3>
          <div className="flex justify-between py-2 text-sm border-b border-border/50"><span className="text-muted-foreground">Bonus promo totaux</span><span className="font-mono font-semibold">{money(d.bonus_total, "")}</span></div>
          <div className="flex justify-between py-2 text-sm border-b border-border/50"><span className="text-muted-foreground">Recettes totales</span><span className="font-mono font-semibold">{money(d.recette_total, "")}</span></div>
          <div className="flex justify-between py-2 text-sm"><span className="text-muted-foreground">Pays actifs</span><span className="font-semibold">{d.countries_active}</span></div>
          <div className="py-2 text-sm"><span className="text-muted-foreground">Devises utilisées</span><div className="flex flex-wrap gap-1 mt-1">{d.currencies_used.map((c) => <span key={c} className="bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full font-mono">{c}</span>)}</div></div>
        </div>
      </div>
    </div>
  );
}
const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const presetRange = (kind) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  let from;
  if (kind === "month") from = new Date(y, m, 1);
  else if (kind === "quarter") from = new Date(y, Math.floor(m / 3) * 3, 1);
  else if (kind === "semester") from = new Date(y, m < 6 ? 0 : 6, 1);
  else from = new Date(y, 0, 1);
  return { from, to: now };
};
const PRESETS = [
  { key: "month", label: "Mois" },
  { key: "quarter", label: "Trimestre" },
  { key: "semester", label: "Semestre" },
  { key: "year", label: "Année" },
];

export function AdminReporting() {
  const [range, setRange] = useState(presetRange("month"));
  const [preset, setPreset] = useState("month");
  const [d, setD] = useState(null);
  const [calOpen, setCalOpen] = useState(false);

  const df = range?.from ? fmtLocal(range.from) : null;
  const dt = range?.to ? fmtLocal(range.to) : null;

  useEffect(() => {
    if (!df || !dt) return;
    setD(null);
    api.get("/admin/reporting", { params: { date_from: df, date_to: dt } })
      .then((r) => setD(r.data)).catch((e) => { toast.error(apiErr(e)); setD({}); });
  }, [df, dt]);

  const applyPreset = (k) => { setPreset(k); setRange(presetRange(k)); };
  const exportCsv = () => downloadFile("/admin/reporting/export", `rapport-ventes-${df}_${dt}.csv`, { date_from: df, date_to: dt });

  return (
    <div>
      <PageHeader title="Reporting ventes" subtitle="Chiffre d'affaires, top boutiques et top produits"
        action={
          <Button className="rounded-full" onClick={exportCsv} disabled={!d} data-testid="reporting-export-csv">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        } />

      {/* Period controls */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" variant={preset === p.key ? "default" : "outline"} className="rounded-full"
            onClick={() => applyPreset(p.key)} data-testid={`reporting-preset-${p.key}`}>{p.label}</Button>
        ))}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant={preset === "custom" ? "default" : "outline"} className="rounded-full" data-testid="reporting-custom-range">
              <CalendarIcon className="w-4 h-4 mr-2" />
              {df && dt ? `${df} → ${dt}` : "Période personnalisée"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={range} numberOfMonths={2}
              onSelect={(r) => { setRange(r || {}); setPreset("custom"); if (r?.from && r?.to) setCalOpen(false); }} />
          </PopoverContent>
        </Popover>
      </div>

      {!d ? <Loading /> : (
        <div className="space-y-6">
          {/* Anomaly alerts */}
          {d.anomalies && d.anomalies.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5" data-testid="reporting-anomalies">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-600" /> Alertes d'anomalies ({d.anomalies.length})</h3>
              <div className="space-y-2">
                {d.anomalies.map((a, i) => {
                  const tone = a.severity === "high"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : a.severity === "medium" ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-blue-50 border-blue-200 text-blue-800";
                  return (
                    <div key={i} className={`flex items-start gap-3 border rounded-lg px-3 py-2 ${tone}`} data-testid={`anomaly-${a.type}-${i}`}>
                      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <span className="font-semibold">{a.title}</span>
                        <span className="ml-2">{a.message}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KPI by currency */}
          {(!d.kpi_by_currency || d.kpi_by_currency.length === 0) ? (
            <EmptyState title="Aucune vente sur cette période" description="Sélectionnez une autre période." />
          ) : (
            <div className="space-y-4">
              {d.kpi_by_currency.map((c) => (
                <div key={c.currency} className="bg-card border border-border rounded-xl p-5" data-testid={`reporting-currency-${c.currency}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-mono bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{c.currency || "—"}</span>
                    <span className="text-sm text-muted-foreground">{c.orders} commande(s) · {c.items} article(s)</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard label="CA" value={money(c.ca, c.currency)} icon={TrendingUp} accent="bg-green-100 text-green-700" />
                    <StatCard label="Commission" value={money(c.commission, c.currency)} icon={Banknote} accent="bg-primary/10 text-primary" />
                    <StatCard label="Net vendeurs" value={money(c.net, c.currency)} icon={Banknote} accent="bg-blue-100 text-blue-700" />
                    <StatCard label="Commandes" value={c.orders} icon={ShoppingCart} />
                    <StatCard label="Panier moyen" value={money(c.avg_basket, c.currency)} icon={ShoppingCart} accent="bg-amber-100 text-amber-700" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Revenue chart */}
          {d.series && d.series.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5" data-testid="reporting-chart">
              <h3 className="font-display font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Évolution du chiffre d'affaires</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="CA" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top shops */}
            <div className="bg-card border border-border rounded-xl p-5" data-testid="reporting-top-shops">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Top boutiques / vendeurs</h3>
              {(!d.top_shops || d.top_shops.length === 0) ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Boutique</TableHead><TableHead className="text-right">CA</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">Cmd.</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.top_shops.map((s) => (
                      <TableRow key={s.shop_id} data-testid={`reporting-shop-${s.shop_id}`}>
                        <TableCell className="text-sm font-medium">{s.shop_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(s.ca, s.currency)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary">{money(s.commission, s.currency)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{s.orders}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Top products */}
            <div className="bg-card border border-border rounded-xl p-5" data-testid="reporting-top-products">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Top produits</h3>
              {(!d.top_products || d.top_products.length === 0) ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Produit</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">CA généré</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.top_products.map((p) => (
                      <TableRow key={p.product_id} data-testid={`reporting-product-${p.product_id}`}>
                        <TableCell className="text-sm"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.shop_name}</div></TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{p.qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(p.revenue, p.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Status breakdown */}
          {d.status_breakdown && Object.keys(d.status_breakdown).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5" data-testid="reporting-status">
              <h3 className="font-display font-bold mb-3">Commandes par statut</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(d.status_breakdown).map(([st, n]) => (
                  <div key={st} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                    <StatusBadge status={st} /><span className="font-mono font-semibold text-sm">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminShops() {
  const [shops, setShops] = useState(null);
  const [tab, setTab] = useState("SUBMITTED");
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comm, setComm] = useState("");
  const [quota, setQuota] = useState("");
  const [storage, setStorage] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const load = () => api.get("/admin/shops").then((r) => setShops(r.data.shops)).catch(() => setShops([]));
  useEffect(() => { load(); }, []);

  const openDetail = async (s) => {
    const { data } = await api.get(`/admin/shops/${s.id}`);
    setDetail(data);
    setComm(data.shop.commission_rate == null ? "" : String(data.shop.commission_rate * 100));
    setQuota(data.shop.product_quota == null ? "" : String(data.shop.product_quota));
    setStorage(data.shop.storage_quota_mb == null ? "" : String(data.shop.storage_quota_mb));
    setSuspendReason("");
  };
  const approve = async (id) => { await api.put(`/admin/shops/${id}/approve`); toast.success("Boutique approuvée"); setDetail(null); load(); };
  const reject = async (id) => { await api.put(`/admin/shops/${id}/reject`, { reason }); toast.success("Boutique rejetée"); setRejectOpen(false); setDetail(null); setReason(""); load(); };
  const saveCommission = async (id) => {
    const rate = comm.trim() === "" ? null : Math.max(0, Math.min(100, parseFloat(comm))) / 100;
    try { await api.put(`/admin/shops/${id}/commission`, { commission_rate: rate }); toast.success("Commission mise à jour"); openDetail({ id }); load(); } catch (e) { toast.error(apiErr(e)); }
  };
  const saveQuota = async (id) => {
    try { await api.put(`/admin/shops/${id}/quota`, { product_quota: parseInt(quota || "0", 10), storage_quota_mb: parseInt(storage || "0", 10) }); toast.success("Quotas mis à jour"); openDetail({ id }); load(); } catch (e) { toast.error(apiErr(e)); }
  };
  const suspend = async (id) => { try { await api.put(`/admin/shops/${id}/suspend`, { reason: suspendReason }); toast.success("Boutique suspendue"); openDetail({ id }); load(); } catch (e) { toast.error(apiErr(e)); } };
  const reactivate = async (id) => { try { await api.put(`/admin/shops/${id}/reactivate`); toast.success("Boutique réactivée"); openDetail({ id }); load(); } catch (e) { toast.error(apiErr(e)); } };

  if (shops === null) return <Loading />;
  const filtered = tab === "ALL" ? shops : (tab === "SUSPENDED" ? shops.filter((s) => s.suspended) : shops.filter((s) => (tab === "SUBMITTED" ? ["SUBMITTED", "UNDER_REVIEW"].includes(s.status) : s.status === tab)));

  return (
    <div>
      <PageHeader title="Boutiques" subtitle="Validation, suspension, commissions & quotas" />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="SUBMITTED" data-testid="tab-pending">En attente</TabsTrigger>
          <TabsTrigger value="APPROVED" data-testid="tab-approved">Approuvées</TabsTrigger>
          <TabsTrigger value="SUSPENDED" data-testid="tab-suspended">Suspendues</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejetées</TabsTrigger>
          <TabsTrigger value="ALL">Toutes</TabsTrigger>
        </TabsList>
      </Tabs>
      {filtered.length === 0 ? <EmptyState title="Aucune boutique" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Boutique</TableHead><TableHead>Commerçant</TableHead><TableHead>Produits</TableHead><TableHead>Commission</TableHead><TableHead>KYC</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} data-testid={`admin-shop-${s.id}`}>
                  <TableCell className="font-medium">{s.name} {s.suspended && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">SUSPENDUE</span>}</TableCell>
                  <TableCell className="text-sm">{s.owner_name}</TableCell>
                  <TableCell className="text-sm">{s.product_count ?? 0}{s.product_quota ? ` / ${s.product_quota}` : ""}</TableCell>
                  <TableCell className="text-sm">{s.commission_rate != null ? `${(s.commission_rate * 100).toFixed(1)}%` : "défaut"}</TableCell>
                  <TableCell><StatusBadge status={s.kyc_status} /></TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell><Button size="sm" variant="outline" className="rounded-full" onClick={() => openDetail(s)} data-testid={`review-${s.id}`}>Gérer</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gestion de la boutique</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[["Boutique", detail.shop.name], ["Commerçant", detail.shop.owner_name], ["Pays", detail.shop.country], ["Ville", detail.shop.city], ["N° fiscal", detail.shop.tax_number || "—"], ["Téléphone", detail.shop.phone || "—"]].map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground text-xs">{k}</span><div className="font-medium">{v}</div></div>
                ))}
              </div>
              <div className="bg-accent/40 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1"><ShieldCheck className="w-4 h-4" /> Vérification KYC</div>
                {detail.kyc ? (
                  <div className="text-xs space-y-0.5">
                    <div>Type : {detail.kyc.doc_type}</div>
                    <div>Numéro : <span className="font-mono">{detail.kyc.doc_number}</span></div>
                    <div>Statut : <StatusBadge status={detail.kyc.status} /></div>
                    {detail.kyc.status !== "APPROUVE" && (
                      <Button size="sm" className="rounded-full mt-2" onClick={async () => { await api.put(`/admin/kyc/${detail.shop.owner_id}`, { status: "APPROUVE" }); toast.success("KYC approuvé"); openDetail(detail.shop); }} data-testid="approve-kyc">Approuver le KYC</Button>
                    )}
                  </div>
                ) : <div className="text-xs text-muted-foreground">Aucun document KYC soumis.</div>}
              </div>

              {detail.shop.status === "APPROVED" && (
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <div className="font-semibold text-sm">Commission & quotas</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Commission (%) — vide = défaut plateforme</Label>
                      <div className="flex gap-1 mt-1">
                        <Input type="number" value={comm} onChange={(e) => setComm(e.target.value)} placeholder="défaut" data-testid="shop-commission" />
                        <Button size="sm" className="rounded-full" onClick={() => saveCommission(detail.shop.id)} data-testid="save-commission">OK</Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Quota produits (0 = illimité)</Label>
                      <div className="flex gap-1 mt-1">
                        <Input type="number" value={quota} onChange={(e) => setQuota(e.target.value)} data-testid="shop-quota" />
                        <Button size="sm" className="rounded-full" onClick={() => saveQuota(detail.shop.id)} data-testid="save-quota">OK</Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Quota stockage images (Mo, 0 = illimité)</Label>
                      <div className="flex gap-1 mt-1">
                        <Input type="number" value={storage} onChange={(e) => setStorage(e.target.value)} data-testid="shop-storage" />
                        <Button size="sm" className="rounded-full" onClick={() => saveQuota(detail.shop.id)} data-testid="save-storage">OK</Button>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Produits : {detail.shop.product_count ?? "—"}{detail.shop.product_quota ? ` / ${detail.shop.product_quota}` : ""} · Stockage : {detail.shop.storage_used_mb ?? 0} Mo{detail.shop.storage_quota_mb ? ` / ${detail.shop.storage_quota_mb} Mo` : ""}</div>

                  {detail.shop.suspended ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-amber-700">Boutique suspendue : {detail.shop.suspension_reason || "—"}</span>
                      <Button size="sm" className="rounded-full" onClick={() => reactivate(detail.shop.id)} data-testid="reactivate-shop">Réactiver</Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Motif de suspension" data-testid="suspend-reason" />
                      <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => suspend(detail.shop.id)} data-testid="suspend-shop">Suspendre</Button>
                    </div>
                  )}
                </div>
              )}

              {detail.shop.status === "REJECTED" && <div className="text-sm text-destructive">Motif précédent : {detail.shop.rejection_reason}</div>}
            </div>
          )}
          {detail && ["SUBMITTED", "UNDER_REVIEW"].includes(detail.shop.status) && (
            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-full text-destructive" onClick={() => setRejectOpen(true)} data-testid="reject-shop"><XCircle className="w-4 h-4 mr-1" /> Rejeter</Button>
              <Button className="rounded-full" onClick={() => approve(detail.shop.id)} data-testid="approve-shop"><CheckCircle2 className="w-4 h-4 mr-1" /> Approuver</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motif du rejet</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Expliquez la raison du rejet..." data-testid="reject-reason" />
          <DialogFooter><Button variant="destructive" className="rounded-full" onClick={() => reject(detail.shop.id)}>Confirmer le rejet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const adminLevel = me?.role === "SUPER_ADMIN" || me?.role === "ADMIN";
  const load = () => api.get("/admin/users").then((r) => setUsers(r.data.users)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);
  const delMerchant = async (u) => {
    if (!window.confirm(`Demander la suppression du vendeur ${u.email} ? Cette action requiert une seconde validation administrateur.`)) return;
    try { const { data } = await api.delete(`/admin/merchants/${u.id}`); toast.success(data.message); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (users === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Utilisateurs" subtitle={`${users.length} compte(s)`} />
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>E-mail</TableHead><TableHead>Rôle</TableHead><TableHead>Statut</TableHead><TableHead>Pays</TableHead><TableHead>KYC</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid={`admin-user-${u.id}`}>
                <TableCell className="font-medium text-sm">{u.name} {u.is_demo && <span className="text-[10px] bg-muted px-1 rounded">DEMO</span>}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell><span className="text-xs font-mono bg-accent px-2 py-0.5 rounded-full">{u.role}</span></TableCell>
                <TableCell><StatusBadge status={u.status || "ACTIVE"} /></TableCell>
                <TableCell className="text-sm">{u.country || "—"}</TableCell>
                <TableCell>{u.role === "MERCHANT" ? <StatusBadge status={u.kyc_status} /> : "—"}</TableCell>
                <TableCell>
                  {adminLevel && u.role === "MERCHANT" && (u.status || "ACTIVE") === "ACTIVE" && (
                    <Button size="sm" variant="ghost" className="text-destructive rounded-full" onClick={() => delMerchant(u)} data-testid={`del-merchant-${u.id}`}>
                      <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminOrders() {
  const [data, setData] = useState(null);
  const [shops, setShops] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [f, setF] = useState({ shop_id: "", status: "", carrier_id: "", date_from: "", date_to: "", late: false });
  const load = () => {
    const params = {};
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get("/admin/orders", { params }).then((r) => setData(r.data)).catch(() => setData({ orders: [], late_count: 0 }));
  };
  useEffect(() => { load(); }, [f]);
  useEffect(() => {
    api.get("/admin/shops").then((r) => setShops(r.data.shops)).catch(() => {});
    api.get("/carriers").then((r) => setCarriers(r.data.carriers)).catch(() => {});
  }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v === "ALL" ? "" : v }));
  const STATUSES = ["NOUVELLE", "APPROUVEE", "EN_PREPARATION", "PRETE", "EXPEDIEE", "LIVREE", "ANNULEE", "REJETEE"];
  if (data === null) return <Loading />;
  const orders = data.orders || [];
  return (
    <div>
      <PageHeader title="Commandes multi-boutiques" subtitle={`${data.total ?? orders.length} commande(s)`} />
      {data.late_count > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm" data-testid="late-alert">
          <ShieldAlert className="w-4 h-4" /> {data.late_count} commande(s) en retard de livraison.
          <button className="underline ml-1" onClick={() => set("late", !f.late)} data-testid="toggle-late">{f.late ? "Voir toutes" : "Voir les retards"}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={f.shop_id || "ALL"} onValueChange={(v) => set("shop_id", v)}>
          <SelectTrigger className="w-44 rounded-full" data-testid="filter-shop"><SelectValue placeholder="Boutique" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">Toutes boutiques</SelectItem>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.status || "ALL"} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="w-40 rounded-full" data-testid="filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">Tous statuts</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.carrier_id || "ALL"} onValueChange={(v) => set("carrier_id", v)}>
          <SelectTrigger className="w-40 rounded-full" data-testid="filter-carrier"><SelectValue placeholder="Transporteur" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">Tous transporteurs</SelectItem>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" className="w-40 rounded-full" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} data-testid="filter-from" />
        <Input type="date" className="w-40 rounded-full" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} data-testid="filter-to" />
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Réf.</TableHead><TableHead>Boutique</TableHead><TableHead>Client</TableHead><TableHead>Transporteur</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} data-testid={`admin-order-${o.ref}`} className={o.is_late ? "bg-red-50/60" : ""}>
                <TableCell className="font-mono text-xs">{o.ref}{o.is_late && <span className="ml-1 text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">RETARD</span>}</TableCell>
                <TableCell className="text-sm">{o.shop_name}</TableCell>
                <TableCell className="text-sm">{o.customer_name}</TableCell>
                <TableCell className="text-xs">{o.carrier_name || "—"}</TableCell>
                <TableCell className="text-right font-mono">{money(o.total, o.currency)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell>{o.carrier_id && <Button size="sm" variant="ghost" className="rounded-full text-xs h-7" onClick={() => downloadFile(`/orders/${o.id}/label`, `Etiquette-${o.ref}.pdf`)} data-testid={`label-${o.ref}`}><FileText className="w-3.5 h-3.5 mr-1" /> Étiquette</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminWithdrawals() {
  const [list, setList] = useState(null);
  const load = () => api.get("/admin/withdrawals").then((r) => setList(r.data.withdrawals)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const decide = async (id, status) => {
    let reference = "";
    if (status === "TRAITE") {
      reference = window.prompt("Justificatif / référence de la transaction (obligatoire pour traiter) :", "");
      if (reference === null) return;
      if (!reference.trim()) { toast.error("Un justificatif est requis pour traiter le retrait"); return; }
    }
    try { await api.put(`/admin/withdrawals/${id}`, { status, reference }); toast.success("Décision enregistrée"); load(); } catch (e) { toast.error(apiErr(e)); }
  };
  if (list === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Retraits" subtitle="Validation des demandes de retrait" />
      {list.length === 0 ? <EmptyState title="Aucune demande" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Utilisateur</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Destination</TableHead><TableHead>Statut</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-sm">{w.user_name}</TableCell>
                  <TableCell className="text-right font-mono">{money(w.amount, w.currency)}</TableCell>
                  <TableCell className="text-xs">
                    <div>{w.method === "BANK" ? `Banque : ${w.bank_name || "—"}` : "Mobile Money"}</div>
                    <div className="text-muted-foreground">{w.destination || "—"}</div>
                    {w.reference && <div className="text-green-700">Réf : {w.reference}</div>}
                  </TableCell>
                  <TableCell><StatusBadge status={w.status} /></TableCell>
                  <TableCell>
                    {["TRAITE", "REFUSE", "ANNULE"].includes(w.status) ? <span className="text-xs text-muted-foreground">Clôturé</span> : (
                      <div className="flex gap-1">
                        {w.status === "DEMANDE" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => decide(w.id, "APPROUVE")} data-testid={`wd-approve-${w.id}`}>Approuver</Button>}
                        <Button size="sm" className="rounded-full" onClick={() => decide(w.id, "TRAITE")} data-testid={`wd-process-${w.id}`}>Traiter</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => decide(w.id, "REFUSE")} data-testid={`wd-refuse-${w.id}`}>Refuser</Button>
                      </div>
                    )}
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

export function AdminCountries() {
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  useEffect(() => {
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
    api.get("/config/currencies").then((r) => setCurrencies(r.data.currencies)).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="Pays & Devises" subtitle={`${countries.length} pays · ${currencies.length} devises`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 font-display font-bold border-b border-border">Devises</div>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Nom</TableHead><TableHead>Symbole</TableHead></TableRow></TableHeader>
              <TableBody>{currencies.map((c) => (<TableRow key={c.code}><TableCell className="font-mono font-semibold">{c.code}</TableCell><TableCell className="text-sm">{c.name}</TableCell><TableCell>{c.symbol}</TableCell></TableRow>))}</TableBody>
            </Table>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 font-display font-bold border-b border-border">Pays</div>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Pays</TableHead><TableHead>Devise</TableHead></TableRow></TableHeader>
              <TableBody>{countries.map((c) => (<TableRow key={c.name}><TableCell className="text-sm">{c.name}</TableCell><TableCell className="font-mono text-sm">{c.currency}</TableCell></TableRow>))}</TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminGlobalSettings() {
  const LEGAL = [
    { key: "terms", label: "Conditions générales (CGU/CGV)" },
    { key: "privacy", label: "Politique de confidentialité" },
    { key: "mentions", label: "Mentions légales" },
    { key: "faq", label: "FAQ" },
    { key: "contact", label: "Contact" },
  ];
  const [legal, setLegal] = useState(null);
  const [taxes, setTaxes] = useState([]);
  const [taxesEnabled, setTaxesEnabled] = useState(false);
  const [countries, setCountries] = useState([]);
  const [csvImport, setCsvImport] = useState(false);
  const [nt, setNt] = useState({ country: "", zone: "", rate: "", label: "TVA", enabled: true });

  const loadTaxes = () => api.get("/admin/taxes").then((r) => { setTaxes(r.data.taxes); setTaxesEnabled(r.data.taxes_enabled); }).catch(() => {});
  useEffect(() => {
    api.get("/legal").then((r) => setLegal(r.data.content)).catch(() => setLegal({}));
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
    api.get("/admin/settings").then((r) => setCsvImport(!!r.data.settings?.csv_import_enabled)).catch(() => {});
    loadTaxes();
  }, []);

  const toggleCsvImport = async (v) => {
    setCsvImport(v);
    try { await api.put("/admin/settings", { csv_import_enabled: v }); toast.success("Import CSV mis à jour"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const saveLegal = async () => {
    try { await api.put("/admin/settings", { legal_content: legal }); toast.success("Contenu légal enregistré"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const toggleTaxes = async (v) => {
    setTaxesEnabled(v);
    try { await api.put("/admin/settings", { taxes_enabled: v }); toast.success("Paramètre taxes mis à jour"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const addTax = async () => {
    if (!nt.country || nt.rate === "") { toast.error("Pays et taux requis"); return; }
    try {
      await api.post("/admin/taxes", { ...nt, rate: parseFloat(nt.rate) || 0 });
      toast.success("Règle de taxe ajoutée"); setNt({ country: "", zone: "", rate: "", label: "TVA", enabled: true }); loadTaxes();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const updTax = async (id, patch) => { try { await api.put(`/admin/taxes/${id}`, patch); loadTaxes(); } catch (e) { toast.error(apiErr(e)); } };
  const delTax = async (id) => { try { await api.delete(`/admin/taxes/${id}`); toast.success("Règle supprimée"); loadTaxes(); } catch (e) { toast.error(apiErr(e)); } };

  if (legal === null) return <Loading />;
  const setField = (k, field, v) => setLegal({ ...legal, [k]: { ...(legal[k] || {}), [field]: v } });

  return (
    <div>
      <PageHeader title="Paramétrage global" subtitle="Contenu légal & taxes par pays / zone" />
      <div className="space-y-6">
        {/* Merchant features */}
        <div className="bg-card border border-border rounded-xl p-5" data-testid="merchant-features">
          <h3 className="font-display font-bold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Fonctionnalités commerçant</h3>
          <label className="flex items-center justify-between text-sm">
            <span><span className="font-medium">Import CSV/Excel des produits</span><br /><span className="text-muted-foreground text-xs">Autoriser les commerçants à importer leurs produits en masse.</span></span>
            <Switch checked={csvImport} onCheckedChange={toggleCsvImport} data-testid="csv-import-toggle" />
          </label>
        </div>

        {/* Legal editor */}
        <div className="bg-card border border-border rounded-xl p-5" data-testid="legal-editor">
          <h3 className="font-display font-bold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Éditeur de pages légales</h3>
          <div className="space-y-5">
            {LEGAL.map((p) => (
              <div key={p.key} className="border border-border rounded-lg p-4" data-testid={`legal-${p.key}`}>
                <Label className="text-xs text-muted-foreground">{p.label}</Label>
                <Input className="mt-1 mb-2" value={legal[p.key]?.title || ""} placeholder="Titre"
                  onChange={(e) => setField(p.key, "title", e.target.value)} data-testid={`legal-title-${p.key}`} />
                <Textarea rows={4} value={legal[p.key]?.body || ""} placeholder="Contenu"
                  onChange={(e) => setField(p.key, "body", e.target.value)} data-testid={`legal-body-${p.key}`} />
              </div>
            ))}
          </div>
          <Button className="rounded-full mt-4" onClick={saveLegal} data-testid="legal-save">Enregistrer le contenu légal</Button>
        </div>

        {/* Taxes */}
        <div className="bg-card border border-border rounded-xl p-5" data-testid="taxes-editor">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-display font-bold flex items-center gap-2"><Banknote className="w-4 h-4 text-primary" /> Taxes par pays / zone</h3>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Affichage des taxes activé</span>
              <Switch checked={taxesEnabled} onCheckedChange={toggleTaxes} data-testid="taxes-enabled-toggle" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Configuration informative. Les taux n'impactent pas les totaux du checkout pour l'instant.</p>

          {/* Add rule */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end border border-dashed border-border rounded-lg p-3 mb-4">
            <div className="md:col-span-2">
              <Label className="text-xs">Pays</Label>
              <Select value={nt.country} onValueChange={(v) => setNt({ ...nt, country: v })}>
                <SelectTrigger className="mt-1" data-testid="tax-new-country"><SelectValue placeholder="Choisir un pays" /></SelectTrigger>
                <SelectContent className="max-h-64">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Zone / région</Label><Input className="mt-1" value={nt.zone} placeholder="(optionnel)" onChange={(e) => setNt({ ...nt, zone: e.target.value })} data-testid="tax-new-zone" /></div>
            <div><Label className="text-xs">Taux (%)</Label><Input className="mt-1" type="number" value={nt.rate} onChange={(e) => setNt({ ...nt, rate: e.target.value })} data-testid="tax-new-rate" /></div>
            <Button className="rounded-full" onClick={addTax} data-testid="tax-add">Ajouter</Button>
          </div>

          {taxes.length === 0 ? <EmptyState title="Aucune règle de taxe" description="Ajoutez une règle par pays ou zone." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Pays</TableHead><TableHead>Zone</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Taux</TableHead><TableHead className="text-center">Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {taxes.map((tx) => (
                  <TableRow key={tx.id} data-testid={`tax-row-${tx.id}`}>
                    <TableCell className="text-sm font-medium">{tx.country}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tx.zone || "—"}</TableCell>
                    <TableCell className="text-sm">{tx.label}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{tx.rate}%</TableCell>
                    <TableCell className="text-center"><Switch checked={tx.enabled} onCheckedChange={(v) => updTax(tx.id, { enabled: v })} data-testid={`tax-toggle-${tx.id}`} /></TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => delTax(tx.id)} data-testid={`tax-delete-${tx.id}`}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/admin/audit-logs").then((r) => setLogs(r.data.logs)).catch(() => setLogs([])); }, []);
  if (logs === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Journal d'audit" subtitle={`${logs.length} entrée(s)`} />
      {logs.length === 0 ? <EmptyState title="Aucune entrée" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Acteur</TableHead><TableHead>Action</TableHead><TableHead>Cible</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{l.created_at?.slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell className="text-sm">{l.actor_email}<div className="text-[10px] text-muted-foreground">{l.actor_role}</div></TableCell>
                  <TableCell><span className="text-xs font-mono bg-accent px-2 py-0.5 rounded-full">{l.action}</span></TableCell>
                  <TableCell className="text-xs">{l.target_type} · {String(l.target_id).slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}


// ---------------- Module 9: Gestionnaires (RBAC) ----------------
const emptyStaff = {
  name: "", email: "", password: "", phone: "", phone_verification_id: "",
  role: "MODERATOR", permissions: {}, country_scopes: [], shop_ids: [],
};

export function AdminStaff() {
  const [staff, setStaff] = useState(null);
  const [meta, setMeta] = useState(null);
  const [shops, setShops] = useState([]);
  const [countries, setCountries] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyStaff);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const load = () => api.get("/admin/staff").then((r) => setStaff(r.data.staff)).catch(() => setStaff([]));
  useEffect(() => {
    load();
    api.get("/admin/rbac/meta").then((r) => setMeta(r.data)).catch(() => {});
    api.get("/admin/shops").then((r) => setShops(r.data.shops)).catch(() => {});
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
  }, []);

  const modules = meta?.modules || [];
  const roles = meta?.roles || [];

  const openCreate = () => {
    const defaults = {};
    (meta?.default_permissions?.MODERATOR || []).forEach((m) => { defaults[m] = true; });
    setEditing(null); setForm({ ...emptyStaff, permissions: defaults });
    setOtpCode(""); setOtpSent(false); setPhoneVerified(false); setOpen(true);
  };
  const openEdit = (s) => {
    const perms = {}; modules.forEach((m) => { perms[m.key] = (s.permissions || []).includes(m.key); });
    setEditing(s);
    setForm({ name: s.name, email: s.email, phone: s.phone || "", password: "", role: s.role, permissions: perms,
      country_scopes: s.country_scopes || (s.country ? [s.country] : []), shop_ids: s.shop_ids || [],
      status: s.status, delegation: s.delegation || { enabled: false } });
    setOtpCode(""); setOtpSent(false); setPhoneVerified(true);
    setOpen(true);
  };
  const setRoleDefaults = (role) => {
    const perms = {}; modules.forEach((m) => { perms[m.key] = (meta?.default_permissions?.[role] || []).includes(m.key); });
    setForm((f) => ({ ...f, role, permissions: perms }));
  };
  const togglePerm = (k) => setForm((f) => ({ ...f, permissions: { ...f.permissions, [k]: !f.permissions[k] } }));
  const toggleShop = (id) => setForm((f) => ({ ...f, shop_ids: f.shop_ids.includes(id) ? f.shop_ids.filter((x) => x !== id) : [...f.shop_ids, id] }));
  const toggleCountry = (country) => setForm((f) => {
    const country_scopes = f.country_scopes.includes(country)
      ? f.country_scopes.filter((item) => item !== country)
      : [...f.country_scopes, country];
    const shop_ids = f.shop_ids.filter((id) => {
      const shop = shops.find((item) => item.id === id);
      return shop && country_scopes.includes(shop.country);
    });
    return { ...f, country_scopes, shop_ids };
  });
  const eligibleShops = shops.filter((shop) => form.country_scopes.includes(shop.country));

  const sendPhoneOtp = async () => {
    if (!form.phone.trim()) { toast.error("Saisissez un numéro de téléphone international"); return; }
    setOtpLoading(true);
    try {
      const { data } = await api.post("/admin/staff/phone-otp", { phone: form.phone });
      setForm((f) => ({ ...f, phone_verification_id: data.verification_id }));
      setOtpSent(true);
      toast.info(data.demo_otp ? `Code OTP (simulation) : ${data.demo_otp}` : data.message);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setOtpLoading(false); }
  };

  const verifyPhoneOtp = async () => {
    if (!otpCode.trim()) { toast.error("Saisissez le code OTP"); return; }
    setOtpLoading(true);
    try {
      await api.post("/admin/staff/phone-otp/verify", {
        verification_id: form.phone_verification_id,
        code: otpCode,
      });
      setPhoneVerified(true);
      toast.success("Téléphone vérifié");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setOtpLoading(false); }
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/admin/staff/${editing.id}`, {
          role: form.role, permissions: form.permissions, country_scopes: form.country_scopes, shop_ids: form.shop_ids,
          status: form.status, delegation: form.delegation, password: form.password || undefined,
        });
        toast.success("Gestionnaire mis à jour");
      } else {
        if (!phoneVerified) { toast.error("Vérifiez le téléphone avant de créer le compte"); return; }
        await api.post("/admin/staff", {
          name: form.name, email: form.email, password: form.password, phone: form.phone,
          phone_verification_id: form.phone_verification_id, role: form.role,
          country_scopes: form.country_scopes, permissions: form.permissions, shop_ids: form.shop_ids,
        });
        toast.success("Gestionnaire créé. Une vérification e-mail est en attente.");
      }
      setOpen(false); load();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const disable = async (s) => {
    if (!window.confirm(`Désactiver ${s.email} ?`)) return;
    try { await api.delete(`/admin/staff/${s.id}`); toast.success("Compte désactivé"); load(); } catch (e) { toast.error(apiErr(e)); }
  };

  if (staff === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Administrateurs & gestionnaires" subtitle="Rôles, permissions granulaires, délégation"
        action={<Button className="rounded-full" onClick={openCreate} data-testid="new-staff-btn"><UserCog className="w-4 h-4 mr-1" /> Nouveau gestionnaire</Button>} />
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>E-mail</TableHead><TableHead>Rôle</TableHead><TableHead>Modules</TableHead><TableHead>Boutiques</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.id} data-testid={`staff-row-${s.id}`}>
                <TableCell className="font-medium text-sm">{s.name}</TableCell>
                <TableCell className="text-sm">{s.email}</TableCell>
                <TableCell><span className="text-xs font-mono bg-accent px-2 py-0.5 rounded-full">{ROLE_LABELS[s.role] || s.role}</span></TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.role === "SUPER_ADMIN" ? "Tous" : (s.permissions || []).length}</TableCell>
                <TableCell className="text-xs">{(s.shop_ids || []).length || "—"}</TableCell>
                <TableCell><StatusBadge status={s.status || "ACTIVE"} /></TableCell>
                <TableCell>
                  {s.role !== "SUPER_ADMIN" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(s)} data-testid={`edit-staff-${s.id}`}>Modifier</Button>
                      {(s.status || "ACTIVE") === "ACTIVE" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => disable(s)} data-testid={`disable-staff-${s.id}`}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier le gestionnaire" : "Nouveau gestionnaire"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <>
                <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="staff-name" className="mt-1" /></div>
                <div>
                  <Label className="mb-2 block">Pays d'accès</Label>
                  <p className="text-xs text-muted-foreground mb-2">Les permissions et boutiques seront limitées à ces pays.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-border rounded-lg p-3 max-h-44 overflow-y-auto">
                    {countries.map((country) => (
                      <label key={country.name} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={form.country_scopes.includes(country.name)} onCheckedChange={() => toggleCountry(country.name)} data-testid={`staff-country-${country.iso2}`} />
                        {country.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <Label>Numéro de téléphone à vérifier</Label>
                  <div className="flex gap-2">
                    <Input value={form.phone} disabled={phoneVerified} onChange={(e) => {
                      setForm((f) => ({ ...f, phone: e.target.value, phone_verification_id: "" }));
                      setOtpCode(""); setOtpSent(false);
                    }} placeholder="+221..." data-testid="staff-phone" />
                    <Button type="button" variant="outline" disabled={otpLoading || phoneVerified} onClick={sendPhoneOtp} data-testid="staff-send-phone-otp">Envoyer OTP</Button>
                  </div>
                  {otpSent && !phoneVerified && (
                    <div className="flex gap-2">
                      <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Code OTP" data-testid="staff-phone-otp" />
                      <Button type="button" disabled={otpLoading} onClick={verifyPhoneOtp} data-testid="staff-verify-phone-otp">Vérifier</Button>
                    </div>
                  )}
                  {phoneVerified && <p className="text-xs text-green-700 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Téléphone vérifié</p>}
                </div>
                {phoneVerified && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="staff-email" className="mt-1" /></div>
                    <div><Label>Mot de passe</Label><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="staff-password" className="mt-1" /></div>
                  </div>
                )}
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              {editing && <div>
                <Label>{editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe"}</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="staff-password" className="mt-1" />
              </div>}
              <div>
                <Label>Rôle</Label>
                <Select value={form.role} onValueChange={setRoleDefaults}>
                  <SelectTrigger className="mt-1" data-testid="staff-role"><SelectValue /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {editing && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Statut du compte</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="mt-1" data-testid="staff-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Actif</SelectItem>
                      <SelectItem value="SUSPENDED">Suspendu</SelectItem>
                      <SelectItem value="DISABLED">Désactivé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {editing && (
              <div>
                <Label className="mb-2 block">Pays d'accès</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-border rounded-lg p-3 max-h-44 overflow-y-auto">
                  {countries.map((country) => (
                    <label key={country.name} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.country_scopes.includes(country.name)} onCheckedChange={() => toggleCountry(country.name)} data-testid={`staff-country-${country.iso2}`} />
                      {country.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Permissions par module (RBAC)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-border rounded-lg p-3">
                {modules.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={!!form.permissions[m.key]} onCheckedChange={() => togglePerm(m.key)} data-testid={`perm-${m.key}`} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Rattachement aux boutiques des pays sélectionnés (optionnel)</Label>
              <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                {eligibleShops.length === 0 && <span className="text-xs text-muted-foreground">Aucune boutique dans les pays sélectionnés</span>}
                {eligibleShops.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.shop_ids.includes(s.id)} onCheckedChange={() => toggleShop(s.id)} data-testid={`shop-attach-${s.id}`} />
                    {s.name} <span className="text-xs text-muted-foreground">({s.country})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <Switch checked={!!form.delegation?.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, delegation: { ...(f.delegation || {}), enabled: v } }))} data-testid="delegation-toggle" />
                Délégation temporaire d'accès
              </label>
              {form.delegation?.enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Début</Label><Input type="datetime-local" value={form.delegation?.start || ""} onChange={(e) => setForm((f) => ({ ...f, delegation: { ...f.delegation, start: e.target.value } }))} data-testid="delegation-start" className="mt-1" /></div>
                  <div><Label className="text-xs">Fin</Label><Input type="datetime-local" value={form.delegation?.end || ""} onChange={(e) => setForm((f) => ({ ...f, delegation: { ...f.delegation, end: e.target.value } }))} data-testid="delegation-end" className="mt-1" /></div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter><Button className="rounded-full" disabled={!editing && !phoneVerified} onClick={save} data-testid="save-staff">{editing ? "Enregistrer" : "Créer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Module 1: Sécurité & 2FA ----------------
export function AdminSecurity() {
  const { user, refresh } = useAuth();
  const [s, setS] = useState(null);
  const [channels, setChannels] = useState([]);
  const [cats, setCats] = useState([]);
  const canSettings = user?.role === "SUPER_ADMIN" || (user?.permissions || []).includes("settings");
  useEffect(() => {
    if (canSettings) {
      api.get("/admin/settings").then((r) => { setS(r.data.settings); setChannels(r.data.channels); }).catch(() => {});
      api.get("/categories").then((r) => setCats(r.data.categories || [])).catch(() => {});
    }
  }, [canSettings]);

  const CHAN_LABEL = { email: "E-mail", sms: "SMS", whatsapp: "WhatsApp" };
  const save = async (patch) => {
    try { const { data } = await api.put("/admin/settings", patch); setS(data.settings); toast.success("Paramètres enregistrés"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const toggleChannel = (c) => {
    const cur = s.two_factor_channels || [];
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    if (next.length === 0) { toast.error("Au moins un canal requis"); return; }
    save({ two_factor_channels: next });
  };

  const [pref, setPref] = useState({ enabled: user?.two_factor_enabled, channel: user?.two_factor_channel || "email" });
  const savePref = async (patch) => {
    const next = { ...pref, ...patch };
    setPref(next);
    try { await api.put("/auth/2fa", next); toast.success("Préférences 2FA mises à jour"); refresh(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div>
      <PageHeader title="Sécurité & authentification" subtitle="2FA, canaux OTP et double-validation" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canSettings && s && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="security-settings">
            <div className="flex items-center gap-2 font-display font-bold"><ShieldCheck className="w-5 h-5 text-primary" /> Politique 2FA de la plateforme</div>
            <div>
              <Label>Portée de la 2FA</Label>
              <Select value={s.two_factor_scope} onValueChange={(v) => save({ two_factor_scope: v })}>
                <SelectTrigger className="mt-1" data-testid="twofa-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Désactivée</SelectItem>
                  <SelectItem value="STAFF">Administrateurs & gestionnaires</SelectItem>
                  <SelectItem value="ALL">Tous les comptes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Canaux OTP autorisés</Label>
              <div className="flex flex-wrap gap-3">
                {channels.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={(s.two_factor_channels || []).includes(c)} onCheckedChange={() => toggleChannel(c)} data-testid={`channel-${c}`} />
                    {CHAN_LABEL[c]} {c !== "email" && <span className="text-[10px] text-muted-foreground">(simulé)</span>}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Seuil de double-validation (remboursement / retrait)</Label>
              <div className="flex gap-2 mt-1">
                <Input type="number" defaultValue={s.refund_threshold} data-testid="refund-threshold"
                  onBlur={(e) => save({ refund_threshold: parseFloat(e.target.value) || 0 })} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Toute opération au-dessus de ce montant exige l'approbation d'un second administrateur.</p>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2 font-display font-bold text-sm"><Store className="w-4 h-4 text-primary" /> Commissions & quotas</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Commission plateforme par défaut (%)</Label>
                  <Input type="number" defaultValue={(s.default_commission_rate ?? 0) * 100} data-testid="default-commission"
                    onBlur={(e) => save({ default_commission_rate: (parseFloat(e.target.value) || 0) / 100 })} className="mt-1" />
                </div>
                <div>
                  <Label>Quota produits par défaut (0 = illimité)</Label>
                  <Input type="number" defaultValue={s.default_product_quota ?? 0} data-testid="default-quota"
                    onBlur={(e) => save({ default_product_quota: parseInt(e.target.value || "0", 10) })} className="mt-1" />
                </div>
                <div>
                  <Label>Quota stockage par défaut (Mo, 0 = illimité)</Label>
                  <Input type="number" defaultValue={s.default_storage_quota_mb ?? 0} data-testid="default-storage"
                    onBlur={(e) => save({ default_storage_quota_mb: parseInt(e.target.value || "0", 10) })} className="mt-1" />
                </div>
              </div>
              {cats.length > 0 && (
                <div>
                  <Label className="mb-1 block">Commission par catégorie (%) — vide = défaut</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                    {cats.map((c) => {
                      const name = c.name || c;
                      const cur = s.category_commissions || {};
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate">{name}</span>
                          <Input type="number" className="w-20 h-8" data-testid={`cat-commission-${name}`}
                            defaultValue={cur[name] != null ? cur[name] * 100 : ""}
                            placeholder="défaut"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              const next = { ...cur };
                              if (v === "") delete next[name]; else next[name] = (parseFloat(v) || 0) / 100;
                              save({ category_commissions: next });
                            }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2 font-display font-bold text-sm"><ShieldAlert className="w-4 h-4 text-red-600" /> Détection d'anomalies (Reporting fraude)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sensibilité panier anormal (σ)</Label>
                  <Input type="number" step="0.5" defaultValue={s.fraud_basket_sigma ?? 3} data-testid="fraud-basket-sigma"
                    onBlur={(e) => save({ fraud_basket_sigma: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div>
                  <Label>Seuil taux d'annulation (%)</Label>
                  <Input type="number" defaultValue={Math.round((s.fraud_cancel_rate ?? 0.3) * 100)} data-testid="fraud-cancel-rate"
                    onBlur={(e) => save({ fraud_cancel_rate: (parseFloat(e.target.value) || 0) / 100 })} className="mt-1" />
                </div>
                <div>
                  <Label>Annulations/client avant alerte</Label>
                  <Input type="number" defaultValue={s.fraud_customer_cancels ?? 3} data-testid="fraud-customer-cancels"
                    onBlur={(e) => save({ fraud_customer_cancels: parseInt(e.target.value || "1", 10) })} className="mt-1" />
                </div>
                <div>
                  <Label>Remboursements avant alerte</Label>
                  <Input type="number" defaultValue={s.fraud_refund_count ?? 3} data-testid="fraud-refund-count"
                    onBlur={(e) => save({ fraud_refund_count: parseInt(e.target.value || "1", 10) })} className="mt-1" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Ces seuils pilotent les alertes affichées en haut de la page Reporting ventes.</p>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="my-2fa">
          <div className="flex items-center gap-2 font-display font-bold"><KeyRound className="w-5 h-5 text-primary" /> Ma vérification en deux étapes</div>
          <label className="flex items-center justify-between text-sm">
            <span>Activer la 2FA sur mon compte</span>
            <Switch checked={!!pref.enabled} onCheckedChange={(v) => savePref({ enabled: v })} data-testid="my-2fa-toggle" />
          </label>
          <div>
            <Label>Canal de réception</Label>
            <Select value={pref.channel} onValueChange={(v) => savePref({ channel: v })}>
              <SelectTrigger className="mt-1" data-testid="my-2fa-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="sms">SMS (simulé)</SelectItem>
                <SelectItem value="whatsapp">WhatsApp (simulé)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Module 9: Double-validation ----------------
export function AdminApprovals() {
  const [list, setList] = useState(null);
  const load = () => api.get("/admin/approvals").then((r) => setList(r.data.approvals)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const decide = async (a, decision) => {
    let note = "";
    if (decision === "REJECT") { note = window.prompt("Motif du rejet (optionnel) :", "") || ""; }
    try { await api.put(`/admin/approvals/${a.id}`, { decision, note }); toast.success("Décision enregistrée"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const KIND = { WITHDRAWAL: "Retrait (montant élevé)", DELETE_MERCHANT: "Suppression vendeur" };
  if (list === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Validations en attente" subtitle="Double-validation des actions sensibles" />
      {list.length === 0 ? <EmptyState title="Aucune demande" description="Les actions sensibles à valider apparaîtront ici." /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Détail</TableHead><TableHead>Demandé par</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id} data-testid={`approval-${a.id}`}>
                  <TableCell className="text-sm font-medium">{KIND[a.kind] || a.kind}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">{a.reason}</TableCell>
                  <TableCell className="text-xs">{a.requested_by_email}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    {a.status === "PENDING" ? (
                      <div className="flex gap-1">
                        <Button size="sm" className="rounded-full" onClick={() => decide(a, "APPROVE")} data-testid={`approve-${a.id}`}><CheckCircle2 className="w-4 h-4 mr-1" /> Approuver</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => decide(a, "REJECT")} data-testid={`reject-${a.id}`}><XCircle className="w-4 h-4" /></Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Clôturé</span>}
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

// ---------------- Module 1: Journal des connexions ----------------
export function AdminLoginJournal() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/admin/login-journal").then((r) => setRows(r.data.entries)).catch(() => setRows([])); }, []);
  if (rows === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Journal des connexions" subtitle={`${rows.length} connexion(s) enregistrée(s)`} />
      {rows.length === 0 ? <EmptyState title="Aucune connexion" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Utilisateur</TableHead><TableHead>Rôle</TableHead><TableHead>IP</TableHead><TableHead>Navigateur</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.created_at?.slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell className="text-sm">{r.email}</TableCell>
                  <TableCell className="text-xs font-mono">{r.role}</TableCell>
                  <TableCell className="text-xs font-mono">{r.ip}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.user_agent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------- Module 3: Modération produits ----------------
export function AdminProducts() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("PENDING");
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  const load = (status) => api.get(`/admin/products${status && status !== "ALL" ? `?status=${status}` : ""}`)
    .then((r) => setItems(r.data.products)).catch(() => setItems([]));
  useEffect(() => { load(tab); }, [tab]);

  const approve = async (p) => { try { await api.put(`/admin/products/${p.id}/moderate`, { decision: "APPROVE" }); toast.success("Produit validé"); load(tab); } catch (e) { toast.error(apiErr(e)); } };
  const doReject = async () => { try { await api.put(`/admin/products/${reject.id}/moderate`, { decision: "REJECT", reason }); toast.success("Produit refusé"); setReject(null); setReason(""); load(tab); } catch (e) { toast.error(apiErr(e)); } };

  if (items === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Modération des produits" subtitle="File de validation (en attente / validé / refusé)" />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="PENDING" data-testid="tab-pending">En attente</TabsTrigger>
          <TabsTrigger value="APPROVED" data-testid="tab-approved">Validés</TabsTrigger>
          <TabsTrigger value="REJECTED" data-testid="tab-rejected">Refusés</TabsTrigger>
          <TabsTrigger value="ALL" data-testid="tab-all">Tous</TabsTrigger>
        </TabsList>
      </Tabs>
      {items.length === 0 ? <EmptyState title="Aucun produit" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Produit</TableHead><TableHead>Boutique</TableHead><TableHead className="text-right">Prix</TableHead><TableHead>Signalements</TableHead><TableHead>Modération</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} data-testid={`mod-product-${p.id}`}>
                  <TableCell className="font-medium text-sm flex items-center gap-2">
                    {p.image ? <img src={p.image} alt="" className="w-8 h-8 rounded object-cover" /> : null}
                    {p.name} {p.flagged && <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded-full">SIGNALÉ</span>}
                  </TableCell>
                  <TableCell className="text-sm">{p.shop_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{money(p.price_simple, p.currency)}</TableCell>
                  <TableCell className="text-sm">{p.report_count || 0}</TableCell>
                  <TableCell><StatusBadge status={p.moderation_status || "APPROVED"} /></TableCell>
                  <TableCell>
                    {p.moderation_status !== "APPROVED" && <Button size="sm" className="rounded-full mr-1" onClick={() => approve(p)} data-testid={`approve-product-${p.id}`}><CheckCircle2 className="w-4 h-4 mr-1" /> Valider</Button>}
                    {p.moderation_status !== "REJECTED" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReject(p); setReason(""); }} data-testid={`reject-product-${p.id}`}><XCircle className="w-4 h-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!reject} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser le produit</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif du refus (visible par le commerçant)" data-testid="reject-product-reason" />
          <DialogFooter><Button variant="destructive" className="rounded-full" onClick={doReject} data-testid="confirm-reject-product">Confirmer le refus</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Module 3: Signalements ----------------
export function AdminReports() {
  const [reports, setReports] = useState(null);
  const [tab, setTab] = useState("OPEN");
  const load = (status) => api.get(`/admin/reports?status=${status}`).then((r) => setReports(r.data.reports)).catch(() => setReports([]));
  useEffect(() => { load(tab); }, [tab]);
  const act = async (r, action) => {
    let reason = "";
    if (action === "REJECT_PRODUCT") { reason = window.prompt("Motif du retrait du produit :", "Contenu non conforme") || ""; }
    try { await api.put(`/admin/reports/${r.id}`, { action, reason }); toast.success("Signalement traité"); load(tab); } catch (e) { toast.error(apiErr(e)); }
  };
  if (reports === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Signalements de produits" subtitle="Signalements clients & automatiques" />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="OPEN" data-testid="tab-open">Ouverts</TabsTrigger>
          <TabsTrigger value="ALL" data-testid="tab-all-reports">Tous</TabsTrigger>
        </TabsList>
      </Tabs>
      {reports.length === 0 ? <EmptyState title="Aucun signalement" /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Produit</TableHead><TableHead>Motif</TableHead><TableHead>Signalé par</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} data-testid={`report-${r.id}`}>
                  <TableCell className="text-sm font-medium">{r.product_name}<div className="text-[10px] text-muted-foreground">{r.shop_name}</div></TableCell>
                  <TableCell className="text-xs">{r.reason}{r.comment ? ` — ${r.comment}` : ""}</TableCell>
                  <TableCell className="text-xs">{r.auto ? <span className="text-red-700">Automatique</span> : r.reporter_name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    {r.status === "OPEN" ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" className="rounded-full" onClick={() => act(r, "REJECT_PRODUCT")} data-testid={`reject-reported-${r.id}`}>Retirer produit</Button>
                        <Button size="sm" variant="ghost" onClick={() => act(r, "DISMISS")} data-testid={`dismiss-${r.id}`}>Ignorer</Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Clôturé</span>}
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


// ---------------- Module 4: Reversements vendeurs & export comptable ----------------
export function AdminEarnings() {
  const [data, setData] = useState(null);
  const load = () => api.get("/admin/earnings").then((r) => setData(r.data)).catch(() => setData({ earnings: [], counts: {} }));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => {
    if (action === "reject" && !window.confirm("Rejeter ce gain ? Le client en sera notifié.")) return;
    try { await api.post(`/admin/earnings/${id}/${action}`); toast.success(action === "validate" ? "Gain validé" : "Gain rejeté"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (data === null) return <Loading />;
  const rows = data.earnings || [];
  const c = data.counts || {};
  return (
    <div>
      <PageHeader title="Validation des gains" subtitle="Recettes, bonus & marges clients — à valider après livraison" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard label="À valider (livrés)" value={c.awaiting || 0} icon={CheckCircle2} accent="bg-amber-100 text-amber-700" />
        <StatCard label="En attente de livraison" value={c.pending_delivery || 0} icon={Clock} accent="bg-muted text-muted-foreground" />
      </div>
      {rows.length === 0 ? <EmptyState title="Aucun gain en attente" description="Les gains apparaissent ici après la commande, et deviennent validables une fois la commande livrée." /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="earnings-table">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Montant</TableHead>
              <TableHead>Origine</TableHead><TableHead className="text-center">Statut</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} data-testid={`earning-row-${e.id}`}>
                  <TableCell className="text-sm"><div className="font-medium">{e.client_name}</div><div className="text-xs text-muted-foreground">{e.client_email}</div></TableCell>
                  <TableCell className="text-sm">{e.wallet_label}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{money(e.amount, e.currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{e.description}</TableCell>
                  <TableCell className="text-center">
                    {e.status === "AWAITING_VALIDATION"
                      ? <Badge className="bg-amber-100 text-amber-800 border-amber-200" data-testid={`earning-status-${e.id}`}>À valider</Badge>
                      : <Badge variant="outline" data-testid={`earning-status-${e.id}`}>En attente livraison</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {e.status === "AWAITING_VALIDATION" && (
                        <Button size="sm" className="rounded-full h-8" onClick={() => act(e.id, "validate")} data-testid={`validate-earning-${e.id}`}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Valider</Button>
                      )}
                      <Button size="sm" variant="outline" className="rounded-full h-8 text-destructive" onClick={() => act(e.id, "reject")} data-testid={`reject-earning-${e.id}`}><XCircle className="w-3.5 h-3.5 mr-1" /> Rejeter</Button>
                    </div>
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

export function AdminPayouts() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/payouts").then((r) => setData(r.data)).catch(() => setData({ payouts: [], summary: {} })); }, []);
  const doExport = async (fmt) => {
    try { await downloadFile("/admin/export/accounting", `comptabilite.${fmt === "xlsx" ? "xlsx" : "csv"}`, { format: fmt }); toast.success("Export généré"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (data === null) return <Loading />;
  const s = data.summary || {};
  return (
    <div>
      <PageHeader title="Reversements vendeurs" subtitle="Net reversé après commission plateforme"
        action={<div className="flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => doExport("csv")} data-testid="export-csv"><FileText className="w-4 h-4 mr-1" /> Export CSV</Button>
          <Button className="rounded-full" onClick={() => doExport("xlsx")} data-testid="export-xlsx"><FileText className="w-4 h-4 mr-1" /> Export Excel</Button>
        </div>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Volume brut (livré)" value={money(s.gross || 0, "")} icon={TrendingUp} accent="bg-green-100 text-green-700" />
        <StatCard label="Commission plateforme" value={money(s.commission || 0, "")} icon={Banknote} accent="bg-primary/10 text-primary" />
        <StatCard label="Net reversé vendeurs" value={money(s.net || 0, "")} icon={Banknote} accent="bg-amber-100 text-amber-700" />
      </div>
      {(!data.payouts || data.payouts.length === 0) ? <EmptyState title="Aucun reversement" description="Les reversements apparaissent lorsqu'une commande est livrée." /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Commande</TableHead><TableHead>Boutique</TableHead><TableHead className="text-right">Brut</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.payouts.map((p) => (
                <TableRow key={p.id} data-testid={`payout-${p.id}`}>
                  <TableCell className="text-sm font-mono">{p.order_ref}</TableCell>
                  <TableCell className="text-sm">{p.shop_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{money(p.gross, p.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-primary">{money(p.commission, p.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{money(p.net, p.currency)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}


// ---------------- Module 5: Transporteurs (carriers) ----------------
const emptyCarrier = { name: "", code: "", tracking_url: "", delay_days: 5, active: true };
export function AdminCarriers() {
  const [carriers, setCarriers] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCarrier);
  const load = () => api.get("/admin/carriers").then((r) => setCarriers(r.data.carriers)).catch(() => setCarriers([]));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await api.post("/admin/carriers", { ...form, delay_days: parseInt(form.delay_days || "5", 10) }); toast.success("Transporteur ajouté"); setOpen(false); setForm(emptyCarrier); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const patch = async (c, upd) => { try { await api.put(`/admin/carriers/${c.id}`, upd); load(); } catch (e) { toast.error(apiErr(e)); } };
  const remove = async (c) => { if (!window.confirm(`Supprimer ${c.name} ?`)) return; try { await api.delete(`/admin/carriers/${c.id}`); toast.success("Supprimé"); load(); } catch (e) { toast.error(apiErr(e)); } };
  if (carriers === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Transporteurs" subtitle="Architecture modulaire : ajout / suspension / suppression"
        action={<Button className="rounded-full" onClick={() => { setForm(emptyCarrier); setOpen(true); }} data-testid="new-carrier-btn"><Truck className="w-4 h-4 mr-1" /> Nouveau transporteur</Button>} />
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Code</TableHead><TableHead>Délai (j)</TableHead><TableHead>Actif</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {carriers.map((c) => (
              <TableRow key={c.id} data-testid={`carrier-${c.id}`}>
                <TableCell className="font-medium text-sm">{c.name}</TableCell>
                <TableCell className="text-xs font-mono">{c.code}</TableCell>
                <TableCell className="text-sm">{c.delay_days}</TableCell>
                <TableCell><Switch checked={!!c.active} onCheckedChange={(v) => patch(c, { active: v })} data-testid={`carrier-active-${c.id}`} /></TableCell>
                <TableCell>{c.suspended ? <StatusBadge status="SUSPENDED" /> : <StatusBadge status="ACTIVE" />}</TableCell>
                <TableCell><div className="flex gap-1">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => patch(c, { suspended: !c.suspended })} data-testid={`carrier-suspend-${c.id}`}>{c.suspended ? "Réactiver" : "Suspendre"}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c)} data-testid={`carrier-del-${c.id}`}><Trash2 className="w-4 h-4" /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau transporteur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="carrier-name" className="mt-1" /></div>
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} data-testid="carrier-code" className="mt-1" /></div>
            <div><Label>Délai de livraison (jours)</Label><Input type="number" value={form.delay_days} onChange={(e) => setForm((p) => ({ ...p, delay_days: e.target.value }))} data-testid="carrier-delay" className="mt-1" /></div>
            <div><Label>URL de suivi (optionnel)</Label><Input value={form.tracking_url} onChange={(e) => setForm((p) => ({ ...p, tracking_url: e.target.value }))} placeholder="https://.../{tracking}" data-testid="carrier-url" className="mt-1" /></div>
          </div>
          <DialogFooter><Button className="rounded-full" onClick={create} data-testid="save-carrier">Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
