import React from "react";
import { Link } from "react-router-dom";
import { money } from "@/lib/currency";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Store } from "lucide-react";

export function ProductCard({ product, index = 0 }) {
  const { add } = useCart();
  const promo = product.is_promo;
  return (
    <div
      className="group bg-card border border-border rounded-xl overflow-hidden card-lift stagger-in flex flex-col"
      style={{ animationDelay: `${index * 40}ms` }}
      data-testid={`product-card-${product.id}`}
    >
      <Link to={`/products/${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {promo && (
          <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-semibold px-2 py-1 rounded-full">
            PROMO
          </span>
        )}
      </Link>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <Link to={`/shops/${product.shop_id}`} className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-primary">
          <Store className="w-3 h-3" /> {product.shop_name}
        </Link>
        <Link to={`/products/${product.id}`} className="font-medium text-sm line-clamp-2 hover:text-primary transition-colors">
          {product.name}
        </Link>
        {product.reseller_margin > 0 && (
          <span className="text-[11px] text-green-700 bg-green-50 rounded px-1.5 py-0.5 w-fit font-medium" data-testid={`margin-${product.id}`}>
            Marge ~ {money(product.reseller_margin, product.currency)}
          </span>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div className="font-mono">
            {promo ? (
              <div className="flex flex-col leading-none">
                <span className="text-primary font-bold text-sm">{money(product.promo_price, product.currency)}</span>
                <span className="text-[11px] text-muted-foreground line-through">{money(product.display_price, product.currency)}</span>
              </div>
            ) : (
              <span className="font-bold text-sm">{money(product.display_price, product.currency)}</span>
            )}
          </div>
          <Button
            size="icon"
            className="rounded-full h-8 w-8 shrink-0"
            onClick={() => add(product, 1)}
            data-testid={`add-to-cart-${product.id}`}
            aria-label="Ajouter au panier"
          >
            <ShoppingCart className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
