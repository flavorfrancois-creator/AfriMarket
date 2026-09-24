"""Idempotent seeding: admin, demo merchant/shop/products, demo client, orders."""
import os
import random
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from security import hash_password
from db import now_iso, new_id, gen_invite_code, gen_order_ref, gen_sku
from config_data import currency_for_country
from business import compute_line, add_wallet_tx

IMG = {
    "boubou": "https://images.unsplash.com/photo-1727407209320-1fa6ae60ee05?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "sac": "https://images.unsplash.com/photo-1584917865442-de89df76afd3?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "cafe": "https://images.unsplash.com/photo-1447933601403-0c6688de566e?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "phone": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "beurre": "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "panier": "https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?crop=entropy&cs=srgb&fm=jpg&q=80&w=800",
    "logo": "https://images.unsplash.com/photo-1751374858042-b8b9ff8480aa?crop=entropy&cs=srgb&fm=jpg&q=80&w=400",
}


async def _ensure_user(db, email, name, password, role, country="Sénégal", extra=None):
    existing = await db.users.find_one({"email": email})
    cur = currency_for_country(country)
    if existing:
        if role == "SUPER_ADMIN":
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password), "role": "SUPER_ADMIN"}})
        return str(existing["_id"])
    doc = {
        "name": name, "email": email, "password_hash": hash_password(password),
        "phone": "+221770000000", "role": role, "country": country, "currency": cur["code"],
        "token_version": 0, "phone_verified": True, "email_verified": True,
        "kyc_status": "APPROUVE" if role == "MERCHANT" else "NONE",
        "invite_code": gen_invite_code(), "referred_by": None, "is_partner": False,
        "created_at": now_iso(), "is_demo": role != "SUPER_ADMIN",
    }
    if extra:
        doc.update(extra)
    res = await db.users.insert_one(doc)
    return str(res.inserted_id)


async def seed(db):
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    await _ensure_user(db, admin_email, "Super Admin", admin_password, "SUPER_ADMIN")

    # Core demo accounts are seeded before the shop check so older databases
    # also receive the requested customer, administrator, and merchant profiles.
    await _ensure_user(db, "admin.demo1@afrimarket.demo", "Aminata Ndiaye", "Demo@2026", "ADMIN", "Sénégal")
    await _ensure_user(db, "admin.demo2@afrimarket.demo", "Kojo Asante", "Demo@2026", "ADMIN", "Ghana")
    m1 = await _ensure_user(db, "marchand@demo.com", "Aïssatou Diallo", "Demo@2026", "MERCHANT", "Sénégal")
    m2 = await _ensure_user(db, "marchand2@demo.com", "Kwame Mensah", "Demo@2026", "MERCHANT", "Ghana")
    c1 = await _ensure_user(db, "client@demo.com", "Mariama Sow", "Demo@2026", "CLIENT", "Sénégal")
    c2 = await _ensure_user(db, "client2@demo.com", "Ibrahim Traoré", "Demo@2026", "CLIENT", "Sénégal",
                            extra={"is_partner": True})

    if await db.shops.find_one({"is_demo": True}):
        return  # demo data already present

    # Categories
    cats = ["Mode & Vêtements", "Électronique", "Maison & Cuisine", "Alimentation", "Beauté & Cosmétiques", "Artisanat"]
    for c in cats:
        if not await db.categories.find_one({"name": c}):
            await db.categories.insert_one({"id": new_id(), "name": c, "parent": None,
                                            "proposed_by": "system", "status": "APPROVED", "created_at": now_iso()})

    # Demo merchants
    cur_sn = currency_for_country("Sénégal")
    cur_gh = currency_for_country("Ghana")

    shop1 = {
        "id": new_id(), "owner_id": m1, "owner_name": "Aïssatou Diallo",
        "name": "Sahel Élégance", "country": "Sénégal", "region": "Dakar", "city": "Dakar",
        "zone": "Plateau", "district": "", "street": "Av. Léopold Sédar Senghor", "po_box": "",
        "phone": "+221770000001", "tax_number": "SN-TAX-0001", "logo": IMG["logo"],
        "description": "Boutique de mode et d'artisanat africain haut de gamme.",
        "return_policy": "Retour sous 14 jours.", "sale_conditions": "Paiement à la livraison ou Mobile Money.",
        "currency": cur_sn["code"], "currency_symbol": cur_sn["symbol"], "status": "APPROVED",
        "rejection_reason": "", "coefficients": {"partner": 0.5, "professional": 0.4, "enterprise": 0.5},
        "created_at": now_iso(), "is_demo": True,
    }
    shop2 = {
        "id": new_id(), "owner_id": m2, "owner_name": "Kwame Mensah",
        "name": "Accra Tech Hub", "country": "Ghana", "region": "Greater Accra", "city": "Accra",
        "zone": "Osu", "district": "", "street": "Oxford Street", "po_box": "",
        "phone": "+233240000002", "tax_number": "GH-TAX-0002", "logo": IMG["logo"],
        "description": "Électronique et accessoires connectés à prix imbattables.",
        "return_policy": "Retour sous 7 jours.", "sale_conditions": "Garantie 6 mois.",
        "currency": cur_gh["code"], "currency_symbol": cur_gh["symbol"], "status": "APPROVED",
        "rejection_reason": "", "coefficients": {"partner": 0.5, "professional": 0.5, "enterprise": 0.6},
        "created_at": now_iso(), "is_demo": True,
    }
    # A pending shop for admin approval demo
    m3 = await _ensure_user(db, "marchand3@demo.com", "Fatou Ba", "Demo@2026", "MERCHANT", "Côte d'Ivoire")
    cur_ci = currency_for_country("Côte d'Ivoire")
    shop3 = {
        "id": new_id(), "owner_id": m3, "owner_name": "Fatou Ba",
        "name": "Abidjan Saveurs", "country": "Côte d'Ivoire", "region": "Abidjan", "city": "Abidjan",
        "zone": "Cocody", "district": "", "street": "Bd Latrille", "po_box": "",
        "phone": "+225070000003", "tax_number": "CI-TAX-0003", "logo": IMG["logo"],
        "description": "Produits alimentaires locaux et épices.",
        "return_policy": "", "sale_conditions": "",
        "currency": cur_ci["code"], "currency_symbol": cur_ci["symbol"], "status": "SUBMITTED",
        "rejection_reason": "", "coefficients": {"partner": 0.5, "professional": 0.5, "enterprise": 0.5},
        "created_at": now_iso(), "is_demo": True,
    }
    await db.shops.insert_many([shop1, shop2, shop3])

    # KYC records for demo merchants
    for uid, name, ctry in [(m1, "Aïssatou Diallo", "Sénégal"), (m2, "Kwame Mensah", "Ghana"), (m3, "Fatou Ba", "Côte d'Ivoire")]:
        await db.merchant_verifications.replace_one({"user_id": uid}, {
            "id": new_id(), "user_id": uid, "user_name": name, "doc_type": "Carte nationale d'identité",
            "doc_number": "ID" + str(random.randint(100000, 999999)), "expiry_date": "2030-01-01",
            "issuing_country": ctry, "file_data": "", "status": "APPROUVE" if uid != m3 else "EN_ATTENTE",
            "created_at": now_iso(),
        }, upsert=True)

    def product(shop, name, cat, img, ps, pp, ppr, pe, stock, promo=None, ship=1000):
        return {
            "id": new_id(), "shop_id": shop["id"], "shop_name": shop["name"],
            "currency": shop["currency"], "currency_symbol": shop["currency_symbol"],
            "name": name, "short_description": name, "description": f"{name} — produit de qualité, {shop['name']}.",
            "image": img, "gallery": [img], "category": cat, "subcategory": "", "genre": "Mixte",
            "usage": "Maison", "attributes": {"origine": shop["country"]}, "weight": 0.5, "dimensions": "M",
            "sku": gen_sku(), "stock": stock, "alert_threshold": 5,
            "price_simple": ps, "price_partner": pp, "price_pro": ppr, "price_enterprise": pe,
            "shipping_fee": ship, "promo": promo or {}, "status": "ACTIVE", "views": random.randint(10, 500),
            "sold": random.randint(0, 30), "initial_stock": stock, "created_at": now_iso(), "is_demo": True,
        }

    promo1 = {"enabled": True, "promo_price": 12000, "promo_qty": 20, "promo_sold": 3,
              "start": now_iso(), "end": (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()}
    products = [
        product(shop1, "Boubou brodé grand teint", "Mode & Vêtements", IMG["boubou"], 18000, 16000, 14000, 12000, 40, promo1),
        product(shop1, "Sac en cuir artisanal", "Artisanat", IMG["sac"], 25000, 22000, 20000, 18000, 15),
        product(shop1, "Panier tressé décoratif", "Maison & Cuisine", IMG["panier"], 8000, 7000, 6500, 6000, 3),
        product(shop1, "Beurre de karité pur (500g)", "Beauté & Cosmétiques", IMG["beurre"], 5000, 4500, 4000, 3500, 0),
        product(shop2, "Smartphone AndroBudget X2", "Électronique", IMG["phone"], 1200, 1100, 1050, 980, 25),
        product(shop2, "Café Arabica torréfié (1kg)", "Alimentation", IMG["cafe"], 90, 82, 78, 70, 60,
                {"enabled": True, "promo_price": 75, "promo_qty": 30, "promo_sold": 10,
                 "start": now_iso(), "end": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()}, ship=15),
    ]
    await db.products.insert_many(products)
    for p in products:
        await db.inventory_movements.insert_one({
            "id": new_id(), "product_id": p["id"], "shop_id": p["shop_id"], "type": "ENTREE",
            "quantity": p["initial_stock"], "reason": "Stock initial", "actor_id": p["shop_id"],
            "created_at": now_iso(),
        })

    # Demo clients
    # Set client2 as ENTREPRISE in shop1 to show recettes
    await db.shop_customers.update_one({"shop_id": shop1["id"], "user_id": c2},
                                       {"$set": {"type": "ENTREPRISE", "orders_count": 0, "total_spent": 0,
                                                 "created_at": now_iso()}}, upsert=True)
    await db.shop_customers.update_one({"shop_id": shop1["id"], "user_id": c1},
                                       {"$set": {"type": "SIMPLE", "orders_count": 0, "total_spent": 0,
                                                 "created_at": now_iso()}}, upsert=True)

    # Create a few demo orders (one delivered with available wallet, one pending)
    async def make_order(client_id, client_name, ctype, shop, items, status):
        order_items = []
        total = 0.0
        bonus_total = 0.0
        recette_accum = {}
        for prod, qty in items:
            fin = compute_line(prod, shop, ctype, qty)
            total += fin["line_total"]
            bonus_total += fin["bonus"]
            if fin["recette"] > 0 and fin["recette_wallet"]:
                recette_accum[fin["recette_wallet"]] = recette_accum.get(fin["recette_wallet"], 0) + fin["recette"]
            order_items.append({"product_id": prod["id"], "name": prod["name"], "image": prod["image"],
                                "qty": qty, "unit_price": fin["unit_charged"], "line_total": fin["line_total"],
                                "bonus": fin["bonus"], "recette": fin["recette"]})
        shipping = sum(float(p.get("shipping_fee", 0)) * q for p, q in items)
        grand = round(total + shipping, 2)
        oid_ = new_id()
        order = {"id": oid_, "ref": gen_order_ref(), "customer_id": client_id, "customer_name": client_name,
                 "customer_type": ctype, "shop_id": shop["id"], "shop_name": shop["name"], "items": order_items,
                 "subtotal": round(total, 2), "shipping": round(shipping, 2), "total": grand,
                 "currency": shop["currency"], "currency_symbol": shop["currency_symbol"], "status": status,
                 "payment_method": "MOCK", "payment_status": "PAID_MOCK", "address": "Dakar",
                 "bonus_total": round(bonus_total, 2),
                 "status_history": [{"status": "NOUVELLE", "at": now_iso(), "by": client_id}],
                 "created_at": now_iso()}
        await db.orders.insert_one(order)
        wstatus = "AVAILABLE" if status == "LIVREE" else "PENDING"
        wkind = "AVAILABLE" if status == "LIVREE" else "PENDING"
        if bonus_total > 0:
            await add_wallet_tx(client_id, "bonus_promo", bonus_total, shop["currency"], wkind, wstatus,
                                f"Bonus promotionnel commande {order['ref']}", shop["id"], oid_)
        for wallet, amt in recette_accum.items():
            await add_wallet_tx(client_id, wallet, amt, shop["currency"], wkind, wstatus,
                                f"Recette commande {order['ref']}", shop["id"], oid_)
        await db.shop_customers.update_one({"shop_id": shop["id"], "user_id": client_id},
                                           {"$inc": {"orders_count": 1, "total_spent": grand}}, upsert=True)

    await make_order(c1, "Mariama Sow", "SIMPLE", shop1, [(products[0], 1), (products[1], 1)], "LIVREE")
    await make_order(c2, "Ibrahim Traoré", "ENTREPRISE", shop1, [(products[0], 2)], "NOUVELLE")
    await make_order(c1, "Mariama Sow", "SIMPLE", shop2, [(products[4], 1)], "EN_PREPARATION")
