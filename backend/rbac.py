"""RBAC: staff roles, granular module permissions, account status, delegation,
and platform security settings (2FA scope/channels, double-validation threshold)."""
from datetime import datetime, timezone
from fastapi import Depends, HTTPException

from db import db
from security import get_current_user

# Staff roles (Module 1 & 9). CLIENT / MERCHANT are non-staff app roles.
STAFF_ROLES = [
    "SUPER_ADMIN", "ADMIN", "SHOP_ADMIN", "PRODUCT_MANAGER",
    "ORDER_MANAGER", "MODERATOR", "ACCOUNTANT",
]
ROLE_LABELS = {
    "SUPER_ADMIN": "Super-administrateur",
    "ADMIN": "Administrateur",
    "SHOP_ADMIN": "Admin boutique",
    "PRODUCT_MANAGER": "Gestionnaire produits",
    "ORDER_MANAGER": "Gestionnaire commandes / SAV",
    "MODERATOR": "Modérateur",
    "ACCOUNTANT": "Comptable / Finance",
}

# Modules gated by granular permissions (checkbox per module).
MODULES = [
    "overview", "shops", "products", "orders", "users",
    "finance", "moderation", "settings", "reporting", "audit", "admins",
]
MODULE_LABELS = {
    "overview": "Tableau de bord",
    "shops": "Boutiques / Vendeurs",
    "products": "Produits & modération",
    "orders": "Commandes & SAV",
    "users": "Utilisateurs (acheteurs)",
    "finance": "Finance & retraits",
    "moderation": "Modération (avis/signalements)",
    "settings": "Paramétrage global",
    "reporting": "Reporting & statistiques",
    "audit": "Journal & sécurité",
    "admins": "Administrateurs & gestionnaires",
}

DEFAULT_ROLE_PERMISSIONS = {
    "SUPER_ADMIN": list(MODULES),
    "ADMIN": [m for m in MODULES if m != "admins"],
    "SHOP_ADMIN": ["overview", "shops", "products", "orders", "reporting"],
    "PRODUCT_MANAGER": ["overview", "products"],
    "ORDER_MANAGER": ["overview", "orders"],
    "MODERATOR": ["overview", "moderation", "users", "products"],
    "ACCOUNTANT": ["overview", "finance", "reporting"],
}


def is_staff(user: dict) -> bool:
    return user.get("role") in STAFF_ROLES


def account_status(user: dict) -> str:
    return user.get("status") or "ACTIVE"


def within_delegation(user: dict) -> bool:
    """Temporary delegation window (start/end). No window => permanent access."""
    d = user.get("delegation") or {}
    if not d.get("enabled"):
        return True
    now = datetime.now(timezone.utc).isoformat()
    start, end = d.get("start"), d.get("end")
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


def effective_permissions(user: dict) -> set:
    role = user.get("role")
    if role == "SUPER_ADMIN":
        return set(MODULES)
    perms = user.get("permissions")
    if isinstance(perms, dict):
        return {m for m, v in perms.items() if v and m in MODULES}
    return set(DEFAULT_ROLE_PERMISSIONS.get(role, []))


def require_module(module: str):
    async def dep(user: dict = Depends(get_current_user)):
        if not is_staff(user):
            raise HTTPException(status_code=403, detail="Accès refusé")
        if account_status(user) != "ACTIVE":
            raise HTTPException(status_code=403, detail="Compte suspendu ou désactivé")
        if not within_delegation(user):
            raise HTTPException(status_code=403, detail="Délégation d'accès expirée")
        if user.get("role") == "SUPER_ADMIN":
            return user
        if module not in effective_permissions(user):
            raise HTTPException(status_code=403, detail="Permission insuffisante pour ce module")
        return user
    return dep


def require_super():
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Réservé au super-administrateur")
        return user
    return dep


def require_admin_level():
    """ADMIN or SUPER_ADMIN (used for double-validation & sensitive-action requests)."""
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
        if account_status(user) != "ACTIVE":
            raise HTTPException(status_code=403, detail="Compte suspendu ou désactivé")
        return user
    return dep


DEFAULT_SETTINGS = {
    "_id": "global",
    "two_factor_scope": "NONE",          # NONE | STAFF | ALL
    "two_factor_channels": ["email"],     # subset of email|sms|whatsapp
    "refund_threshold": 100000.0,         # amount above which double-validation applies
    "default_commission_rate": 0.05,      # platform commission (0.05 = 5%)
    "category_commissions": {},           # {category_name: rate} overrides
    "default_product_quota": 0,           # max products per shop (0 = unlimited)
    "default_storage_quota_mb": 0,        # max image storage MB per shop (0 = unlimited)
    # --- Fraud / anomaly detection thresholds (Module 8) ---
    "fraud_basket_sigma": 3.0,            # flag order if total > mean + sigma*std (per currency)
    "fraud_cancel_rate": 0.30,           # cancellation-rate threshold (global & per shop)
    "fraud_customer_cancels": 3,         # cancelled/rejected orders per customer to flag
    "fraud_refund_count": 3,             # refunded/partial-refund orders in period to flag
    "taxes_enabled": False,              # Module 7: global tax display toggle (no total impact)
    "legal_content": {},                 # Module 7: editable legal pages {kind: {title, body}}
    "csv_import_enabled": False,          # P1: allow merchants to bulk import products via CSV/XLSX
}


def resolve_commission_rate(shop: dict, category: str, settings: dict) -> float:
    """Effective commission: per-shop override > per-category > global default."""
    if shop.get("commission_rate") is not None:
        return float(shop["commission_rate"])
    cc = settings.get("category_commissions") or {}
    if category and category in cc:
        return float(cc[category])
    return float(settings.get("default_commission_rate", 0) or 0)


async def get_settings() -> dict:
    s = await db.platform_settings.find_one({"_id": "global"})
    if not s:
        s = dict(DEFAULT_SETTINGS)
        await db.platform_settings.insert_one(dict(s))
    for k, v in DEFAULT_SETTINGS.items():
        s.setdefault(k, v)
    return s


def requires_2fa(user: dict, settings: dict) -> bool:
    if user.get("two_factor_enabled"):
        return True
    scope = settings.get("two_factor_scope", "NONE")
    if scope == "ALL":
        return True
    if scope == "STAFF" and is_staff(user):
        return True
    return False
