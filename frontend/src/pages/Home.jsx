import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePrivateClient } from "@/context/PrivateClientContext";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/common";
import { Search, Store, ShieldCheck, Truck, Wallet, ArrowRight } from "lucide-react";

const BANNER = "https://images.unsplash.com/photo-1772580310425-63f2290c2ba7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHw0fHxhZnJpY2FuJTIwbWFya2V0cGxhY2UlMjBwcm9kdWN0c3xlbnwwfHx8fDE3ODk5NzM2MzF8MA&ixlib=rb-4.1.0&q=85";

const CAT_ICONS = ["🧵", "📱", "🏠", "🥫", "💄", "🎨"];

export default function Home() {
  const { t } = useI18n();
  const { active } = usePrivateClient();
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [shops, setShops] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = active ? { for_client: true } : {};
    api.get("/products", { params }).then((r) => setProducts(r.data.products)).catch(() => setProducts([]));
    api.get("/shops").then((r) => setShops(r.data.shops)).catch(() => {});
    api.get("/categories").then((r) => setCats(r.data.categories)).catch(() => {});
  }, [active]);

  const promos = (products || []).filter((p) => p.is_promo);

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0">
          <img src={BANNER} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-neutral-950/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-32">
          <div className="max-w-2xl">
            <span className="inline-block bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full mb-4">
              {t("tagline")}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold text-white leading-[1.05]">
              Achetez local, vendez partout en Afrique.
            </h1>
            <p className="text-neutral-200 mt-5 text-base md:text-lg max-w-xl">
              Des milliers de produits de boutiques vérifiées. Multi-devises, Mobile Money et bonus fidélité à chaque achat.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); navigate(`/products?q=${encodeURIComponent(q)}`); }}
              className="mt-8 flex gap-2 max-w-lg"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("search_ph")}
                  className="pl-11 h-12 rounded-full bg-white text-foreground"
                  data-testid="hero-search-input"
                />
              </div>
              <Button type="submit" className="h-12 px-6 rounded-full" data-testid="hero-search-btn">
                {t("search")}
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            [ShieldCheck, "Boutiques vérifiées", "KYC & validation admin"],
            [Truck, "Livraison locale", "Frais calculés par zone"],
            [Wallet, "Bonus & recettes", "Gagnez à chaque achat"],
            [Store, "Multi-boutiques", "Vendez sur la plateforme"],
          ].map(([Icon, title, sub], i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon className="w-5 h-5" />
              </span>
              <div>
                <div className="font-semibold text-sm">{title}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4">
        {/* Categories */}
        {cats.length > 0 && (
          <section className="py-12">
            <h2 className="text-lg font-display font-bold mb-5">{t("categories")}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {cats.slice(0, 6).map((c, i) => (
                <Link
                  key={c.id}
                  to={`/products?category=${encodeURIComponent(c.name)}`}
                  className="bg-card border border-border rounded-xl p-4 text-center card-lift"
                  data-testid={`cat-${c.name}`}
                >
                  <div className="text-2xl mb-1">{CAT_ICONS[i % CAT_ICONS.length]}</div>
                  <div className="text-xs font-medium line-clamp-2">{c.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Promotions */}
        {promos.length > 0 && (
          <section className="py-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-display font-bold">🔥 {t("promos")}</h2>
              <Link to="/products?promo=1" className="text-sm text-primary flex items-center gap-1">
                Voir tout <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {promos.slice(0, 4).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          </section>
        )}

        {/* Products */}
        <section className="py-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-bold">{t("products")}</h2>
            <Link to="/products" className="text-sm text-primary flex items-center gap-1">
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {products === null ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </section>

        {/* Shops */}
        {shops.length > 0 && (
          <section className="py-6 pb-16">
            <h2 className="text-lg font-display font-bold mb-5">{t("shops")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shops.map((s) => (
                <Link key={s.id} to={`/shops/${s.id}`} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 card-lift" data-testid={`shop-card-${s.id}`}>
                  <img src={s.logo} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0">
                    <div className="font-display font-bold truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.city}, {s.country}</div>
                    <div className="text-xs text-primary mt-1">{s.currency}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
