import React, { useEffect, useState, createContext, useContext, useCallback } from "react";
import { Navigate, useNavigate, Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid,
} from "recharts";
import api, { apiErr, downloadFile, uploadImage } from "@/lib/api";
import { money } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, StatCard, EmptyState, Loading } from "@/components/common";
import { StatusBadge } from "@/components/StatusBadge";
import { TrackingButton } from "@/components/OrderTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  Home, Package, ShoppingCart, Users, Lightbulb, Boxes, BarChart3, Gift, Tag, Settings,
  Plus, Pencil, Trash2, Minus, TrendingUp, AlertTriangle, CheckCircle2, Clock, Phone, Mail, IdCard, Store, FileText,
  Upload, X, Image as ImageIcon, Layers, UploadCloud, UserCog, Link2,
} from "lucide-react";
import { CategoryPicker } from "@/components/CategoryPicker";

const MerchantCtx = createContext(null);
const useMerchant = () => useContext(MerchantCtx);


export function MerchantLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [shop, setShop] = useState(undefined);
  const [shops, setShops] = useState([]);
  const reload = useCallback(() => {
    api.get("/shops/mine").then((r) => { setShop(r.data.shop); setShops(r.data.shops || []); }).catch(() => setShop(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  if (shop === undefined) return <Loading full />;
  if (!shop || shop.status !== "APPROVED") return <Navigate to="/merchant/onboarding" replace />;

  const changeShop = async (shopId) => {
    try {
      await api.put("/shops/mine/active", { shop_id: shopId });
      window.location.assign("/merchant");
    } catch (e) {
      toast.error(apiErr(e));
    }
  };
  const headerAction = (
    <div className="hidden sm:flex items-center gap-2">
      {shops.length > 1 && (
        <Select value={shop.id} onValueChange={changeShop}>
          <SelectTrigger className="w-44 h-9" data-testid="merchant-shop-switcher"><SelectValue /></SelectTrigger>
          <SelectContent>
            {shops.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" size="sm" onClick={() => navigate("/merchant/onboarding?new=1")} data-testid="merchant-add-shop">
        <Plus className="w-4 h-4 mr-1" /> Boutique
      </Button>
    </div>
  );

  const nav = [
    { to: "/merchant", label: t("dashboard"), icon: Home, testid: "overview" },
    { to: "/merchant/products", label: t("articles"), icon: Package, testid: "products" },
    { to: "/merchant/orders", label: t("orders"), icon: ShoppingCart, testid: "orders" },
    { to: "/merchant/customers", label: t("customers"), icon: Users, testid: "customers" },
    { to: "/merchant/opportunities", label: t("opportunities"), icon: Lightbulb, testid: "opportunities" },
    { to: "/merchant/stock", label: t("stock"), icon: Boxes, testid: "stock" },
    { to: "/merchant/stats", label: t("statistics"), icon: BarChart3, testid: "stats" },
    { to: "/merchant/loyalty", label: t("loyalty"), icon: Gift, testid: "loyalty" },
    { to: "/merchant/promotions", label: t("promos"), icon: Tag, testid: "promotions" },
    { to: "/merchant/daily-offers", label: "Offre du jour", icon: Gift, testid: "daily-offers" },
    { to: "/merchant/settings", label: t("settings"), icon: Settings, testid: "settings" },
    { to: "/merchant/account", label: "Mon compte", icon: UserCog, testid: "account" },
  ];
  return (
    <MerchantCtx.Provider value={{ shop, reload }}>
      <DashboardShell nav={nav} title={shop.name} subtitle="Espace commerçant" headerAction={headerAction} />
    </MerchantCtx.Provider>
  );
}

/* ---------------- Onboarding ---------------- */
export function MerchantOnboarding() {
  const { user, refresh, switchProfile } = useAuth();
  const navigate = useNavigate();
  const [shop, setShop] = useState(undefined);
  const [shops, setShops] = useState([]);
  const [kyc, setKyc] = useState(null);
  const [countries, setCountries] = useState([]);
  const [searchParams] = useSearchParams();
  const [addingShop, setAddingShop] = useState(searchParams.get("new") === "1");

  const load = () => {
    api.get("/shops/mine").then((r) => { setShop(r.data.shop); setShops(r.data.shops || []); }).catch(() => setShop(null));
    api.get("/kyc/mine").then((r) => setKyc(r.data.kyc)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get("/config/countries").then((r) => setCountries(r.data.countries)).catch(() => {});
  }, []);

  useEffect(() => { if (shop && shop.status === "APPROVED" && !addingShop) navigate("/merchant"); }, [shop, navigate, addingShop]);

  const selectShop = async (shopId) => {
    try {
      const { data } = await api.put("/shops/mine/active", { shop_id: shopId });
      setShop(data.shop);
      setAddingShop(false);
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const phoneOk = user?.phone_verified;
  const emailOk = user?.email_verified;
  const kycOk = kyc && (kyc.status === "APPROUVE");
  const kycSubmitted = kyc && kyc.status !== "NONE";
  const shopCreated = !!shop;
  const shopSubmitted = shop && ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(shop.status);

  const Step = ({ n, title, done, children }) => (
    <div className={`bg-card border rounded-xl p-5 ${done ? "border-green-300" : "border-border"}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full grid place-items-center text-sm font-bold ${done ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"}`}>
          {done ? <CheckCircle2 className="w-5 h-5" /> : n}
        </div>
        <h3 className="font-display font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-neutral-950 text-white">
        <div className="max-w-3xl mx-auto px-4 py-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center font-display font-extrabold">A</div>
            <span className="font-display font-extrabold">AfriMarket</span>
          </Link>
          <div className="flex items-center gap-3">
            {(user?.profiles || []).includes("CLIENT") && (
              <Button variant="outline" size="sm" onClick={async () => {
                try { await switchProfile("CLIENT"); navigate("/account"); }
                catch { toast.error("Impossible de changer de profil."); }
              }} data-testid="merchant-onboarding-client-profile">Espace client</Button>
            )}
            <span className="text-sm text-neutral-300">Créer votre boutique</span>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <PageHeader title="Bienvenue, commerçant 👋" subtitle="Suivez les étapes pour lancer votre boutique" />

        <VerifyStep StepC={Step} kind="phone" ok={phoneOk} onDone={refresh} />
        <VerifyStep StepC={Step} kind="email" ok={emailOk} onDone={refresh} />

        <Step n={3} title="Vérification d'identité (KYC)" done={kycOk}>
          {kycOk ? <div className="text-sm text-green-700">Identité approuvée ✓</div> :
            kycSubmitted ? <div className="text-sm"><StatusBadge status={kyc.status} /> — en cours de vérification par l'administration.</div> :
            <KycForm countries={countries} onDone={load} disabled={!phoneOk || !emailOk} />}
        </Step>

        <Step n={4} title="Créer la boutique" done={shopCreated}>
          {shops.length > 0 && (
            <div className="mb-4 space-y-2" data-testid="merchant-shop-list">
              <Label>Vos boutiques</Label>
              {shops.map((item) => (
                <button key={item.id} type="button" onClick={() => selectShop(item.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm flex items-center justify-between gap-3 ${shop?.id === item.id ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`merchant-shop-${item.id}`}>
                  <span className="font-medium truncate">{item.name}</span>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          )}
          {shopCreated && !addingShop ? (
            <div className="text-sm">
              <div className="font-medium">{shop.name} — {shop.city}, {shop.country}</div>
              <div className="mt-1">Statut : <StatusBadge status={shop.status} /></div>
              {shop.status === "REJECTED" && <div className="text-destructive text-sm mt-2">Motif : {shop.rejection_reason}</div>}
              <Button variant="outline" className="rounded-full mt-3" onClick={() => setAddingShop(true)} data-testid="add-another-shop">
                <Plus className="w-4 h-4 mr-1" /> Créer une autre boutique
              </Button>
            </div>
          ) : <ShopForm countries={countries} onDone={(createdShop) => {
            setShop(createdShop);
            setShops((current) => [createdShop, ...current.filter((item) => item.id !== createdShop.id)]);
            setAddingShop(false);
            load();
          }} disabled={!kycSubmitted} />}
        </Step>

        <Step n={5} title="Soumettre pour validation" done={shopSubmitted && shop.status !== "DRAFT"}>
          {!shopCreated ? <div className="text-sm text-muted-foreground">Créez d'abord votre boutique.</div> :
            shop.status === "DRAFT" ? (
              <Button className="rounded-full" data-testid="submit-shop-btn" onClick={async () => { await api.post(`/shops/${shop.id}/submit`); toast.success("Boutique soumise !"); load(); }}>
                Soumettre à l'administration
              </Button>
            ) : shop.status === "APPROVED" ? <div className="text-green-700 text-sm">Approuvée ! Redirection...</div> :
              shop.status === "REJECTED" ? (
                <Button className="rounded-full" onClick={async () => { await api.post(`/shops/${shop.id}/submit`); toast.success("Re-soumise !"); load(); }}>Re-soumettre</Button>
              ) : <div className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> En attente de validation par l'administration.</div>}
        </Step>
      </div>
    </div>
  );
}

function VerifyStep({ StepC, kind, ok, onDone }) {
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const isPhone = kind === "phone";
  const send = async () => {
    if (isPhone) { const { data } = await api.post("/auth/send-phone-otp"); setOtp(data.demo_otp); toast.info(`Code OTP (MOCK) : ${data.demo_otp}`); }
    else { await api.post("/auth/resend-email"); toast.info("E-mail de vérification envoyé (vérifiez les logs si non reçu)"); }
  };
  const verify = async () => {
    try { await api.post(isPhone ? "/auth/verify-phone" : "/auth/verify-email", { code }); toast.success("Vérifié !"); onDone(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <StepC n={isPhone ? 1 : 2} title={isPhone ? "Vérifier le téléphone (OTP)" : "Vérifier l'e-mail"} done={ok}>
      {ok ? <div className="text-sm text-green-700">Vérifié ✓</div> : (
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={send} data-testid={`send-${kind}`}>
            {isPhone ? <Phone className="w-4 h-4 mr-1" /> : <Mail className="w-4 h-4 mr-1" />} Envoyer le code
          </Button>
          <div>
            <Label className="text-xs">Code {isPhone && otp ? `(MOCK: ${otp})` : ""}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-32 mt-1" data-testid={`code-${kind}`} />
          </div>
          <Button className="rounded-full" onClick={verify} data-testid={`verify-${kind}`}>Valider</Button>
        </div>
      )}
    </StepC>
  );
}

function KycForm({ countries, onDone, disabled }) {
  const [f, setF] = useState({ doc_type: "Carte nationale d'identité", doc_number: "", expiry_date: "", issuing_country: "" });
  const submit = async () => {
    try { await api.post("/kyc", { ...f, file_data: "" }); toast.success("Document soumis"); onDone(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Type de document</Label>
          <Select value={f.doc_type} onValueChange={(v) => setF({ ...f, doc_type: v })}>
            <SelectTrigger className="mt-1" data-testid="kyc-doctype"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Carte nationale d'identité">Carte nationale d'identité</SelectItem>
              <SelectItem value="Passeport">Passeport</SelectItem>
              <SelectItem value="Permis de conduire">Permis de conduire</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Numéro</Label><Input value={f.doc_number} onChange={(e) => setF({ ...f, doc_number: e.target.value })} className="mt-1" data-testid="kyc-number" /></div>
        <div><Label>Date d'expiration</Label><Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} className="mt-1" /></div>
        <div><Label>Pays d'émission</Label>
          <Select value={f.issuing_country} onValueChange={(v) => setF({ ...f, issuing_country: v })}>
            <SelectTrigger className="mt-1" data-testid="kyc-country"><SelectValue placeholder="Pays" /></SelectTrigger>
            <SelectContent className="max-h-60">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><IdCard className="w-3 h-3" /> Document chiffré et accessible uniquement à l'administration.</div>
      <Button className="rounded-full" onClick={submit} data-testid="submit-kyc">Soumettre le document</Button>
    </div>
  );
}

function ShopForm({ countries, onDone, disabled }) {
  const [f, setF] = useState({ name: "", country: "", city: "", region: "", zone: "", street: "", phone: "", tax_number: "", description: "", logo: "https://images.unsplash.com/photo-1751374858042-b8b9ff8480aa?q=80&w=400" });
  const upd = (k, v) => setF({ ...f, [k]: v });
  const submit = async () => {
    if (!f.name.trim() || !f.country || !f.city.trim()) {
      toast.error("Le nom de la boutique, le pays et la ville sont obligatoires.");
      return;
    }
    try { const { data } = await api.post("/shops", f); toast.success("Boutique créée"); onDone(data.shop); }
    catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Dénomination</Label><Input value={f.name} onChange={(e) => upd("name", e.target.value)} className="mt-1" data-testid="shop-name" /></div>
        <div><Label>Pays</Label>
          <Select value={f.country} onValueChange={(v) => upd("country", v)}>
            <SelectTrigger className="mt-1" data-testid="shop-country"><SelectValue placeholder="Pays" /></SelectTrigger>
            <SelectContent className="max-h-60">{countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name} — {c.currency}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Ville</Label><Input value={f.city} onChange={(e) => upd("city", e.target.value)} className="mt-1" data-testid="shop-city" /></div>
        <div><Label>Région/Province</Label><Input value={f.region} onChange={(e) => upd("region", e.target.value)} className="mt-1" /></div>
        <div><Label>Zone/Quartier</Label><Input value={f.zone} onChange={(e) => upd("zone", e.target.value)} className="mt-1" /></div>
        <div><Label>Rue</Label><Input value={f.street} onChange={(e) => upd("street", e.target.value)} className="mt-1" /></div>
        <div><Label>Téléphone</Label><Input value={f.phone} onChange={(e) => upd("phone", e.target.value)} className="mt-1" /></div>
        <div><Label>N° fiscal</Label><Input value={f.tax_number} onChange={(e) => upd("tax_number", e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label>Description</Label><Textarea value={f.description} onChange={(e) => upd("description", e.target.value)} className="mt-1" /></div>
      <Button className="rounded-full" onClick={submit} data-testid="create-shop-btn">Créer la boutique</Button>
    </div>
  );
}

/* ---------------- Overview ---------------- */
export function MerchantOverview() {
  const { shop } = useMerchant();
  const [s, setS] = useState(null);
  useEffect(() => { api.get(`/shops/${shop.id}/stats`).then((r) => setS(r.data)).catch(() => {}); }, [shop.id]);
  if (!s) return <Loading />;
  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle={`${shop.name} · ${shop.currency}`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="CA du jour" value={money(s.revenue_today, s.currency)} icon={TrendingUp} accent="bg-green-100 text-green-700" />
        <StatCard label="CA du mois" value={money(s.revenue_month, s.currency)} icon={BarChart3} />
        <StatCard label="Commandes en attente" value={s.orders_pending} icon={Clock} accent="bg-amber-100 text-amber-700" />
        <StatCard label="Clients" value={s.n_customers} icon={Users} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-4">CA — 7 derniers jours</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={s.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} />
              <Tooltip /><Line type="monotone" dataKey="revenue" stroke="#E85D04" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 text-amber-600 mb-2"><AlertTriangle className="w-4 h-4" /><span className="font-semibold text-sm">Alertes stock</span></div>
            <div className="text-sm">Rupture : <span className="font-bold">{s.out_of_stock.length}</span></div>
            <div className="text-sm">Stock faible : <span className="font-bold">{s.low_stock.length}</span></div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="text-sm text-muted-foreground">Panier moyen</div>
            <div className="font-mono font-bold text-lg">{money(s.avg_basket, s.currency)}</div>
            <div className="text-sm text-muted-foreground mt-2">Indice de vente (IDV)</div>
            <div className="font-mono font-bold text-lg">{s.idv}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Products ---------------- */
const emptyProduct = {
  name: "", short_description: "", description: "", image: "https://images.unsplash.com/photo-1560343090-f0409e92791a?q=80&w=600",
  gallery: [], category: "", subcategory: "", stock: 0, alert_threshold: 5, price_simple: 0, price_partner: 0, price_pro: 0, price_enterprise: 0,
  shipping_fee: 0, weight: 0, dimensions: "", sku: "", variants: [],
  promo: { enabled: false, promo_price: 0, promo_qty: 0, promo_sold: 0 },
};

function ImageUploader({ value, gallery, onImage, onGallery }) {
  const [busy, setBusy] = useState(false);
  const doUpload = async (files, isGallery) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadImage(f));
      if (isGallery) onGallery([...(gallery || []), ...urls]);
      else onImage(urls[0]);
      toast.success("Image(s) téléversée(s)");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div>
        <Label>Image principale</Label>
        <div className="mt-1 flex items-center gap-3">
          <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
            {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-muted-foreground"><ImageIcon className="w-6 h-6" /></div>}
          </div>
          <div className="flex-1">
            <label className="inline-flex items-center gap-2 text-sm border border-border rounded-full px-3 py-2 cursor-pointer hover:bg-accent transition-colors" data-testid="upload-main-image">
              <Upload className="w-4 h-4" /> {busy ? "Téléversement..." : "Téléverser"}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => doUpload(e.target.files, false)} />
            </label>
            <Input value={value} onChange={(e) => onImage(e.target.value)} className="mt-2" placeholder="ou coller une URL" />
          </div>
        </div>
      </div>
      <div>
        <Label>Galerie ({(gallery || []).length})</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {(gallery || []).map((g, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group" data-testid={`gallery-item-${idx}`}>
              <img src={g} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onGallery(gallery.filter((_, i) => i !== idx))}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`gallery-remove-${idx}`}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border grid place-items-center cursor-pointer hover:border-primary transition-colors" data-testid="upload-gallery-image">
            <Plus className="w-5 h-5 text-muted-foreground" />
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => doUpload(Array.from(e.target.files), true)} />
          </label>
        </div>
      </div>
    </div>
  );
}

function VariantsEditor({ variants, onChange, currency }) {
  const add = () => onChange([...(variants || []), { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "", sku: "", stock: 0, price_simple: 0, price_partner: 0, price_pro: 0, price_enterprise: 0 }]);
  const upd = (idx, k, v) => onChange(variants.map((vr, i) => (i === idx ? { ...vr, [k]: v } : vr)));
  const del = (idx) => onChange(variants.filter((_, i) => i !== idx));
  return (
    <div className="bg-accent/30 rounded-lg p-3" data-testid="variants-editor">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Variantes ({(variants || []).length})</span>
        <Button type="button" size="sm" variant="outline" className="rounded-full h-7" onClick={add} data-testid="variant-add"><Plus className="w-3 h-3 mr-1" /> Ajouter</Button>
      </div>
      {(variants || []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune variante. Le produit se vend au stock et prix ci-dessus. Ajoutez des variantes (taille/couleur) pour redéfinir stock et prix par déclinaison.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">Chaque variante redéfinit ses 4 prix ({currency}). Le stock produit = somme des stocks de variantes.</p>
          {variants.map((vr, idx) => (
            <div key={vr.id || idx} className="border border-border rounded-lg p-2 bg-background" data-testid={`variant-row-${idx}`}>
              <div className="flex items-center gap-2 mb-2">
                <Input value={vr.label} onChange={(e) => upd(idx, "label", e.target.value)} placeholder="Ex: Rouge / M" className="h-8" data-testid={`variant-label-${idx}`} />
                <Input type="number" value={vr.stock} onChange={(e) => upd(idx, "stock", Number(e.target.value))} placeholder="Stock" className="h-8 w-24" data-testid={`variant-stock-${idx}`} />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => del(idx)} data-testid={`variant-del-${idx}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Input type="number" value={vr.price_simple} onChange={(e) => upd(idx, "price_simple", Number(e.target.value))} placeholder="PCS" className="h-8" data-testid={`variant-pcs-${idx}`} />
                <Input type="number" value={vr.price_partner} onChange={(e) => upd(idx, "price_partner", Number(e.target.value))} placeholder="PP" className="h-8" data-testid={`variant-pp-${idx}`} />
                <Input type="number" value={vr.price_pro} onChange={(e) => upd(idx, "price_pro", Number(e.target.value))} placeholder="PPR" className="h-8" data-testid={`variant-ppr-${idx}`} />
                <Input type="number" value={vr.price_enterprise} onChange={(e) => upd(idx, "price_enterprise", Number(e.target.value))} placeholder="PE" className="h-8" data-testid={`variant-pe-${idx}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductForm({ initial, onSaved, shop }) {
  const [f, setF] = useState(initial || emptyProduct);
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const updPromo = (k, v) => setF((x) => ({ ...x, promo: { ...x.promo, [k]: v } }));
  const hasVariants = (f.variants || []).length > 0;
  const save = async () => {
    const payload = { ...f, stock: Number(f.stock), alert_threshold: Number(f.alert_threshold),
      price_simple: Number(f.price_simple), price_partner: Number(f.price_partner), price_pro: Number(f.price_pro),
      price_enterprise: Number(f.price_enterprise), shipping_fee: Number(f.shipping_fee), weight: Number(f.weight),
      gallery: f.gallery || [], variants: (f.variants || []).map((v) => ({ ...v, id: v.id && v.id.startsWith("new-") ? undefined : v.id })),
      promo: { ...f.promo, promo_price: Number(f.promo.promo_price || 0), promo_qty: Number(f.promo.promo_qty || 0), promo_sold: Number(f.promo.promo_sold || 0) } };
    try {
      if (initial?.id) await api.put(`/products/${initial.id}`, payload);
      else await api.post("/products", payload);
      toast.success("Article enregistré"); onSaved();
    } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div><Label>Nom</Label><Input value={f.name} onChange={(e) => upd("name", e.target.value)} className="mt-1" data-testid="prod-name" /></div>
      <ImageUploader value={f.image} gallery={f.gallery} onImage={(v) => upd("image", v)} onGallery={(v) => upd("gallery", v)} />
      <div><Label>Description courte</Label><Input value={f.short_description} onChange={(e) => upd("short_description", e.target.value)} className="mt-1" /></div>
      <div><Label>Description complète</Label><Textarea value={f.description} onChange={(e) => upd("description", e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        <CategoryPicker category={f.category} subcategory={f.subcategory} onChange={(c, s) => setF((x) => ({ ...x, category: c, subcategory: s }))} />
        <div><Label>Stock {hasVariants && <span className="text-[10px] text-muted-foreground">(auto = Σ variantes)</span>}</Label><Input type="number" value={f.stock} onChange={(e) => upd("stock", e.target.value)} className="mt-1" disabled={hasVariants} data-testid="prod-stock" /></div>
      </div>
      <div className="bg-accent/40 rounded-lg p-3">
        <div className="text-xs font-semibold mb-2">Prix par type de client ({shop?.currency}){hasVariants && <span className="text-muted-foreground font-normal"> — prix de base, surchargé par les variantes</span>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Client Simple (PCS)</Label><Input type="number" value={f.price_simple} onChange={(e) => upd("price_simple", e.target.value)} className="mt-1" data-testid="prod-pcs" /></div>
          <div><Label className="text-xs">Partenaire (PP)</Label><Input type="number" value={f.price_partner} onChange={(e) => upd("price_partner", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Professionnel (PPR)</Label><Input type="number" value={f.price_pro} onChange={(e) => upd("price_pro", e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Entreprise (PE)</Label><Input type="number" value={f.price_enterprise} onChange={(e) => upd("price_enterprise", e.target.value)} className="mt-1" /></div>
        </div>
      </div>
      <VariantsEditor variants={f.variants} onChange={(v) => upd("variants", v)} currency={shop?.currency} />
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Frais de livraison</Label><Input type="number" value={f.shipping_fee} onChange={(e) => upd("shipping_fee", e.target.value)} className="mt-1" /></div>
        <div><Label>Seuil d'alerte</Label><Input type="number" value={f.alert_threshold} onChange={(e) => upd("alert_threshold", e.target.value)} className="mt-1" /></div>
      </div>
      <div className="bg-primary/5 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">Promotion</span>
          <Switch checked={f.promo.enabled} onCheckedChange={(v) => updPromo("enabled", v)} data-testid="promo-toggle" />
        </div>
        {f.promo.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Prix promo</Label><Input type="number" value={f.promo.promo_price} onChange={(e) => updPromo("promo_price", e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Quantité promo</Label><Input type="number" value={f.promo.promo_qty} onChange={(e) => updPromo("promo_qty", e.target.value)} className="mt-1" /></div>
          </div>
        )}
      </div>
      <Button className="w-full rounded-full" onClick={save} data-testid="save-product">Enregistrer</Button>
    </div>
  );
}

function SupplierImportDraft({ item, importId, shop, onChanged }) {
  const [form, setForm] = useState({
    ...item,
    gallery: item.gallery || [],
    stock: item.stock || 0,
    price_simple: item.price_simple || 0,
    price_partner: item.price_partner || 0,
    price_pro: item.price_pro || 0,
    price_enterprise: item.price_enterprise || 0,
    shipping_fee: item.shipping_fee || 0,
  });
  const [busy, setBusy] = useState(false);
  const upd = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        gallery: form.gallery || [],
        stock: Number(form.stock),
        price_simple: Number(form.price_simple),
        price_partner: Number(form.price_partner),
        price_pro: Number(form.price_pro),
        price_enterprise: Number(form.price_enterprise),
        shipping_fee: Number(form.shipping_fee),
      };
      const { data } = await api.put(`/products/supplier-imports/${importId}/items/${item.id}`, payload);
      setForm(data.item);
      toast.success("Brouillon enregistré");
      onChanged();
      return true;
    } catch (e) { toast.error(apiErr(e)); return false; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!await save()) return;
    setBusy(true);
    try {
      await api.post(`/products/supplier-imports/${importId}/items/${item.id}/publish`);
      toast.success("Produit envoyé en modération");
      onChanged();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true);
    try {
      await api.post(`/products/supplier-imports/${importId}/items/${item.id}/dismiss`);
      toast.success("Produit ignoré");
      onChanged();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  if (item.status !== "PENDING") return null;
  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <img src={form.image} alt="" className="w-20 h-20 rounded-lg object-cover bg-muted shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Prix fournisseur indicatif : {form.source_price ?? "—"} {form.source_currency}</div>
          <a href={form.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">Voir la fiche source</a>
          <Input className="mt-2" value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="Nom du produit" aria-label="Nom du produit" />
        </div>
      </div>
      <Input value={form.image} onChange={(e) => upd("image", e.target.value)} placeholder="URL HTTPS de l’image principale" aria-label="Image principale" />
      <Textarea value={(form.gallery || []).join("\n")} onChange={(e) => upd("gallery", e.target.value.split("\n").map((url) => url.trim()).filter(Boolean))} placeholder="Images supplémentaires — une URL HTTPS par ligne" aria-label="Galerie d’images" />
      <Input value={form.short_description || ""} onChange={(e) => upd("short_description", e.target.value)} placeholder="Description courte" aria-label="Description courte" />
      <Textarea value={form.description || ""} onChange={(e) => upd("description", e.target.value)} placeholder="Description détaillée" aria-label="Description détaillée" />
      <CategoryPicker category={form.category || ""} subcategory={form.subcategory || ""} onChange={(category, subcategory) => setForm((current) => ({ ...current, category, subcategory }))} />
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Stock</Label><Input type="number" min="1" value={form.stock} onChange={(e) => upd("stock", e.target.value)} /></div>
        <div><Label>Transport ({shop?.currency})</Label><Input type="number" min="0" value={form.shipping_fee} onChange={(e) => upd("shipping_fee", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["price_simple", "Prix client simple (PCS)"],
          ["price_partner", "Prix partenaire (PP)"],
          ["price_pro", "Prix professionnel (PPR)"],
          ["price_enterprise", "Prix entreprise (PE)"],
        ].map(([key, label]) => <div key={key}><Label>{label} ({shop?.currency})</Label><Input type="number" min="0" value={form[key]} onChange={(e) => upd(key, e.target.value)} /></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={save}>Enregistrer</Button>
        <Button className="rounded-full" disabled={busy} onClick={publish}>Valider et envoyer en modération</Button>
        <Button variant="ghost" className="rounded-full text-destructive" disabled={busy} onClick={dismiss}>Ignorer</Button>
      </div>
    </div>
  );
}

function SupplierImportDialog({ open, onOpenChange, shop, onPublished }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const refreshSessions = async () => {
    try { const { data } = await api.get("/products/supplier-imports"); setSessions(data.sessions || []); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const openSession = async (id) => {
    setBusy(true);
    try {
      const { data } = await api.get(`/products/supplier-imports/${id}`);
      setActive(data.session);
      setItems(data.items || []);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (open) refreshSessions(); }, [open]);
  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/products/supplier-imports", { source_url: sourceUrl });
      setActive(data.session);
      setItems(data.items || []);
      await refreshSessions();
      toast.success(`${data.items?.length || 0} produit(s) importé(s) dans les brouillons`);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const continueImport = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/products/supplier-imports/${active.id}/continue`);
      setActive(data.session);
      setItems(data.items || []);
      await refreshSessions();
      toast.success(`${data.session.imported_count} produit(s) détecté(s) au total`);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const pause = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/products/supplier-imports/${active.id}/pause`);
      setActive(data.session);
      await refreshSessions();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };
  const reloadActive = async () => {
    if (!active) return;
    await openSession(active.id);
    onPublished();
    await refreshSessions();
  };
  const pendingItems = items.filter((item) => item.status === "PENDING");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer depuis AliExpress ou Alibaba</DialogTitle>
          <DialogDescription>Collez une URL publique de produit ou de boutique. Les boutiques sont traitées par lots de 20 maximum. Les pages protégées ne sont pas contournées. Chaque prix et frais de transport doit être défini par vous avant l’envoi en modération.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.aliexpress.com/... ou alibaba.com/..." aria-label="Adresse AliExpress ou Alibaba" />
            <Button className="rounded-full shrink-0" disabled={busy || !sourceUrl.trim()} onClick={start}><Link2 className="w-4 h-4 mr-1" /> Importer</Button>
          </div>
          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => <Button key={session.id} variant={active?.id === session.id ? "default" : "outline"} size="sm" className="rounded-full" disabled={busy} onClick={() => openSession(session.id)}>{session.shop_name} · {session.imported_count} importé(s) · {session.status}</Button>)}
            </div>
          )}
          {active && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-lg p-3">
                <div className="text-sm"><strong>{active.kind === "STORE" ? "Boutique" : "Produit"}</strong> · {active.imported_count} produit(s) détecté(s) · {pendingItems.length} à vérifier</div>
                <div className="flex gap-2">
                  {active.can_continue && <Button variant="outline" className="rounded-full" disabled={busy} onClick={pause}>Arrêter ici</Button>}
                  {active.can_continue && <Button className="rounded-full" disabled={busy} onClick={continueImport}>Continuer (20 max)</Button>}
                </div>
              </div>
              {active.errors?.length > 0 && <div className="text-sm text-amber-700">{active.errors.length} page(s) fournisseur illisible(s) ou indisponible(s).</div>}
              {pendingItems.length === 0 && <p className="text-sm text-muted-foreground">Aucun brouillon à vérifier pour ce lot.</p>}
              {pendingItems.map((item) => <SupplierImportDraft key={item.id} item={item} importId={active.id} shop={shop} onChanged={reloadActive} />)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MerchantProducts() {
  const { shop } = useMerchant();
  const [products, setProducts] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [csvEnabled, setCsvEnabled] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supplierImportOpen, setSupplierImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const load = () => api.get("/products/mine").then((r) => setProducts(r.data.products)).catch(() => setProducts([]));
  useEffect(() => { load(); api.get("/features").then((r) => setCsvEnabled(r.data.csv_import_enabled)).catch(() => {}); }, []);
  const del = async (id) => { if (!window.confirm("Supprimer cet article ?")) return; await api.delete(`/products/${id}`); toast.success("Supprimé"); load(); };
  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setOpen(true); };
  const doImport = async (file) => {
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/products/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(data);
      toast.success(`${data.created} produit(s) importé(s)`);
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setImportBusy(false); }
  };
  if (products === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Articles" subtitle={`${products.length} article(s)`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setSupplierImportOpen(true)} data-testid="supplier-import-btn"><Link2 className="w-4 h-4 mr-1" /> AliExpress / Alibaba</Button>
            {csvEnabled && <Button variant="outline" className="rounded-full" onClick={() => { setImportResult(null); setImportOpen(true); }} data-testid="import-csv-btn"><UploadCloud className="w-4 h-4 mr-1" /> Importer CSV</Button>}
            <Button className="rounded-full" onClick={openNew} data-testid="new-product-btn"><Plus className="w-4 h-4 mr-1" /> Nouvel article</Button>
          </div>
        } />
      <SupplierImportDialog open={supplierImportOpen} onOpenChange={setSupplierImportOpen} shop={shop} onPublished={load} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
            <DialogDescription>Renseignez les informations, images et variantes de votre article.</DialogDescription>
          </DialogHeader>
          <ProductForm initial={editing} shop={shop} onSaved={() => { setOpen(false); load(); }} />
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Importer des produits (CSV / Excel)</DialogTitle>
            <DialogDescription>Téléchargez le modèle, remplissez-le puis importez. Les produits importés passent en modération.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button variant="outline" className="rounded-full w-full" onClick={() => downloadFile("/products/import/template", "modele-import-produits.csv")} data-testid="download-template-btn"><FileText className="w-4 h-4 mr-1" /> Télécharger le modèle CSV</Button>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary transition-colors" data-testid="import-dropzone">
              <UploadCloud className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{importBusy ? "Import en cours..." : "Cliquez pour choisir un fichier .csv ou .xlsx"}</span>
              <input type="file" accept=".csv,.xlsx" className="hidden" disabled={importBusy} onChange={(e) => doImport(e.target.files[0])} data-testid="import-file-input" />
            </label>
            {importResult && (
              <div className="text-sm border border-border rounded-lg p-3" data-testid="import-result">
                <div className="font-semibold text-green-700">{importResult.created} produit(s) importé(s) sur {importResult.total} ligne(s).</div>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-destructive font-medium">{importResult.errors.length} erreur(s) :</div>
                    <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                      {importResult.errors.map((er, i) => <li key={i} className="text-xs text-muted-foreground">Ligne {er.row} : {er.message}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {products.length === 0 ? <EmptyState title="Aucun article" description="Créez votre premier article." action={<Button className="rounded-full" onClick={openNew}>Créer</Button>} /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Article</TableHead><TableHead>Cat.</TableHead><TableHead className="text-right">PCS</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Dispo</TableHead><TableHead>Modération</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id} data-testid={`prod-row-${p.id}`}>
                  <TableCell><div className="flex items-center gap-2"><img src={p.image} alt="" className="w-9 h-9 rounded object-cover" /><span className="font-medium text-sm">{p.name}</span>{p.promo?.enabled && <span className="text-[10px] bg-primary text-white px-1.5 rounded">PROMO</span>}</div></TableCell>
                  <TableCell className="text-xs">{p.category ? `${p.category}${p.subcategory ? ` › ${p.subcategory}` : ""}` : <span className="text-amber-700 font-medium" data-testid={`uncategorized-${p.id}`}>Sans catégorie — à réattribuer</span>}</TableCell>
                  <TableCell className="text-right font-mono">{money(p.price_simple, p.currency)}</TableCell>
                  <TableCell className={`text-right font-mono ${p.stock === 0 ? "text-red-600" : p.stock <= p.alert_threshold ? "text-amber-600" : ""}`}>{p.stock}</TableCell>
                  <TableCell><StatusBadge status={p.stock === 0 ? "REJETEE" : "APPROVED"} /></TableCell>
                  <TableCell data-testid={`mod-status-${p.id}`}>
                    <StatusBadge status={p.moderation_status || "APPROVED"} />
                    {p.moderation_status === "REJECTED" && p.moderation_reason ? <div className="text-[10px] text-destructive mt-0.5 max-w-[140px]">{p.moderation_reason}</div> : null}
                  </TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del(p.id)} data-testid={`del-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Orders ---------------- */
const NEXT_ACTIONS = {
  NOUVELLE: [["APPROUVEE", "Approuver"], ["REJETEE", "Rejeter"]],
  EN_ATTENTE: [["APPROUVEE", "Approuver"], ["REJETEE", "Rejeter"]],
  APPROUVEE: [["EN_PREPARATION", "Préparer"], ["ANNULEE", "Annuler"]],
  EN_PREPARATION: [["PRETE", "Marquer prête"]],
  PRETE: [["EXPEDIEE", "Expédier"]],
  EXPEDIEE: [["LIVREE", "Livrer"]],
};

export function MerchantOrders() {
  const { shop } = useMerchant();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState("");
  const [carriers, setCarriers] = useState([]);
  const selectedOrderId = searchParams.get("order_id");
  const load = () => api.get(`/shops/${shop.id}/orders`).then((r) => setOrders(r.data.orders)).catch(() => setOrders([]));
  useEffect(() => { load(); api.get("/carriers").then((r) => setCarriers(r.data.carriers)).catch(() => {}); }, []);
  useEffect(() => {
    if (!orders || !selectedOrderId || !orders.some((order) => order.id === selectedOrderId)) return;
    document.getElementById(`merchant-order-${selectedOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [orders, selectedOrderId]);
  const changeStatus = async (o, status) => { try { await api.put(`/orders/${o.id}/status`, { status }); toast.success("Statut mis à jour"); load(); } catch (e) { toast.error(apiErr(e)); } };
  const assignCarrier = async (o, carrier_id) => { try { await api.put(`/orders/${o.id}/shipping`, { carrier_id }); toast.success("Transporteur assigné"); load(); } catch (e) { toast.error(apiErr(e)); } };
  if (orders === null) return <Loading />;
  const filtered = filter ? orders.filter((o) => o.status === filter) : orders;
  return (
    <div>
      <PageHeader title="Commandes" subtitle={`${orders.length} commande(s)`}
        action={
          <Select value={filter || "all"} onValueChange={(v) => setFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 rounded-full" data-testid="order-filter"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {["NOUVELLE", "APPROUVEE", "EN_PREPARATION", "PRETE", "EXPEDIEE", "LIVREE", "ANNULEE", "REJETEE"].map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        } />
      {filtered.length === 0 ? <EmptyState title="Aucune commande" /> : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div id={`merchant-order-${o.id}`} key={o.id} className={`bg-card border border-border rounded-xl p-4 ${o.id === selectedOrderId ? "ring-2 ring-primary" : ""}`} data-testid={`morder-${o.ref}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-mono text-sm font-semibold">{o.ref}</span>
                  <span className="text-xs text-muted-foreground ml-2">{o.customer_name} · <StatusBadge status={o.customer_type} /> · {o.created_at?.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  <span className="font-mono font-semibold">{money(o.total, o.currency)}</span>
                </div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Select value={o.carrier_id || ""} onValueChange={(v) => assignCarrier(o, v)}>
                  <SelectTrigger className="w-44 rounded-full h-8 text-xs" data-testid={`carrier-select-${o.ref}`}><SelectValue placeholder="Transporteur" /></SelectTrigger>
                  <SelectContent>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                {o.carrier_name && <span className="text-xs text-muted-foreground">{o.carrier_name} · {o.tracking_number}</span>}
                <TrackingButton order={o} />
                <Button size="sm" variant="ghost" className="rounded-full text-xs h-8" onClick={() => downloadFile(`/orders/${o.id}/label`, `Etiquette-${o.ref}.pdf`)} data-testid={`label-${o.ref}`}><FileText className="w-3.5 h-3.5 mr-1" /> Étiquette</Button>
                <Button size="sm" variant="ghost" className="rounded-full text-xs h-8" onClick={() => downloadFile(`/orders/${o.id}/invoice`, `Facture-${o.ref}.pdf`)} data-testid={`invoice-${o.ref}`}><FileText className="w-3.5 h-3.5 mr-1" /> Facture PDF</Button>
              </div>
              {(NEXT_ACTIONS[o.status] || []).length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {NEXT_ACTIONS[o.status].map(([st, label]) => (
                    <Button key={st} size="sm" variant={st.includes("REJET") || st.includes("ANNUL") ? "outline" : "default"}
                      className="rounded-full" onClick={() => changeStatus(o, st)} data-testid={`order-action-${st}-${o.ref}`}>
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Customers ---------------- */
const TYPES = ["SIMPLE", "PARTENAIRE", "PROFESSIONNEL", "ENTREPRISE"];
export function MerchantCustomers() {
  const { shop } = useMerchant();
  const [list, setList] = useState(null);
  const load = () => api.get(`/shops/${shop.id}/customers`).then((r) => setList(r.data.customers)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const setType = async (uid, type) => { try { await api.put(`/shops/${shop.id}/customers/${uid}/type`, { type }); toast.success("Type mis à jour"); load(); } catch (e) { toast.error(apiErr(e)); } };
  if (list === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Suivi client" subtitle={`${list.length} client(s)`} />
      {list.length === 0 ? <EmptyState title="Aucun client" description="Les clients apparaissent après leur première commande." /> : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Commandes</TableHead><TableHead className="text-right">Dépenses</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.user_id}>
                  <TableCell><div className="font-medium text-sm">{c.name}</div><div className="text-xs text-muted-foreground">{c.email}</div></TableCell>
                  <TableCell>{c.orders_count || 0}</TableCell>
                  <TableCell className="text-right font-mono">{money(c.total_spent, shop.currency)}</TableCell>
                  <TableCell>
                    <Select value={c.type} onValueChange={(v) => setType(c.user_id, v)}>
                      <SelectTrigger className="w-40 h-8 rounded-full" data-testid={`ctype-${c.user_id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
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

/* ---------------- Stock ---------------- */
export function MerchantStock() {
  const { shop } = useMerchant();
  const [products, setProducts] = useState(null);
  const load = () => api.get("/products/mine").then((r) => setProducts(r.data.products)).catch(() => setProducts([]));
  useEffect(() => { load(); }, []);
  const adjust = async (id, delta) => { try { await api.post(`/products/${id}/stock`, { delta, reason: delta > 0 ? "Réappro" : "Sortie manuelle" }); load(); } catch (e) { toast.error(apiErr(e)); } };
  if (products === null) return <Loading />;
  return (
    <div>
      <PageHeader title="Stocks" subtitle="Gestion des quantités" />
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Article</TableHead><TableHead className="text-center">Initial</TableHead><TableHead className="text-center">Vendus</TableHead><TableHead className="text-center">Stock actuel</TableHead><TableHead className="text-center">Ajuster</TableHead></TableRow></TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-sm">{p.name}</TableCell>
                <TableCell className="text-center font-mono">{p.initial_stock}</TableCell>
                <TableCell className="text-center font-mono">{p.sold}</TableCell>
                <TableCell className="text-center"><span className={`font-mono font-bold ${p.stock === 0 ? "text-red-600" : p.stock <= p.alert_threshold ? "text-amber-600" : "text-green-600"}`}>{p.stock}</span></TableCell>
                <TableCell><div className="flex items-center justify-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => adjust(p.id, -1)} data-testid={`stock-minus-${p.id}`}><Minus className="w-3 h-3" /></Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => adjust(p.id, 1)} data-testid={`stock-plus-${p.id}`}><Plus className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => adjust(p.id, 10)}>+10</Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ---------------- Stats ---------------- */
export function MerchantStats() {
  const { shop } = useMerchant();
  const [s, setS] = useState(null);
  useEffect(() => { api.get(`/shops/${shop.id}/stats`).then((r) => setS(r.data)).catch(() => {}); }, [shop.id]);
  if (!s) return <Loading />;
  return (
    <div>
      <PageHeader title="Statistiques" subtitle="Analyse de performance" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="CA total" value={money(s.ca_total, s.currency)} icon={TrendingUp} />
        <StatCard label="Panier moyen" value={money(s.avg_basket, s.currency)} icon={BarChart3} />
        <StatCard label="IDV" value={s.idv} icon={Package} />
        <StatCard label="Commandes" value={s.orders_total} icon={ShoppingCart} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-4">Évolution du CA</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.series}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="date" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Bar dataKey="revenue" fill="#E85D04" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-4">Top ventes</h3>
          {s.top_sellers.length === 0 ? <div className="text-sm text-muted-foreground">Aucune vente</div> : s.top_sellers.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2"><img src={p.image} alt="" className="w-8 h-8 rounded object-cover" /><span className="text-sm">{p.name}</span></div>
              <span className="font-mono text-sm">{p.sold} vendus</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Loyalty ---------------- */
export function MerchantLoyalty() {
  const { shop } = useMerchant();
  const [orders, setOrders] = useState(null);
  useEffect(() => { api.get(`/shops/${shop.id}/orders`).then((r) => setOrders(r.data.orders)).catch(() => setOrders([])); }, []);
  if (orders === null) return <Loading />;
  const bonus = orders.reduce((s, o) => s + (o.bonus_total || 0), 0);
  const recettes = orders.reduce((s, o) => s + o.items.reduce((a, i) => a + (i.recette || 0), 0), 0);
  return (
    <div>
      <PageHeader title="Fidélités" subtitle="Bonus et recettes générés pour vos clients" />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Bonus promo distribués" value={money(bonus, shop.currency)} icon={Gift} accent="bg-primary/10 text-primary" />
        <StatCard label="Recettes distribuées" value={money(recettes, shop.currency)} icon={TrendingUp} accent="bg-green-100 text-green-700" />
      </div>
      <div className="bg-accent/40 border border-border rounded-xl p-5 text-sm text-muted-foreground">
        Les demandes de retrait des clients sont validées par l'administration de la plateforme. Formules : <span className="font-mono text-foreground">Bonus = Prix normal − Prix promo</span>, <span className="font-mono text-foreground">Recette = X × (PCS − Prix type)</span>.
      </div>
      <h3 className="font-display font-bold mt-6 mb-3">Détail par commande</h3>
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Réf.</TableHead><TableHead>Client</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Bonus</TableHead><TableHead className="text-right">Recette</TableHead></TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => {
              const r = o.items.reduce((a, i) => a + (i.recette || 0), 0);
              return (<TableRow key={o.id}><TableCell className="font-mono text-xs">{o.ref}</TableCell><TableCell className="text-sm">{o.customer_name}</TableCell><TableCell><StatusBadge status={o.customer_type} /></TableCell><TableCell className="text-right font-mono">{money(o.bonus_total, o.currency)}</TableCell><TableCell className="text-right font-mono">{money(r, o.currency)}</TableCell></TableRow>);
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ---------------- Promotions ---------------- */
export function MerchantPromotions() {
  const [products, setProducts] = useState(null);
  useEffect(() => { api.get("/products/mine").then((r) => setProducts(r.data.products)).catch(() => setProducts([])); }, []);
  if (products === null) return <Loading />;
  const promos = products.filter((p) => p.promo?.enabled);
  return (
    <div>
      <PageHeader title="Promotions" subtitle="Gérez vos promotions depuis la fiche article" />
      {promos.length === 0 ? <EmptyState title="Aucune promotion active" description="Activez une promotion en modifiant un article." action={<Link to="/merchant/products"><Button className="rounded-full">Aller aux articles</Button></Link>} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {promos.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3"><img src={p.image} alt="" className="w-12 h-12 rounded object-cover" /><div><div className="font-medium text-sm">{p.name}</div><div className="text-xs text-muted-foreground">{p.category}</div></div></div>
              <div className="mt-3 flex items-center gap-2"><span className="text-primary font-bold font-mono">{money(p.promo.promo_price, p.currency)}</span><span className="text-xs line-through text-muted-foreground font-mono">{money(p.price_simple, p.currency)}</span></div>
              <div className="text-xs text-muted-foreground mt-1">Quantité promo : {p.promo.promo_sold || 0}/{p.promo.promo_qty}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Opportunities ---------------- */
export function MerchantOpportunities() {
  const [products, setProducts] = useState(null);
  const [similar, setSimilar] = useState({});
  useEffect(() => { api.get("/products/mine").then((r) => setProducts(r.data.products)).catch(() => setProducts([])); }, []);
  const findSimilar = async (p) => {
    const { data } = await api.get("/products", { params: { category: p.category } });
    setSimilar((s) => ({ ...s, [p.id]: data.products.filter((x) => x.shop_id !== p.shop_id).slice(0, 4) }));
  };
  if (products === null) return <Loading />;
  const outOfStock = products.filter((p) => p.stock === 0);
  return (
    <div>
      <PageHeader title="Opportunités" subtitle="Complément de stock & produits similaires" />
      {outOfStock.length === 0 ? <EmptyState title="Aucune opportunité" description="Vos produits en rupture apparaîtront ici avec des suggestions d'autres boutiques." /> : (
        <div className="space-y-4">
          {outOfStock.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><img src={p.image} alt="" className="w-12 h-12 rounded object-cover" /><div><div className="font-medium">{p.name}</div><div className="text-xs text-red-600">En rupture — {p.category}</div></div></div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => findSimilar(p)} data-testid={`find-similar-${p.id}`}>Rechercher similaires</Button>
              </div>
              {similar[p.id] && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {similar[p.id].length === 0 ? <div className="text-xs text-muted-foreground col-span-full">Aucun produit similaire dans d'autres boutiques.</div> :
                    similar[p.id].map((s) => (
                      <div key={s.id} className="border border-border rounded-lg p-2 text-xs">
                        <div className="font-medium line-clamp-1">{s.name}</div>
                        <div className="text-muted-foreground flex items-center gap-1"><Store className="w-3 h-3" />{s.shop_name}</div>
                        <div className="font-mono mt-1">Stock: {s.stock} · {money(s.display_price, s.currency)}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */
export function MerchantSettings() {
  const { shop, reload } = useMerchant();
  const [coef, setCoef] = useState(shop.coefficients || { partner: 0.5, professional: 0.5, enterprise: 0.5 });
  const [prov, setProv] = useState({ provider: shop.payment_provider || "MONITY_WORLD", account: shop.payment_config?.account || "", api_key: shop.payment_config?.api_key || "" });
  const [storefrontImages, setStorefrontImages] = useState(shop.homepage_images || []);
  const [uploadingImages, setUploadingImages] = useState(false);
  useEffect(() => setStorefrontImages(shop.homepage_images || []), [shop.id, shop.homepage_images]);
  const save = async () => { try { await api.put(`/shops/${shop.id}/coefficients`, { partner: Number(coef.partner), professional: Number(coef.professional), enterprise: Number(coef.enterprise) }); toast.success("Coefficients enregistrés"); reload(); } catch (e) { toast.error(apiErr(e)); } };
  const savePayment = async () => { try { await api.put(`/shops/${shop.id}/payment`, prov); toast.success("Paiement enregistré"); reload(); } catch (e) { toast.error(apiErr(e)); } };
  const saveStorefrontImages = async (images) => {
    try {
      const { data } = await api.put(`/shops/${shop.id}/storefront-images`, { images });
      setStorefrontImages(data.images || []);
      toast.success("Images de la boutique enregistrées");
      reload();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const uploadStorefrontImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (storefrontImages.length + files.length > 10) { toast.error("Maximum 10 images pour la boutique."); return; }
    setUploadingImages(true);
    try {
      const images = [...storefrontImages];
      for (const file of files) images.push(await uploadImage(file));
      await saveStorefrontImages(images);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setUploadingImages(false); }
  };
  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Boutique & coefficients de recette" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-4">Informations</h3>
          {[["Nom", shop.name], ["Pays", shop.country], ["Ville", shop.city], ["Monnaie", shop.currency], ["N° fiscal", shop.tax_number], ["Statut", shop.status]].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 text-sm border-b border-border/50 last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-1">Coefficients de recette (X)</h3>
          <p className="text-xs text-muted-foreground mb-4">Recette = X × (PCS − Prix type). Valeur entre 0 et 1.</p>
          {[["partner", "Partenaire"], ["professional", "Professionnel"], ["enterprise", "Entreprise"]].map(([k, l]) => (
            <div key={k} className="mb-3"><Label>{l}</Label><Input type="number" step="0.1" min="0" max="1" value={coef[k]} onChange={(e) => setCoef({ ...coef, [k]: e.target.value })} className="mt-1" data-testid={`coef-${k}`} /></div>
          ))}
          <Button className="rounded-full mt-2" onClick={save} data-testid="save-coefficients">Enregistrer</Button>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2" data-testid="shop-storefront-images">
          <h3 className="font-display font-bold mb-1">Images de la page boutique</h3>
          <p className="text-xs text-muted-foreground mb-3">Ajoutez jusqu’à 10 images qui défileront automatiquement sur votre page publique.</p>
          <Label htmlFor="shop-storefront-upload">Téléverser des images</Label>
          <Input id="shop-storefront-upload" type="file" accept="image/*" multiple className="mt-1" onChange={uploadStorefrontImages} disabled={uploadingImages} data-testid="shop-storefront-upload" />
          {uploadingImages && <p className="mt-2 text-xs text-muted-foreground">Téléversement en cours…</p>}
          {storefrontImages.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {storefrontImages.map((image, index) => (
                <div key={`${image}-${index}`} className="relative">
                  <img src={image} alt={`Boutique ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />
                  <Button type="button" variant="destructive" size="sm" className="absolute right-1 top-1 h-7 px-2" onClick={() => saveStorefrontImages(storefrontImages.filter((_, i) => i !== index))} aria-label={`Supprimer l’image ${index + 1}`}>×</Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
          <h3 className="font-display font-bold mb-1">Système de paiement</h3>
          <p className="text-xs text-muted-foreground mb-4">Chaque boutique peut intégrer son API de paiement. Priorité au système par défaut <strong>Monity World</strong>.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Fournisseur</Label>
              <Select value={prov.provider} onValueChange={(v) => setProv({ ...prov, provider: v })}>
                <SelectTrigger className="mt-1" data-testid="payment-provider"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONITY_WORLD">Monity World (par défaut)</SelectItem>
                  <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                  <SelectItem value="STRIPE">Carte bancaire</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Compte / N°</Label><Input value={prov.account} onChange={(e) => setProv({ ...prov, account: e.target.value })} className="mt-1" placeholder="Ex: +221..." /></div>
            <div><Label>Clé API</Label><Input value={prov.api_key} onChange={(e) => setProv({ ...prov, api_key: e.target.value })} className="mt-1" placeholder="(optionnel)" /></div>
          </div>
          <Button className="rounded-full mt-3" onClick={savePayment} data-testid="save-payment">Enregistrer le paiement</Button>
        </div>
      </div>
    </div>
  );
}

export function MerchantDailyOffers() {
  const { shop } = useMerchant();
  const [products, setProducts] = useState([]);
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/daily-offers/mine")
      .then((r) => setProducts(r.data.products || []))
      .catch((e) => { toast.error(apiErr(e)); setProducts([]); })
      .finally(() => setLoading(false));
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);

  const updateChoice = (productId, patch) => {
    setChoices((current) => ({
      ...current,
      [productId]: { mode: "percent", value: "0", ...(current[productId] || {}), ...patch },
    }));
  };
  const approve = async (product) => {
    const choice = choices[product.id] || { mode: "percent", value: "0" };
    const payload = { offer_id: product.daily_offer.id };
    if (choice.mode === "price" && choice.value !== "") payload.fixed_price = Number(choice.value);
    else payload.discount_percent = Number(choice.value || 0);
    setBusy(product.id);
    try {
      await api.post(`/daily-offers/${product.id}/approve`, payload);
      toast.success("Offre du jour activée");
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(""); }
  };

  return (
    <div>
      <PageHeader title="Offres du jour" subtitle={`Propositions pour la boutique ${shop.name}`} action={<Button variant="outline" onClick={load}>Actualiser</Button>} />
      {loading ? <Loading /> : products.length === 0 ? (
        <EmptyState title="Aucune proposition" description="Les prochaines propositions automatiques apparaîtront ici." />
      ) : (
        <div className="grid gap-4">
          {products.map((product) => {
            const offer = product.daily_offer || {};
            const choice = choices[product.id] || { mode: "percent", value: "0" };
            return (
              <article key={product.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-4" data-testid={`daily-offer-${product.id}`}>
                <img src={product.image} alt="" className="w-24 h-24 rounded-lg object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display font-bold">{product.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">Prix normal : {money(Number(product.price_simple || 0), shop.currency)}</p>
                  {offer.status === "PENDING" ? (
                    <>
                      <p className="text-xs text-amber-700 mt-2">Répondez avant le {new Date(offer.review_deadline).toLocaleString("fr-FR")}. Sans réponse après 24 h, le produit sera mis en avant à son prix normal.</p>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div>
                          <Label htmlFor={`offer-mode-${product.id}`}>Type de proposition</Label>
                          <select id={`offer-mode-${product.id}`} value={choice.mode} onChange={(event) => updateChoice(product.id, { mode: event.target.value })} className="mt-1 h-10 rounded-md border border-border bg-card px-3 text-sm">
                            <option value="percent">Réduction (%)</option>
                            <option value="price">Nouveau prix</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor={`offer-value-${product.id}`}>{choice.mode === "price" ? `Prix (${shop.currency})` : "Réduction (%)"}</Label>
                          <Input id={`offer-value-${product.id}`} type="number" min={choice.mode === "price" ? "0.01" : "0"} max={choice.mode === "price" ? undefined : "100"} step={choice.mode === "price" ? "0.01" : "1"} value={choice.value} onChange={(event) => updateChoice(product.id, { value: event.target.value })} className="mt-1 w-40" data-testid={`offer-value-${product.id}`} />
                        </div>
                        <Button onClick={() => approve(product)} disabled={busy === product.id} data-testid={`approve-offer-${product.id}`}>
                          {busy === product.id ? "Activation…" : "Approuver l’offre"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-primary">
                      {Number(offer.discount_percent || 0) > 0 ? `Réduction de ${offer.discount_percent} %` : "Sélection qualité — prix normal"}
                      {offer.ends_at && ` · jusqu’au ${new Date(offer.ends_at).toLocaleString("fr-FR")}`}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
