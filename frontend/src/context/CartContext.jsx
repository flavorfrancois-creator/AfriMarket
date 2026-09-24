import React, { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("am_cart") || "[]");
      return raw.map((i) => ({ ...i, key: i.key || (i.variant_id ? `${i.product_id}::${i.variant_id}` : i.product_id) }));
    } catch {
      return [];
    }
  });

  const persist = useCallback((next) => {
    setItems(next);
    localStorage.setItem("am_cart", JSON.stringify(next));
  }, []);

  const add = useCallback((product, qty = 1, variant = null) => {
    const next = [...items];
    const key = variant ? `${product.id}::${variant.id}` : product.id;
    const idx = next.findIndex((i) => i.key === key);
    const promo = product.is_promo;
    if (idx >= 0) next[idx].qty += qty;
    else
      next.push({
        key,
        product_id: product.id,
        variant_id: variant ? variant.id : null,
        variant_label: variant ? variant.label : "",
        name: product.name,
        image: (variant && variant.image) || product.image,
        price: variant ? variant.price : (promo ? product.promo_price : product.display_price),
        price_simple: variant ? variant.price_simple : (promo ? product.promo_price : (product.price_simple ?? product.display_price)),
        reseller_margin: (variant ? variant.reseller_margin : product.reseller_margin) || 0,
        currency: product.currency,
        shop_id: product.shop_id,
        shop_name: product.shop_name,
        qty,
      });
    persist(next);
    toast.success("Ajouté au panier");
  }, [items, persist]);

  const remove = useCallback((key) => {
    persist(items.filter((i) => i.key !== key));
  }, [items, persist]);

  const setQty = useCallback((key, qty) => {
    if (qty < 1) return;
    persist(items.map((i) => (i.key === key ? { ...i, qty } : i)));
  }, [items, persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const totalSimple = items.reduce((s, i) => s + (i.price_simple ?? i.price) * i.qty, 0);
  const totalMargin = items.reduce((s, i) => s + (i.reseller_margin || 0) * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, setQty, clear, count, total, totalSimple, totalMargin }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
