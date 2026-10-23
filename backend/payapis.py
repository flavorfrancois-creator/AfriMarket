"""Per-country financial APIs (payment / withdrawal), global default APIs and country enable/disable."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db, new_id, now_iso
from security import get_current_user
from business import audit_log
from config_data import COUNTRIES
from messaging import _enc
from rbac import is_staff, account_status, within_delegation, effective_permissions

router = APIRouter(prefix="/api")
MAX_PER_COUNTRY = 15
KINDS = ("PAYMENT", "WITHDRAWAL", "BOTH")
MODES = ("TEST", "LIVE")
COUNTRY_NAMES = {c["name"] for c in COUNTRIES}
SECRET_FIELDS = ("api_key", "secret_key")


class PayApiReq(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    kind: Optional[str] = None
    mode: Optional[str] = None
    api_url: Optional[str] = None
    merchant_id: Optional[str] = None
    api_key: Optional[str] = None
    secret_key: Optional[str] = None
    active: Optional[bool] = None
    countries: Optional[List[str]] = None


class CountryStatusReq(BaseModel):
    enabled: bool


def require_finance_or_settings():
    async def dep(user: dict = Depends(get_current_user)):
        if not is_staff(user) or account_status(user) != "ACTIVE" or not within_delegation(user):
            raise HTTPException(status_code=403, detail="Accès refusé")
        if user.get("role") != "SUPER_ADMIN" and not ({"finance", "settings"} & effective_permissions(user)):
            raise HTTPException(status_code=403, detail="Permission « finances » ou « paramètres » requise")
        return user
    return dep


def _check_super(user: dict):
    if user.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Les API générales par défaut sont réservées au super-administrateur")


def _mask(last4: str) -> str:
    return f"••••{last4}" if last4 else ""


def _admin_view(a: dict) -> dict:
    out = {k: a.get(k) for k in ("id", "scope", "country", "countries", "name", "provider", "kind", "mode",
                                  "api_url", "merchant_id", "active", "created_at", "updated_at")}
    for f in SECRET_FIELDS:
        out[f"{f}_masked"] = _mask(a.get(f"{f}_last4", ""))
    return out


def _public_view(a: dict) -> dict:
    return {"id": a["id"], "name": a["name"], "provider": a.get("provider", ""), "kind": a["kind"],
            "mode": a.get("mode", "TEST"), "is_default": a.get("scope") == "GLOBAL"}


def _apply(req: PayApiReq, doc: dict) -> dict:
    for k in ("name", "provider", "api_url", "merchant_id"):
        v = getattr(req, k)
        if v is not None:
            doc[k] = v.strip()
    if req.kind is not None:
        if req.kind not in KINDS:
            raise HTTPException(status_code=400, detail="Type invalide (paiement, retrait ou les deux)")
        doc["kind"] = req.kind
    if req.mode is not None:
        if req.mode not in MODES:
            raise HTTPException(status_code=400, detail="Mode invalide")
        doc["mode"] = req.mode
    if req.active is not None:
        doc["active"] = bool(req.active)
    for f in SECRET_FIELDS:
        v = (getattr(req, f) or "").strip()
        if v:
            doc[f"{f}_enc"] = _enc(v)
            doc[f"{f}_last4"] = v[-4:]
    if not doc.get("name") or not doc.get("kind"):
        raise HTTPException(status_code=400, detail="Nom et type requis")
    return doc


# ---------------- Helpers used by checkout / withdrawals ----------------
async def disabled_countries() -> set:
    return {c["country"] async for c in db.country_settings.find({"enabled": False}, {"country": 1})}


async def ensure_country_enabled(user: dict):
    country = user.get("country") or ""
    if country and country in await disabled_countries():
        raise HTTPException(status_code=403, detail=f"Le pays {country} est temporairement désactivé : commandes et retraits suspendus")


async def available_apis(country: str, kind: str) -> list:
    if not country or country in await disabled_countries():
        return []
    kinds = [kind, "BOTH"]
    rows = await db.pay_apis.find({"active": True, "kind": {"$in": kinds}, "$or": [
        {"scope": "COUNTRY", "country": country}, {"scope": "GLOBAL", "countries": country}]}).to_list(100)
    rows.sort(key=lambda a: (a.get("scope") != "GLOBAL", a.get("name", "")))
    return [_public_view(a) for a in rows]


async def resolve_api(user: dict, kind: str, api_id: Optional[str]) -> Optional[dict]:
    apis = await available_apis(user.get("country") or "", kind)
    if api_id:
        match = next((a for a in apis if a["id"] == api_id), None)
        if not match:
            raise HTTPException(status_code=400, detail="Moyen de paiement indisponible pour votre pays")
        return match
    return next((a for a in apis if a["is_default"]), apis[0] if apis else None)


# ---------------- Public / user ----------------
@router.get("/config/disabled-countries")
async def public_disabled_countries():
    return {"countries": sorted(await disabled_countries())}


@router.get("/pay-apis")
async def my_pay_apis(kind: str = "PAYMENT", user: dict = Depends(get_current_user)):
    if kind not in ("PAYMENT", "WITHDRAWAL"):
        raise HTTPException(status_code=400, detail="Type invalide")
    country = user.get("country") or ""
    apis = await available_apis(country, kind)
    default = next((a["id"] for a in apis if a["is_default"]), None)
    return {"country": country, "country_enabled": country not in await disabled_countries(),
            "apis": apis, "default_id": default}


# ---------------- Admin ----------------
@router.get("/admin/countries/overview")
async def admin_countries_overview(user: dict = Depends(require_finance_or_settings())):
    disabled = await disabled_countries()
    counts = {}
    async for a in db.pay_apis.find({"scope": "COUNTRY"}, {"country": 1, "active": 1}):
        c = counts.setdefault(a["country"], {"total": 0, "active": 0})
        c["total"] += 1
        c["active"] += 1 if a.get("active") else 0
    globals_ = await db.pay_apis.find({"scope": "GLOBAL"}).sort("name", 1).to_list(100)
    rows = [{"name": c["name"], "currency": c["currency"], "enabled": c["name"] not in disabled,
             "api_total": counts.get(c["name"], {}).get("total", 0),
             "api_active": counts.get(c["name"], {}).get("active", 0),
             "default_apis": [g["name"] for g in globals_ if c["name"] in (g.get("countries") or [])]}
            for c in COUNTRIES]
    return {"countries": rows, "max_per_country": MAX_PER_COUNTRY, "global_apis": [_admin_view(g) for g in globals_],
            "can_manage_global": user.get("role") == "SUPER_ADMIN"}


@router.put("/admin/countries/{country}/status")
async def admin_country_status(country: str, req: CountryStatusReq, user: dict = Depends(require_finance_or_settings())):
    if country not in COUNTRY_NAMES:
        raise HTTPException(status_code=404, detail="Pays inconnu")
    await db.country_settings.update_one({"country": country}, {"$set": {
        "country": country, "enabled": req.enabled, "updated_at": now_iso(), "updated_by": user["id"]}}, upsert=True)
    await audit_log(user, "COUNTRY_ENABLED" if req.enabled else "COUNTRY_DISABLED", "country", country, None, req.enabled)
    return {"country": country, "enabled": req.enabled}


@router.get("/admin/countries/{country}/pay-apis")
async def admin_country_apis(country: str, user: dict = Depends(require_finance_or_settings())):
    if country not in COUNTRY_NAMES:
        raise HTTPException(status_code=404, detail="Pays inconnu")
    rows = await db.pay_apis.find({"scope": "COUNTRY", "country": country}).sort("created_at", 1).to_list(MAX_PER_COUNTRY)
    return {"apis": [_admin_view(a) for a in rows], "max": MAX_PER_COUNTRY}


@router.post("/admin/countries/{country}/pay-apis")
async def admin_create_country_api(country: str, req: PayApiReq, user: dict = Depends(require_finance_or_settings())):
    if country not in COUNTRY_NAMES:
        raise HTTPException(status_code=404, detail="Pays inconnu")
    if await db.pay_apis.count_documents({"scope": "COUNTRY", "country": country}) >= MAX_PER_COUNTRY:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PER_COUNTRY} API par pays")
    doc = _apply(req, {"id": new_id(), "scope": "COUNTRY", "country": country, "mode": "TEST", "active": True,
                       "created_at": now_iso(), "created_by": user["id"]})
    await db.pay_apis.insert_one(dict(doc))
    await audit_log(user, "CREATE_PAY_API", "pay_api", doc["id"], None, f"{country} {doc['name']}")
    return {"api": _admin_view(doc)}


@router.post("/admin/global-pay-apis")
async def admin_create_global_api(req: PayApiReq, user: dict = Depends(require_finance_or_settings())):
    _check_super(user)
    doc = _apply(req, {"id": new_id(), "scope": "GLOBAL", "mode": "TEST", "active": True,
                       "created_at": now_iso(), "created_by": user["id"]})
    doc["countries"] = [c for c in (req.countries or []) if c in COUNTRY_NAMES]
    await db.pay_apis.insert_one(dict(doc))
    await audit_log(user, "CREATE_GLOBAL_PAY_API", "pay_api", doc["id"], None, doc["name"])
    return {"api": _admin_view(doc)}


async def _get_api(aid: str, user: dict) -> dict:
    a = await db.pay_apis.find_one({"id": aid})
    if not a:
        raise HTTPException(status_code=404, detail="API introuvable")
    if a.get("scope") == "GLOBAL":
        _check_super(user)
    return a


@router.put("/admin/pay-apis/{aid}")
async def admin_update_api(aid: str, req: PayApiReq, user: dict = Depends(require_finance_or_settings())):
    a = await _get_api(aid, user)
    doc = _apply(req, {k: v for k, v in a.items() if k != "_id"})
    if a.get("scope") == "GLOBAL" and req.countries is not None:
        doc["countries"] = [c for c in req.countries if c in COUNTRY_NAMES]
    doc["updated_at"] = now_iso()
    await db.pay_apis.replace_one({"id": aid}, doc)
    await audit_log(user, "UPDATE_PAY_API", "pay_api", aid, None, doc["name"])
    return {"api": _admin_view(doc)}


@router.delete("/admin/pay-apis/{aid}")
async def admin_delete_api(aid: str, user: dict = Depends(require_finance_or_settings())):
    a = await _get_api(aid, user)
    await db.pay_apis.delete_one({"id": aid})
    await audit_log(user, "DELETE_PAY_API", "pay_api", aid, a.get("name"), None)
    return {"message": "API supprimée"}
