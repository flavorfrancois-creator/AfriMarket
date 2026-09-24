import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  const cols = [
    { title: t("shops"), links: [["/shops", t("shops")], ["/products", t("products")], ["/products?promo=1", t("promos")], ["/register?role=merchant", t("become_merchant")]] },
    { title: "Support", links: [["/faq", "FAQ"], ["/contact", "Contact"], ["/terms", "Conditions générales"], ["/privacy", "Politique de confidentialité"]] },
  ];
  return (
    <footer className="bg-neutral-950 text-neutral-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display font-extrabold">A</div>
            <span className="font-display font-extrabold text-lg text-white">{t("app_name")}</span>
          </div>
          <p className="text-sm max-w-sm text-neutral-400">{t("tagline")}. Une plateforme e-commerce multi-boutiques pensée pour l'Afrique — multi-devises, Mobile Money et livraison locale.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-white font-semibold mb-4">{c.title}</h4>
            <ul className="space-y-2 text-sm">
              {c.links.map(([to, label]) => (
                <li key={to}><Link to={to} className="hover:text-primary transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} {t("app_name")}. Démonstration — données fictives.
      </div>
    </footer>
  );
}
