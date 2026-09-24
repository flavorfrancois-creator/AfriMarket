import os
import io
import csv
import math
import hashlib
import secrets
import random
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, BackgroundTasks, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

from db import db, client, now_iso, new_id, gen_invite_code, gen_order_ref, gen_sku, gen_tracking, serialize, oid
from security import (hash_password, verify_password, create_access_token, get_current_user,
                      require_roles)
from emailer import send_verification_email, send_password_reset_email, send_2fa_code
from config_data import COUNTRIES, CURRENCIES, currency_for_country
from business import (CUSTOMER_TYPES, compute_line, compute_margin, process_payment, get_customer_type,
                      add_wallet_tx, wallet_balances, audit_log, notify, promo_active, price_for_type)
import rbac
from rbac import require_module, require_super, effective_permissions, get_settings, requires_2fa
from rbac import require_admin_level, resolve_commission_rate
import finance
import seed as seed_module
import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="AfriMarket API")
api = APIRouter(prefix="/api")

ORDER_STATUSES = ["NOUVELLE", "EN_ATTENTE", "APPROUVEE", "EN_PREPARATION", "PRETE", "EXPEDIEE",
                  "LIVREE", "ANNULEE", "REJETEE", "REMBOURSEE", "PARTIELLEMENT_REMBOURSEE"]
SHOP_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"]
DEMO_OTP = "123456"


# ---------------- Models ----------------
class RegisterReq(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = ""
    role: str = "CLIENT"
    country: Optional[str] = ""
    currency: Optional[str] = ""
    invite_code: Optional[str] = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class VerifyReq(BaseModel):
    code: str


class TwoFAVerifyReq(BaseModel):
    challenge_id: str
    code: str


class StaffCreateReq(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    permissions: Optional[dict] = None
    shop_ids: List[str] = []


class StaffUpdateReq(BaseModel):
    role: Optional[str] = None
    permissions: Optional[dict] = None
    shop_ids: Optional[List[str]] = None
    status: Optional[str] = None
    delegation: Optional[dict] = None
    password: Optional[str] = None


class SettingsReq(BaseModel):
    two_factor_scope: Optional[str] = None
    two_factor_channels: Optional[List[str]] = None
    refund_threshold: Optional[float] = None
    default_commission_rate: Optional[float] = None
    category_commissions: Optional[dict] = None
    default_product_quota: Optional[int] = None
    default_storage_quota_mb: Optional[int] = None
    fraud_basket_sigma: Optional[float] = None
    fraud_cancel_rate: Optional[float] = None
    fraud_customer_cancels: Optional[int] = None
    fraud_refund_count: Optional[int] = None
    legal_content: Optional[dict] = None
    taxes_enabled: Optional[bool] = None
    csv_import_enabled: Optional[bool] = None


class ShopCommissionReq(BaseModel):
    commission_rate: Optional[float] = None  # null = use platform/category default


class ShopQuotaReq(BaseModel):
    product_quota: int = 0
    storage_quota_mb: int = 0


class SuspendReq(BaseModel):
    reason: Optional[str] = ""


class ProductModerateReq(BaseModel):
    decision: str  # APPROVE | REJECT
    reason: Optional[str] = ""


class ProductReportReq(BaseModel):
    reason: str
    comment: Optional[str] = ""


class ReportActionReq(BaseModel):
    action: str  # DISMISS | REJECT_PRODUCT
    reason: Optional[str] = ""


class TwoFAPrefReq(BaseModel):
    enabled: bool
    channel: str = "email"


class ApprovalDecisionReq(BaseModel):
    decision: str  # APPROVE | REJECT
    note: Optional[str] = ""


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    token: str
    password: str


class ShopReq(BaseModel):
    name: str
    country: str
    region: Optional[str] = ""
    city: str
    zone: Optional[str] = ""
    district: Optional[str] = ""
    street: Optional[str] = ""
    po_box: Optional[str] = ""
    phone: Optional[str] = ""
    tax_number: Optional[str] = ""
    logo: Optional[str] = ""
    description: Optional[str] = ""
    return_policy: Optional[str] = ""
    sale_conditions: Optional[str] = ""


class KycReq(BaseModel):
    doc_type: str
    doc_number: str
    expiry_date: Optional[str] = ""
    issuing_country: str
    file_data: Optional[str] = ""


class ProductReq(BaseModel):
    name: str
    short_description: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    gallery: List[str] = []
    category: Optional[str] = ""
    subcategory: Optional[str] = ""
    genre: Optional[str] = ""
    usage: Optional[str] = ""
    attributes: dict = {}
    weight: Optional[float] = 0
    dimensions: Optional[str] = ""
    sku: Optional[str] = ""
    stock: int = 0
    alert_threshold: int = 5
    price_simple: float = 0
    price_partner: float = 0
    price_pro: float = 0
    price_enterprise: float = 0
    shipping_fee: float = 0
    promo: dict = {}
    variants: List[dict] = []


class StockAdjustReq(BaseModel):
    delta: int
    reason: str = ""


class CartItem(BaseModel):
    product_id: str
    qty: int
    variant_id: Optional[str] = None


class CheckoutReq(BaseModel):
    items: List[CartItem]
    address: Optional[str] = ""
    payment_method: str = "MOCK"
    private_client: Optional[dict] = None
    use_wallet: bool = False
    wallet_amount: Optional[float] = None


class OrderStatusReq(BaseModel):
    status: str


class CarrierReq(BaseModel):
    name: str
    code: str
    tracking_url: Optional[str] = ""
    delay_days: int = 5
    active: bool = True


class CarrierUpdateReq(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    tracking_url: Optional[str] = None
    delay_days: Optional[int] = None
    active: Optional[bool] = None
    suspended: Optional[bool] = None


class ShippingReq(BaseModel):
    carrier_id: str
    tracking: Optional[str] = None


class TaxRuleReq(BaseModel):
    country: str
    zone: Optional[str] = ""
    rate: float
    label: Optional[str] = "TVA"
    enabled: bool = True


class TaxRuleUpdateReq(BaseModel):
    country: Optional[str] = None
    zone: Optional[str] = None
    rate: Optional[float] = None
    label: Optional[str] = None
    enabled: Optional[bool] = None


class CustomerTypeReq(BaseModel):
    type: str


class WithdrawReq(BaseModel):
    amount: float
    method: str = "MOBILE_MONEY"
    destination: Optional[str] = ""
    bank_name: Optional[str] = ""
    account_name: Optional[str] = ""


class WithdrawDecisionReq(BaseModel):
    status: str
    reference: Optional[str] = ""


class ConfirmByTrackingReq(BaseModel):
    code: str


class CoefficientsReq(BaseModel):
    partner: float = 0.5
    professional: float = 0.5
    enterprise: float = 0.5


class PrivateClientReq(BaseModel):
    name: str
    phone: Optional[str] = ""
    city: Optional[str] = ""
    address: Optional[str] = ""


class PaymentProviderReq(BaseModel):
    provider: str = "MONITY_WORLD"
    api_key: Optional[str] = ""
    account: Optional[str] = ""


class ConfirmReceiptReq(BaseModel):
    code: str


# ---------------- Helpers ----------------
def _client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]


def _user_public(user: dict) -> dict:
    return {
        "id": str(user["_id"]) if "_id" in user else user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone", ""),
        "role": user.get("role"),
        "country": user.get("country", ""),
        "currency": user.get("currency", ""),
        "phone_verified": user.get("phone_verified", False),
        "email_verified": user.get("email_verified", False),
        "kyc_status": user.get("kyc_status", "NONE"),
        "invite_code": user.get("invite_code"),
        "referred_by": user.get("referred_by"),
        "is_partner": user.get("is_partner", False),
        "is_demo": user.get("is_demo", False),
        "status": user.get("status", "ACTIVE"),
        "shop_ids": user.get("shop_ids", []),
        "delegation": user.get("delegation") or {},
        "two_factor_enabled": user.get("two_factor_enabled", False),
        "two_factor_channel": user.get("two_factor_channel", "email"),
        "permissions": sorted(effective_permissions(user)),
    }


import hashlib as _hashlib


async def _record_login(user: dict, request: Request):
    await db.login_journal.insert_one({
        "id": new_id(),
        "user_id": str(user.get("_id", user.get("id"))),
        "email": user.get("email"),
        "role": user.get("role"),
        "ip": _client_ip(request),
        "user_agent": request.headers.get("user-agent", "?")[:400],
        "created_at": now_iso(),
    })


async def _create_otp_challenge(user: dict, channel: str) -> tuple:
    code = str(random.randint(100000, 999999))
    cid = new_id()
    await db.otp_challenges.insert_one({
        "id": cid,
        "user_id": str(user["_id"]),
        "code_hash": _hashlib.sha256(code.encode()).hexdigest(),
        "channel": channel,
        "attempts": 0,
        "consumed": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "created_at": now_iso(),
    })
    return cid, code


async def _deliver_otp(user: dict, channel: str, code: str):
    if channel == "email":
        await send_2fa_code(user["email"], code)
    else:
        # SMS / WhatsApp are modular MOCK channels (code shown in logs).
        logger.info("2FA %s OTP for %s: %s", channel.upper(), user.get("phone") or user["email"], code)


# ---------------- Auth ----------------
@api.post("/auth/register")
async def register(req: RegisterReq, background_tasks: BackgroundTasks):
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet e-mail est déjà utilisé")
    role = req.role.upper()
    if role not in ("CLIENT", "MERCHANT"):
        role = "CLIENT"

    referred_by = None
    if req.invite_code:
        sponsor = await db.users.find_one({"invite_code": req.invite_code.strip()})
        if sponsor:
            referred_by = str(sponsor["_id"])

    code = str(random.randint(100000, 999999))
    doc = {
        "name": req.name.strip(),
        "email": email,
        "password_hash": hash_password(req.password),
        "phone": req.phone or "",
        "role": role,
        "country": req.country or "",
        "currency": req.currency or (currency_for_country(req.country)["code"] if req.country else ""),
        "token_version": 0,
        "phone_verified": False,
        "email_verified": False,
        "email_code": code,
        "phone_code": DEMO_OTP,
        "kyc_status": "NONE",
        "invite_code": gen_invite_code(),
        "referred_by": referred_by,
        "is_partner": False,
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id

    if referred_by:
        await db.referrals.insert_one({
            "id": new_id(), "referrer_id": referred_by, "referee_id": str(res.inserted_id),
            "created_at": now_iso(),
        })
        await db.users.update_one({"_id": ObjectId(referred_by)}, {"$set": {"is_partner": True}})
        await notify(referred_by, "REFERRAL", "Nouveau filleul",
                     f"{req.name} s'est inscrit avec votre code INVITE.")

    background_tasks.add_task(send_verification_email, email, code)
    token = create_access_token(str(res.inserted_id), email, role, 0)
    return {"token": token, "user": _user_public(doc),
            "demo_otp": DEMO_OTP, "message": "Compte créé. Vérifiez votre téléphone et votre e-mail."}


@api.post("/auth/login")
async def login(req: LoginReq, request: Request):
    email = req.email.lower().strip()
    ip = _client_ip(request)
    identifier = f"{ip}:{email}"
    lock = await db.login_attempts.find_one({"identifier": identifier})
    if lock and lock.get("count", 0) >= 5:
        locked_until = lock.get("locked_until")
        if locked_until and locked_until > now_iso():
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez plus tard.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"email": email, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()},
             "$inc": {"count": 1}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")

    await db.login_attempts.delete_many({"identifier": identifier})

    if (user.get("status") or "ACTIVE") != "ACTIVE":
        raise HTTPException(status_code=403, detail="Compte suspendu ou désactivé. Contactez un administrateur.")

    settings = await get_settings()
    if requires_2fa(user, settings):
        enabled = settings.get("two_factor_channels") or ["email"]
        channel = user.get("two_factor_channel", "email")
        if channel not in enabled:
            channel = enabled[0]
        cid, code = await _create_otp_challenge(user, channel)
        await _deliver_otp(user, channel, code)
        return {"require_2fa": True, "challenge_id": cid, "channel": channel, "dev_code": code}

    await _record_login(user, request)
    token = create_access_token(str(user["_id"]), email, user["role"], user.get("token_version", 0))
    return {"token": token, "user": _user_public(user)}


@api.post("/auth/2fa/verify")
async def verify_2fa(req: TwoFAVerifyReq, request: Request):
    ch = await db.otp_challenges.find_one({"id": req.challenge_id})
    if not ch or ch.get("consumed"):
        raise HTTPException(status_code=400, detail="Session de vérification invalide")
    if ch["expires_at"] < now_iso():
        raise HTTPException(status_code=400, detail="Code expiré. Reconnectez-vous.")
    if ch.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Reconnectez-vous.")
    if _hashlib.sha256((req.code or "").strip().encode()).hexdigest() != ch["code_hash"]:
        await db.otp_challenges.update_one({"id": req.challenge_id}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Code de vérification incorrect")
    await db.otp_challenges.update_one({"id": req.challenge_id}, {"$set": {"consumed": True}})
    user = await db.users.find_one({"_id": ObjectId(ch["user_id"])})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user["id"] = str(user["_id"])
    await _record_login(user, request)
    token = create_access_token(str(user["_id"]), user["email"], user["role"], user.get("token_version", 0))
    return {"token": token, "user": _user_public(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": _user_public(user)}


@api.post("/auth/send-phone-otp")
async def send_phone_otp(user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"phone_code": DEMO_OTP}})
    return {"message": "Code OTP envoyé (MOCK)", "demo_otp": DEMO_OTP}


@api.post("/auth/verify-phone")
async def verify_phone(req: VerifyReq, user: dict = Depends(get_current_user)):
    if req.code != user.get("phone_code", DEMO_OTP):
        raise HTTPException(status_code=400, detail="Code OTP invalide")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"phone_verified": True}})
    return {"message": "Téléphone vérifié"}


@api.post("/auth/resend-email")
async def resend_email(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    code = str(random.randint(100000, 999999))
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"email_code": code}})
    background_tasks.add_task(send_verification_email, user["email"], code)
    return {"message": "E-mail de vérification renvoyé"}


@api.post("/auth/verify-email")
async def verify_email(req: VerifyReq, user: dict = Depends(get_current_user)):
    if req.code != user.get("email_code"):
        raise HTTPException(status_code=400, detail="Code e-mail invalide")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"email_verified": True}})
    return {"message": "E-mail vérifié"}


@api.post("/auth/forgot-password")
async def forgot_password(req: ForgotReq, background_tasks: BackgroundTasks):
    email = req.email.lower().strip()
    generic = {"message": "Si cet e-mail est enregistré, un lien de réinitialisation a été envoyé."}
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_iso()})
    recent = await db.password_reset_requests.count_documents(
        {"email": email, "created_at": {"$gt": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()}})
    if recent > 5:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash, "user_id": str(user["_id"]), "email": email,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(), "used": False,
    })
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return generic


@api.post("/auth/reset-password")
async def reset_password(req: ResetReq):
    token_hash = hashlib.sha256(req.token.encode()).hexdigest()
    now = now_iso()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now}},
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré")
    await db.users.update_one(
        {"_id": ObjectId(doc["user_id"])},
        {"$set": {"password_hash": hash_password(req.password)}, "$inc": {"token_version": 1}},
    )
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Mot de passe réinitialisé"}


# ---------------- Config ----------------
@api.get("/config/countries")
async def get_countries():
    return {"countries": COUNTRIES}


@api.get("/config/currencies")
async def get_currencies():
    return {"currencies": CURRENCIES}


# ---------------- Legal content (Module 7) ----------------
LEGAL_KINDS = ["terms", "privacy", "faq", "contact", "mentions"]
LEGAL_DEFAULTS = {
    "terms": {"title": "Conditions générales",
              "body": "Plateforme de démonstration. Les transactions sont simulées et n'engagent aucune valeur réelle."},
    "privacy": {"title": "Politique de confidentialité",
                "body": "Vos données sont utilisées uniquement pour le fonctionnement de la démonstration. Les documents d'identité (KYC) sont protégés et accessibles uniquement aux administrateurs autorisés."},
    "faq": {"title": "FAQ",
            "body": "Comment créer un compte ? Cliquez sur « Créer un compte ». Comment vendre ? Créez un compte commerçant, vérifiez votre identité (KYC), créez votre boutique et soumettez-la à validation. Comment fonctionnent les recettes ? Selon votre type de client (Partenaire, Professionnel, Entreprise), chaque achat peut générer des recettes. Les articles en promotion sont vendus au prix promo et ne génèrent pas de bonus."},
    "contact": {"title": "Contact",
                "body": "Pour toute question : support@afrimarket.demo. Ceci est une démonstration ; les coordonnées sont fictives."},
    "mentions": {"title": "Mentions légales",
                 "body": "AfriMarket — plateforme de démonstration. Éditeur, hébergeur et informations légales à compléter."},
}


def _merged_legal(settings: dict) -> dict:
    stored = settings.get("legal_content") or {}
    out = {}
    for k in LEGAL_KINDS:
        d = LEGAL_DEFAULTS[k]
        s = stored.get(k) or {}
        title = (s.get("title") or "").strip() or d["title"]
        body = (s.get("body") or "").strip() or d["body"]
        out[k] = {"title": title, "body": body}
    return out


@api.get("/legal")
async def get_legal():
    settings = await get_settings()
    return {"content": _merged_legal(settings)}


# ---------------- Earnings validation (bonus / recettes / marges) ----------------
EARNING_WALLETS = ["bonus_promo", "earning_partner", "earning_pro", "earning_enterprise"]
EARNING_LABELS = {"bonus_promo": "Bonus promo", "earning_partner": "Recette partenaire",
                  "earning_pro": "Recette professionnel", "earning_enterprise": "Recette entreprise"}


@api.get("/admin/earnings")
async def admin_list_earnings(status: Optional[str] = None, user: dict = Depends(require_module("finance"))):
    q = {"wallet": {"$in": EARNING_WALLETS}}
    q["status"] = status if status else {"$in": ["PENDING", "AWAITING_VALIDATION"]}
    txs = await db.wallet_transactions.find(q).sort("created_at", -1).to_list(2000)
    uids = list({t["user_id"] for t in txs})
    users = {}
    if uids:
        obj_ids = [ObjectId(u) for u in uids if oid(u)]
        async for u in db.users.find({"_id": {"$in": obj_ids}}):
            users[str(u["_id"])] = u
    out = []
    for t in txs:
        u = users.get(t["user_id"], {})
        out.append({
            "id": t["id"], "user_id": t["user_id"],
            "client_name": u.get("name", "—"), "client_email": u.get("email", ""),
            "wallet": t["wallet"], "wallet_label": EARNING_LABELS.get(t["wallet"], t["wallet"]),
            "amount": t["amount"], "currency": t["currency"], "status": t["status"],
            "order_id": t.get("order_id"), "description": t.get("description", ""),
            "created_at": t.get("created_at"), "delivered_at": t.get("delivered_at"),
        })
    counts = {
        "awaiting": sum(1 for t in txs if t["status"] == "AWAITING_VALIDATION"),
        "pending_delivery": sum(1 for t in txs if t["status"] == "PENDING"),
    }
    return {"earnings": out, "counts": counts}


@api.post("/admin/earnings/{tx_id}/validate")
async def admin_validate_earning(tx_id: str, request: Request, user: dict = Depends(require_module("finance"))):
    tx = await db.wallet_transactions.find_one({"id": tx_id})
    if not tx or tx["wallet"] not in EARNING_WALLETS:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx["status"] != "AWAITING_VALIDATION":
        raise HTTPException(status_code=400, detail="Seuls les gains livrés (en attente de validation) peuvent être validés")
    await db.wallet_transactions.update_one(
        {"id": tx_id}, {"$set": {"status": "AVAILABLE", "kind": "AVAILABLE",
                                 "validated_by": user["id"], "validated_at": now_iso()}})
    await audit_log(user, "VALIDATE_EARNING", "wallet_tx", tx_id, tx["status"], "AVAILABLE", _client_ip(request))
    await notify(tx["user_id"], "EARNING_VALIDATED", "Gain validé",
                 f"Votre gain de {tx['amount']} {tx['currency']} a été validé et est désormais disponible.", "/account/wallet")
    return {"message": "Gain validé et rendu disponible"}


@api.post("/admin/earnings/{tx_id}/reject")
async def admin_reject_earning(tx_id: str, request: Request, user: dict = Depends(require_module("finance"))):
    tx = await db.wallet_transactions.find_one({"id": tx_id})
    if not tx or tx["wallet"] not in EARNING_WALLETS:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx["status"] not in ("AWAITING_VALIDATION", "PENDING"):
        raise HTTPException(status_code=400, detail="Ce gain ne peut plus être rejeté")
    await db.wallet_transactions.update_one(
        {"id": tx_id}, {"$set": {"status": "REJECTED", "kind": "REJECTED",
                                 "validated_by": user["id"], "validated_at": now_iso()}})
    await audit_log(user, "REJECT_EARNING", "wallet_tx", tx_id, tx["status"], "REJECTED", _client_ip(request))
    await notify(tx["user_id"], "EARNING_REJECTED", "Gain rejeté",
                 f"Votre gain de {tx['amount']} {tx['currency']} a été rejeté après vérification.", "/account/wallet")
    return {"message": "Gain rejeté"}


# ---------------- Taxes per country/zone (Module 7) ----------------
@api.get("/admin/taxes")
async def admin_list_taxes(user: dict = Depends(require_module("settings"))):
    settings = await get_settings()
    rows = await db.tax_rules.find({}).sort("country", 1).to_list(500)
    return {"taxes": [serialize(r) for r in rows], "taxes_enabled": bool(settings.get("taxes_enabled", False))}


@api.post("/admin/taxes")
async def admin_create_tax(req: TaxRuleReq, request: Request, user: dict = Depends(require_module("settings"))):
    doc = {"id": new_id(), "country": req.country, "zone": (req.zone or "").strip(),
           "rate": round(max(0.0, float(req.rate)), 4), "label": (req.label or "TVA").strip(),
           "enabled": bool(req.enabled), "created_at": now_iso()}
    await db.tax_rules.insert_one(doc)
    await audit_log(user, "CREATE_TAX", "tax", doc["id"], None, f"{doc['country']} {doc['rate']}", _client_ip(request))
    return {"tax": serialize(doc)}


@api.put("/admin/taxes/{tid}")
async def admin_update_tax(tid: str, req: TaxRuleUpdateReq, request: Request, user: dict = Depends(require_module("settings"))):
    row = await db.tax_rules.find_one({"id": tid})
    if not row:
        raise HTTPException(status_code=404, detail="Règle de taxe introuvable")
    upd = {}
    if req.country is not None:
        upd["country"] = req.country
    if req.zone is not None:
        upd["zone"] = req.zone.strip()
    if req.rate is not None:
        upd["rate"] = round(max(0.0, float(req.rate)), 4)
    if req.label is not None:
        upd["label"] = req.label.strip()
    if req.enabled is not None:
        upd["enabled"] = bool(req.enabled)
    if upd:
        await db.tax_rules.update_one({"id": tid}, {"$set": upd})
    await audit_log(user, "UPDATE_TAX", "tax", tid, None, upd, _client_ip(request))
    fresh = await db.tax_rules.find_one({"id": tid})
    return {"tax": serialize(fresh)}


@api.delete("/admin/taxes/{tid}")
async def admin_delete_tax(tid: str, request: Request, user: dict = Depends(require_module("settings"))):
    res = await db.tax_rules.delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Règle de taxe introuvable")
    await audit_log(user, "DELETE_TAX", "tax", tid, None, None, _client_ip(request))
    return {"message": "Règle supprimée"}


# ---------------- Shops ----------------
async def _shop_or_404(shop_id: str):
    shop = await db.shops.find_one({"id": shop_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Boutique introuvable")
    return shop


async def _my_shop(user: dict):
    return await db.shops.find_one({"owner_id": user["id"]})


def _img_bytes(s: str) -> int:
    """Approx byte weight of an image value: decoded size for data: URLs, else string length."""
    if not s:
        return 0
    if s.startswith("data:"):
        try:
            b64 = s.split(",", 1)[1]
            return (len(b64) * 3) // 4
        except Exception:
            return len(s.encode("utf-8"))
    return len(s.encode("utf-8"))


def _product_img_bytes(image: str, gallery: list) -> int:
    return _img_bytes(image or "") + sum(_img_bytes(g) for g in (gallery or []))


async def _shop_storage_bytes(shop_id: str, exclude_product_id: str = None) -> int:
    total = 0
    async for p in db.products.find({"shop_id": shop_id, "status": {"$ne": "DELETED"}},
                                    {"image": 1, "gallery": 1, "id": 1}):
        if exclude_product_id and p.get("id") == exclude_product_id:
            continue
        total += _product_img_bytes(p.get("image", ""), p.get("gallery", []))
    return total


def _mb(bytes_: int) -> float:
    return round(bytes_ / (1024 * 1024), 3)


@api.post("/shops")
async def create_shop(req: ShopReq, user: dict = Depends(require_roles("MERCHANT"))):
    existing = await db.shops.find_one({"owner_id": user["id"]})
    cur = currency_for_country(req.country)
    doc = {
        "id": new_id(),
        "owner_id": user["id"],
        "owner_name": user["name"],
        **req.model_dump(),
        "currency": cur["code"],
        "currency_symbol": cur["symbol"],
        "status": "DRAFT",
        "rejection_reason": "",
        "coefficients": {"partner": 0.5, "professional": 0.5, "enterprise": 0.5},
        "payment_provider": "MONITY_WORLD",
        "payment_config": {},
        "created_at": now_iso(),
        "is_demo": False,
    }
    if existing:
        upd = {k: v for k, v in doc.items() if k not in ("id", "created_at", "status", "coefficients")}
        await db.shops.update_one({"id": existing["id"]}, {"$set": upd})
        shop = await db.shops.find_one({"id": existing["id"]})
        return {"shop": serialize(shop)}
    await db.shops.insert_one(doc)
    await audit_log(user, "CREATE_SHOP", "shop", doc["id"], None, doc["name"])
    return {"shop": serialize(doc)}


@api.get("/shops/mine")
async def my_shop(user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    if not shop:
        return {"shop": None}
    out = serialize(shop)
    out["storage_used_mb"] = _mb(await _shop_storage_bytes(shop["id"]))
    out["product_count"] = await db.products.count_documents({"shop_id": shop["id"], "status": {"$ne": "DELETED"}})
    return {"shop": out}


@api.post("/shops/{shop_id}/submit")
async def submit_shop(shop_id: str, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.shops.update_one({"id": shop_id}, {"$set": {"status": "SUBMITTED"}})
    await audit_log(user, "SUBMIT_SHOP", "shop", shop_id, shop["status"], "SUBMITTED")
    async for a in db.users.find({"role": {"$in": ["SUPER_ADMIN", "ADMIN"]}}):
        await notify(str(a["_id"]), "SHOP_SUBMITTED", "Nouvelle demande de boutique",
                     f"{shop['name']} attend validation.")
    return {"message": "Boutique soumise pour validation"}


@api.put("/shops/{shop_id}")
async def update_shop(shop_id: str, req: ShopReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.shops.update_one({"id": shop_id}, {"$set": req.model_dump()})
    return {"message": "Boutique mise à jour"}


@api.put("/shops/{shop_id}/coefficients")
async def update_coefficients(shop_id: str, req: CoefficientsReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.shops.update_one({"id": shop_id}, {"$set": {"coefficients": req.model_dump()}})
    await audit_log(user, "UPDATE_COEFFICIENTS", "shop", shop_id, shop.get("coefficients"), req.model_dump())
    return {"message": "Coefficients mis à jour"}


def _public_shop(shop: dict) -> dict:
    s = serialize(shop)
    for k in ("coefficients", "rejection_reason", "tax_number", "payment_config",
              "commission_rate", "product_quota", "storage_quota_mb", "suspension_reason"):
        s.pop(k, None)
    return s


@api.get("/shops")
async def list_shops(q: Optional[str] = None, country: Optional[str] = None, city: Optional[str] = None):
    query = {"status": "APPROVED", "suspended": {"$ne": True}}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    if country:
        query["country"] = country
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    shops = await db.shops.find(query).to_list(200)
    return {"shops": [_public_shop(s) for s in shops]}


@api.get("/shops/{shop_id}")
async def get_shop(shop_id: str):
    shop = await _shop_or_404(shop_id)
    if shop.get("suspended") or shop.get("status") != "APPROVED":
        raise HTTPException(status_code=404, detail="Boutique indisponible")
    return {"shop": _public_shop(shop)}


# ---------------- KYC ----------------
@api.post("/kyc")
async def submit_kyc(req: KycReq, user: dict = Depends(require_roles("MERCHANT"))):
    doc = {
        "id": new_id(), "user_id": user["id"], "user_name": user["name"],
        **req.model_dump(), "status": "EN_ATTENTE", "created_at": now_iso(),
    }
    await db.merchant_verifications.replace_one({"user_id": user["id"]}, doc, upsert=True)
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"kyc_status": "EN_ATTENTE"}})
    await audit_log(user, "SUBMIT_KYC", "kyc", doc["id"], None, req.doc_type)
    return {"message": "Document soumis pour vérification"}


@api.get("/kyc/mine")
async def my_kyc(user: dict = Depends(require_roles("MERCHANT"))):
    kyc = await db.merchant_verifications.find_one({"user_id": user["id"]})
    if kyc:
        k = serialize(kyc)
        k.pop("file_data", None)
        return {"kyc": k}
    return {"kyc": None}


# ---------------- Products ----------------
def _normalize_variants(variants):
    """Assign ids and coerce numeric fields for product variants."""
    out = []
    for v in (variants or []):
        if not isinstance(v, dict):
            continue
        out.append({
            "id": v.get("id") or new_id(),
            "label": str(v.get("label", "")).strip(),
            "attributes": v.get("attributes") or {},
            "sku": (v.get("sku") or gen_sku()),
            "stock": max(0, int(v.get("stock", 0) or 0)),
            "sold": max(0, int(v.get("sold", 0) or 0)),
            "price_simple": float(v.get("price_simple", 0) or 0),
            "price_partner": float(v.get("price_partner", 0) or 0),
            "price_pro": float(v.get("price_pro", 0) or 0),
            "price_enterprise": float(v.get("price_enterprise", 0) or 0),
            "image": v.get("image", ""),
        })
    return out


@api.post("/products")
async def create_product(req: ProductReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    if not shop or shop["status"] != "APPROVED":
        raise HTTPException(status_code=403, detail="Votre boutique doit être approuvée")
    if shop.get("suspended"):
        raise HTTPException(status_code=403, detail="Votre boutique est suspendue")
    settings = await get_settings()
    quota = shop.get("product_quota") or settings.get("default_product_quota", 0) or 0
    if quota > 0:
        count = await db.products.count_documents({"shop_id": shop["id"], "status": {"$ne": "DELETED"}})
        if count >= quota:
            raise HTTPException(status_code=403, detail=f"Quota de produits atteint ({quota}). Contactez l'administrateur.")
    storage_quota_mb = shop.get("storage_quota_mb") or settings.get("default_storage_quota_mb", 0) or 0
    if storage_quota_mb > 0:
        used = await _shop_storage_bytes(shop["id"])
        new_bytes = _product_img_bytes(req.image, req.gallery)
        if used + new_bytes > storage_quota_mb * 1024 * 1024:
            raise HTTPException(status_code=403, detail=f"Quota de stockage atteint ({storage_quota_mb} Mo). Réduisez le poids des images ou contactez l'administrateur.")
    data = req.model_dump()
    data["sku"] = data.get("sku") or gen_sku()
    data["variants"] = _normalize_variants(data.get("variants"))
    if data["variants"]:
        data["stock"] = sum(v["stock"] for v in data["variants"])
    doc = {
        "id": new_id(), "shop_id": shop["id"], "shop_name": shop["name"],
        "currency": shop["currency"], "currency_symbol": shop.get("currency_symbol", ""),
        **data, "status": "ACTIVE", "moderation_status": "PENDING", "moderation_reason": "",
        "views": 0, "sold": 0, "flagged": False,
        "initial_stock": data.get("stock", 0), "created_at": now_iso(), "is_demo": False,
    }
    await db.products.insert_one(doc)
    await db.inventory_movements.insert_one({
        "id": new_id(), "product_id": doc["id"], "shop_id": shop["id"], "type": "ENTREE",
        "quantity": data.get("stock", 0), "reason": "Stock initial", "actor_id": user["id"],
        "created_at": now_iso(),
    })
    await audit_log(user, "CREATE_PRODUCT", "product", doc["id"], None, doc["name"])
    await _notify_moderators("PRODUCT_MODERATION", "Produit à valider",
                             f"Nouveau produit « {doc['name']} » ({shop['name']}) en attente de modération.", "/admin/products")
    return {"product": serialize(doc)}


async def _notify_moderators(ntype: str, title: str, message: str, link: str = None):
    async for a in db.users.find({"role": {"$in": ["SUPER_ADMIN", "ADMIN", "MODERATOR", "PRODUCT_MANAGER"]}}):
        await notify(str(a["_id"]), ntype, title, message, link)


@api.get("/products/mine")
async def my_products(user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    if not shop:
        return {"products": []}
    products = await db.products.find({"shop_id": shop["id"], "status": {"$ne": "DELETED"}}).to_list(500)
    return {"products": [serialize(p) for p in products]}


@api.put("/products/{product_id}")
async def update_product(product_id: str, req: ProductReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    product = await db.products.find_one({"id": product_id})
    if not product or not shop or product["shop_id"] != shop["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    settings = await get_settings()
    storage_quota_mb = shop.get("storage_quota_mb") or settings.get("default_storage_quota_mb", 0) or 0
    if storage_quota_mb > 0:
        used_excl = await _shop_storage_bytes(shop["id"], exclude_product_id=product_id)
        new_bytes = _product_img_bytes(req.image, req.gallery)
        if used_excl + new_bytes > storage_quota_mb * 1024 * 1024:
            raise HTTPException(status_code=403, detail=f"Quota de stockage atteint ({storage_quota_mb} Mo). Réduisez le poids des images.")
    old_prices = {k: product.get(k) for k in ("price_simple", "price_partner", "price_pro", "price_enterprise")}
    upd = req.model_dump()
    upd["variants"] = _normalize_variants(upd.get("variants"))
    if upd["variants"]:
        upd["stock"] = sum(v["stock"] for v in upd["variants"])
    upd["moderation_status"] = "PENDING"
    upd["moderation_reason"] = ""
    await db.products.update_one({"id": product_id}, {"$set": upd})
    await audit_log(user, "UPDATE_PRODUCT", "product", product_id, old_prices, {"price_simple": req.price_simple})
    await _notify_moderators("PRODUCT_MODERATION", "Produit modifié à revalider",
                             f"Le produit « {product['name']} » a été modifié et attend une nouvelle validation.", "/admin/products")
    return {"message": "Article mis à jour (en attente de modération)"}


@api.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    product = await db.products.find_one({"id": product_id})
    if not product or not shop or product["shop_id"] != shop["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.products.update_one({"id": product_id}, {"$set": {"status": "DELETED"}})
    await audit_log(user, "DELETE_PRODUCT", "product", product_id, product["name"], None)
    return {"message": "Article supprimé"}


@api.post("/products/{product_id}/stock")
async def adjust_stock(product_id: str, req: StockAdjustReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    product = await db.products.find_one({"id": product_id})
    if not product or not shop or product["shop_id"] != shop["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    new_stock = max(0, product.get("stock", 0) + req.delta)
    await db.products.update_one({"id": product_id}, {"$set": {"stock": new_stock}})
    await db.inventory_movements.insert_one({
        "id": new_id(), "product_id": product_id, "shop_id": shop["id"],
        "type": "ENTREE" if req.delta >= 0 else "SORTIE", "quantity": abs(req.delta),
        "reason": req.reason or "Ajustement manuel", "actor_id": user["id"], "created_at": now_iso(),
    })
    await audit_log(user, "ADJUST_STOCK", "product", product_id, product.get("stock"), new_stock)
    return {"message": "Stock ajusté", "stock": new_stock}


@api.get("/products/{product_id}/movements")
async def stock_movements(product_id: str, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _my_shop(user)
    product = await db.products.find_one({"id": product_id})
    if not product or not shop or product["shop_id"] != shop["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    movements = await db.inventory_movements.find({"product_id": product_id}).sort("created_at", -1).to_list(200)
    return {"movements": [serialize(m) for m in movements]}


async def viewer_ctype(shop_id: str, user: Optional[dict], cache: dict) -> str:
    if not user:
        return "SIMPLE"
    if shop_id in cache:
        return cache[shop_id]
    ct = await get_customer_type(shop_id, user["id"])
    if ct == "SIMPLE" and user.get("is_partner"):
        ct = "PARTENAIRE"
    cache[shop_id] = ct
    return ct


def _public_product(product: dict, ctype: str) -> dict:
    """Public payload: expose only the simple price and the viewer's own price."""
    p = serialize(product)
    for k in ("price_partner", "price_pro", "price_enterprise"):
        p.pop(k, None)
    p["display_price"] = price_for_type(product, ctype)
    p["viewer_type"] = ctype
    p["is_promo"] = promo_active(product)
    if p["is_promo"]:
        p["promo_price"] = (product.get("promo") or {}).get("promo_price")
    return p


async def _optional_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            return await get_current_user(request)
        except Exception:
            return None
    return None


async def reseller_type_for(shop_id: str, user: Optional[dict], cache: dict) -> Optional[str]:
    if not user:
        return None
    bt = await viewer_ctype(shop_id, user, cache)
    return "PARTENAIRE" if bt == "SIMPLE" else bt


@api.get("/products")
async def list_products(request: Request, q: Optional[str] = None, category: Optional[str] = None,
                        shop_id: Optional[str] = None, promo: Optional[bool] = None,
                        min_price: Optional[float] = None, max_price: Optional[float] = None,
                        for_client: bool = False):
    query = {"status": "ACTIVE", "moderation_status": "APPROVED"}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                        {"description": {"$regex": q, "$options": "i"}},
                        {"sku": {"$regex": q, "$options": "i"}}]
    if category:
        query["category"] = category
    if shop_id:
        query["shop_id"] = shop_id
    products = await db.products.find(query).to_list(300)
    susp = {s["id"] async for s in db.shops.find({"suspended": True}, {"id": 1})}
    products = [p for p in products if p.get("shop_id") not in susp]
    user = await _optional_user(request)
    cache = {}
    shop_cache = {}
    result = []
    for p in products:
        if promo and not promo_active(p):
            continue
        if for_client:
            item = _public_product(p, "SIMPLE")
            rt = await reseller_type_for(p["shop_id"], user, cache)
            if rt:
                sid = p["shop_id"]
                if sid not in shop_cache:
                    shop_cache[sid] = await db.shops.find_one({"id": sid})
                mg = compute_margin(p, shop_cache[sid] or {}, rt, 1)
                item["reseller_type"] = rt
                item["reseller_margin"] = mg["margin"]
        else:
            ctype = await viewer_ctype(p["shop_id"], user, cache)
            item = _public_product(p, ctype)
        if min_price is not None and item["display_price"] < min_price:
            continue
        if max_price is not None and item["display_price"] > max_price:
            continue
        result.append(item)
    return {"products": result}


@api.get("/products/{product_id}")
async def get_product(product_id: str, request: Request, for_client: bool = False):
    product = await db.products.find_one({"id": product_id})
    if not product or product.get("status") == "DELETED":
        raise HTTPException(status_code=404, detail="Article introuvable")
    if product.get("moderation_status", "APPROVED") != "APPROVED":
        raise HTTPException(status_code=404, detail="Article indisponible")
    shop_doc = await db.shops.find_one({"id": product["shop_id"]})
    if shop_doc and shop_doc.get("suspended"):
        raise HTTPException(status_code=404, detail="Article indisponible")
    await db.products.update_one({"id": product_id}, {"$inc": {"views": 1}})
    user = await _optional_user(request)
    cache = {}
    if for_client:
        item = _public_product(product, "SIMPLE")
        rt = await reseller_type_for(product["shop_id"], user, cache)
        if rt:
            shop = await db.shops.find_one({"id": product["shop_id"]})
            mg = compute_margin(product, shop or {}, rt, 1)
            item["reseller_type"] = rt
            item["reseller_margin"] = mg["margin"]
        return {"product": item}
    ctype = await viewer_ctype(product["shop_id"], user, cache)
    return {"product": _public_product(product, ctype)}


# ---------------- Categories ----------------
@api.get("/categories")
async def list_categories():
    cats = await db.categories.find({"status": "APPROVED"}).to_list(200)
    return {"categories": [serialize(c) for c in cats]}


@api.post("/categories")
async def create_category(payload: dict, user: dict = Depends(get_current_user)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    existing = await db.categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        return {"category": serialize(existing)}
    status = "APPROVED" if user["role"] in ("SUPER_ADMIN", "ADMIN") else "PENDING"
    doc = {"id": new_id(), "name": name, "parent": payload.get("parent"),
           "proposed_by": user["id"], "status": status, "created_at": now_iso()}
    await db.categories.insert_one(doc)
    return {"category": serialize(doc)}


# ---------------- Uploads & file serving (P1) ----------------
ALLOWED_IMG = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD = 6 * 1024 * 1024  # 6 MB


@api.post("/upload/image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Image trop lourde (max 6 Mo)")
    ct = file.content_type or ""
    if ct not in ALLOWED_IMG:
        raise HTTPException(status_code=400, detail="Format non supporté (JPEG, PNG, WEBP, GIF)")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "jpg").lower()
    path = f"{storage.APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    try:
        result = storage.put_object(path, data, ct)
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(status_code=502, detail="Échec de l'upload de l'image")
    await db.files.insert_one({
        "id": new_id(), "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ct, "size": result.get("size", len(data)), "owner_id": user["id"],
        "is_deleted": False, "created_at": now_iso(),
    })
    return {"url": f"/api/files/{result['path']}", "path": result["path"], "size": result.get("size", len(data))}


@api.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        content, ct = storage.get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return Response(content=content, media_type=record.get("content_type") or ct,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------------- CSV/Excel product import (P1) ----------------
IMPORT_COLUMNS = ["name", "category", "short_description", "description", "image",
                  "stock", "alert_threshold", "price_simple", "price_partner",
                  "price_pro", "price_enterprise", "shipping_fee", "sku"]


@api.get("/products/import/template")
async def import_template(user: dict = Depends(require_roles("MERCHANT"))):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(IMPORT_COLUMNS)
    w.writerow(["T-shirt coton", "Mode", "T-shirt 100% coton", "Description complète...",
                "https://exemple.com/image.jpg", 50, 5, 5000, 4500, 4000, 3500, 500, ""])
    data = ("\ufeff" + buf.getvalue()).encode("utf-8")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="modele-import-produits.csv"'})


@api.post("/products/import")
async def import_products(file: UploadFile = File(...), user: dict = Depends(require_roles("MERCHANT"))):
    settings = await get_settings()
    if not settings.get("csv_import_enabled", False):
        raise HTTPException(status_code=403, detail="L'import CSV est désactivé par l'administrateur.")
    shop = await _my_shop(user)
    if not shop or shop["status"] != "APPROVED":
        raise HTTPException(status_code=403, detail="Votre boutique doit être approuvée")
    raw = await file.read()
    rows = []
    fname = (file.filename or "").lower()
    try:
        if fname.endswith(".xlsx"):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True)
            ws = wb.active
            it = ws.iter_rows(values_only=True)
            headers = [str(h).strip() if h is not None else "" for h in next(it)]
            for r in it:
                rows.append({headers[i]: r[i] for i in range(min(len(headers), len(r)))})
        else:
            text = raw.decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(text)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier illisible : {e}")

    quota = shop.get("product_quota") or settings.get("default_product_quota", 0) or 0
    existing = await db.products.count_documents({"shop_id": shop["id"], "status": {"$ne": "DELETED"}})
    created, errors = 0, []

    def num(v, default=0.0):
        try:
            return float(str(v).replace(",", ".").strip())
        except Exception:
            return default

    for idx, row in enumerate(rows, start=2):
        name = str(row.get("name") or "").strip()
        if not name:
            errors.append({"row": idx, "message": "Nom manquant"})
            continue
        if quota > 0 and existing + created >= quota:
            errors.append({"row": idx, "message": "Quota de produits atteint"})
            continue
        try:
            stock = int(num(row.get("stock"), 0))
            doc = {
                "id": new_id(), "shop_id": shop["id"], "shop_name": shop["name"],
                "currency": shop["currency"], "currency_symbol": shop.get("currency_symbol", ""),
                "name": name, "short_description": str(row.get("short_description") or ""),
                "description": str(row.get("description") or ""), "image": str(row.get("image") or ""),
                "gallery": [], "category": str(row.get("category") or ""), "subcategory": "", "genre": "", "usage": "",
                "attributes": {}, "weight": 0, "dimensions": "", "sku": str(row.get("sku") or "") or gen_sku(),
                "stock": stock, "alert_threshold": int(num(row.get("alert_threshold"), 5)),
                "price_simple": num(row.get("price_simple")), "price_partner": num(row.get("price_partner")),
                "price_pro": num(row.get("price_pro")), "price_enterprise": num(row.get("price_enterprise")),
                "shipping_fee": num(row.get("shipping_fee")), "promo": {}, "variants": [],
                "status": "ACTIVE", "moderation_status": "PENDING", "moderation_reason": "",
                "views": 0, "sold": 0, "flagged": False,
                "initial_stock": stock, "created_at": now_iso(), "is_demo": False,
            }
            await db.products.insert_one(doc)
            created += 1
        except Exception as e:
            errors.append({"row": idx, "message": str(e)})
    await audit_log(user, "IMPORT_PRODUCTS", "shop", shop["id"], None, f"{created} produits importés")
    if created:
        await _notify_moderators("PRODUCT_MODERATION", "Produits importés à valider",
                                 f"{created} produit(s) importé(s) par {shop['name']} en attente de modération.", "/admin/products")
    return {"created": created, "errors": errors, "total": len(rows)}


@api.get("/features")
async def get_features(user: dict = Depends(get_current_user)):
    settings = await get_settings()
    return {"csv_import_enabled": bool(settings.get("csv_import_enabled", False))}


# ---------------- Checkout / Orders ----------------
async def _restore_stock(oi):
    """Restore stock (product and variant) when a checkout line fails mid-way."""
    if oi.get("variant_id"):
        await db.products.update_one(
            {"id": oi["product_id"], "variants.id": oi["variant_id"]},
            {"$inc": {"variants.$.stock": oi["qty"], "variants.$.sold": -oi["qty"],
                      "stock": oi["qty"], "sold": -oi["qty"]}},
        )
    else:
        await db.products.update_one({"id": oi["product_id"]},
                                     {"$inc": {"stock": oi["qty"], "sold": -oi["qty"]}})


@api.post("/orders")
async def checkout(req: CheckoutReq, user: dict = Depends(get_current_user)):
    if not req.items:
        raise HTTPException(status_code=400, detail="Panier vide")

    shops_items = {}
    for it in req.items:
        product = await db.products.find_one({"id": it.product_id, "status": "ACTIVE", "moderation_status": "APPROVED"})
        if not product:
            raise HTTPException(status_code=400, detail="Article indisponible")
        if it.qty < 1:
            raise HTTPException(status_code=400, detail="Quantité invalide")
        if (product.get("variants") or []) and not it.variant_id:
            raise HTTPException(status_code=400, detail=f"Veuillez choisir une variante pour {product['name']}")
        shops_items.setdefault(product["shop_id"], []).append((product, it.qty, it.variant_id))

    order_refs = []
    is_private = bool(req.private_client and (req.private_client.get("name") or "").strip())
    private_info = None
    if is_private:
        pc = req.private_client
        private_info = {"name": (pc.get("name") or "").strip(), "phone": pc.get("phone", ""),
                        "city": pc.get("city", ""), "address": pc.get("address", "")}

    wallet_budget = 0.0
    if req.use_wallet:
        bal = await wallet_balances(user["id"])
        wallet_budget = bal["total_available"]
        if req.wallet_amount is not None:
            wallet_budget = min(wallet_budget, max(0.0, float(req.wallet_amount)))

    settings = await get_settings()

    for shop_id, entries in shops_items.items():
        shop = await db.shops.find_one({"id": shop_id})
        if not shop or shop.get("suspended") or shop.get("status") != "APPROVED":
            raise HTTPException(status_code=400, detail="Boutique indisponible")
        buyer_type = await get_customer_type(shop_id, user["id"])
        if buyer_type == "SIMPLE":
            u = await db.users.find_one({"_id": ObjectId(user["id"])})
            if u and u.get("is_partner"):
                buyer_type = "PARTENAIRE"

        reseller_type = None
        if is_private:
            reseller_type = "PARTENAIRE" if buyer_type == "SIMPLE" else buyer_type
            ctype = "SIMPLE"  # facture au prix client simple
        else:
            ctype = buyer_type

        order_items = []
        total = 0.0
        total_bonus = 0.0
        total_margin = 0.0
        commission_accum = 0.0
        recette_accum = {}
        margin_accum = {}
        for product, qty, variant_id in entries:
            variant_label = ""
            item_image = product.get("image", "")
            eff = product
            if variant_id:
                variant = next((v for v in (product.get("variants") or []) if v.get("id") == variant_id), None)
                if not variant:
                    for oi in order_items:
                        await _restore_stock(oi)
                    raise HTTPException(status_code=400, detail=f"Variante introuvable pour {product['name']}")
                eff = {**product}
                for pk in ("price_simple", "price_partner", "price_pro", "price_enterprise"):
                    eff[pk] = float(variant.get(pk, product.get(pk, 0)))
                variant_label = variant.get("label", "")
                item_image = variant.get("image") or product.get("image", "")
                updated = await db.products.find_one_and_update(
                    {"id": product["id"], "variants.id": variant_id, "variants.stock": {"$gte": qty}},
                    {"$inc": {"variants.$.stock": -qty, "variants.$.sold": qty, "stock": -qty, "sold": qty}},
                )
            else:
                updated = await db.products.find_one_and_update(
                    {"id": product["id"], "stock": {"$gte": qty}},
                    {"$inc": {"stock": -qty, "sold": qty}},
                )
            if not updated:
                for oi in order_items:
                    await _restore_stock(oi)
                raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {product['name']}")

            comm_rate = resolve_commission_rate(shop, product.get("category", ""), settings)
            if is_private:
                mg = compute_margin(eff, shop, reseller_type, qty)
                total += mg["line_total"]
                total_margin += mg["margin"]
                commission_accum += comm_rate * mg["line_total"]
                if mg["margin"] > 0 and mg["margin_wallet"]:
                    margin_accum[mg["margin_wallet"]] = margin_accum.get(mg["margin_wallet"], 0) + mg["margin"]
                order_items.append({
                    "product_id": product["id"], "name": product["name"], "image": item_image,
                    "variant_id": variant_id, "variant_label": variant_label,
                    "qty": qty, "unit_price": mg["unit_charged"], "line_total": mg["line_total"],
                    "bonus": 0, "recette": 0, "margin": mg["margin"],
                })
            else:
                fin = compute_line(eff, shop, ctype, qty)
                if fin["is_promo"]:
                    await db.products.update_one({"id": product["id"]}, {"$inc": {"promo.promo_sold": qty}})
                total += fin["line_total"]
                total_bonus += fin["bonus"]
                commission_accum += comm_rate * fin["line_total"]
                if fin["recette"] > 0 and fin["recette_wallet"]:
                    recette_accum[fin["recette_wallet"]] = recette_accum.get(fin["recette_wallet"], 0) + fin["recette"]
                order_items.append({
                    "product_id": product["id"], "name": product["name"], "image": item_image,
                    "variant_id": variant_id, "variant_label": variant_label,
                    "qty": qty, "unit_price": fin["unit_charged"], "line_total": fin["line_total"],
                    "bonus": fin["bonus"], "recette": fin["recette"], "margin": 0,
                })

        commission = round(commission_accum, 2)
        effective_comm_rate = round(commission / total, 4) if total > 0 else 0.0
        shipping = sum(float(p.get("shipping_fee", 0)) * q for p, q, _ in entries)
        grand_total = round(total + shipping, 2)
        wallet_applied = 0.0
        if wallet_budget > 0:
            wallet_applied = round(min(wallet_budget, grand_total), 2)
            wallet_budget = round(wallet_budget - wallet_applied, 2)
        provider_amount = round(grand_total - wallet_applied, 2)
        provider = shop.get("payment_provider") or "MONITY_WORLD"
        payment = await process_payment(provider, provider_amount, shop["currency"])
        order = {
            "id": new_id(), "ref": gen_order_ref(), "tracking_number": gen_tracking(),
            "customer_id": user["id"], "customer_name": user["name"], "customer_type": ctype,
            "reseller_type": reseller_type, "shop_id": shop_id, "shop_name": shop["name"],
            "items": order_items, "subtotal": round(total, 2), "shipping": round(shipping, 2),
            "total": grand_total, "currency": shop["currency"], "currency_symbol": shop.get("currency_symbol", ""),
            "status": "NOUVELLE", "payment_method": req.payment_method, "payment_provider": provider,
            "payment_status": payment["status"], "wallet_paid": wallet_applied, "provider_paid": provider_amount,
            "address": req.address, "bonus_total": round(total_bonus, 2), "margin_total": round(total_margin, 2),
            "commission": commission, "commission_rate": effective_comm_rate,
            "is_private": is_private, "private_client": private_info,
            "delivered_confirmed": False, "received_by": None,
            "status_history": [{"status": "NOUVELLE", "at": now_iso(), "by": user["id"]}],
            "created_at": now_iso(),
        }
        await db.orders.insert_one(order)
        order_refs.append(order["ref"])

        if wallet_applied > 0:
            await add_wallet_tx(user["id"], "general", wallet_applied, shop["currency"], "WITHDRAWAL",
                                "WITHDRAWN", f"Paiement commande {order['ref']} avec le solde", shop_id, order["id"])

        await db.shop_customers.update_one(
            {"shop_id": shop_id, "user_id": user["id"]},
            {"$setOnInsert": {"created_at": now_iso()},
             "$set": {"type": reseller_type if is_private else buyer_type},
             "$inc": {"orders_count": 1, "total_spent": grand_total}},
            upsert=True,
        )

        if is_private:
            # Promote a SIMPLE buyer to PARTENAIRE globally on first resale
            if buyer_type == "SIMPLE":
                await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"is_partner": True}})
            for wallet, amt in margin_accum.items():
                await add_wallet_tx(user["id"], wallet, amt, shop["currency"], "PENDING", "PENDING",
                                    f"Marge revendeur commande {order['ref']}", shop_id, order["id"])
        else:
            if total_bonus > 0:
                await add_wallet_tx(user["id"], "bonus_promo", total_bonus, shop["currency"], "PENDING",
                                    "PENDING", f"Bonus promotionnel commande {order['ref']}", shop_id, order["id"])
            for wallet, amt in recette_accum.items():
                await add_wallet_tx(user["id"], wallet, amt, shop["currency"], "PENDING", "PENDING",
                                    f"Recette commande {order['ref']}", shop_id, order["id"])

        await notify(shop["owner_id"], "NEW_ORDER", "Nouvelle commande",
                     f"Commande {order['ref']} reçue ({grand_total} {shop['currency']}).")

    return {"message": "Commande passée avec succès", "orders": order_refs}


@api.get("/orders/mine")
async def my_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"customer_id": user["id"]}).sort("created_at", -1).to_list(200)
    return {"orders": [serialize(o) for o in orders]}


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    shop = await db.shops.find_one({"id": order["shop_id"]})
    if order["customer_id"] != user["id"] and (not shop or shop["owner_id"] != user["id"]) and user["role"] not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    return {"order": serialize(order)}


@api.get("/shops/{shop_id}/orders")
async def shop_orders(shop_id: str, status: Optional[str] = None, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    query = {"shop_id": shop_id}
    if status:
        query["status"] = status
    orders = await db.orders.find(query).sort("created_at", -1).to_list(300)
    return {"orders": [serialize(o) for o in orders]}


ALLOWED_TRANSITIONS = {
    "NOUVELLE": ["APPROUVEE", "REJETEE", "ANNULEE", "EN_ATTENTE"],
    "EN_ATTENTE": ["APPROUVEE", "REJETEE", "ANNULEE"],
    "APPROUVEE": ["EN_PREPARATION", "ANNULEE"],
    "EN_PREPARATION": ["PRETE", "ANNULEE"],
    "PRETE": ["EXPEDIEE", "ANNULEE"],
    "EXPEDIEE": ["LIVREE"],
    "LIVREE": ["REMBOURSEE", "PARTIELLEMENT_REMBOURSEE"],
    "REJETEE": [],
    "ANNULEE": [],
}


@api.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, req: OrderStatusReq, user: dict = Depends(require_roles("MERCHANT"))):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    shop = await db.shops.find_one({"id": order["shop_id"]})
    if not shop or shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    new_status = req.status
    if new_status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    if new_status not in ALLOWED_TRANSITIONS.get(order["status"], []):
        raise HTTPException(status_code=400, detail=f"Transition non autorisée: {order['status']} -> {new_status}")

    await db.orders.update_one({"id": order_id}, {
        "$set": {"status": new_status},
        "$push": {"status_history": {"status": new_status, "at": now_iso(), "by": user["id"]}},
    })
    await audit_log(user, "ORDER_STATUS", "order", order_id, order["status"], new_status)

    if new_status == "EXPEDIEE" and not order.get("shipped_at"):
        shipped = datetime.now(timezone.utc)
        delay = 5
        if order.get("carrier_id"):
            c = await db.carriers.find_one({"id": order["carrier_id"]})
            if c:
                delay = int(c.get("delay_days", 5) or 5)
        expected = (shipped + timedelta(days=delay)).isoformat()
        await db.orders.update_one({"id": order_id}, {"$set": {"shipped_at": shipped.isoformat(), "expected_delivery": expected}})

    if new_status in ("ANNULEE", "REJETEE"):
        for it in order["items"]:
            await db.products.update_one({"id": it["product_id"]},
                                         {"$inc": {"stock": it["qty"], "sold": -it["qty"]}})
        await db.wallet_transactions.delete_many(
            {"order_id": order_id, "status": {"$in": ["PENDING", "AWAITING_VALIDATION"]}})

    if new_status == "LIVREE":
        # Client earnings become validatable by an admin (they do NOT auto-become available).
        pending = await db.wallet_transactions.find({"order_id": order_id, "status": "PENDING"}).to_list(100)
        for tx in pending:
            await db.wallet_transactions.update_one(
                {"id": tx["id"]},
                {"$set": {"status": "AWAITING_VALIDATION", "kind": "AWAITING_VALIDATION", "delivered_at": now_iso()}})
        await _credit_seller_payout(order, shop)

    await notify(order["customer_id"], "ORDER_UPDATE", "Mise à jour commande",
                 f"Commande {order['ref']} : {new_status}.")
    return {"message": "Statut mis à jour", "status": new_status}


# ---------------- Module 4: Finance (payouts, invoices, accounting export) ----------------
async def _credit_seller_payout(order: dict, shop: dict):
    # Atomically claim the payout so it can never be credited twice.
    claimed = await db.orders.find_one_and_update(
        {"id": order["id"], "payout_done": {"$ne": True}},
        {"$set": {"payout_done": True}},
    )
    if not claimed:
        return
    gross = float(order.get("subtotal", 0) or 0)
    commission = float(order.get("commission", 0) or 0)
    net = round(gross - commission, 2)
    owner = shop["owner_id"]
    await add_wallet_tx(owner, "seller_payout", net, order["currency"], "CREDIT", "AVAILABLE",
                        f"Reversement commande {order['ref']} (net après commission)", order["shop_id"], order["id"])
    await db.payouts.insert_one({
        "id": new_id(), "order_id": order["id"], "order_ref": order["ref"], "shop_id": order["shop_id"],
        "shop_name": order.get("shop_name", ""), "merchant_id": owner, "gross": round(gross, 2),
        "commission": round(commission, 2), "net": net, "currency": order["currency"],
        "status": "AVAILABLE", "created_at": now_iso(),
    })
    await notify(owner, "PAYOUT", "Reversement crédité",
                 f"{net} {order['currency']} crédités pour la commande {order['ref']}.", "/merchant/finance")


async def _order_or_404(order_id: str) -> dict:
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order


@api.get("/orders/{order_id}/invoice")
async def order_invoice_pdf(order_id: str, user: dict = Depends(get_current_user)):
    order = await _order_or_404(order_id)
    shop = await db.shops.find_one({"id": order["shop_id"]})
    allowed = (user["id"] == order.get("customer_id") or (shop and shop.get("owner_id") == user["id"])
               or rbac.is_staff(user))
    if not allowed:
        raise HTTPException(status_code=403, detail="Accès refusé")
    pdf = finance.build_invoice_pdf(order, shop or {})
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="Facture-{order["ref"]}.pdf"'})


@api.get("/merchant/payouts")
async def merchant_payouts(user: dict = Depends(require_roles("MERCHANT"))):
    rows = await db.payouts.find({"merchant_id": user["id"]}).sort("created_at", -1).to_list(500)
    total_net = sum(float(r.get("net", 0)) for r in rows)
    total_comm = sum(float(r.get("commission", 0)) for r in rows)
    bal = await wallet_balances(user["id"])
    return {"payouts": [serialize(r) for r in rows], "total_net": round(total_net, 2),
            "total_commission": round(total_comm, 2),
            "available": bal["wallets"].get("seller_payout", {}).get("available", 0.0)}


@api.get("/admin/payouts")
async def admin_payouts(shop_id: Optional[str] = None, user: dict = Depends(require_module("finance"))):
    query = {"shop_id": shop_id} if shop_id else {}
    rows = await db.payouts.find(query).sort("created_at", -1).to_list(1000)
    total_gross = sum(float(r.get("gross", 0)) for r in rows)
    total_commission = sum(float(r.get("commission", 0)) for r in rows)
    total_net = sum(float(r.get("net", 0)) for r in rows)
    return {"payouts": [serialize(r) for r in rows],
            "summary": {"gross": round(total_gross, 2), "commission": round(total_commission, 2),
                        "net": round(total_net, 2), "count": len(rows)}}


@api.get("/admin/export/accounting")
async def export_accounting(format: str = "csv", status: Optional[str] = None,
                            user: dict = Depends(require_module("finance"))):
    query = {} if not status else {"status": status}
    orders = await db.orders.find(query).sort("created_at", -1).to_list(5000)
    rows = finance.accounting_rows(orders)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    if format == "xlsx":
        data = finance.build_xlsx(rows)
        return StreamingResponse(io.BytesIO(data),
                                 media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 headers={"Content-Disposition": f'attachment; filename="comptabilite-{stamp}.xlsx"'})
    data = finance.build_csv(rows)
    return StreamingResponse(io.BytesIO(data), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="comptabilite-{stamp}.csv"'})


# ---------------- Reporting (Module 8) ----------------
def _reporting_range(date_from: Optional[str], date_to: Optional[str]):
    """Return (date_from, date_to) as YYYY-MM-DD strings, defaulting to the current month."""
    today = datetime.now(timezone.utc).date()
    if not date_to:
        date_to = today.isoformat()
    if not date_from:
        date_from = today.replace(day=1).isoformat()
    return date_from[:10], date_to[:10]


def _compute_reporting(orders, date_from: str, date_to: str):
    def in_range(o):
        d = (o.get("created_at") or "")[:10]
        return date_from <= d <= date_to

    scoped = [o for o in orders if in_range(o)]
    valid = [o for o in scoped if o["status"] not in ("ANNULEE", "REJETEE")]

    by_cur = {}
    for o in valid:
        cur = o.get("currency", "") or ""
        c = by_cur.setdefault(cur, {"currency": cur, "ca": 0.0, "commission": 0.0,
                                    "net": 0.0, "orders": 0, "items": 0})
        comm = float(o.get("commission", 0) or 0)
        c["ca"] += float(o.get("total", 0) or 0)
        c["commission"] += comm
        c["net"] += float(o.get("subtotal", 0) or 0) - comm
        c["orders"] += 1
        c["items"] += sum(int(i.get("qty", 0) or 0) for i in o.get("items", []))
    kpi_by_currency = []
    for c in by_cur.values():
        c["ca"] = round(c["ca"], 2)
        c["commission"] = round(c["commission"], 2)
        c["net"] = round(c["net"], 2)
        c["avg_basket"] = round(c["ca"] / c["orders"], 2) if c["orders"] else 0
        kpi_by_currency.append(c)
    kpi_by_currency.sort(key=lambda x: x["ca"], reverse=True)

    shops = {}
    for o in valid:
        sid = o.get("shop_id")
        s = shops.setdefault(sid, {"shop_id": sid, "shop_name": o.get("shop_name", "—"),
                                   "currency": o.get("currency", ""), "ca": 0.0,
                                   "commission": 0.0, "orders": 0})
        s["ca"] += float(o.get("total", 0) or 0)
        s["commission"] += float(o.get("commission", 0) or 0)
        s["orders"] += 1
    top_shops = sorted(shops.values(), key=lambda x: x["ca"], reverse=True)[:10]
    for s in top_shops:
        s["ca"] = round(s["ca"], 2)
        s["commission"] = round(s["commission"], 2)

    prods = {}
    for o in valid:
        cur = o.get("currency", "")
        for i in o.get("items", []):
            pid = i.get("product_id") or i.get("name")
            p = prods.setdefault(pid, {"product_id": pid, "name": i.get("name", "—"),
                                       "shop_name": o.get("shop_name", "—"), "currency": cur,
                                       "qty": 0, "revenue": 0.0})
            p["qty"] += int(i.get("qty", 0) or 0)
            p["revenue"] += float(i.get("line_total", 0) or 0)
    top_products = sorted(prods.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    for p in top_products:
        p["revenue"] = round(p["revenue"], 2)

    status_breakdown = {}
    for o in scoped:
        status_breakdown[o["status"]] = status_breakdown.get(o["status"], 0) + 1

    # Time series: daily if span <= 62 days, else monthly
    d0 = datetime.fromisoformat(date_from).date()
    d1 = datetime.fromisoformat(date_to).date()
    series = []
    if d1 >= d0:
        span = (d1 - d0).days
        if span <= 62:
            cur = d0
            while cur <= d1:
                ds = cur.isoformat()
                day_orders = [o for o in valid if (o.get("created_at") or "")[:10] == ds]
                series.append({"label": ds[5:], "revenue": round(sum(float(o.get("total", 0) or 0) for o in day_orders), 2),
                               "orders": len(day_orders)})
                cur += timedelta(days=1)
        else:
            buckets = {}
            for o in valid:
                key = (o.get("created_at") or "")[:7]
                if date_from[:7] <= key <= date_to[:7]:
                    b = buckets.setdefault(key, {"label": key, "revenue": 0.0, "orders": 0})
                    b["revenue"] += float(o.get("total", 0) or 0)
                    b["orders"] += 1
            for b in sorted(buckets.values(), key=lambda x: x["label"]):
                b["revenue"] = round(b["revenue"], 2)
                series.append(b)

    return {
        "date_from": date_from, "date_to": date_to,
        "kpi_by_currency": kpi_by_currency,
        "orders_total": len(scoped), "valid_orders": len(valid),
        "top_shops": top_shops, "top_products": top_products,
        "status_breakdown": status_breakdown, "series": series,
    }


def _detect_anomalies(orders, date_from: str, date_to: str, settings: dict):
    def in_range(o):
        d = (o.get("created_at") or "")[:10]
        return date_from <= d <= date_to

    scoped = [o for o in orders if in_range(o)]
    anomalies = []
    sigma = float(settings.get("fraud_basket_sigma", 3.0) or 3.0)
    cancel_rate_th = float(settings.get("fraud_cancel_rate", 0.30) or 0.30)
    cust_cancel_th = int(settings.get("fraud_customer_cancels", 3) or 3)
    refund_count_th = int(settings.get("fraud_refund_count", 3) or 3)

    valid = [o for o in scoped if o["status"] not in ("ANNULEE", "REJETEE")]
    cancelled = [o for o in scoped if o["status"] in ("ANNULEE", "REJETEE")]
    refunded = [o for o in scoped if o["status"] in ("REMBOURSEE", "PARTIELLEMENT_REMBOURSEE")]

    # 1) Abnormal baskets per currency (total > mean + sigma*std, guarded)
    by_cur = {}
    for o in valid:
        by_cur.setdefault(o.get("currency", ""), []).append(o)
    for cur, os_ in by_cur.items():
        totals = [float(o.get("total", 0) or 0) for o in os_]
        n = len(totals)
        if n < 3:
            continue
        mean = sum(totals) / n
        std = math.sqrt(sum((t - mean) ** 2 for t in totals) / n)
        if std <= 0:
            continue
        threshold = mean + sigma * std
        for o in os_:
            t = float(o.get("total", 0) or 0)
            if t > threshold and t > 1.5 * mean:
                anomalies.append({
                    "type": "abnormal_basket", "severity": "medium",
                    "title": "Panier anormalement élevé",
                    "message": f"Commande {o.get('ref')} de {o.get('customer_name', '?')} — {round(t)} {cur} (moyenne {round(mean)} {cur}).",
                    "ref": o.get("ref"), "shop_name": o.get("shop_name"),
                    "currency": cur, "amount": round(t, 2),
                })

    # 2) Cancellation spikes (global + per shop)
    total_orders = len(scoped)
    if total_orders >= 5:
        rate = len(cancelled) / total_orders
        if rate >= cancel_rate_th:
            anomalies.append({
                "type": "cancel_spike", "severity": "high",
                "title": "Pic d'annulations global",
                "message": f"{len(cancelled)}/{total_orders} commandes annulées/rejetées ({round(rate * 100)}%) — seuil {round(cancel_rate_th * 100)}%.",
            })
    shop_stats = {}
    for o in scoped:
        s = shop_stats.setdefault(o.get("shop_id"), {"name": o.get("shop_name", "—"), "total": 0, "cancel": 0})
        s["total"] += 1
        if o["status"] in ("ANNULEE", "REJETEE"):
            s["cancel"] += 1
    for s in shop_stats.values():
        if s["total"] >= 5:
            rate = s["cancel"] / s["total"]
            if rate >= cancel_rate_th:
                anomalies.append({
                    "type": "cancel_spike_shop", "severity": "high",
                    "title": "Pic d'annulations — boutique",
                    "message": f"{s['name']} : {s['cancel']}/{s['total']} annulées ({round(rate * 100)}%).",
                    "shop_name": s["name"],
                })

    # 3) Suspicious customers (repeated cancellations/rejections)
    cust = {}
    for o in cancelled:
        c = cust.setdefault(o.get("customer_id"), {"name": o.get("customer_name", "?"), "count": 0})
        c["count"] += 1
    for c in cust.values():
        if c["count"] >= cust_cancel_th:
            anomalies.append({
                "type": "suspicious_customer", "severity": "medium",
                "title": "Client à surveiller",
                "message": f"{c['name']} a {c['count']} commandes annulées/rejetées sur la période (seuil {cust_cancel_th}).",
            })

    # 4) Refund spike
    if len(refunded) >= refund_count_th:
        anomalies.append({
            "type": "refund_spike", "severity": "high",
            "title": "Pic de remboursements",
            "message": f"{len(refunded)} commandes remboursées / partiellement remboursées sur la période (seuil {refund_count_th}).",
        })

    sev_order = {"high": 0, "medium": 1, "low": 2}
    anomalies.sort(key=lambda a: sev_order.get(a["severity"], 3))
    return anomalies


@api.get("/admin/reporting")
async def admin_reporting(date_from: Optional[str] = None, date_to: Optional[str] = None,
                          user: dict = Depends(require_module("reporting"))):
    date_from, date_to = _reporting_range(date_from, date_to)
    orders = await db.orders.find({}).to_list(10000)
    settings = await get_settings()
    rep = _compute_reporting(orders, date_from, date_to)
    rep["anomalies"] = _detect_anomalies(orders, date_from, date_to, settings)
    return rep


@api.get("/admin/reporting/export")
async def admin_reporting_export(date_from: Optional[str] = None, date_to: Optional[str] = None,
                                 user: dict = Depends(require_module("reporting"))):
    date_from, date_to = _reporting_range(date_from, date_to)
    orders = await db.orders.find({}).to_list(10000)
    rep = _compute_reporting(orders, date_from, date_to)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow([f"Rapport de ventes AfriMarket — du {date_from} au {date_to}"])
    w.writerow([])
    w.writerow(["Chiffre d'affaires par devise"])
    w.writerow(["Devise", "CA", "Commission", "Net vendeurs", "Commandes", "Articles", "Panier moyen"])
    for c in rep["kpi_by_currency"]:
        w.writerow([c["currency"], c["ca"], c["commission"], c["net"], c["orders"], c["items"], c["avg_basket"]])
    w.writerow([])
    w.writerow(["Top boutiques / vendeurs"])
    w.writerow(["Boutique", "Devise", "CA", "Commission", "Commandes"])
    for s in rep["top_shops"]:
        w.writerow([s["shop_name"], s["currency"], s["ca"], s["commission"], s["orders"]])
    w.writerow([])
    w.writerow(["Top produits"])
    w.writerow(["Produit", "Boutique", "Devise", "Quantité vendue", "CA généré"])
    for p in rep["top_products"]:
        w.writerow([p["name"], p["shop_name"], p["currency"], p["qty"], p["revenue"]])
    w.writerow([])
    w.writerow(["Commandes par statut"])
    for st, n in rep["status_breakdown"].items():
        w.writerow([st, n])
    data = ("\ufeff" + buf.getvalue()).encode("utf-8")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="rapport-ventes-{stamp}.csv"'})


# ---------------- Customers (merchant) ----------------
@api.get("/shops/{shop_id}/customers")
async def shop_customers(shop_id: str, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    recs = await db.shop_customers.find({"shop_id": shop_id}).to_list(500)
    result = []
    for r in recs:
        u = await db.users.find_one({"_id": ObjectId(r["user_id"])}) if oid(r["user_id"]) else None
        result.append({**serialize(r),
                       "name": u["name"] if u else "?", "email": u["email"] if u else "",
                       "phone": u.get("phone", "") if u else ""})
    return {"customers": result}


@api.put("/shops/{shop_id}/customers/{user_id}/type")
async def set_customer_type(shop_id: str, user_id: str, req: CustomerTypeReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if req.type not in CUSTOMER_TYPES:
        raise HTTPException(status_code=400, detail="Type invalide")
    rec = await db.shop_customers.find_one({"shop_id": shop_id, "user_id": user_id})
    await db.shop_customers.update_one({"shop_id": shop_id, "user_id": user_id},
                                       {"$set": {"type": req.type}}, upsert=True)
    await audit_log(user, "CUSTOMER_TYPE", "customer", user_id, rec.get("type") if rec else None, req.type)
    await notify(user_id, "CUSTOMER_TYPE", "Statut client mis à jour",
                 f"Votre statut chez {shop['name']} est désormais {req.type}.")
    return {"message": "Type client mis à jour"}


# ---------------- Wallet & Withdrawals ----------------
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    bal = await wallet_balances(user["id"])
    txs = await db.wallet_transactions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return {**bal, "transactions": [serialize(t) for t in txs]}


@api.post("/withdrawals")
async def request_withdrawal(req: WithdrawReq, user: dict = Depends(get_current_user)):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    bal = await wallet_balances(user["id"])
    if req.amount > bal["total_available"]:
        raise HTTPException(status_code=400, detail="Solde disponible insuffisant")
    dup = await db.withdrawal_requests.find_one({
        "user_id": user["id"], "amount": round(req.amount, 2),
        "status": {"$in": ["DEMANDE", "EN_VERIFICATION", "APPROUVE"]},
    })
    if dup:
        raise HTTPException(status_code=400, detail="Une demande identique est déjà en cours")
    doc = {
        "id": new_id(), "user_id": user["id"], "user_name": user["name"],
        "amount": round(req.amount, 2), "currency": user.get("currency", ""),
        "method": req.method, "destination": req.destination,
        "bank_name": req.bank_name or "", "account_name": req.account_name or "",
        "reference": "", "status": "DEMANDE", "debited": False, "created_at": now_iso(),
    }
    await db.withdrawal_requests.insert_one(doc)
    await audit_log(user, "WITHDRAW_REQUEST", "withdrawal", doc["id"], None, doc["amount"])
    async for a in db.users.find({"role": {"$in": ["SUPER_ADMIN", "ADMIN"]}}):
        await notify(str(a["_id"]), "WITHDRAWAL", "Demande de retrait",
                     f"{user['name']} demande un retrait de {doc['amount']} {doc['currency']}.")
    return {"message": "Demande de retrait enregistrée", "withdrawal": serialize(doc)}


@api.get("/withdrawals/mine")
async def my_withdrawals(user: dict = Depends(get_current_user)):
    ws = await db.withdrawal_requests.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return {"withdrawals": [serialize(w) for w in ws]}


# ---------------- Notifications ----------------
@api.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    unread = sum(1 for n in notifs if not n.get("read"))
    return {"notifications": [serialize(n) for n in notifs], "unread": unread}


@api.put("/notifications/{notif_id}/read")
async def read_notification(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


@api.put("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


# ---------------- Merchant stats ----------------
@api.get("/shops/{shop_id}/stats")
async def shop_stats(shop_id: str, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    orders = await db.orders.find({"shop_id": shop_id}).to_list(2000)
    today = datetime.now(timezone.utc).date().isoformat()
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    valid_orders = [o for o in orders if o["status"] not in ("ANNULEE", "REJETEE")]
    revenue_today = sum(o["total"] for o in valid_orders if o["created_at"][:10] == today)
    revenue_month = sum(o["total"] for o in valid_orders if o["created_at"][:7] == month)
    ca_total = sum(o["total"] for o in valid_orders)
    n_tx = len(valid_orders)
    avg_basket = round(ca_total / n_tx, 2) if n_tx else 0
    total_items = sum(sum(i["qty"] for i in o["items"]) for o in valid_orders)
    idv = round(total_items / n_tx, 2) if n_tx else 0
    pending = sum(1 for o in orders if o["status"] in ("NOUVELLE", "EN_ATTENTE"))
    in_progress = sum(1 for o in orders if o["status"] in ("APPROUVEE", "EN_PREPARATION", "PRETE", "EXPEDIEE"))

    products = await db.products.find({"shop_id": shop_id, "status": "ACTIVE"}).to_list(500)
    out_of_stock = [serialize(p) for p in products if p.get("stock", 0) == 0]
    low_stock = [serialize(p) for p in products if 0 < p.get("stock", 0) <= p.get("alert_threshold", 5)]
    top = sorted(products, key=lambda p: p.get("sold", 0), reverse=True)[:5]
    flop = sorted([p for p in products if p.get("sold", 0) == 0], key=lambda p: p.get("stock", 0), reverse=True)[:5]
    n_customers = await db.shop_customers.count_documents({"shop_id": shop_id})

    series = []
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc).date() - timedelta(days=i)).isoformat()
        val = sum(o["total"] for o in valid_orders if o["created_at"][:10] == d)
        series.append({"date": d[5:], "revenue": round(val, 2)})

    return {
        "currency": shop["currency"], "currency_symbol": shop.get("currency_symbol", ""),
        "revenue_today": round(revenue_today, 2), "revenue_month": round(revenue_month, 2),
        "ca_total": round(ca_total, 2), "avg_basket": avg_basket, "idv": idv,
        "orders_pending": pending, "orders_in_progress": in_progress, "orders_total": len(orders),
        "out_of_stock": out_of_stock, "low_stock": low_stock,
        "top_sellers": [serialize(p) for p in top], "flop_sellers": [serialize(p) for p in flop],
        "n_customers": n_customers, "series": series,
    }


# ---------------- Admin ----------------
@api.get("/admin/overview")
async def admin_overview(user: dict = Depends(require_module("overview"))):
    total_users = await db.users.count_documents({})
    clients = await db.users.count_documents({"role": "CLIENT"})
    merchants = await db.users.count_documents({"role": "MERCHANT"})
    shops_total = await db.shops.count_documents({})
    shops_pending = await db.shops.count_documents({"status": {"$in": ["SUBMITTED", "UNDER_REVIEW"]}})
    shops_approved = await db.shops.count_documents({"status": "APPROVED"})
    products = await db.products.count_documents({"status": "ACTIVE"})
    orders = await db.orders.find({}).to_list(5000)
    valid = [o for o in orders if o["status"] not in ("ANNULEE", "REJETEE")]
    ca = sum(o["total"] for o in valid)
    commission_total = sum(float(o.get("commission", 0) or 0) for o in valid)
    by_shop = {}
    for o in valid:
        sid = o.get("shop_id")
        b = by_shop.setdefault(sid, {"shop_id": sid, "shop_name": o.get("shop_name", "—"),
                                     "commission": 0.0, "ca": 0.0, "currency": o.get("currency", "")})
        b["commission"] += float(o.get("commission", 0) or 0)
        b["ca"] += float(o.get("total", 0) or 0)
    commission_by_shop = sorted(by_shop.values(), key=lambda x: x["commission"], reverse=True)
    for b in commission_by_shop:
        b["commission"] = round(b["commission"], 2)
        b["ca"] = round(b["ca"], 2)
    withdrawals_pending = await db.withdrawal_requests.count_documents({"status": {"$in": ["DEMANDE", "EN_VERIFICATION"]}})
    txs = await db.wallet_transactions.find({}).to_list(5000)
    bonus_total = sum(t["amount"] for t in txs if t["wallet"] == "bonus_promo" and t["status"] in ("PENDING", "AVAILABLE"))
    recette_total = sum(t["amount"] for t in txs if t["wallet"].startswith("earning") and t["status"] in ("PENDING", "AVAILABLE"))
    approved_shops = await db.shops.find({"status": "APPROVED"}).to_list(500)
    all_shops = await db.shops.find({}).to_list(500)
    return {
        "total_users": total_users, "clients": clients, "merchants": merchants,
        "shops_total": shops_total, "shops_pending": shops_pending, "shops_approved": shops_approved,
        "products": products, "orders_total": len(orders), "ca_global": round(ca, 2),
        "commission_total": round(commission_total, 2),
        "commission_by_shop": commission_by_shop[:10],
        "withdrawals_pending": withdrawals_pending, "bonus_total": round(bonus_total, 2),
        "recette_total": round(recette_total, 2),
        "countries_active": len(set(s.get("country") for s in approved_shops)),
        "currencies_used": list(set(s.get("currency") for s in all_shops)),
    }


@api.get("/admin/shops")
async def admin_shops(status: Optional[str] = None, user: dict = Depends(require_module("shops"))):
    query = {}
    if status:
        query["status"] = status
    shops = await db.shops.find(query).sort("created_at", -1).to_list(500)
    result = []
    for s in shops:
        kyc = await db.merchant_verifications.find_one({"user_id": s["owner_id"]})
        item = serialize(s)
        item["kyc_status"] = kyc["status"] if kyc else "NONE"
        item["product_count"] = await db.products.count_documents({"shop_id": s["id"], "status": {"$ne": "DELETED"}})
        item["storage_used_mb"] = _mb(await _shop_storage_bytes(s["id"]))
        result.append(item)
    return {"shops": result}


@api.put("/admin/shops/{shop_id}/suspend")
async def suspend_shop(shop_id: str, req: SuspendReq, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    await db.shops.update_one({"id": shop_id}, {"$set": {"suspended": True, "suspension_reason": req.reason or ""}})
    await audit_log(user, "SUSPEND_SHOP", "shop", shop_id, False, True, _client_ip(request))
    await notify(shop["owner_id"], "SHOP_SUSPENDED", "Boutique suspendue",
                 f"Votre boutique {shop['name']} a été suspendue. {req.reason or ''}".strip())
    return {"message": "Boutique suspendue"}


@api.put("/admin/shops/{shop_id}/reactivate")
async def reactivate_shop(shop_id: str, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    await db.shops.update_one({"id": shop_id}, {"$set": {"suspended": False, "suspension_reason": ""}})
    await audit_log(user, "REACTIVATE_SHOP", "shop", shop_id, True, False, _client_ip(request))
    await notify(shop["owner_id"], "SHOP_REACTIVATED", "Boutique réactivée",
                 f"Votre boutique {shop['name']} est de nouveau active.")
    return {"message": "Boutique réactivée"}


@api.put("/admin/shops/{shop_id}/commission")
async def set_shop_commission(shop_id: str, req: ShopCommissionReq, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    rate = None if req.commission_rate is None else round(min(1.0, max(0.0, float(req.commission_rate))), 4)
    await db.shops.update_one({"id": shop_id}, {"$set": {"commission_rate": rate}})
    await audit_log(user, "SET_SHOP_COMMISSION", "shop", shop_id, shop.get("commission_rate"), rate, _client_ip(request))
    return {"message": "Commission mise à jour", "commission_rate": rate}


@api.put("/admin/shops/{shop_id}/quota")
async def set_shop_quota(shop_id: str, req: ShopQuotaReq, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    upd = {"product_quota": max(0, int(req.product_quota)), "storage_quota_mb": max(0, int(req.storage_quota_mb))}
    await db.shops.update_one({"id": shop_id}, {"$set": upd})
    await audit_log(user, "SET_SHOP_QUOTA", "shop", shop_id, shop.get("product_quota"), upd["product_quota"], _client_ip(request))
    return {"message": "Quota mis à jour", **upd}


@api.get("/admin/shops/{shop_id}")
async def admin_shop_detail(shop_id: str, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    kyc = await db.merchant_verifications.find_one({"user_id": shop["owner_id"]})
    kyc_out = serialize(kyc) if kyc else None
    shop_out = serialize(shop)
    shop_out["product_count"] = await db.products.count_documents({"shop_id": shop_id, "status": {"$ne": "DELETED"}})
    shop_out["storage_used_mb"] = _mb(await _shop_storage_bytes(shop_id))
    return {"shop": shop_out, "kyc": kyc_out}


@api.put("/admin/shops/{shop_id}/approve")
async def approve_shop(shop_id: str, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    if shop["status"] not in ("SUBMITTED", "UNDER_REVIEW"):
        raise HTTPException(status_code=400, detail="Seule une boutique soumise peut être approuvée")
    await db.shops.update_one({"id": shop_id}, {"$set": {"status": "APPROVED", "rejection_reason": ""}})
    await audit_log(user, "APPROVE_SHOP", "shop", shop_id, shop["status"], "APPROVED", _client_ip(request))
    await notify(shop["owner_id"], "SHOP_APPROVED", "Boutique approuvée",
                 f"Félicitations ! Votre boutique {shop['name']} est approuvée.")
    return {"message": "Boutique approuvée"}


@api.put("/admin/shops/{shop_id}/reject")
async def reject_shop(shop_id: str, payload: dict, request: Request, user: dict = Depends(require_module("shops"))):
    shop = await _shop_or_404(shop_id)
    if shop["status"] not in ("SUBMITTED", "UNDER_REVIEW"):
        raise HTTPException(status_code=400, detail="Seule une boutique soumise peut être rejetée")
    reason = payload.get("reason", "Non conforme")
    await db.shops.update_one({"id": shop_id}, {"$set": {"status": "REJECTED", "rejection_reason": reason}})
    await audit_log(user, "REJECT_SHOP", "shop", shop_id, shop["status"], "REJECTED", _client_ip(request))
    await notify(shop["owner_id"], "SHOP_REJECTED", "Boutique rejetée",
                 f"Votre boutique {shop['name']} a été rejetée : {reason}")
    return {"message": "Boutique rejetée"}


@api.put("/admin/kyc/{user_id}")
async def admin_verify_kyc(user_id: str, payload: dict, user: dict = Depends(require_module("shops"))):
    status = payload.get("status", "APPROUVE")
    if status not in ["EN_ATTENTE", "EN_VERIFICATION", "APPROUVE", "REJETE", "DOCUMENT_EXPIRE"]:
        raise HTTPException(status_code=400, detail="Statut invalide")
    await db.merchant_verifications.update_one({"user_id": user_id}, {"$set": {"status": status}})
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"kyc_status": status}})
    await audit_log(user, "VERIFY_KYC", "kyc", user_id, None, status)
    await notify(user_id, "KYC", "Vérification d'identité", f"Statut KYC : {status}")
    return {"message": "KYC mis à jour"}


@api.get("/admin/kyc/{user_id}/document")
async def admin_kyc_document(user_id: str, user: dict = Depends(require_module("shops"))):
    kyc = await db.merchant_verifications.find_one({"user_id": user_id})
    if not kyc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    await audit_log(user, "VIEW_KYC_DOC", "kyc", user_id, None, None)
    return {"file_data": kyc.get("file_data", ""), "doc_type": kyc.get("doc_type")}


@api.get("/admin/users")
async def admin_users(user: dict = Depends(require_module("users"))):
    users = await db.users.find({}).sort("created_at", -1).to_list(1000)
    return {"users": [_user_public(u) for u in users]}


@api.get("/admin/withdrawals")
async def admin_withdrawals(status: Optional[str] = None, user: dict = Depends(require_module("finance"))):
    query = {}
    if status:
        query["status"] = status
    ws = await db.withdrawal_requests.find(query).sort("created_at", -1).to_list(500)
    return {"withdrawals": [serialize(w) for w in ws]}


@api.put("/admin/withdrawals/{wid}")
async def admin_decide_withdrawal(wid: str, req: WithdrawDecisionReq, request: Request, user: dict = Depends(require_module("finance"))):
    w = await db.withdrawal_requests.find_one({"id": wid})
    if not w:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if w["status"] in ("TRAITE", "REFUSE", "ANNULE"):
        raise HTTPException(status_code=400, detail="Demande déjà clôturée")
    status = req.status
    if status not in ("APPROUVE", "REFUSE", "TRAITE", "EN_VERIFICATION"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    if status == "TRAITE" and not (req.reference or "").strip():
        raise HTTPException(status_code=400, detail="Justificatif (référence) obligatoire pour marquer TRAITE")

    # Double-validation: large withdrawals need a second admin's approval.
    settings = await get_settings()
    threshold = float(settings.get("refund_threshold", 100000.0))
    if status == "TRAITE" and float(w.get("amount", 0)) > threshold and not w.get("double_validated"):
        existing = await db.approval_requests.find_one(
            {"kind": "WITHDRAWAL", "target_id": wid, "status": "PENDING"})
        if not existing:
            await _create_approval(user, "WITHDRAWAL", wid, {
                "reference": req.reference, "amount": w["amount"], "currency": w["currency"],
                "user_id": w["user_id"],
            }, f"Retrait de {w['amount']} {w['currency']} > seuil {threshold}", request)
        await db.withdrawal_requests.update_one(
            {"id": wid}, {"$set": {"status": "EN_VERIFICATION", "reference": req.reference}})
        await audit_log(user, "WITHDRAWAL_NEEDS_2ND_APPROVAL", "withdrawal", wid, w["status"], "EN_VERIFICATION")
        return {"message": "Montant élevé : une seconde validation administrateur est requise.",
                "requires_double_validation": True}

    upd = {"status": status}
    if req.reference:
        upd["reference"] = req.reference
    await db.withdrawal_requests.update_one({"id": wid}, {"$set": upd})
    if status == "TRAITE" and not w.get("debited"):
        await add_wallet_tx(w["user_id"], "general", w["amount"], w["currency"], "WITHDRAWAL",
                            "WITHDRAWN", f"Retrait traité #{wid[:8]}", actor_id=user["id"])
        await db.withdrawal_requests.update_one({"id": wid}, {"$set": {"debited": True}})
    await audit_log(user, "WITHDRAWAL_DECISION", "withdrawal", wid, w["status"], status, _client_ip(request))
    await notify(w["user_id"], "WITHDRAWAL", "Retrait", f"Votre demande de retrait est : {status}")
    return {"message": "Décision enregistrée"}


@api.get("/admin/audit-logs")
async def admin_audit(user: dict = Depends(require_module("audit"))):
    logs = await db.audit_logs.find({}).sort("created_at", -1).to_list(300)
    return {"logs": [serialize(l) for l in logs]}


def _order_is_late(o: dict) -> bool:
    if o.get("delivered_confirmed") or o.get("status") in ("LIVREE", "ANNULEE", "REJETEE", "REMBOURSEE", "PARTIELLEMENT_REMBOURSEE"):
        return False
    exp = o.get("expected_delivery")
    if o.get("status") == "EXPEDIEE" and exp:
        return exp < now_iso()
    return False


@api.get("/admin/orders")
async def admin_orders(shop_id: Optional[str] = None, status: Optional[str] = None,
                       carrier_id: Optional[str] = None, date_from: Optional[str] = None,
                       date_to: Optional[str] = None, late: Optional[bool] = None,
                       user: dict = Depends(require_module("orders"))):
    query = {}
    if shop_id:
        query["shop_id"] = shop_id
    if status:
        query["status"] = status
    if carrier_id:
        query["carrier_id"] = carrier_id
    if date_from or date_to:
        query["created_at"] = {}
        if date_from:
            query["created_at"]["$gte"] = date_from
        if date_to:
            query["created_at"]["$lte"] = date_to + "T23:59:59"
    orders = await db.orders.find(query).sort("created_at", -1).to_list(1000)
    out = []
    late_count = 0
    for o in orders:
        item = serialize(o)
        item["is_late"] = _order_is_late(o)
        if item["is_late"]:
            late_count += 1
        out.append(item)
    if late:
        out = [o for o in out if o["is_late"]]
    return {"orders": out, "late_count": late_count, "total": len(orders)}


# ---------------- Module 5: Carriers (transporteurs modulaires) ----------------
@api.get("/carriers")
async def list_carriers(user: dict = Depends(get_current_user)):
    rows = await db.carriers.find({"active": True, "suspended": {"$ne": True}}).sort("name", 1).to_list(100)
    return {"carriers": [serialize(c) for c in rows]}


@api.get("/admin/carriers")
async def admin_list_carriers(user: dict = Depends(require_module("settings"))):
    rows = await db.carriers.find({}).sort("name", 1).to_list(100)
    return {"carriers": [serialize(c) for c in rows]}


@api.post("/admin/carriers")
async def create_carrier(req: CarrierReq, request: Request, user: dict = Depends(require_module("settings"))):
    doc = {"id": new_id(), **req.model_dump(), "suspended": False, "created_at": now_iso()}
    await db.carriers.insert_one(doc)
    await audit_log(user, "CREATE_CARRIER", "carrier", doc["id"], None, doc["name"], _client_ip(request))
    return {"carrier": serialize(doc)}


@api.put("/admin/carriers/{cid}")
async def update_carrier(cid: str, req: CarrierUpdateReq, request: Request, user: dict = Depends(require_module("settings"))):
    carrier = await db.carriers.find_one({"id": cid})
    if not carrier:
        raise HTTPException(status_code=404, detail="Transporteur introuvable")
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if upd:
        await db.carriers.update_one({"id": cid}, {"$set": upd})
    await audit_log(user, "UPDATE_CARRIER", "carrier", cid, None, upd, _client_ip(request))
    fresh = await db.carriers.find_one({"id": cid})
    return {"carrier": serialize(fresh)}


@api.delete("/admin/carriers/{cid}")
async def delete_carrier(cid: str, request: Request, user: dict = Depends(require_module("settings"))):
    res = await db.carriers.delete_one({"id": cid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transporteur introuvable")
    await audit_log(user, "DELETE_CARRIER", "carrier", cid, None, None, _client_ip(request))
    return {"message": "Transporteur supprimé"}


@api.put("/orders/{order_id}/shipping")
async def assign_shipping(order_id: str, req: ShippingReq, user: dict = Depends(require_roles("MERCHANT"))):
    order = await _order_or_404(order_id)
    shop = await db.shops.find_one({"id": order["shop_id"]})
    if not shop or shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    carrier = await db.carriers.find_one({"id": req.carrier_id})
    if not carrier or carrier.get("suspended") or not carrier.get("active", True):
        raise HTTPException(status_code=400, detail="Transporteur indisponible")
    upd = {"carrier_id": carrier["id"], "carrier_name": carrier["name"]}
    if req.tracking:
        upd["tracking_number"] = req.tracking
    await db.orders.update_one({"id": order_id}, {"$set": upd})
    await audit_log(user, "ASSIGN_CARRIER", "order", order_id, order.get("carrier_name"), carrier["name"])
    await notify(order["customer_id"], "ORDER_UPDATE", "Transporteur assigné",
                 f"Commande {order['ref']} confiée à {carrier['name']}. Suivi : {upd.get('tracking_number', order.get('tracking_number'))}")
    return {"message": "Transporteur assigné", **upd}


@api.get("/orders/{order_id}/label")
async def order_label_pdf(order_id: str, user: dict = Depends(get_current_user)):
    order = await _order_or_404(order_id)
    shop = await db.shops.find_one({"id": order["shop_id"]})
    if not (rbac.is_staff(user) or (shop and shop.get("owner_id") == user["id"])):
        raise HTTPException(status_code=403, detail="Accès refusé")
    carrier = await db.carriers.find_one({"id": order["carrier_id"]}) if order.get("carrier_id") else None
    pdf = finance.build_label(order, shop or {}, carrier or {})
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="Etiquette-{order["ref"]}.pdf"'})


# ---------------- Private clients (carnet) ----------------
@api.get("/private-clients")
async def list_private_clients(user: dict = Depends(get_current_user)):
    clients = await db.private_clients.find({"owner_id": user["id"]}).sort("created_at", -1).to_list(300)
    return {"clients": [serialize(c) for c in clients]}


@api.post("/private-clients")
async def create_private_client(req: PrivateClientReq, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "owner_id": user["id"], **req.model_dump(), "created_at": now_iso()}
    await db.private_clients.insert_one(doc)
    return {"client": serialize(doc)}


@api.delete("/private-clients/{cid}")
async def delete_private_client(cid: str, user: dict = Depends(get_current_user)):
    await db.private_clients.delete_one({"id": cid, "owner_id": user["id"]})
    return {"message": "Client supprimé"}


# ---------------- Order receipt scan / shipping label ----------------
@api.post("/orders/{order_id}/confirm-receipt")
async def confirm_receipt(order_id: str, req: ConfirmReceiptReq, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order["customer_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    code = (req.code or "").strip()
    if code != order.get("tracking_number") and code != order.get("ref"):
        raise HTTPException(status_code=400, detail="Code de suivi invalide")
    await db.orders.update_one({"id": order_id}, {"$set": {"delivered_confirmed": True, "received_by": user["id"], "received_at": now_iso()}})
    await audit_log(user, "CONFIRM_RECEIPT", "order", order_id, None, code)
    await notify(order["customer_id"], "ORDER_UPDATE", "Réception confirmée",
                 f"Réception de la commande {order['ref']} confirmée par scan.")
    return {"message": "Réception confirmée"}


# ---------------- Shop payment provider ----------------
@api.put("/shops/{shop_id}/payment")
async def update_payment_provider(shop_id: str, req: PaymentProviderReq, user: dict = Depends(require_roles("MERCHANT"))):
    shop = await _shop_or_404(shop_id)
    if shop["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.shops.update_one({"id": shop_id}, {"$set": {
        "payment_provider": req.provider or "MONITY_WORLD",
        "payment_config": {"api_key": req.api_key or "", "account": req.account or ""},
    }})
    await audit_log(user, "UPDATE_PAYMENT_PROVIDER", "shop", shop_id, shop.get("payment_provider"), req.provider)
    return {"message": "Fournisseur de paiement mis à jour"}


@api.post("/orders/confirm-by-tracking")
async def confirm_by_tracking(req: ConfirmByTrackingReq, user: dict = Depends(get_current_user)):
    code = (req.code or "").strip()
    order = await db.orders.find_one({"customer_id": user["id"],
                                      "$or": [{"tracking_number": code}, {"ref": code}]})
    if not order:
        raise HTTPException(status_code=404, detail="Aucune commande ne correspond à ce code")
    if order.get("delivered_confirmed"):
        return {"message": "Réception déjà confirmée", "ref": order["ref"]}
    await db.orders.update_one({"id": order["id"]}, {"$set": {"delivered_confirmed": True, "received_by": user["id"], "received_at": now_iso()}})
    await audit_log(user, "CONFIRM_RECEIPT", "order", order["id"], None, code)
    return {"message": "Réception confirmée", "ref": order["ref"]}


# ---------------- Module 3: Product moderation & reports (signalements) ----------------
@api.post("/products/{product_id}/report")
async def report_product(product_id: str, req: ProductReportReq, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Article introuvable")
    doc = {
        "id": new_id(), "product_id": product_id, "product_name": product.get("name"),
        "shop_id": product.get("shop_id"), "shop_name": product.get("shop_name"),
        "reporter_id": user["id"], "reporter_name": user.get("name"), "auto": False,
        "reason": req.reason, "comment": req.comment or "", "status": "OPEN",
        "created_at": now_iso(),
    }
    await db.product_reports.insert_one(doc)
    open_count = await db.product_reports.count_documents({"product_id": product_id, "status": "OPEN"})
    # Automatic escalation: flag the product once it accumulates enough open reports.
    if open_count >= 3 and not product.get("flagged"):
        await db.products.update_one({"id": product_id}, {"$set": {"flagged": True}})
        await db.product_reports.insert_one({
            "id": new_id(), "product_id": product_id, "product_name": product.get("name"),
            "shop_id": product.get("shop_id"), "shop_name": product.get("shop_name"),
            "reporter_id": None, "reporter_name": "Système", "auto": True,
            "reason": "SEUIL_SIGNALEMENTS", "comment": f"{open_count} signalements ouverts", "status": "OPEN",
            "created_at": now_iso(),
        })
        await _notify_moderators("PRODUCT_REPORT", "Produit signalé (automatique)",
                                 f"Le produit « {product.get('name')} » a atteint {open_count} signalements.", "/admin/reports")
    else:
        await _notify_moderators("PRODUCT_REPORT", "Nouveau signalement",
                                 f"Signalement sur « {product.get('name')} » : {req.reason}", "/admin/reports")
    return {"message": "Signalement enregistré. Merci."}


@api.get("/admin/products")
async def admin_products(status: Optional[str] = None, flagged: Optional[bool] = None,
                         user: dict = Depends(require_module("products"))):
    query = {"status": {"$ne": "DELETED"}}
    if status:
        query["moderation_status"] = status
    if flagged is not None:
        query["flagged"] = flagged
    products = await db.products.find(query).sort("created_at", -1).to_list(500)
    out = []
    for p in products:
        item = serialize(p)
        item["report_count"] = await db.product_reports.count_documents({"product_id": p["id"], "status": "OPEN"})
        out.append(item)
    return {"products": out}


@api.put("/admin/products/{product_id}/moderate")
async def moderate_product(product_id: str, req: ProductModerateReq, request: Request,
                           user: dict = Depends(require_module("products"))):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Article introuvable")
    decision = req.decision.upper()
    if decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    new_status = "APPROVED" if decision == "APPROVE" else "REJECTED"
    await db.products.update_one({"id": product_id}, {"$set": {
        "moderation_status": new_status, "moderation_reason": req.reason or ""}})
    shop = await db.shops.find_one({"id": product["shop_id"]})
    if shop:
        msg = f"Votre produit « {product['name']} » a été {'validé' if new_status == 'APPROVED' else 'refusé'}."
        if new_status == "REJECTED" and req.reason:
            msg += f" Motif : {req.reason}"
        await notify(shop["owner_id"], "PRODUCT_MODERATION", "Modération produit", msg, "/merchant/products")
    await audit_log(user, f"MODERATE_PRODUCT_{decision}", "product", product_id,
                    product.get("moderation_status"), new_status, _client_ip(request))
    return {"message": f"Produit {'validé' if new_status == 'APPROVED' else 'refusé'}"}


@api.get("/admin/reports")
async def admin_reports(status: Optional[str] = "OPEN", user: dict = Depends(require_module("moderation"))):
    query = {} if status == "ALL" else {"status": status or "OPEN"}
    reports = await db.product_reports.find(query).sort("created_at", -1).to_list(500)
    return {"reports": [serialize(r) for r in reports]}


@api.put("/admin/reports/{report_id}")
async def resolve_report(report_id: str, req: ReportActionReq, request: Request,
                         user: dict = Depends(require_module("moderation"))):
    report = await db.product_reports.find_one({"id": report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    action = req.action.upper()
    if action not in ("DISMISS", "REJECT_PRODUCT"):
        raise HTTPException(status_code=400, detail="Action invalide")
    if action == "REJECT_PRODUCT":
        pid = report["product_id"]
        await db.products.update_one({"id": pid}, {"$set": {
            "moderation_status": "REJECTED", "moderation_reason": req.reason or "Produit signalé", "flagged": False}})
        await db.product_reports.update_many({"product_id": pid, "status": "OPEN"},
                                             {"$set": {"status": "RESOLVED", "resolved_by": user["id"], "resolved_at": now_iso()}})
        product = await db.products.find_one({"id": pid})
        shop = await db.shops.find_one({"id": report["shop_id"]})
        if shop:
            await notify(shop["owner_id"], "PRODUCT_MODERATION", "Produit retiré",
                         f"Votre produit « {report.get('product_name')} » a été retiré suite à des signalements. {req.reason or ''}".strip(),
                         "/merchant/products")
        await audit_log(user, "REPORT_REJECT_PRODUCT", "product", pid, None, req.reason, _client_ip(request))
    else:
        await db.product_reports.update_one({"id": report_id}, {"$set": {
            "status": "DISMISSED", "resolved_by": user["id"], "resolved_at": now_iso()}})
        remaining = await db.product_reports.count_documents({"product_id": report["product_id"], "status": "OPEN"})
        if remaining == 0:
            await db.products.update_one({"id": report["product_id"]}, {"$set": {"flagged": False}})
        await audit_log(user, "REPORT_DISMISS", "report", report_id, None, None, _client_ip(request))
    return {"message": "Signalement traité"}


# ---------------- Module 1 & 9: Security, RBAC, Staff, Double-validation ----------------
async def _create_approval(actor: dict, kind: str, target_id: str, payload: dict, reason: str, request: Request):
    doc = {
        "id": new_id(), "kind": kind, "target_id": target_id, "payload": payload,
        "reason": reason, "status": "PENDING",
        "requested_by": actor["id"], "requested_by_email": actor.get("email"),
        "created_at": now_iso(), "decided_by": None, "decided_at": None, "note": "",
    }
    await db.approval_requests.insert_one(doc)
    await audit_log(actor, "REQUEST_APPROVAL", kind.lower(), target_id, None, reason, _client_ip(request))
    async for a in db.users.find({"role": {"$in": ["SUPER_ADMIN", "ADMIN"]}, "_id": {"$ne": ObjectId(actor["id"])}}):
        await notify(str(a["_id"]), "APPROVAL", "Double validation requise", reason, "/admin/approvals")
    return doc


async def _execute_approval(appr: dict, approver: dict):
    kind = appr["kind"]
    p = appr.get("payload") or {}
    if kind == "WITHDRAWAL":
        wid = appr["target_id"]
        w = await db.withdrawal_requests.find_one({"id": wid})
        if w and not w.get("debited") and w["status"] not in ("TRAITE", "REFUSE", "ANNULE"):
            await add_wallet_tx(w["user_id"], "general", w["amount"], w["currency"], "WITHDRAWAL",
                                "WITHDRAWN", f"Retrait traité #{wid[:8]} (2e validation)", actor_id=approver["id"])
            await db.withdrawal_requests.update_one({"id": wid}, {"$set": {
                "status": "TRAITE", "debited": True, "double_validated": True,
                "reference": p.get("reference", "")}})
            await notify(w["user_id"], "WITHDRAWAL", "Retrait", "Votre retrait a été traité (TRAITE).")
    elif kind == "DELETE_MERCHANT":
        uid = appr["target_id"]
        await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"status": "DISABLED"}, "$inc": {"token_version": 1}})
        await db.shops.update_many({"owner_id": uid}, {"$set": {"suspended": True}})
        await notify(uid, "ACCOUNT", "Compte désactivé", "Votre compte vendeur a été désactivé par un administrateur.")


@api.get("/admin/rbac/meta")
async def rbac_meta(user: dict = Depends(require_module("admins"))):
    return {
        "modules": [{"key": m, "label": rbac.MODULE_LABELS[m]} for m in rbac.MODULES],
        "roles": [{"key": r, "label": rbac.ROLE_LABELS[r]} for r in rbac.STAFF_ROLES if r != "SUPER_ADMIN"],
        "default_permissions": rbac.DEFAULT_ROLE_PERMISSIONS,
    }


@api.get("/admin/staff")
async def list_staff(user: dict = Depends(require_module("admins"))):
    users = await db.users.find({"role": {"$in": rbac.STAFF_ROLES}}).sort("created_at", -1).to_list(500)
    out = []
    for u in users:
        item = _user_public(u)
        item["default_permissions"] = rbac.DEFAULT_ROLE_PERMISSIONS.get(u.get("role"), [])
        item["is_self"] = str(u["_id"]) == user["id"]
        out.append(item)
    return {"staff": out}


@api.post("/admin/staff")
async def create_staff(req: StaffCreateReq, request: Request, user: dict = Depends(require_super())):
    role = req.role.upper()
    if role not in rbac.STAFF_ROLES or role == "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="Rôle invalide")
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet e-mail est déjà utilisé")
    perms = req.permissions if isinstance(req.permissions, dict) else \
        {m: (m in rbac.DEFAULT_ROLE_PERMISSIONS.get(role, [])) for m in rbac.MODULES}
    doc = {
        "name": req.name.strip(), "email": email, "password_hash": hash_password(req.password),
        "phone": "", "role": role, "country": "", "currency": "", "token_version": 0,
        "phone_verified": True, "email_verified": True, "kyc_status": "NONE",
        "invite_code": gen_invite_code(), "is_partner": False,
        "status": "ACTIVE", "permissions": perms, "shop_ids": req.shop_ids or [],
        "delegation": {"enabled": False}, "two_factor_enabled": False, "two_factor_channel": "email",
        "created_at": now_iso(), "created_by": user["id"],
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(user, "CREATE_STAFF", "user", str(res.inserted_id), None, role, _client_ip(request))
    return {"staff": _user_public(doc)}


@api.put("/admin/staff/{sid}")
async def update_staff(sid: str, req: StaffUpdateReq, request: Request, user: dict = Depends(require_super())):
    target = await db.users.find_one({"_id": oid(sid)})
    if not target or target.get("role") not in rbac.STAFF_ROLES:
        raise HTTPException(status_code=404, detail="Gestionnaire introuvable")
    if target.get("role") == "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="Le super-administrateur ne peut pas être modifié")
    upd = {}
    bump = False
    if req.role is not None:
        r = req.role.upper()
        if r not in rbac.STAFF_ROLES or r == "SUPER_ADMIN":
            raise HTTPException(status_code=400, detail="Rôle invalide")
        upd["role"] = r; bump = True
    if req.permissions is not None:
        upd["permissions"] = {m: bool(req.permissions.get(m)) for m in rbac.MODULES}; bump = True
    if req.shop_ids is not None:
        upd["shop_ids"] = req.shop_ids
    if req.status is not None:
        if req.status not in ("ACTIVE", "SUSPENDED", "DISABLED"):
            raise HTTPException(status_code=400, detail="Statut invalide")
        upd["status"] = req.status
        if req.status != "ACTIVE":
            bump = True
    if req.delegation is not None:
        upd["delegation"] = req.delegation; bump = True
    if req.password:
        upd["password_hash"] = hash_password(req.password); bump = True
    if not upd:
        return {"message": "Aucune modification"}
    ops = {"$set": upd}
    if bump:
        ops["$inc"] = {"token_version": 1}
    await db.users.update_one({"_id": target["_id"]}, ops)
    await audit_log(user, "UPDATE_STAFF", "user", sid, target.get("role"), upd.get("role", target.get("role")), _client_ip(request))
    fresh = await db.users.find_one({"_id": target["_id"]})
    return {"staff": _user_public(fresh)}


@api.delete("/admin/staff/{sid}")
async def delete_staff(sid: str, request: Request, user: dict = Depends(require_super())):
    if sid == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")
    target = await db.users.find_one({"_id": oid(sid)})
    if not target or target.get("role") not in rbac.STAFF_ROLES:
        raise HTTPException(status_code=404, detail="Gestionnaire introuvable")
    if target.get("role") == "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="Le super-administrateur ne peut pas être désactivé")
    await db.users.update_one({"_id": target["_id"]}, {"$set": {"status": "DISABLED"}, "$inc": {"token_version": 1}})
    await audit_log(user, "DISABLE_STAFF", "user", sid, target.get("status"), "DISABLED", _client_ip(request))
    return {"message": "Gestionnaire désactivé"}


@api.get("/admin/settings")
async def admin_get_settings(user: dict = Depends(require_module("settings"))):
    s = await get_settings()
    s.pop("_id", None)
    return {"settings": s, "channels": ["email", "sms", "whatsapp"]}


@api.put("/admin/settings")
async def admin_put_settings(req: SettingsReq, request: Request, user: dict = Depends(require_module("settings"))):
    upd = {}
    if req.two_factor_scope is not None:
        if req.two_factor_scope not in ("NONE", "STAFF", "ALL"):
            raise HTTPException(status_code=400, detail="Portée 2FA invalide")
        upd["two_factor_scope"] = req.two_factor_scope
    if req.two_factor_channels is not None:
        chans = [c for c in req.two_factor_channels if c in ("email", "sms", "whatsapp")]
        if not chans:
            raise HTTPException(status_code=400, detail="Au moins un canal 2FA requis")
        upd["two_factor_channels"] = chans
    if req.refund_threshold is not None:
        upd["refund_threshold"] = max(0.0, float(req.refund_threshold))
    if req.default_commission_rate is not None:
        upd["default_commission_rate"] = round(min(1.0, max(0.0, float(req.default_commission_rate))), 4)
    if req.category_commissions is not None:
        upd["category_commissions"] = {str(k): round(min(1.0, max(0.0, float(v))), 4) for k, v in req.category_commissions.items()}
    if req.default_product_quota is not None:
        upd["default_product_quota"] = max(0, int(req.default_product_quota))
    if req.default_storage_quota_mb is not None:
        upd["default_storage_quota_mb"] = max(0, int(req.default_storage_quota_mb))
    if req.fraud_basket_sigma is not None:
        upd["fraud_basket_sigma"] = max(0.0, float(req.fraud_basket_sigma))
    if req.fraud_cancel_rate is not None:
        upd["fraud_cancel_rate"] = min(1.0, max(0.0, float(req.fraud_cancel_rate)))
    if req.fraud_customer_cancels is not None:
        upd["fraud_customer_cancels"] = max(1, int(req.fraud_customer_cancels))
    if req.fraud_refund_count is not None:
        upd["fraud_refund_count"] = max(1, int(req.fraud_refund_count))
    if req.taxes_enabled is not None:
        upd["taxes_enabled"] = bool(req.taxes_enabled)
    if req.csv_import_enabled is not None:
        upd["csv_import_enabled"] = bool(req.csv_import_enabled)
    if req.legal_content is not None:
        clean = {}
        for k in LEGAL_KINDS:
            v = req.legal_content.get(k)
            if isinstance(v, dict):
                clean[k] = {"title": str(v.get("title", ""))[:200], "body": str(v.get("body", ""))[:20000]}
        upd["legal_content"] = clean
    await db.platform_settings.update_one({"_id": "global"}, {"$set": upd}, upsert=True)
    await audit_log(user, "UPDATE_SETTINGS", "settings", "global", None, upd, _client_ip(request))
    s = await get_settings(); s.pop("_id", None)
    return {"settings": s}


@api.get("/admin/login-journal")
async def admin_login_journal(user: dict = Depends(require_module("audit"))):
    rows = await db.login_journal.find({}).sort("created_at", -1).to_list(300)
    return {"entries": [serialize(r) for r in rows]}


@api.get("/admin/approvals")
async def admin_approvals(user: dict = Depends(require_admin_level())):
    rows = await db.approval_requests.find({}).sort("created_at", -1).to_list(300)
    return {"approvals": [serialize(r) for r in rows]}


@api.put("/admin/approvals/{aid}")
async def admin_decide_approval(aid: str, req: ApprovalDecisionReq, request: Request, user: dict = Depends(require_admin_level())):
    appr = await db.approval_requests.find_one({"id": aid})
    if not appr:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if appr["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")
    if appr["requested_by"] == user["id"]:
        raise HTTPException(status_code=403, detail="Un second administrateur doit valider (pas le demandeur)")
    decision = req.decision.upper()
    if decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    if decision == "APPROVE":
        await _execute_approval(appr, user)
    await db.approval_requests.update_one({"id": aid}, {"$set": {
        "status": "APPROVED" if decision == "APPROVE" else "REJECTED",
        "decided_by": user["id"], "decided_at": now_iso(), "note": req.note or "",
    }})
    await audit_log(user, f"APPROVAL_{decision}", appr["kind"].lower(), appr["target_id"], None, req.note, _client_ip(request))
    return {"message": "Décision enregistrée"}


@api.delete("/admin/merchants/{user_id}")
async def request_delete_merchant(user_id: str, request: Request, user: dict = Depends(require_admin_level())):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target or target.get("role") != "MERCHANT":
        raise HTTPException(status_code=404, detail="Vendeur introuvable")
    existing = await db.approval_requests.find_one({"kind": "DELETE_MERCHANT", "target_id": user_id, "status": "PENDING"})
    if existing:
        raise HTTPException(status_code=400, detail="Une demande de suppression est déjà en attente")
    await _create_approval(user, "DELETE_MERCHANT", user_id,
                           {"name": target.get("name"), "email": target.get("email")},
                           f"Suppression du compte vendeur {target.get('email')}", request)
    return {"message": "Suppression soumise à double validation par un autre administrateur.",
            "requires_double_validation": True}


@api.put("/auth/2fa")
async def set_2fa_pref(req: TwoFAPrefReq, user: dict = Depends(get_current_user)):
    channel = req.channel if req.channel in ("email", "sms", "whatsapp") else "email"
    await db.users.update_one({"_id": ObjectId(user["id"])},
                              {"$set": {"two_factor_enabled": bool(req.enabled), "two_factor_channel": channel}})
    return {"message": "Préférences 2FA mises à jour", "two_factor_enabled": bool(req.enabled), "two_factor_channel": channel}


@api.get("/")
async def root():
    return {"message": "AfriMarket API", "status": "ok"}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
    except Exception as exc:
        logger.error("Health check failed: MongoDB is unavailable", exc_info=exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}


@api.get("/download/export")
async def download_export():
    from fastapi.responses import FileResponse
    path = "/app/afrimarket_export.zip"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archive introuvable")
    return FileResponse(path, media_type="application/zip", filename="afrimarket_export.zip")


app.include_router(api)
cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    try:
        await db.password_reset_tokens.create_index("token_hash", unique=True)
    except Exception:
        pass
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await db.products.create_index("shop_id")
    await db.orders.create_index("shop_id")
    await db.orders.create_index("customer_id")
    await db.wallet_transactions.create_index("user_id")
    await db.otp_challenges.create_index("id")
    await db.login_journal.create_index("created_at")
    await db.approval_requests.create_index("status")
    await db.product_reports.create_index("product_id")
    await db.payouts.create_index("merchant_id")
    await db.carriers.create_index("id")
    try:
        storage.init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    if await db.carriers.count_documents({}) == 0:
        defaults = [
            {"name": "Colissimo", "code": "COLISSIMO", "delay_days": 4},
            {"name": "Chronopost", "code": "CHRONO", "delay_days": 2},
            {"name": "UPS", "code": "UPS", "delay_days": 3},
            {"name": "DHL", "code": "DHL", "delay_days": 3},
            {"name": "Livraison locale", "code": "LOCAL", "delay_days": 2},
        ]
        for d in defaults:
            await db.carriers.insert_one({"id": new_id(), "tracking_url": "", "active": True,
                                          "suspended": False, "created_at": now_iso(), **d})
    await seed_module.seed(db)
    await db.products.update_many({"moderation_status": {"$exists": False}},
                                  {"$set": {"moderation_status": "APPROVED", "moderation_reason": "", "flagged": False}})
    logger.info("Startup complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()
