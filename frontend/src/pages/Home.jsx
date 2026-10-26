import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePrivateClient } from "@/context/PrivateClientContext";
import { useAuth } from "@/context/AuthContext";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/common";
import { Search, Store, ShieldCheck, Truck, Wallet, ArrowRight, ArrowLeft } from "lucide-react";
import { getAdvertisingConsent, getVisitorCountry, setVisitorCountry } from "@/lib/visitorPreferences";

const BANNER = "https://images.unsplash.com/photo-1772580310425-63f2290c2ba7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHw0fHxhZnJpY2FuJTIwbWFya2V0cGxhY2UlMjBwcm9kdWN0c3xlbnwwfHx8fDE3ODk5NzM2MzF8MA&ixlib=rb-4.1.0&q=85";

const CAT_ICONS = { "Mode & Vêtements": "🧵", "Électronique": "📱", "Maison & Cuisine": "🏠", "Alimentation": "🥫", "Beauté & Cosmétiques": "💄", "Artisanat": "🎨" };

export default function Home() {
  const { t } = useI18n();
  const { active, client } = usePrivateClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [shops, setShops] = useState([]);
  const [cats, setCats] = useState([]);
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState("");
  const [dailyOffers, setDailyOffers] = useState([]);
  const [siteConfig, setSiteConfig] = useState({
    homepage_images: [],
    homepage_ads: { above_hero: false, below_hero: true, show_promotions: true, show_popular: false },
  });
  const [heroIndex, setHeroIndex] = useState(0);
  const [adsConsent, setAdsConsent] = useState(() => getAdvertisingConsent());
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = active ? { for_client: true } : {};
    api.get("/products", { params }).then((r) => setProducts(r.data.products)).catch(() => setProducts([]));
    api.get("/shops").then((r) => setShops(r.data.shops)).catch(() => {});
    api.get("/categories").then((r) => setCats(r.data.categories)).catch(() => {});
    api.get("/config/countries").then((r) => setCountries(r.data.countries || [])).catch(() => {});
    api.get("/storefront/config").then((r) => setSiteConfig((current) => ({ ...current, ...r.data }))).catch(() => {});
  }, [active]);

  useEffect(() => {
    if (!countries.length) return;
    const preferredCountry = (active && client?.country) || user?.country || "";
    setCountry(getVisitorCountry(countries, preferredCountry));
  }, [countries, active, client?.country, user?.country]);

  useEffect(() => {
    if (!country) {
      setDailyOffers([]);
      return undefined;
    }
    let current = true;
    api.get("/daily-offers", { params: { country } })
      .then((r) => { if (current) setDailyOffers(r.data.products || []); })
      .catch(() => { if (current) setDailyOffers([]); });
    return () => { current = false; };
  }, [country]);

  useEffect(() => {
    const updateConsent = () => setAdsConsent(getAdvertisingConsent());
    window.addEventListener("afrimarket-ads-consent-change", updateConsent);
    return () => window.removeEventListener("afrimarket-ads-consent-change", updateConsent);
  }, []);

  const homepageImages = siteConfig.homepage_images || [];
  const activeHeroIndex = homepageImages.length ? heroIndex % homepageImages.length : 0;
  useEffect(() => {
    if (homepageImages.length < 2) return undefined;
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % homepageImages.length), 5000);
    return () => window.clearInterval(timer);
  }, [homepageImages.length]);

  const promos = (products || []).filter((p) => p.is_promo);
  const popular = [...(products || [])].sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0)).slice(0, 4);
  const adConfig = siteConfig.homepage_ads || {};
  const adSections = (placement) => {
    if (adsConsent !== "accepted") return null;
    const sections = [];
    if (adConfig.show_promotions && promos.length) sections.push(["promotions", `🔥 ${t("promos")}`, promos.slice(0, 4)]);
    if (adConfig.show_popular && popular.some((p) => Number(p.sold || 0) > 0)) {
      sections.push(["popular", "Les produits les plus sollicités", popular]);
    }
    if (!sections.length) return null;
    return (
      <div className="max-w-7xl mx-auto px-4">
        {sections.map(([key, title, items]) => (
          <section key={`${placement}-${key}`} className="py-5" data-testid={`homepage-ad-${placement}-${key}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold">{title}</h2>
              <Link to={key === "promotions" ? "/products?promo=1" : "/products"} className="text-sm text-primary flex items-center gap-1">
                Voir tout <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div>
      {adConfig.above_hero && adSections("above")}
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0">
          <img src={homepageImages[activeHeroIndex] || BANNER} alt="" className="w-full h-full object-cover transition-opacity duration-500" />
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
        {homepageImages.length > 1 && (
          <div className="absolute right-4 bottom-4 flex gap-2">
            <Button type="button" variant="secondary" size="icon" className="rounded-full" onClick={() => setHeroIndex((index) => (index - 1 + homepageImages.length) % homepageImages.length)} aria-label="Image précédente">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button type="button" variant="secondary" size="icon" className="rounded-full" onClick={() => setHeroIndex((index) => (index + 1) % homepageImages.length)} aria-label="Image suivante">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </section>
      {adConfig.below_hero && adSections("below")}

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
        <section className="py-8" data-testid="daily-offers">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-display font-bold">⭐ Offre du jour</h2>
              <p className="text-sm text-muted-foreground">Une sélection tournante de produits proposés dans votre pays.</p>
            </div>
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setVisitorCountry(event.target.value);
              }}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
              aria-label="Pays des offres du jour"
              data-testid="daily-offers-country"
            >
              <option value="">Choisir un pays</option>
              {countries.map((item) => <option key={item.iso2} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          {dailyOffers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {dailyOffers.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              {country ? "Aucune offre active pour le moment dans ce pays." : "Choisissez votre pays pour voir les offres du jour."}
            </p>
          )}
        </section>

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
                  <div className="text-2xl mb-1">{CAT_ICONS[c.name] || "🏷️"}</div>
                  <div className="text-xs font-medium line-clamp-2">{c.name}</div>
                </Link>
              ))}
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
