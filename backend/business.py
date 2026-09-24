"""Financial & business helper functions (server-side authoritative)."""
from db import db, now_iso, new_id


CUSTOMER_TYPES = ["SIMPLE", "PARTENAIRE", "PROFESSIONNEL", "ENTREPRISE"]
PRICE_FIELD = {
    "SIMPLE": "price_simple",
    "PARTENAIRE": "price_partner",
    "PROFESSIONNEL": "price_pro",
    "ENTREPRISE": "price_enterprise",
}


def price_for_type(product: dict, ctype: str) -> float:
    return float(product.get(PRICE_FIELD.get(ctype, "price_simple"), product.get("price_simple", 0)))


def promo_active(product: dict) -> bool:
    promo = product.get("promo") or {}
    if not promo.get("enabled"):
        return False
    qty = promo.get("promo_qty", 0)
    sold = promo.get("promo_sold", 0)
    if qty and sold >= qty:
        return False
    return True


async def get_customer_type(shop_id: str, user_id: str) -> str:
    rec = await db.shop_customers.find_one({"shop_id": shop_id, "user_id": user_id})
    if rec and rec.get("type") in CUSTOMER_TYPES:
        return rec["type"]
    return "SIMPLE"


def compute_line(product: dict, shop: dict, ctype: str, qty: int) -> dict:
    """Authoritative per-line financial computation."""
    pcs = float(product.get("price_simple", 0))
    unit_type_price = price_for_type(product, ctype)
    coeffs = shop.get("coefficients") or {}

    is_promo = promo_active(product)
    promo = product.get("promo") or {}
    unit_charged = float(promo.get("promo_price", unit_type_price)) if is_promo else unit_type_price

    # Règle métier : un achat en promotion ne génère AUCUN bonus.
    bonus = 0.0

    # Recette = X * (PCS - Prix type)
    recette = 0.0
    recette_wallet = None
    if ctype == "ENTREPRISE":
        x = float(coeffs.get("enterprise", 0.5))
        recette = x * (pcs - float(product.get("price_enterprise", pcs))) * qty
        recette_wallet = "earning_enterprise"
    elif ctype == "PARTENAIRE":
        x = float(coeffs.get("partner", 0.5))
        recette = x * (pcs - float(product.get("price_partner", pcs))) * qty
        recette_wallet = "earning_partner"
    elif ctype == "PROFESSIONNEL":
        x = float(coeffs.get("professional", 0.5))
        recette = x * (pcs - float(product.get("price_pro", pcs))) * qty
        recette_wallet = "earning_pro"
    recette = max(0.0, recette)

    return {
        "unit_charged": round(unit_charged, 2),
        "unit_type_price": round(unit_type_price, 2),
        "line_total": round(unit_charged * qty, 2),
        "bonus": round(bonus, 2),
        "recette": round(recette, 2),
        "recette_wallet": recette_wallet,
        "is_promo": is_promo,
    }


WALLET_TYPES = ["general", "bonus_promo", "earning_partner", "earning_pro", "earning_enterprise", "seller_payout"]

MARGIN_WALLET = {
    "PARTENAIRE": "earning_partner",
    "PROFESSIONNEL": "earning_pro",
    "ENTREPRISE": "earning_enterprise",
}


def compute_margin(product: dict, shop: dict, reseller_type: str, qty: int) -> dict:
    """Reseller margin when ordering for a private client. Invoice charged at PCS."""
    pcs = float(product.get("price_simple", 0))
    coeffs = shop.get("coefficients") or {}
    if reseller_type == "PARTENAIRE":
        x = float(coeffs.get("partner", 0.5)); ptype = float(product.get("price_partner", pcs))
    elif reseller_type == "PROFESSIONNEL":
        x = float(coeffs.get("professional", 0.5)); ptype = float(product.get("price_pro", pcs))
    elif reseller_type == "ENTREPRISE":
        x = float(coeffs.get("enterprise", 0.5)); ptype = float(product.get("price_enterprise", pcs))
    else:
        return {"unit_charged": pcs, "line_total": round(pcs * qty, 2), "margin": 0.0, "margin_wallet": None}
    margin = max(0.0, x * (pcs - ptype)) * qty
    return {"unit_charged": pcs, "line_total": round(pcs * qty, 2),
            "margin": round(margin, 2), "margin_wallet": MARGIN_WALLET[reseller_type]}


async def process_payment(provider: str, amount: float, currency: str) -> dict:
    """PaymentProvider abstraction (MOCK). Default provider: Monity World."""
    provider = provider or "MONITY_WORLD"
    return {"provider": provider, "status": "PAID_MOCK", "amount": round(float(amount), 2), "currency": currency}


async def add_wallet_tx(user_id: str, wallet: str, amount: float, currency: str, kind: str,
                        status: str, description: str, shop_id: str = None, order_id: str = None,
                        actor_id: str = None):
    doc = {
        "id": new_id(),
        "user_id": user_id,
        "wallet": wallet,
        "amount": round(float(amount), 2),
        "currency": currency,
        "kind": kind,  # CREDIT / DEBIT / PENDING / AVAILABLE / WITHDRAWAL / REFUND / ADJUSTMENT
        "status": status,  # PENDING / AVAILABLE / WITHDRAWN
        "description": description,
        "shop_id": shop_id,
        "order_id": order_id,
        "actor_id": actor_id or user_id,
        "created_at": now_iso(),
    }
    await db.wallet_transactions.insert_one(doc)
    return doc


async def wallet_balances(user_id: str) -> dict:
    """Compute virtual balances from the immutable ledger."""
    balances = {w: {"pending": 0.0, "available": 0.0} for w in WALLET_TYPES}
    cursor = db.wallet_transactions.find({"user_id": user_id})
    async for tx in cursor:
        w = tx.get("wallet")
        if w not in balances:
            continue
        amt = float(tx.get("amount", 0))
        st = tx.get("status")
        if st in ("PENDING", "AWAITING_VALIDATION"):
            balances[w]["pending"] += amt
        elif st == "AVAILABLE":
            balances[w]["available"] += amt
        elif st == "WITHDRAWN":
            balances[w]["available"] -= amt
    total_available = round(sum(b["available"] for b in balances.values()), 2)
    total_pending = round(sum(b["pending"] for b in balances.values()), 2)
    for w in balances:
        balances[w]["pending"] = round(balances[w]["pending"], 2)
        balances[w]["available"] = round(balances[w]["available"], 2)
    return {"wallets": balances, "total_available": total_available, "total_pending": total_pending}


async def audit_log(actor: dict, action: str, target_type: str, target_id: str,
                    old_value=None, new_value=None, ip: str = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "actor_id": actor.get("id"),
        "actor_email": actor.get("email"),
        "actor_role": actor.get("role"),
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "old_value": old_value,
        "new_value": new_value,
        "ip": ip,
        "created_at": now_iso(),
    })


async def notify(user_id: str, ntype: str, title: str, message: str, link: str = None):
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": now_iso(),
    })
