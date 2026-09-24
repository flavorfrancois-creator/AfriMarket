import React, { useEffect, useState } from "react";
import { useSearchParams, useParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { money } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { usePrivateClient } from "@/context/PrivateClientContext";
import { ProductCard } from "@/components/ProductCard";
import { Loading, EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trash2, Store, Minus, Plus, ShoppingCart, MapPin, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function Products() {
  const { t } = useI18n();
  const { active } = usePrivateClient();
  const [sp] = useSearchParams();
  const [products, setProducts] = useState(null);
  const q = sp.get("q") || "";
  const category = sp.get("category") || "";
  const promo = sp.get("promo") || "";

  useEffect(() => {
    const params = {};
    if (q) params.q = q;
    if (category) params.category = category;
    if (promo) params.promo = true;
    if (active) params.for_client = true;
    setProducts(null);
    api.get("/products", { params }).then((r) => setProducts(r.data.products)).catch(() => setProducts([]));
  }, [q, category, promo, active]);

  const title = promo ? t("promos") : category || (q ? `${t("search")}: ${q}` : t("products"));

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <PageHeader title={title} subtitle={products ? `${products.length} article(s)` : ""} />
      {products === null ? (
        <Loading />
      ) : products.length === 0 ? (
        <EmptyState title="Aucun article trouvé" description="Essayez une autre recherche ou catégorie." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      )}
    </div>
  );
}

export function Shops() {
  const { t } = useI18n();
  const [shops, setShops] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get("/shops").then((r) => setShops(r.data.shops)).catch(() => setShops([]));
  }, []);
  const filtered = (shops || []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.city.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <PageHeader title={t("shops")} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une boutique ou une ville..." className="max-w-md mb-6 rounded-full" data-testid="shop-search" />
      {shops === null ? <Loading /> : filtered.length === 0 ? <EmptyState title="Aucune boutique" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Link key={s.id} to={`/shops/${s.id}`} className="bg-card border border-border rounded-xl overflow-hidden card-lift" data-testid={`shop-${s.id}`}>
              <div className="p-5 flex items-center gap-4">
                <img src={s.logo} alt="" className="w-16 h-16 rounded-xl object-cover" />
                <div className="min-w-0">
                  <div className="font-display font-bold truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{s.city}, {s.country}</div>
                  <div className="text-xs text-primary mt-1">{s.currency}</div>
                </div>
              </div>
              {s.description && <div className="px-5 pb-5 text-sm text-muted-foreground line-clamp-2">{s.description}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShopDetail() {
  const { id } = useParams();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    api.get(`/shops/${id}`).then((r) => setShop(r.data.shop)).catch(() => setShop(false));
    api.get("/products", { params: { shop_id: id } }).then((r) => setProducts(r.data.products)).catch(() => {});
  }, [id]);
  if (shop === null) return <Loading full />;
  if (shop === false) return <div className="max-w-7xl mx-auto px-4 py-10"><EmptyState title="Boutique introuvable" /></div>;
  return (
    <div>
      <div className="bg-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 flex items-center gap-5">
          <img src={shop.logo} alt="" className="w-20 h-20 rounded-2xl object-cover border-2 border-white/20" />
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold">{shop.name}</h1>
            <div className="text-neutral-300 text-sm flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{shop.city}, {shop.country} · {shop.currency}</div>
            {shop.description && <p className="text-neutral-400 text-sm mt-2 max-w-xl">{shop.description}</p>}
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="font-display font-bold text-lg mb-5">Articles ({products.length})</h2>
        {products.length === 0 ? <EmptyState title="Aucun article pour le moment" /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_LABEL = { SIMPLE: "Client Simple", PARTENAIRE: "Partenaire", PROFESSIONNEL: "Professionnel", ENTREPRISE: "Entreprise" };

export function ProductDetail() {
  const { id } = useParams();
  const { add } = useCart();
  const { user } = useAuth();
  const { active, client } = usePrivateClient();
  const [data, setData] = useState(null);
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState(null);
  const [mainImg, setMainImg] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Contrefaçon");
  const [reportComment, setReportComment] = useState("");
  useEffect(() => {
    const params = active ? { for_client: true } : {};
    api.get(`/products/${id}`, { params }).then((r) => setData(r.data)).catch(() => setData(false));
  }, [id, active]);
  const submitReport = async () => {
    try {
      await api.post(`/products/${id}/report`, { reason: reportReason, comment: reportComment });
      toast.success("Signalement envoyé. Merci.");
      setReportOpen(false); setReportComment("");
    } catch (e) { toast.error(apiErr(e)); }
  };
  if (data === null) return <Loading full />;
  if (data === false) return <div className="max-w-7xl mx-auto px-4 py-10"><EmptyState title="Article introuvable" /></div>;
  const p = data.product;
  const hasVariants = (p.variants || []).length > 0;
  const PF = { SIMPLE: "price_simple", PARTENAIRE: "price_partner", PROFESSIONNEL: "price_pro", ENTREPRISE: "price_enterprise" };
  const vprice = (v) => (active ? Number(v.price_simple || 0) : Number(v[PF[p.viewer_type]] ?? v.price_simple ?? 0));
  const selVar = hasVariants ? (p.variants.find((v) => v.id === sel) || null) : null;
  const gallery = [p.image, ...((p.gallery) || [])].filter(Boolean);
  const heroImg = mainImg || (selVar && selVar.image) || gallery[0] || "";
  const dispStock = selVar ? selVar.stock : p.stock;
  const canAdd = hasVariants ? !!(selVar && dispStock > 0) : p.stock > 0;
  const minVariantPrice = hasVariants ? Math.min(...p.variants.map((v) => vprice(v))) : 0;
  const doAdd = () => {
    if (hasVariants) {
      if (!selVar) { toast.error("Veuillez choisir une variante"); return; }
      add(p, qty, { id: selVar.id, label: selVar.label, image: selVar.image || p.image, price: vprice(selVar), price_simple: Number(selVar.price_simple || 0) });
    } else add(p, qty);
  };
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
      <div>
        <div className="aspect-square rounded-2xl overflow-hidden bg-muted border border-border" data-testid="detail-hero-image">
          {heroImg ? <img src={heroImg} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-muted-foreground"><Store className="w-10 h-10" /></div>}
        </div>
        {gallery.length > 1 && (
          <div className="mt-3 flex gap-2 flex-wrap" data-testid="detail-gallery">
            {gallery.map((g, idx) => (
              <button key={idx} onClick={() => setMainImg(g)} data-testid={`gallery-thumb-${idx}`}
                className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${heroImg === g ? "border-primary" : "border-border"}`}>
                <img src={g} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <Link to={`/shops/${p.shop_id}`} className="text-sm text-primary flex items-center gap-1 mb-2"><Store className="w-4 h-4" />{p.shop_name}</Link>
        <h1 className="text-2xl md:text-3xl font-display font-extrabold">{p.name}</h1>
        {p.short_description && <p className="text-muted-foreground mt-2">{p.short_description}</p>}

        <div className="mt-5 flex items-end gap-3">
          {hasVariants ? (
            selVar ? (
              <span className="text-3xl font-display font-extrabold text-primary font-mono" data-testid="detail-variant-price">{money(vprice(selVar), p.currency)}</span>
            ) : (
              <span className="text-2xl font-display font-extrabold font-mono">À partir de {money(minVariantPrice, p.currency)}</span>
            )
          ) : p.is_promo ? (
            <>
              <span className="text-3xl font-display font-extrabold text-primary font-mono">{money(p.promo_price, p.currency)}</span>
              <span className="text-lg text-muted-foreground line-through font-mono">{money(p.display_price, p.currency)}</span>
            </>
          ) : (
            <span className="text-3xl font-display font-extrabold font-mono">{money(p.display_price, p.currency)}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {active ? <>Prix client simple — commande pour <strong>{client?.name}</strong></> : <>Prix {TYPE_LABEL[p.viewer_type] || "Client Simple"}</>}
        </div>
        {active && p.reseller_margin > 0 && (
          <div className="mt-2 inline-block text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5" data-testid="detail-margin">
            Votre marge revendeur estimée : <strong>{money(p.reseller_margin, p.currency)}</strong> / unité
          </div>
        )}

        {hasVariants && (
          <div className="mt-5" data-testid="detail-variants">
            <Label className="text-xs text-muted-foreground">Choisir une variante</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button key={v.id} onClick={() => setSel(v.id)} disabled={v.stock < 1} data-testid={`variant-${v.id}`}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-40 disabled:line-through
                    ${sel === v.id ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:border-primary/50"}`}>
                  {v.label || "Variante"} {v.stock < 1 ? "(rupture)" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground">
          Stock : <span className={`font-semibold ${dispStock > 0 ? "text-green-600" : "text-red-600"}`}>{dispStock > 0 ? `${dispStock} disponibles` : "Rupture"}</span> · SKU : <span className="font-mono">{(selVar && selVar.sku) || p.sku}</span>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center border border-border rounded-full">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="w-4 h-4" /></Button>
            <span className="w-10 text-center font-mono font-semibold">{qty}</span>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setQty(qty + 1)}><Plus className="w-4 h-4" /></Button>
          </div>
          <Button className="rounded-full flex-1 h-12" disabled={!canAdd} onClick={doAdd} data-testid="detail-add-cart">
            <ShoppingCart className="w-4 h-4 mr-2" /> {hasVariants && !selVar ? "Choisir une variante" : "Ajouter au panier"}
          </Button>
        </div>

        {p.description && (
          <div className="mt-8">
            <h3 className="font-display font-bold mb-2">Description</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{p.description}</p>
          </div>
        )}

        {user && (
          <button className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors" onClick={() => setReportOpen(true)} data-testid="report-product-btn">
            <Flag className="w-3.5 h-3.5" /> Signaler ce produit
          </button>
        )}
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Signaler ce produit</DialogTitle>
            <DialogDescription>Aidez-nous à garder la marketplace sûre. Indiquez le motif du signalement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motif</Label>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} data-testid="report-reason"
                className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                <option>Contrefaçon</option>
                <option>Produit interdit / illégal</option>
                <option>Description trompeuse</option>
                <option>Prix abusif</option>
                <option>Contenu inapproprié</option>
                <option>Autre</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Commentaire (optionnel)</Label>
              <Textarea value={reportComment} onChange={(e) => setReportComment(e.target.value)} placeholder="Décrivez le problème..." data-testid="report-comment" className="mt-1" />
            </div>
          </div>
          <DialogFooter><Button className="rounded-full" onClick={submitReport} data-testid="submit-report">Envoyer le signalement</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Cart() {
  const { items, remove, setQty, total, totalSimple, clear } = useCart();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { active, client } = usePrivateClient();
  const cur = items[0]?.currency || "";
  const linePrice = (i) => (active ? (i.price_simple ?? i.price) : i.price);
  const shownTotal = active ? totalSimple : total;
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader title="Mon panier" subtitle={`${items.length} article(s)`} />
      {active && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 mb-4 text-sm" data-testid="cart-private-notice">
          🧾 Commande pour votre client <strong>{client?.name}</strong> — prix client simple appliqués.
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="Votre panier est vide" description="Découvrez nos produits et ajoutez vos favoris." action={<Button onClick={() => navigate("/products")} className="rounded-full">Voir les produits</Button>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {items.map((i) => (
              <div key={i.key} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3" data-testid={`cart-item-${i.product_id}`}>
                <img src={i.image} alt="" className="w-16 h-16 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{i.name}</div>
                  {i.variant_label && <div className="text-xs text-primary">{i.variant_label}</div>}
                  <div className="text-xs text-muted-foreground">{i.shop_name}</div>
                  <div className="font-mono font-semibold text-sm mt-1">{money(linePrice(i), i.currency)}</div>
                </div>
                <div className="flex items-center border border-border rounded-full">
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setQty(i.key, i.qty - 1)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-8 text-center text-sm font-mono">{i.qty}</span>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setQty(i.key, i.qty + 1)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(i.key)} data-testid={`remove-${i.product_id}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl p-5 h-fit">
            <h3 className="font-display font-bold mb-4">Récapitulatif</h3>
            <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">Sous-total</span><span className="font-mono font-semibold">{money(shownTotal, cur)}</span></div>
            <div className="text-xs text-muted-foreground mb-4">Frais de livraison calculés à la commande.</div>
            <Button className="w-full rounded-full h-11" onClick={() => navigate(user ? "/checkout" : "/login")} data-testid="checkout-btn">
              {user ? "Passer commande" : "Se connecter pour commander"}
            </Button>
            <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={clear}>Vider le panier</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Checkout() {
  const { items, total, totalSimple, totalMargin, clear } = useCart();
  const navigate = useNavigate();
  const { active, client, clear: clearPrivate } = usePrivateClient();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [useWallet, setUseWallet] = useState(false);
  const cur = items[0]?.currency || "";
  const linePrice = (i) => (active ? (i.price_simple ?? i.price) : i.price);
  const shownTotal = active ? totalSimple : total;

  useEffect(() => { api.get("/wallet").then((r) => setWallet(r.data)).catch(() => {}); }, []);
  const avail = wallet?.total_available || 0;
  const walletApplied = useWallet ? Math.min(avail, shownTotal) : 0;
  const toPay = Math.max(0, shownTotal - walletApplied);

  const submit = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, variant_id: i.variant_id || null })),
        address: active ? (client?.address || client?.city || "") : address,
        payment_method: "MOCK",
        use_wallet: useWallet,
      };
      if (active) payload.private_client = client;
      const { data } = await api.post("/orders", payload);
      clear();
      if (active) clearPrivate();
      toast.success(`Commande passée ! (${data.orders.join(", ")})`);
      navigate("/account/orders");
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0)
    return <div className="max-w-3xl mx-auto px-4 py-10"><EmptyState title="Panier vide" action={<Button onClick={() => navigate("/products")}>Voir les produits</Button>} /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <PageHeader title="Commande" subtitle="Paiement simulé (MOCK) — extensible Mobile Money / Monity World" />
      <div className="space-y-4">
        {active ? (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-5" data-testid="checkout-private-client">
            <div className="text-xs font-semibold text-primary mb-2">🧾 Facture au nom de votre client (prix client simple)</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground text-xs">Nom</span><div className="font-medium">{client?.name}</div></div>
              <div><span className="text-muted-foreground text-xs">Téléphone</span><div className="font-medium">{client?.phone || "—"}</div></div>
              <div><span className="text-muted-foreground text-xs">Ville</span><div className="font-medium">{client?.city || "—"}</div></div>
              <div><span className="text-muted-foreground text-xs">Adresse</span><div className="font-medium">{client?.address || "—"}</div></div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-5">
            <Label className="mb-2 block">Adresse de livraison</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, ville, repères..." data-testid="checkout-address" />
          </div>
        )}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold mb-3">Articles</h3>
          {items.map((i) => (
            <div key={i.key} className="flex justify-between text-sm py-1">
              <span>{i.name}{i.variant_label ? ` (${i.variant_label})` : ""} × {i.qty}</span>
              <span className="font-mono">{money(linePrice(i) * i.qty, i.currency)}</span>
            </div>
          ))}
          <div className="border-t border-border mt-3 pt-3 flex justify-between font-semibold">
            <span>Sous-total</span><span className="font-mono">{money(shownTotal, cur)}</span>
          </div>
          {active && totalMargin > 0 && (
            <div className="flex justify-between text-sm text-green-700 mt-1" data-testid="checkout-margin">
              <span>Votre marge revendeur estimée</span><span className="font-mono">{money(totalMargin, cur)}</span>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <div>
              <div className="font-medium text-sm">Payer avec mon solde</div>
              <div className="text-xs text-muted-foreground">Solde disponible : <span className="font-mono">{money(avail, cur)}</span></div>
            </div>
            <input type="checkbox" checked={useWallet} disabled={avail <= 0} onChange={(e) => setUseWallet(e.target.checked)} data-testid="use-wallet-toggle" className="w-5 h-5" />
          </label>
          {useWallet && (
            <div className="mt-3 text-sm space-y-1 border-t border-border pt-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Payé avec le solde</span><span className="font-mono text-green-700">−{money(walletApplied, cur)}</span></div>
              <div className="flex justify-between font-semibold"><span>Reste à payer ({items[0]?.shop_name ? "par commande" : ""})</span><span className="font-mono">{money(toPay, cur)}</span></div>
            </div>
          )}
        </div>

        <div className="bg-accent/50 border border-border rounded-xl p-4 text-sm text-muted-foreground">
          Paiement : <span className="font-semibold text-foreground">Monity World (simulation)</span>. Aucun débit réel.
        </div>
        <Button className="w-full rounded-full h-12" disabled={loading} onClick={submit} data-testid="confirm-order-btn">
          {loading ? "Traitement..." : "Confirmer et payer"}
        </Button>
      </div>
    </div>
  );
}

const STATIC_CONTENT = {
  faq: { title: "FAQ", body: "Comment créer un compte ? Cliquez sur « Créer un compte ». Comment vendre ? Créez un compte commerçant, vérifiez votre identité (KYC), créez votre boutique et soumettez-la à validation. Comment fonctionnent les recettes ? Selon votre type de client (Partenaire, Professionnel, Entreprise), chaque achat peut générer des recettes. Les articles en promotion sont vendus au prix promo et ne génèrent pas de bonus." },
  contact: { title: "Contact", body: "Pour toute question : support@afrimarket.demo. Ceci est une démonstration ; les coordonnées sont fictives." },
  terms: { title: "Conditions générales", body: "Plateforme de démonstration. Les transactions sont simulées et n'engagent aucune valeur réelle." },
  privacy: { title: "Politique de confidentialité", body: "Vos données sont utilisées uniquement pour le fonctionnement de la démonstration. Les documents d'identité (KYC) sont protégés et accessibles uniquement aux administrateurs autorisés." },
  mentions: { title: "Mentions légales", body: "AfriMarket — plateforme de démonstration. Éditeur, hébergeur et informations légales à compléter." },
};

export function StaticPage({ kind }) {
  const [c, setC] = useState(STATIC_CONTENT[kind]);
  useEffect(() => {
    let alive = true;
    api.get("/legal").then((r) => {
      const item = r.data?.content?.[kind];
      if (alive && item) setC(item);
    }).catch(() => {});
    return () => { alive = false; };
  }, [kind]);
  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid={`static-page-${kind}`}>
      <h1 className="text-3xl font-display font-extrabold mb-4" data-testid={`static-title-${kind}`}>{c.title}</h1>
      <p className="text-muted-foreground leading-relaxed whitespace-pre-line" data-testid={`static-body-${kind}`}>{c.body}</p>
    </div>
  );
}
