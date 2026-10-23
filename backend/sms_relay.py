"""Phone-based SMS relay accounts, SIM routing, and outbound message queue."""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from db import db, new_id, now_iso
from rbac import require_module
from security import JWT_ALGORITHM, get_jwt_secret, hash_password, verify_password
from config_data import COUNTRIES
from business import audit_log

router = APIRouter(prefix="/api")
COUNTRY_NAMES = {country["name"] for country in COUNTRIES}


class RelayCreateReq(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class RelayStatusReq(BaseModel):
    status: str


class RelayLoginReq(BaseModel):
    phone: str
    password: str
    connection_key: str


class RelayConfigReq(BaseModel):
    countries: list[str] = Field(default_factory=list, max_length=100)
    sims: list[dict] = Field(default_factory=list, max_length=10)


class RelayRouteReq(BaseModel):
    relay_id: str
    sim_id: str
    enabled: bool = True


class RelayResultReq(BaseModel):
    sim_id: str
    claim_id: str
    status: str
    error: str = ""


def _key_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _public_relay(relay: dict, stats: dict | None = None) -> dict:
    last_seen = relay.get("last_seen")
    try:
        online = bool(last_seen) and datetime.now(timezone.utc) - datetime.fromisoformat(last_seen) < timedelta(minutes=5)
    except (TypeError, ValueError):
        online = False
    return {
        "id": relay["id"],
        "phone": relay["phone"],
        "status": relay.get("status", "ACTIVE"),
        "online": online,
        "last_seen": last_seen,
        "countries": relay.get("countries", []),
        "sims": relay.get("sims", []),
        "message_counts": stats or {},
        "created_at": relay.get("created_at"),
    }


async def _ensure_indexes():
    await db.sms_relay_accounts.create_index("phone", unique=True)
    await db.sms_relay_routes.create_index("country", unique=True)
    await db.sms_relay_messages.create_index([("relay_id", 1), ("sim_id", 1), ("status", 1), ("created_at", 1)])


async def _admin_relay_stats(relay_id: str | None = None):
    counts = {}
    pipeline = []
    if relay_id:
        pipeline.append({"$match": {"relay_id": relay_id}})
    pipeline.append(
        {"$group": {"_id": {"relay_id": "$relay_id", "sim_id": "$sim_id", "status": "$status"},
                    "count": {"$sum": 1}}},
    )
    cursor = db.sms_relay_messages.aggregate(pipeline)
    async for row in cursor:
        key = (row["_id"]["relay_id"], row["_id"]["sim_id"])
        counts.setdefault(key, {})[row["_id"]["status"].lower()] = row["count"]
    return counts


@router.get("/admin/comm/relays")
async def list_relays(user: dict = Depends(require_module("settings"))):
    await _ensure_indexes()
    relays = await db.sms_relay_accounts.find({}).sort("created_at", -1).to_list(500)
    routes = await db.sms_relay_routes.find({}).to_list(500)
    stats = await _admin_relay_stats()
    output = []
    for relay in relays:
        public = _public_relay(relay)
        for sim in public["sims"]:
            sim["message_counts"] = stats.get((relay["id"], sim["id"]), {})
        public["routes"] = [route for route in routes if route.get("relay_id") == relay["id"]]
        output.append(public)
    return {"relays": output, "routes": routes}


@router.post("/admin/comm/relays")
async def create_relay(req: RelayCreateReq, user: dict = Depends(require_module("settings"))):
    await _ensure_indexes()
    phone = req.phone.strip()
    if await db.sms_relay_accounts.find_one({"phone": phone}):
        raise HTTPException(status_code=409, detail="Ce numéro de téléphone est déjà utilisé")
    connection_key = secrets.token_urlsafe(32)
    relay = {
        "id": new_id(),
        "phone": phone,
        "password_hash": hash_password(req.password),
        "connection_key_hash": _key_hash(connection_key),
        "token_version": 0,
        "status": "ACTIVE",
        "countries": [],
        "sims": [],
        "created_at": now_iso(),
        "created_by": user["id"],
    }
    try:
        await db.sms_relay_accounts.insert_one(relay)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Ce numéro de téléphone est déjà utilisé")
    await audit_log(user, "CREATE_SMS_RELAY", "sms_relay", relay["id"], None, phone)
    return {"relay": _public_relay(relay), "connection_key": connection_key}


@router.put("/admin/comm/relays/{relay_id}")
async def update_relay(relay_id: str, req: RelayStatusReq, user: dict = Depends(require_module("settings"))):
    if req.status not in ("ACTIVE", "SUSPENDED"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    relay = await db.sms_relay_accounts.find_one({"id": relay_id})
    if not relay:
        raise HTTPException(status_code=404, detail="Compte relais introuvable")
    await db.sms_relay_accounts.update_one({"id": relay_id}, {"$set": {"status": req.status}})
    if req.status != "ACTIVE":
        await db.sms_relay_routes.update_many({"relay_id": relay_id}, {"$set": {"enabled": False}})
        await db.sms_relay_accounts.update_one({"id": relay_id}, {"$inc": {"token_version": 1}})
    await audit_log(user, "UPDATE_SMS_RELAY", "sms_relay", relay_id, relay.get("status"), req.status)
    return {"relay": _public_relay(await db.sms_relay_accounts.find_one({"id": relay_id}))}


@router.post("/admin/comm/relays/{relay_id}/rotate-key")
async def rotate_relay_key(relay_id: str, user: dict = Depends(require_module("settings"))):
    relay = await db.sms_relay_accounts.find_one({"id": relay_id})
    if not relay:
        raise HTTPException(status_code=404, detail="Compte relais introuvable")
    connection_key = secrets.token_urlsafe(32)
    await db.sms_relay_accounts.update_one({"id": relay_id}, {
        "$set": {"connection_key_hash": _key_hash(connection_key)},
        "$inc": {"token_version": 1},
    })
    await audit_log(user, "ROTATE_SMS_RELAY_KEY", "sms_relay", relay_id, None, "rotated")
    return {"connection_key": connection_key}


@router.put("/admin/comm/relay-routes/{country}")
async def save_relay_route(country: str, req: RelayRouteReq, user: dict = Depends(require_module("settings"))):
    if country not in COUNTRY_NAMES:
        raise HTTPException(status_code=400, detail="Pays invalide")
    relay = await db.sms_relay_accounts.find_one({"id": req.relay_id, "status": "ACTIVE"})
    sim = next((entry for entry in (relay or {}).get("sims", []) if entry.get("id") == req.sim_id), None)
    if not sim or sim.get("country") != country:
        raise HTTPException(status_code=400, detail="La SIM sélectionnée n'est pas configurée pour ce pays")
    route = {"country": country, "relay_id": req.relay_id, "sim_id": req.sim_id,
             "operator": sim["operator"], "sender_phone": sim.get("phone", ""),
             "enabled": bool(req.enabled), "updated_at": now_iso(), "updated_by": user["id"]}
    await db.sms_relay_routes.replace_one({"country": country}, route, upsert=True)
    await audit_log(user, "SET_SMS_RELAY_ROUTE", "sms_relay_route", country, None,
                    f"{sim['operator']} via {sim.get('phone') or 'SIM'}")
    return {"route": route}


@router.delete("/admin/comm/relay-routes/{country}")
async def delete_relay_route(country: str, user: dict = Depends(require_module("settings"))):
    await db.sms_relay_routes.delete_one({"country": country})
    await audit_log(user, "DELETE_SMS_RELAY_ROUTE", "sms_relay_route", country, None, None)
    return {"message": "Affectation supprimée"}


async def _current_relay(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentification relais requise")
    try:
        payload = jwt.decode(authorization[7:], get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "sms_relay":
            raise HTTPException(status_code=401, detail="Jeton relais invalide")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide")
    relay = await db.sms_relay_accounts.find_one({"id": payload.get("sub")})
    if not relay or relay.get("status") != "ACTIVE" or payload.get("ver") != relay.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Compte relais inactif ou session révoquée")
    return relay


@router.post("/relay/auth/login")
async def relay_login(req: RelayLoginReq, request: Request):
    await _ensure_indexes()
    phone = req.phone.strip()
    identifier = _key_hash(f"{request.client.host if request.client else 'unknown'}:{phone}")
    attempts = await db.sms_relay_login_attempts.find_one({"_id": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        since = attempts.get("since")
        try:
            if since and datetime.now(timezone.utc) - datetime.fromisoformat(since) < timedelta(minutes=15):
                raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 15 minutes.")
        except ValueError:
            pass
    relay = await db.sms_relay_accounts.find_one({"phone": phone})
    valid = bool(relay and relay.get("status") == "ACTIVE")
    if valid:
        valid = verify_password(req.password, relay.get("password_hash", "")) and hmac.compare_digest(
            _key_hash(req.connection_key), relay.get("connection_key_hash", ""))
    if not valid:
        if not attempts or attempts.get("since", "") < (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat():
            await db.sms_relay_login_attempts.replace_one(
                {"_id": identifier}, {"_id": identifier, "count": 1, "since": now_iso()}, upsert=True)
        else:
            await db.sms_relay_login_attempts.update_one({"_id": identifier}, {"$inc": {"count": 1}})
        raise HTTPException(status_code=401, detail="Identifiants relais incorrects")
    await db.sms_relay_login_attempts.delete_one({"_id": identifier})
    expires = datetime.now(timezone.utc) + timedelta(hours=12)
    token = jwt.encode({"sub": relay["id"], "ver": relay.get("token_version", 0), "type": "sms_relay",
                        "exp": expires}, get_jwt_secret(), algorithm=JWT_ALGORITHM)
    await db.sms_relay_accounts.update_one({"id": relay["id"]}, {"$set": {"last_seen": now_iso()}})
    return {"access_token": token, "token_type": "bearer", "expires_at": expires.isoformat()}


@router.get("/relay/me")
async def relay_me(include_stats: bool = False, relay: dict = Depends(_current_relay)):
    await db.sms_relay_accounts.update_one({"id": relay["id"]}, {"$set": {"last_seen": now_iso()}})
    stats = await _admin_relay_stats(relay["id"]) if include_stats else {}
    public = _public_relay(relay)
    for sim in public["sims"]:
        sim["message_counts"] = stats.get((relay["id"], sim["id"]), {})
    return {"relay": public}


@router.put("/relay/config")
async def save_relay_config(req: RelayConfigReq, relay: dict = Depends(_current_relay)):
    countries = list(dict.fromkeys(country.strip() for country in req.countries if country.strip()))
    if any(country not in COUNTRY_NAMES for country in countries):
        raise HTTPException(status_code=400, detail="Un ou plusieurs pays sont invalides")
    if len(req.sims) > 10:
        raise HTTPException(status_code=400, detail="Dix cartes SIM maximum")
    sims = []
    for entry in req.sims:
        country = str(entry.get("country") or "").strip()
        operator = str(entry.get("operator") or "").strip()[:80]
        phone = str(entry.get("phone") or "").strip()[:32]
        sim_id = str(entry.get("id") or "").strip()[:100]
        if not sim_id or not operator or country not in countries:
            raise HTTPException(status_code=400, detail="Chaque SIM doit avoir un identifiant, un opérateur et un pays sélectionné")
        sims.append({"id": sim_id, "country": country, "operator": operator, "phone": phone})
    await db.sms_relay_accounts.update_one({"id": relay["id"]}, {
        "$set": {"countries": countries, "sims": sims, "last_seen": now_iso()}})
    await db.sms_relay_routes.update_many(
        {"relay_id": relay["id"], "sim_id": {"$nin": [sim["id"] for sim in sims]}},
        {"$set": {"enabled": False}})
    updated = await db.sms_relay_accounts.find_one({"id": relay["id"]})
    return {"relay": _public_relay(updated)}


@router.get("/relay/messages")
async def relay_messages(sim_id: str, relay: dict = Depends(_current_relay)):
    sim = next((entry for entry in relay.get("sims", []) if entry.get("id") == sim_id), None)
    if not sim:
        raise HTTPException(status_code=403, detail="SIM non enregistrée sur ce compte")
    await db.sms_relay_accounts.update_one({"id": relay["id"]}, {"$set": {"last_seen": now_iso()}})
    now = now_iso()
    await db.sms_relay_messages.update_many(
        {"relay_id": relay["id"], "sim_id": sim_id, "status": {"$in": ["QUEUED", "SENDING"]},
         "expires_at": {"$lte": now}},
        {"$set": {"status": "EXPIRED", "updated_at": now}})
    jobs = []
    for _ in range(20):
        claim_id = secrets.token_urlsafe(18)
        job = await db.sms_relay_messages.find_one_and_update(
            {"relay_id": relay["id"], "sim_id": sim_id, "expires_at": {"$gt": now},
             "$or": [{"status": "QUEUED"}, {"status": "SENDING", "lease_until": {"$lte": now}}]},
            {"$set": {"status": "SENDING", "claim_id": claim_id,
                      "lease_until": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
                      "updated_at": now}},
            sort=[("created_at", 1)], return_document=ReturnDocument.AFTER)
        if not job:
            break
        jobs.append({"id": job["id"], "claim_id": claim_id, "to": job["to"],
                     "message": job["message"], "expires_at": job["expires_at"]})
    return {"messages": jobs}


@router.post("/relay/messages/{message_id}/result")
async def relay_message_result(message_id: str, req: RelayResultReq, relay: dict = Depends(_current_relay)):
    if req.status not in ("SENT", "FAILED"):
        raise HTTPException(status_code=400, detail="Résultat invalide")
    result = await db.sms_relay_messages.update_one(
        {"id": message_id, "relay_id": relay["id"], "sim_id": req.sim_id,
         "claim_id": req.claim_id, "status": "SENDING"},
        {"$set": {"status": req.status, "error": req.error[:240] if req.status == "FAILED" else "",
                  "updated_at": now_iso()}})
    if not result.matched_count:
        raise HTTPException(status_code=409, detail="Message déjà traité ou réservation expirée")
    message = await db.sms_relay_messages.find_one({"id": message_id})
    await db.message_log.insert_one({
        "id": new_id(), "channel": "sms", "provider": f"Relais {message.get('operator')}",
        "to": message.get("to", "")[:3] + "***", "subject": "SMS relay",
        "status": req.status, "at": now_iso(),
    })
    return {"message": "Résultat enregistré"}


async def enqueue_sms(country: str, phone: str, text: str) -> str | None:
    """Queue an SMS only when an administrator has assigned an active relay SIM."""
    if not re.fullmatch(r"\+?[0-9]{6,20}", phone or ""):
        return None
    if len(text or "") > 160 or not re.search(r"(?<![0-9])[0-9]{6}(?![0-9])", text or ""):
        return None
    route = await db.sms_relay_routes.find_one({"country": country, "enabled": True})
    if not route:
        return None
    relay = await db.sms_relay_accounts.find_one({"id": route["relay_id"], "status": "ACTIVE"})
    sim = next((entry for entry in (relay or {}).get("sims", []) if entry.get("id") == route.get("sim_id")
                and entry.get("country") == country), None)
    if not relay or not sim or not _public_relay(relay)["online"]:
        return None
    now = datetime.now(timezone.utc)
    await db.sms_relay_messages.insert_one({
        "id": new_id(), "relay_id": relay["id"], "sim_id": sim["id"], "country": country,
        "operator": sim["operator"], "sender_phone": sim.get("phone", ""), "to": phone,
        "message": text, "purpose": "OTP_2FA", "status": "QUEUED", "created_at": now.isoformat(),
        "updated_at": now.isoformat(), "expires_at": (now + timedelta(minutes=15)).isoformat(),
    })
    return sim["operator"]
