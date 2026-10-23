"""Self-service account: password change, client contact change, deletion (2 admins + e-mail confirmation), restore, purge."""
import asyncio
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from html import escape
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel

from db import db, new_id, now_iso
from security import get_current_user, hash_password, verify_password, create_access_token
from business import audit_log, notify
from messaging import _enc, _dec, send_message, send_sms_like
from emailer import send_email, _wrap
from rbac import require_admin_level

router = APIRouter(prefix="/api")
logger = logging.getLogger("accounts")
RESTORE_DAYS = 90
CONFIRM_DAYS = 7
ACTIVE_REQ = ("PENDING", "AWAITING_USER")
USER_COLLECTIONS = ("notifications", "login_journal", "withdrawal_requests", "otp_challenges", "shop_customers",
                    "wallet_transactions", "merchant_verifications", "contact_changes")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
_bg = set()


class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str


class ContactReq(BaseModel):
    kind: str
    value: str
    current_password: str


class ContactConfirmReq(BaseModel):
    challenge_id: str
    code: str


class DeletionReq(BaseModel):
    current_password: str
    reason: Optional[str] = ""


class DecisionReq(BaseModel):
    decision: str
    note: Optional[str] = ""


class TokenReq(BaseModel):
    token: str


def _h(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _digits(p: str) -> str:
    return re.sub(r"\D", "", p or "")


def _spawn(coro):
    task = asyncio.create_task(coro)
    _bg.add(task)
    task.add_done_callback(_bg.discard)


async def _check_password(user: dict, pwd: str):
    full = await db.users.find_one({"_id": ObjectId(user["id"])}, {"password_hash": 1})
    if not pwd or not full or not verify_password(pwd, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")


async def _notify_admins(title: str, body: str, link: str):
    async for a in db.users.find({"role": {"$in": ["ADMIN", "SUPER_ADMIN"]}, "status": {"$in": ["ACTIVE", None]}}, {"_id": 1}):
        await notify(str(a["_id"]), "ACCOUNT_DELETION", title, body, link)


def _mail(to: str, subject: str, paragraphs: list, link: Optional[tuple] = None):
    html = "".join(f"<p>{escape(p)}</p>" for p in paragraphs)
    if link:
        html += f'<p><a href="{escape(link[0])}">{escape(link[1])}</a></p>'
    _spawn(send_email(to=to, subject=subject, html=_wrap(html)))


# ---------------- Password ----------------
@router.post("/account/password")
async def change_password(req: PasswordChangeReq, user: dict = Depends(get_current_user)):
    await _check_password(user, req.current_password)
    if len(req.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="Nouveau mot de passe trop court (6 caractères minimum)")
    if req.new_password == req.current_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'actuel")
    ver = int(user.get("token_version", 0)) + 1
    await db.users.update_one({"_id": ObjectId(user["id"])},
                              {"$set": {"password_hash": hash_password(req.new_password), "token_version": ver}})
    await db.password_reset_tokens.delete_many({"user_id": user["id"], "used": False})
    await send_message(user["id"], "auth_password_changed", {}, ntype="SECURITY")
    await audit_log(user, "CHANGE_PASSWORD", "user", user["id"], None, None)
    return {"message": "Mot de passe modifié. Vos autres sessions ont été déconnectées.",
            "token": create_access_token(user["id"], user["email"], user["role"], ver)}


# ---------------- Contact change (clients only) ----------------
@router.post("/account/contact/request")
async def contact_request(req: ContactReq, user: dict = Depends(get_current_user)):
    if user.get("role") != "CLIENT":
        raise HTTPException(status_code=403, detail="Réservé aux comptes clients")
    if req.kind not in ("email", "phone"):
        raise HTTPException(status_code=400, detail="Type invalide")
    await _check_password(user, req.current_password)
    value = req.value.strip()
    if req.kind == "email":
        value = value.lower()
        if not EMAIL_RE.match(value):
            raise HTTPException(status_code=400, detail="Adresse e-mail invalide")
        if value == user.get("email"):
            raise HTTPException(status_code=400, detail="C'est déjà votre adresse e-mail")
        if await db.users.find_one({"email": value}):
            raise HTTPException(status_code=400, detail="Cette adresse e-mail est déjà utilisée")
    else:
        if len(_digits(value)) < 8:
            raise HTTPException(status_code=400, detail="Numéro de téléphone invalide")
        if _digits(value) == _digits(user.get("phone")):
            raise HTTPException(status_code=400, detail="C'est déjà votre numéro")
    since = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    if await db.contact_changes.count_documents({"user_id": user["id"], "created_at": {"$gt": since}}) >= 5:
        raise HTTPException(status_code=429, detail="Trop de demandes. Réessayez dans 15 minutes.")
    code = f"{secrets.randbelow(900000) + 100000}"
    doc = {"id": new_id(), "user_id": user["id"], "kind": req.kind, "value": value, "code_hash": _h(code),
           "attempts": 0, "consumed": False, "created_at": now_iso(),
           "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}
    await db.contact_changes.insert_one(dict(doc))
    sent = False
    if req.kind == "email":
        sent = await send_email(to=value, subject="Code de confirmation AfriMarket", html=_wrap(
            f"<p>Votre code pour confirmer votre nouvelle adresse e-mail : <strong>{code}</strong></p>"
            "<p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>"))
    else:
        await send_sms_like("sms", value, user.get("country", ""), f"AfriMarket : votre code de confirmation est {code}")
        logger.info("Contact change SMS code (simulated) for %s: %s", value, code)
    return {"challenge_id": doc["id"], "kind": req.kind, "value": value,
            "message": "Code envoyé au nouvel e-mail" if req.kind == "email" else "Code envoyé par SMS (simulé)",
            "dev_code": None if sent else code}


@router.post("/account/contact/confirm")
async def contact_confirm(req: ContactConfirmReq, user: dict = Depends(get_current_user)):
    ch = await db.contact_changes.find_one({"id": req.challenge_id, "user_id": user["id"], "consumed": False})
    if not ch or ch["expires_at"] < now_iso():
        raise HTTPException(status_code=400, detail="Code expiré ou demande invalide")
    if ch.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Refaites une demande.")
    if not hmac.compare_digest(_h((req.code or "").strip()), ch["code_hash"]):
        await db.contact_changes.update_one({"id": ch["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Code incorrect")
    if ch["kind"] == "email" and await db.users.find_one({"email": ch["value"]}):
        raise HTTPException(status_code=400, detail="Cette adresse e-mail est déjà utilisée")
    await db.contact_changes.update_one({"id": ch["id"]}, {"$set": {"consumed": True}})
    out = {"message": "Coordonnées mises à jour"}
    if ch["kind"] == "email":
        ver = int(user.get("token_version", 0)) + 1
        await db.users.update_one({"_id": ObjectId(user["id"])},
                                  {"$set": {"email": ch["value"], "email_verified": True, "token_version": ver}})
        out["token"] = create_access_token(user["id"], ch["value"], user["role"], ver)
        if user.get("email"):
            _mail(user["email"], "Votre adresse e-mail AfriMarket a été modifiée",
                  [f"L'adresse e-mail de votre compte a été remplacée par {ch['value']}.",
                   "Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support."])
    else:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"phone": ch["value"], "phone_verified": True}})
    await notify(user["id"], "SECURITY", "Coordonnées modifiées",
                 f"Votre {'adresse e-mail' if ch['kind'] == 'email' else 'numéro de téléphone'} a été mis à jour.")
    await audit_log(user, "CHANGE_" + ch["kind"].upper(), "user", user["id"], None, ch["value"])
    return out


# ---------------- Deletion request (user) ----------------
def _req_view(r: dict, me: Optional[str] = None) -> dict:
    out = {k: r.get(k) for k in ("id", "user_id", "user_name", "email", "role", "reason", "status", "created_at",
                                  "decided_at", "completed_at", "reject_note", "confirm_expires")}
    out["approvals"] = [{"by_name": a["by_name"], "at": a["at"]} for a in r.get("approvals", [])]
    out["downloads"] = len(r.get("downloads", []))
    if me:
        out["downloaded_by_me"] = any(d["by"] == me for d in r.get("downloads", []))
        out["approved_by_me"] = any(a["by"] == me for a in r.get("approvals", []))
    return out


@router.post("/account/deletion")
async def request_deletion(req: DeletionReq, user: dict = Depends(get_current_user)):
    await _check_password(user, req.current_password)
    if user["role"] == "SUPER_ADMIN" and await db.users.count_documents({"role": "SUPER_ADMIN", "status": {"$ne": "DELETED"}}) <= 1:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le dernier super-administrateur")
    if await db.account_deletion_requests.find_one({"user_id": user["id"], "status": {"$in": list(ACTIVE_REQ)}}):
        raise HTTPException(status_code=400, detail="Une demande de suppression est déjà en cours")
    doc = {"id": new_id(), "user_id": user["id"], "user_name": user.get("name"), "email": user.get("email"),
           "role": user["role"], "reason": (req.reason or "").strip()[:500], "status": "PENDING",
           "approvals": [], "downloads": [], "created_at": now_iso()}
    await db.account_deletion_requests.insert_one(dict(doc))
    await _notify_admins("Demande de suppression de compte",
                         f"{doc['user_name']} ({doc['email']}) demande la suppression de son compte.", "/admin/account-deletions")
    await audit_log(user, "REQUEST_ACCOUNT_DELETION", "user", user["id"], None, doc["reason"])
    return {"message": "Demande envoyée. Deux administrateurs doivent l'approuver, puis vous recevrez un e-mail de confirmation.",
            "request": _req_view(doc)}


@router.get("/account/deletion")
async def my_deletion(user: dict = Depends(get_current_user)):
    r = await db.account_deletion_requests.find_one({"user_id": user["id"]}, sort=[("created_at", -1)])
    return {"request": _req_view(r) if r else None}


@router.delete("/account/deletion")
async def cancel_deletion(user: dict = Depends(get_current_user)):
    res = await db.account_deletion_requests.update_one({"user_id": user["id"], "status": {"$in": list(ACTIVE_REQ)}},
                                                        {"$set": {"status": "CANCELLED", "decided_at": now_iso()},
                                                         "$unset": {"confirm_token_hash": ""}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Aucune demande en cours")
    await audit_log(user, "CANCEL_ACCOUNT_DELETION", "user", user["id"], None, None)
    return {"message": "Demande de suppression annulée"}


# ---------------- Activity history (Excel) ----------------
def _sheet(wb, title: str, headers: list, rows: list):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for r in rows:
        ws.append([("" if v is None else v if isinstance(v, (int, float, str)) else json.dumps(v, ensure_ascii=False, default=str))
                   for v in r])
    if not rows:
        ws.append(["Aucune donnée"])


async def _history_xlsx(uid: str) -> bytes:
    u = await db.users.find_one({"_id": ObjectId(uid)}) or {}
    wb = Workbook()
    ws = wb.active
    ws.title = "Profil"
    ws.append(["Champ", "Valeur"])
    for k in ("name", "email", "phone", "role", "country", "currency", "status", "kyc_status", "invite_code",
              "language", "created_at", "last_seen"):
        ws.append([k, str(u.get(k) or "")])
    orders = await db.orders.find({"customer_id": uid}).sort("created_at", 1).to_list(5000)
    _sheet(wb, "Commandes", ["Date", "Réf.", "Boutique", "Statut", "Total", "Devise", "Total acheteur", "Devise acheteur", "Articles"],
           [[o.get("created_at"), o.get("ref"), o.get("shop_name"), o.get("status"), o.get("total"), o.get("currency"),
             o.get("buyer_total"), o.get("buyer_currency"), ", ".join(f"{i.get('name')} x{i.get('qty')}" for i in o.get("items", []))]
            for o in orders])
    shop_ids = [s["id"] async for s in db.shops.find({"owner_id": uid}, {"id": 1})]
    if shop_ids:
        sales = await db.orders.find({"shop_id": {"$in": shop_ids}}).sort("created_at", 1).to_list(5000)
        _sheet(wb, "Ventes boutique", ["Date", "Réf.", "Client", "Statut", "Total", "Devise"],
               [[o.get("created_at"), o.get("ref"), o.get("customer_name"), o.get("status"), o.get("total"), o.get("currency")] for o in sales])
    tx = await db.wallet_transactions.find({"user_id": uid}).sort("created_at", 1).to_list(5000)
    _sheet(wb, "Portefeuille", ["Date", "Type", "Statut", "Montant", "Devise", "Description"],
           [[t.get("created_at"), t.get("kind"), t.get("status"), t.get("amount"), t.get("currency"), t.get("description")] for t in tx])
    wd = await db.withdrawal_requests.find({"user_id": uid}).sort("created_at", 1).to_list(2000)
    _sheet(wb, "Retraits", ["Date", "Montant", "Devise", "Méthode", "Statut", "Référence"],
           [[w.get("created_at"), w.get("amount"), w.get("currency"), w.get("method"), w.get("status"), w.get("reference")] for w in wd])
    lj = await db.login_journal.find({"user_id": uid}).sort("created_at", -1).to_list(2000)
    _sheet(wb, "Connexions", ["Date", "IP", "Appareil", "Résultat"],
           [[x.get("created_at") or x.get("at"), x.get("ip"), x.get("user_agent"), x.get("status") or x.get("result")] for x in lj])
    al = await db.audit_logs.find({"actor_id": uid}).sort("created_at", -1).to_list(5000)
    _sheet(wb, "Actions", ["Date", "Action", "Objet", "ID", "Valeur"],
           [[a.get("created_at"), a.get("action"), a.get("target_type"), a.get("target_id"), a.get("new_value")] for a in al])
    nt = await db.notifications.find({"user_id": uid}).sort("created_at", -1).to_list(2000)
    _sheet(wb, "Notifications", ["Date", "Type", "Titre", "Message"],
           [[n.get("created_at"), n.get("type"), n.get("title"), n.get("message")] for n in nt])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------- Deletion requests (admins) ----------------
@router.get("/admin/deletion-requests")
async def admin_deletion_requests(status: Optional[str] = None, user: dict = Depends(require_admin_level())):
    q = {"status": status} if status else {}
    rows = await db.account_deletion_requests.find(q).sort("created_at", -1).to_list(500)
    return {"requests": [_req_view(r, user["id"]) for r in rows]}


@router.get("/admin/deletion-requests/{rid}/history")
async def admin_deletion_history(rid: str, user: dict = Depends(require_admin_level())):
    r = await db.account_deletion_requests.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    data = await _history_xlsx(r["user_id"])
    await db.account_deletion_requests.update_one({"id": rid}, {"$push": {"downloads": {"by": user["id"], "by_name": user.get("name"), "at": now_iso()}}})
    await audit_log(user, "DOWNLOAD_USER_HISTORY", "user", r["user_id"], None, rid)
    return StreamingResponse(io.BytesIO(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="historique_{r["user_id"]}.xlsx"'})


@router.put("/admin/deletion-requests/{rid}")
async def admin_decide_deletion(rid: str, req: DecisionReq, user: dict = Depends(require_admin_level())):
    if req.decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    r = await db.account_deletion_requests.find_one({"id": rid, "status": "PENDING"})
    if not r:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà traitée")
    if r["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas traiter votre propre demande")
    if req.decision == "REJECT":
        await db.account_deletion_requests.update_one({"id": rid}, {"$set": {
            "status": "REJECTED", "decided_at": now_iso(), "reject_note": (req.note or "").strip()[:500], "rejected_by": user["id"]}})
        await notify(r["user_id"], "ACCOUNT", "Demande de suppression refusée", req.note or "Votre demande de suppression a été refusée.")
        await audit_log(user, "REJECT_ACCOUNT_DELETION", "user", r["user_id"], None, req.note)
        return {"message": "Demande refusée"}
    if not any(d["by"] == user["id"] for d in r.get("downloads", [])):
        raise HTTPException(status_code=400, detail="Téléchargez et consultez l'historique d'activité avant d'approuver")
    if any(a["by"] == user["id"] for a in r.get("approvals", [])):
        raise HTTPException(status_code=400, detail="Vous avez déjà approuvé cette demande ; un second administrateur doit valider")
    res = await db.account_deletion_requests.find_one_and_update(
        {"id": rid, "status": "PENDING", "approvals.by": {"$ne": user["id"]}},
        {"$push": {"approvals": {"by": user["id"], "by_name": user.get("name"), "at": now_iso()}}}, return_document=True)
    if not res:
        raise HTTPException(status_code=409, detail="Demande modifiée entre-temps, rechargez")
    await audit_log(user, "APPROVE_ACCOUNT_DELETION", "user", r["user_id"], None, len(res["approvals"]))
    if len(res["approvals"]) < 2:
        return {"message": "Première approbation enregistrée. Un second administrateur doit valider."}
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=CONFIRM_DAYS)).isoformat()
    await db.account_deletion_requests.update_one({"id": rid}, {"$set": {
        "status": "AWAITING_USER", "decided_at": now_iso(), "confirm_token_hash": _h(token), "confirm_expires": expires}})
    link = f"{os.environ['FRONTEND_URL'].rstrip('/')}/confirm-deletion?token={token}"
    target = await db.users.find_one({"_id": ObjectId(r["user_id"])}, {"email": 1})
    if target and target.get("email"):
        _mail(target["email"], "Confirmez la suppression de votre compte AfriMarket",
              ["Votre demande de suppression de compte a été approuvée par nos administrateurs.",
               f"Pour la rendre définitive, confirmez-la vous-même avec le lien ci-dessous (valable {CONFIRM_DAYS} jours).",
               "Si vous avez changé d'avis, ignorez cet e-mail ou annulez la demande depuis votre compte."],
              (link, "Confirmer la suppression de mon compte"))
    await notify(r["user_id"], "ACCOUNT", "Suppression approuvée",
                 "Un e-mail vous a été envoyé pour confirmer vous-même la suppression définitive de votre compte.")
    return {"message": "Demande approuvée par 2 administrateurs. E-mail de confirmation envoyé à l'utilisateur."}


# ---------------- Confirmation by the user (public link) ----------------
async def _anonymize(uid: str):
    u = await db.users.find_one({"_id": ObjectId(uid)})
    if not u:
        return
    snap = {k: u.get(k) for k in ("name", "email", "phone", "country", "role", "language")}
    now = datetime.now(timezone.utc)
    phone = _digits(u.get("phone"))
    await db.deleted_accounts.insert_one({
        "id": new_id(), "user_id": uid, "role": u.get("role"), "snapshot_enc": _enc(json.dumps(snap, ensure_ascii=False)),
        "email_hash": _h((u.get("email") or "").lower()), "phone_hash": _h(phone) if len(phone) >= 8 else None,
        "deleted_at": now.isoformat(), "purge_after": (now + timedelta(days=RESTORE_DAYS)).isoformat()})
    await db.users.update_one({"_id": u["_id"]}, {"$set": {
        "name": "Compte supprimé", "email": f"deleted-{uid}@deleted.invalid", "phone": "", "status": "DELETED",
        "password_hash": hash_password(secrets.token_urlsafe(24)), "token_version": int(u.get("token_version", 0)) + 1,
        "deleted_at": now.isoformat()}})
    await db.orders.update_many({"customer_id": uid}, {"$set": {"customer_name": "Client supprimé", "address": "—"}})
    await db.shops.update_many({"owner_id": uid, "suspended": {"$ne": True}},
                               {"$set": {"suspended": True, "suspended_reason": "ACCOUNT_DELETED"}})


@router.post("/account/deletion/confirm")
async def confirm_deletion(req: TokenReq):
    r = await db.account_deletion_requests.find_one_and_update(
        {"confirm_token_hash": _h(req.token or ""), "status": "AWAITING_USER", "confirm_expires": {"$gt": now_iso()}},
        {"$set": {"status": "COMPLETED", "completed_at": now_iso()}, "$unset": {"confirm_token_hash": ""}})
    if not r:
        raise HTTPException(status_code=400, detail="Lien invalide, expiré ou déjà utilisé")
    await _anonymize(r["user_id"])
    await audit_log({"id": r["user_id"], "email": r.get("email"), "role": r.get("role")}, "ACCOUNT_DELETED", "user", r["user_id"], None, None)
    return {"message": f"Votre compte a été supprimé. Vous pouvez demander sa restauration pendant {RESTORE_DAYS} jours "
                       "en créant un nouveau compte avec les mêmes informations."}


# ---------------- Restore (new account with same info, 2 admin approvals) ----------------
async def check_restore(new_user: dict) -> bool:
    """Called after registration: links the new account to a recently deleted one with the same e-mail/phone."""
    phone = _digits(new_user.get("phone"))
    ors = [{"email_hash": _h((new_user.get("email") or "").lower())}]
    if len(phone) >= 8:
        ors.append({"phone_hash": _h(phone)})
    d = await db.deleted_accounts.find_one({"$or": ors, "purge_after": {"$gt": now_iso()}})
    if not d or await db.account_restore_requests.find_one({"deleted_id": d["id"], "status": "PENDING"}):
        return bool(d)
    await db.account_restore_requests.insert_one({
        "id": new_id(), "deleted_id": d["id"], "old_user_id": d["user_id"], "new_user_id": str(new_user["_id"]),
        "new_name": new_user.get("name"), "new_email": new_user.get("email"), "new_phone": new_user.get("phone", ""),
        "role": d.get("role"), "deleted_at": d["deleted_at"], "purge_after": d["purge_after"],
        "status": "PENDING", "approvals": [], "created_at": now_iso()})
    await _notify_admins("Demande de restauration de compte",
                         f"{new_user.get('name')} ({new_user.get('email')}) correspond à un compte supprimé.", "/admin/account-deletions")
    return True


def _restore_view(r: dict, me: str) -> dict:
    out = {k: r.get(k) for k in ("id", "new_name", "new_email", "new_phone", "role", "deleted_at", "purge_after",
                                  "status", "created_at", "decided_at")}
    out["approvals"] = [{"by_name": a["by_name"], "at": a["at"]} for a in r.get("approvals", [])]
    out["approved_by_me"] = any(a["by"] == me for a in r.get("approvals", []))
    return out


@router.get("/admin/restore-requests")
async def admin_restore_requests(user: dict = Depends(require_admin_level())):
    rows = await db.account_restore_requests.find({}).sort("created_at", -1).to_list(500)
    return {"requests": [_restore_view(r, user["id"]) for r in rows]}


async def _do_restore(r: dict):
    d = await db.deleted_accounts.find_one({"id": r["deleted_id"]})
    new = await db.users.find_one({"_id": ObjectId(r["new_user_id"])})
    if not d or not new:
        raise HTTPException(status_code=400, detail="Compte supprimé ou nouveau compte introuvable")
    snap = json.loads(_dec(d["snapshot_enc"]))
    old = await db.users.find_one({"_id": ObjectId(r["old_user_id"])})
    await db.users.delete_one({"_id": new["_id"]})
    for c in ("notifications", "login_journal", "otp_challenges"):
        await getattr(db, c).delete_many({"user_id": r["new_user_id"]})
    await db.users.update_one({"_id": ObjectId(r["old_user_id"])}, {
        "$set": {"name": new.get("name") or snap.get("name"), "email": new["email"], "phone": new.get("phone", ""),
                 "password_hash": new["password_hash"], "language": new.get("language") or snap.get("language"),
                 "status": "ACTIVE", "token_version": int((old or {}).get("token_version", 0)) + 1},
        "$unset": {"deleted_at": ""}})
    await db.orders.update_many({"customer_id": r["old_user_id"]}, {"$set": {"customer_name": new.get("name") or snap.get("name")}})
    await db.shops.update_many({"owner_id": r["old_user_id"], "suspended_reason": "ACCOUNT_DELETED"},
                               {"$set": {"suspended": False}, "$unset": {"suspended_reason": ""}})
    await db.deleted_accounts.delete_one({"id": d["id"]})
    _mail(new["email"], "Votre compte AfriMarket a été restauré",
          ["Votre ancien compte et son historique ont été restaurés.",
           "Connectez-vous avec l'adresse e-mail et le mot de passe de votre nouvelle inscription."])


@router.put("/admin/restore-requests/{rid}")
async def admin_decide_restore(rid: str, req: DecisionReq, user: dict = Depends(require_admin_level())):
    if req.decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    r = await db.account_restore_requests.find_one({"id": rid, "status": "PENDING"})
    if not r:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà traitée")
    if req.decision == "REJECT":
        await db.account_restore_requests.update_one({"id": rid}, {"$set": {"status": "REJECTED", "decided_at": now_iso()}})
        await notify(r["new_user_id"], "ACCOUNT", "Restauration refusée", "La restauration de votre ancien compte a été refusée.")
        await audit_log(user, "REJECT_ACCOUNT_RESTORE", "user", r["old_user_id"], None, req.note)
        return {"message": "Restauration refusée"}
    res = await db.account_restore_requests.find_one_and_update(
        {"id": rid, "status": "PENDING", "approvals.by": {"$ne": user["id"]}},
        {"$push": {"approvals": {"by": user["id"], "by_name": user.get("name"), "at": now_iso()}}}, return_document=True)
    if not res:
        raise HTTPException(status_code=400, detail="Vous avez déjà approuvé ; un second administrateur doit valider")
    await audit_log(user, "APPROVE_ACCOUNT_RESTORE", "user", r["old_user_id"], None, len(res["approvals"]))
    if len(res["approvals"]) < 2:
        return {"message": "Première approbation enregistrée. Un second administrateur doit valider."}
    await _do_restore(res)
    await db.account_restore_requests.update_one({"id": rid}, {"$set": {"status": "RESTORED", "decided_at": now_iso()}})
    return {"message": "Compte restauré avec son historique"}


# ---------------- Purge after 90 days (platform cron) ----------------
async def run_purge() -> dict:
    stats = {"purged": 0}
    async for d in db.deleted_accounts.find({"purge_after": {"$lt": now_iso()}}):
        uid = d["user_id"]
        try:
            await db.users.delete_one({"_id": ObjectId(uid)})
        except Exception:
            pass
        for c in USER_COLLECTIONS:
            await getattr(db, c).delete_many({"user_id": uid})
        await db.orders.delete_many({"customer_id": uid})
        await db.audit_logs.delete_many({"actor_id": uid})
        shop_ids = [s["id"] async for s in db.shops.find({"owner_id": uid}, {"id": 1})]
        if shop_ids:
            await db.products.delete_many({"shop_id": {"$in": shop_ids}})
            await db.shops.delete_many({"id": {"$in": shop_ids}})
        await db.account_deletion_requests.delete_many({"user_id": uid})
        await db.account_restore_requests.delete_many({"old_user_id": uid})
        await db.deleted_accounts.delete_one({"id": d["id"]})
        stats["purged"] += 1
    await db.cron_runs.update_one({"_id": "last_account_purge"}, {"$set": {"at": now_iso(), "stats": stats}}, upsert=True)
    logger.info("Account purge: %s", stats)
    return stats


async def _safe_purge():
    try:
        await run_purge()
    except Exception as e:
        logger.error("Account purge failed: %s", e)


@router.post("/cron/account-purge")
async def cron_account_purge(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not token or not hmac.compare_digest(token, os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = None
    if body is not None and not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("x-webhook-id") or (body or {}).get("run_id") or new_id()
    res = await db.cron_runs.update_one({"_id": f"run:{run_id}"}, {"$setOnInsert": {"at": now_iso(), "name": "account-purge"}}, upsert=True)
    if res.upserted_id is None:
        return {"status": "duplicate"}
    _spawn(_safe_purge())
    return {"status": "accepted"}


@router.get("/admin/deleted-accounts")
async def admin_deleted_accounts(user: dict = Depends(require_admin_level())):
    rows = await db.deleted_accounts.find({}, {"_id": 0, "id": 1, "user_id": 1, "role": 1, "deleted_at": 1, "purge_after": 1}) \
        .sort("deleted_at", -1).to_list(500)
    last = await db.cron_runs.find_one({"_id": "last_account_purge"}) or {}
    return {"accounts": rows, "restore_days": RESTORE_DAYS, "last_purge": last.get("at")}
