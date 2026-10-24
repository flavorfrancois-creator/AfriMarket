"""Route tracking: relay points, partner accounts (relay managers / carriers), parcel scan events, local couriers."""
import asyncio
import hmac
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from db import db, new_id, now_iso
from security import get_current_user, hash_password
from business import audit_log
from messaging import send_message, send_to_users
from rbac import require_module, get_settings

router = APIRouter(prefix="/api")
logger = logging.getLogger("logistics")
_bg = set()

PARTNER_ROLES = ("RELAY_MANAGER", "CARRIER_AGENT")
EDIT_MODES = ("NONE", "APPROVAL", "DIRECT")
POINT_FIELDS = ("name", "code", "country", "city", "address", "phone", "opening_hours", "lat", "lon")
RELAY_EVENTS = ("ARRIVED", "DEPARTED", "AVAILABLE_PICKUP", "HANDED_LOCAL_COURIER")
CARRIER_EVENTS = ("POSITION", "ARRIVED", "DEPARTED")
EVENT_LABELS = {
    "ARRIVED": "Arrivé au point relais", "DEPARTED": "Parti du point relais", "POSITION": "Position mise à jour",
    "AVAILABLE_PICKUP": "Disponible au point relais", "HANDED_LOCAL_COURIER": "Remis au livreur local",
}
TRACKABLE = ("PRETE", "EXPEDIEE")


class RelayPointReq(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    active: Optional[bool] = None


class PartnerAccountReq(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    country: Optional[str] = None
    relay_point_id: Optional[str] = None
    carrier_id: Optional[str] = None
    relay_edit_mode: Optional[str] = None
    status: Optional[str] = None
    create_proposed_point: bool = False


class ChangeDecisionReq(BaseModel):
    decision: str
    note: Optional[str] = ""


class CourierReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    relay_point_id: Optional[str] = None
    active: Optional[bool] = None


class ParcelEventReq(BaseModel):
    type: str
    method: str = "MANUAL"
    relay_point_id: Optional[str] = None
    location: Optional[str] = ""
    courier_id: Optional[str] = None
    note: Optional[str] = ""
    lat: Optional[float] = None
    lon: Optional[float] = None


def _point_updates(req: RelayPointReq) -> dict:
    upd = {k: getattr(req, k) for k in POINT_FIELDS if getattr(req, k) is not None}
    for k in ("name", "code", "country", "city", "address", "phone", "opening_hours"):
        if k in upd:
            upd[k] = str(upd[k]).strip()
    if req.active is not None:
        upd["active"] = bool(req.active)
    return upd


def require_partner():
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in PARTNER_ROLES:
            raise HTTPException(status_code=403, detail="Réservé aux points relais et transporteurs")
        if (user.get("status") or "ACTIVE") != "ACTIVE":
            raise HTTPException(status_code=403, detail="Compte en attente de validation ou suspendu")
        return user
    return dep


def _partner_public(u: dict) -> dict:
    return {"id": str(u["_id"]), "name": u.get("name"), "email": u.get("email"), "phone": u.get("phone", ""),
            "role": u.get("role"), "country": u.get("country", ""), "status": u.get("status", "ACTIVE"),
            "relay_point_id": u.get("relay_point_id"), "carrier_id": u.get("carrier_id"),
            "relay_edit_mode": u.get("relay_edit_mode", "NONE"), "proposed_relay": u.get("proposed_relay"),
            "created_at": u.get("created_at")}


# ---------------- Public ----------------
@router.get("/relay-points")
async def public_relay_points(country: Optional[str] = None):
    q = {"active": True}
    if country:
        q["country"] = country
    rows = await db.relay_points.find(q, {"_id": 0}).sort([("country", 1), ("city", 1)]).to_list(1000)
    return {"relay_points": rows}


@router.get("/logistics/carriers")
async def public_carriers():
    rows = await db.carriers.find({"active": True}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(100)
    return {"carriers": rows}


# ---------------- Admin: relay points ----------------
@router.get("/admin/relay-points")
async def admin_relay_points(user: dict = Depends(require_module("settings"))):
    rows = await db.relay_points.find({}, {"_id": 0}).sort([("country", 1), ("city", 1)]).to_list(1000)
    return {"relay_points": rows}


@router.post("/admin/relay-points")
async def admin_create_relay_point(req: RelayPointReq, user: dict = Depends(require_module("settings"))):
    upd = _point_updates(req)
    if not upd.get("name") or not upd.get("city") or not upd.get("country"):
        raise HTTPException(status_code=400, detail="Nom, ville et pays requis")
    doc = {"id": new_id(), "active": True, **upd, "created_at": now_iso(), "created_by": user["id"]}
    doc.setdefault("code", "PR-" + doc["id"][:6].upper())
    await db.relay_points.insert_one(dict(doc))
    await audit_log(user, "CREATE_RELAY_POINT", "relay_point", doc["id"], None, doc["name"])
    return {"relay_point": doc}


@router.put("/admin/relay-points/{pid}")
async def admin_update_relay_point(pid: str, req: RelayPointReq, user: dict = Depends(require_module("settings"))):
    old = await db.relay_points.find_one({"id": pid}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    upd = _point_updates(req)
    if upd:
        await db.relay_points.update_one({"id": pid}, {"$set": {**upd, "updated_at": now_iso()}})
    await audit_log(user, "UPDATE_RELAY_POINT", "relay_point", pid, None, upd)
    return {"relay_point": await db.relay_points.find_one({"id": pid}, {"_id": 0})}


@router.delete("/admin/relay-points/{pid}")
async def admin_delete_relay_point(pid: str, user: dict = Depends(require_module("settings"))):
    res = await db.relay_points.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    await db.users.update_many({"relay_point_id": pid}, {"$set": {"relay_point_id": None}})
    await audit_log(user, "DELETE_RELAY_POINT", "relay_point", pid, None, None)
    return {"message": "Point relais supprimé"}


# ---------------- Admin: partner accounts ----------------
@router.get("/admin/logistics/accounts")
async def admin_partner_accounts(user: dict = Depends(require_module("settings"))):
    rows = await db.users.find({"role": {"$in": list(PARTNER_ROLES)}}).sort("created_at", -1).to_list(1000)
    return {"accounts": [_partner_public(u) for u in rows]}


@router.post("/admin/logistics/accounts")
async def admin_create_partner(req: PartnerAccountReq, user: dict = Depends(require_module("settings"))):
    if req.role not in PARTNER_ROLES or not req.email or not req.name or not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Nom, e-mail, mot de passe (6+ caractères) et rôle requis")
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet e-mail est déjà utilisé")
    doc = {"name": req.name.strip(), "email": email, "password_hash": hash_password(req.password),
           "phone": req.phone or "", "role": req.role, "country": req.country or "", "status": "ACTIVE",
           "relay_point_id": req.relay_point_id if req.role == "RELAY_MANAGER" else None,
           "carrier_id": req.carrier_id if req.role == "CARRIER_AGENT" else None,
           "relay_edit_mode": req.relay_edit_mode if req.relay_edit_mode in EDIT_MODES else "NONE",
           "token_version": 0, "email_verified": True, "created_at": now_iso(), "created_by": user["id"]}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(user, "CREATE_PARTNER", "user", str(res.inserted_id), None, f"{req.role} {email}")
    return {"account": _partner_public(doc)}


@router.put("/admin/logistics/accounts/{uid}")
async def admin_update_partner(uid: str, req: PartnerAccountReq, user: dict = Depends(require_module("settings"))):
    try:
        target = await db.users.find_one({"_id": ObjectId(uid), "role": {"$in": list(PARTNER_ROLES)}})
    except Exception:
        target = None
    if not target:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    upd = {}
    if req.relay_edit_mode is not None:
        if req.relay_edit_mode not in EDIT_MODES:
            raise HTTPException(status_code=400, detail="Mode de modification invalide")
        upd["relay_edit_mode"] = req.relay_edit_mode
    if req.relay_point_id is not None:
        upd["relay_point_id"] = req.relay_point_id or None
    if req.carrier_id is not None:
        upd["carrier_id"] = req.carrier_id or None
    if req.create_proposed_point and target.get("proposed_relay") and not target.get("relay_point_id"):
        p = target["proposed_relay"]
        point = {"id": new_id(), "active": True, "name": p.get("name", ""), "city": p.get("city", ""),
                 "address": p.get("address", ""), "country": p.get("country") or target.get("country", ""),
                 "phone": target.get("phone", ""), "created_at": now_iso(), "created_by": user["id"]}
        point["code"] = "PR-" + point["id"][:6].upper()
        await db.relay_points.insert_one(dict(point))
        upd["relay_point_id"] = point["id"]
    if req.status is not None:
        if req.status not in ("ACTIVE", "SUSPENDED", "REJECTED", "PENDING"):
            raise HTTPException(status_code=400, detail="Statut invalide")
        upd["status"] = req.status
        if req.status != "ACTIVE":
            upd["token_version"] = int(target.get("token_version", 0)) + 1
    if upd:
        await db.users.update_one({"_id": target["_id"]}, {"$set": upd})
    new_status = upd.get("status")
    old_status = target.get("status")
    if new_status and new_status != old_status:
        key = {"ACTIVE": "auth_account_approved" if old_status == "PENDING" else "auth_account_reactivated",
               "REJECTED": "auth_account_rejected", "SUSPENDED": "auth_account_suspended"}.get(new_status)
        if key:
            await send_message(uid, key, {}, "/partner/account", "ACCOUNT")
    await audit_log(user, "UPDATE_PARTNER", "user", uid, target.get("status"),
                    {k: v for k, v in upd.items() if k != "token_version"})
    return {"account": _partner_public(await db.users.find_one({"_id": target["_id"]}))}


# ---------------- Admin: change requests ----------------
@router.get("/admin/relay-change-requests")
async def admin_change_requests(status: Optional[str] = "PENDING", user: dict = Depends(require_module("settings"))):
    q = {"status": status} if status else {}
    rows = await db.relay_change_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"requests": rows}


@router.put("/admin/relay-change-requests/{rid}")
async def admin_decide_change(rid: str, req: ChangeDecisionReq, user: dict = Depends(require_module("settings"))):
    if req.decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    cr = await db.relay_change_requests.find_one_and_update(
        {"id": rid, "status": "PENDING"},
        {"$set": {"status": "APPROVED" if req.decision == "APPROVE" else "REJECTED", "decided_by": user["id"],
                  "decided_at": now_iso(), "decision_note": req.note or ""}})
    if not cr:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà traitée")
    if req.decision == "APPROVE":
        await db.relay_points.update_one({"id": cr["relay_point_id"]}, {"$set": {**cr["changes"], "updated_at": now_iso()}})
    await send_message(cr["requested_by"], "relay_change_decision",
                       {"point": cr.get("relay_name", ""), "decision": "acceptée" if req.decision == "APPROVE" else "refusée"},
                       "/partner/relay-points", "RELAY_CHANGE")
    await audit_log(user, "DECIDE_RELAY_CHANGE", "relay_point", cr["relay_point_id"], None, req.decision)
    return {"message": "Demande traitée"}


# ---------------- Admin: local couriers ----------------
@router.get("/admin/local-couriers")
async def admin_couriers(user: dict = Depends(require_module("settings"))):
    return {"couriers": await db.local_couriers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)}


@router.post("/admin/local-couriers")
async def admin_create_courier(req: CourierReq, user: dict = Depends(require_module("settings"))):
    if not (req.name or "").strip() or not (req.phone or "").strip():
        raise HTTPException(status_code=400, detail="Nom et téléphone requis")
    doc = {"id": new_id(), "name": req.name.strip(), "phone": req.phone.strip(), "country": req.country or "",
           "city": req.city or "", "relay_point_id": req.relay_point_id or None, "active": True, "created_at": now_iso()}
    await db.local_couriers.insert_one(dict(doc))
    await audit_log(user, "CREATE_LOCAL_COURIER", "local_courier", doc["id"], None, doc["name"])
    return {"courier": doc}


@router.put("/admin/local-couriers/{cid}")
async def admin_update_courier(cid: str, req: CourierReq, user: dict = Depends(require_module("settings"))):
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    res = await db.local_couriers.update_one({"id": cid}, {"$set": upd}) if upd else None
    if res is not None and res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Livreur introuvable")
    return {"courier": await db.local_couriers.find_one({"id": cid}, {"_id": 0})}


@router.delete("/admin/local-couriers/{cid}")
async def admin_delete_courier(cid: str, user: dict = Depends(require_module("settings"))):
    res = await db.local_couriers.delete_one({"id": cid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Livreur introuvable")
    await audit_log(user, "DELETE_LOCAL_COURIER", "local_courier", cid, None, None)
    return {"message": "Livreur supprimé"}


# ---------------- Partner app ----------------
@router.get("/partner/me")
async def partner_me(user: dict = Depends(require_partner())):
    point = await db.relay_points.find_one({"id": user.get("relay_point_id")}, {"_id": 0}) if user.get("relay_point_id") else None
    carrier = await db.carriers.find_one({"id": user.get("carrier_id")}, {"_id": 0, "id": 1, "name": 1}) if user.get("carrier_id") else None
    pending = await db.relay_change_requests.find({"requested_by": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"account": _partner_public(user), "relay_point": point, "carrier": carrier, "change_requests": pending}


@router.get("/partner/relay-points")
async def partner_relay_points(user: dict = Depends(require_partner())):
    return {"relay_points": await db.relay_points.find({"active": True}, {"_id": 0}).sort([("country", 1), ("city", 1)]).to_list(1000)}


@router.put("/partner/relay-points/{pid}")
async def partner_update_relay_point(pid: str, req: RelayPointReq, user: dict = Depends(require_partner())):
    mode = user.get("relay_edit_mode", "NONE")
    if mode == "NONE":
        raise HTTPException(status_code=403, detail="Modification non autorisée par l'administrateur")
    if user["role"] == "RELAY_MANAGER" and user.get("relay_point_id") != pid:
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que votre point relais")
    point = await db.relay_points.find_one({"id": pid}, {"_id": 0})
    if not point:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    upd = _point_updates(req)
    upd.pop("active", None)
    if not upd:
        raise HTTPException(status_code=400, detail="Aucune modification")
    if mode == "DIRECT":
        await db.relay_points.update_one({"id": pid}, {"$set": {**upd, "updated_at": now_iso()}})
        await audit_log(user, "PARTNER_UPDATE_RELAY_POINT", "relay_point", pid, None, upd)
        return {"applied": True, "message": "Point relais modifié", "relay_point": await db.relay_points.find_one({"id": pid}, {"_id": 0})}
    cr = {"id": new_id(), "relay_point_id": pid, "relay_name": point["name"], "changes": upd,
          "previous": {k: point.get(k) for k in upd}, "requested_by": user["id"], "requester_name": user.get("name"),
          "requester_role": user["role"], "status": "PENDING", "created_at": now_iso()}
    await db.relay_change_requests.insert_one(dict(cr))
    await audit_log(user, "REQUEST_RELAY_CHANGE", "relay_point", pid, None, upd)
    return {"applied": False, "message": "Demande envoyée à l'administrateur pour validation", "request": cr}


@router.get("/partner/local-couriers")
async def partner_couriers(user: dict = Depends(require_partner())):
    q = {"active": True}
    if user["role"] == "RELAY_MANAGER" and user.get("relay_point_id"):
        point = await db.relay_points.find_one({"id": user["relay_point_id"]})
        if point:
            q["$or"] = [{"country": point.get("country")}, {"country": ""}, {"relay_point_id": point["id"]}]
    return {"couriers": await db.local_couriers.find(q, {"_id": 0}).sort("name", 1).to_list(500)}


async def _find_parcel(code: str, user: dict) -> dict:
    code = (code or "").strip()
    order = await db.orders.find_one({"$or": [{"tracking_number": code}, {"ref": code}]}) if code else None
    if not order:
        raise HTTPException(status_code=404, detail="Aucun colis ne correspond à ce code")
    if user["role"] == "CARRIER_AGENT" and order.get("carrier_id") != user.get("carrier_id"):
        raise HTTPException(status_code=403, detail="Ce colis n'est pas confié à votre transporteur")
    return order


def _parcel_view(o: dict) -> dict:
    return {"id": o["id"], "ref": o["ref"], "tracking_number": o.get("tracking_number"), "status": o["status"],
            "shop_name": o.get("shop_name"), "customer_name": o.get("customer_name"), "address": o.get("address"),
            "destination_country": o.get("destination_country"), "carrier_name": o.get("carrier_name"),
            "items_count": sum(int(i.get("qty", 0)) for i in o.get("items", [])),
            "route_events": o.get("route_events", []), "current_location": o.get("current_location"),
            "last_mile": o.get("last_mile"), "created_at": o.get("created_at")}


@router.get("/partner/parcels/{code}")
async def partner_parcel(code: str, user: dict = Depends(require_partner())):
    return {"parcel": _parcel_view(await _find_parcel(code, user))}


@router.get("/partner/parcels")
async def partner_parcels(user: dict = Depends(require_partner())):
    q = {"route_events.by": user["id"]}
    if user["role"] == "CARRIER_AGENT" and user.get("carrier_id"):
        q = {"$or": [q, {"carrier_id": user["carrier_id"], "status": {"$in": list(TRACKABLE)}}]}
    elif user["role"] == "RELAY_MANAGER" and user.get("relay_point_id"):
        q = {"$or": [q, {"route_events.relay_point_id": user["relay_point_id"]}]}
    rows = await db.orders.find(q).sort("created_at", -1).to_list(200)
    return {"parcels": [_parcel_view(o) for o in rows]}


@router.post("/partner/parcels/{code}/events")
async def partner_parcel_event(code: str, req: ParcelEventReq, user: dict = Depends(require_partner())):
    order = await _find_parcel(code, user)
    allowed = RELAY_EVENTS if user["role"] == "RELAY_MANAGER" else CARRIER_EVENTS
    if req.type not in allowed:
        raise HTTPException(status_code=400, detail="Type d'événement non autorisé pour ce compte")
    if order["status"] not in TRACKABLE:
        raise HTTPException(status_code=400, detail=f"Colis non suivi (statut {order['status']})")
    if order.get("last_mile") and req.type != "POSITION":
        raise HTTPException(status_code=400, detail="Le colis est déjà en dernière étape de livraison")
    point_id = user.get("relay_point_id") if user["role"] == "RELAY_MANAGER" else req.relay_point_id
    if user["role"] == "RELAY_MANAGER" and not point_id:
        raise HTTPException(status_code=400, detail="Aucun point relais rattaché à votre compte")
    point = await db.relay_points.find_one({"id": point_id}) if point_id else None
    if point_id and not point:
        raise HTTPException(status_code=400, detail="Point relais introuvable")
    if user["role"] == "CARRIER_AGENT" and not point and not (req.location or "").strip() and req.lat is None:
        raise HTTPException(status_code=400, detail="Indiquez un point relais ou une position")
    courier = None
    if req.type == "HANDED_LOCAL_COURIER":
        courier = await db.local_couriers.find_one({"id": req.courier_id, "active": True}) if req.courier_id else None
        if not courier:
            raise HTTPException(status_code=400, detail="Choisissez un livreur local recensé")
    location = (f"{point['name']} — {point.get('city', '')}, {point.get('country', '')}" if point
                else (req.location or "").strip() or f"GPS {req.lat:.5f}, {req.lon:.5f}")
    ev = {"id": new_id(), "type": req.type, "label": EVENT_LABELS[req.type],
          "method": "SCAN" if req.method == "SCAN" else "MANUAL",
          "relay_point_id": point_id, "relay_name": point["name"] if point else None,
          "city": point.get("city") if point else None, "location": location,
          "lat": req.lat, "lon": req.lon, "note": (req.note or "").strip(),
          "courier_id": courier["id"] if courier else None, "courier_name": courier["name"] if courier else None,
          "courier_phone": courier["phone"] if courier else None,
          "by": user["id"], "by_name": user.get("name"), "by_role": user["role"], "at": now_iso()}
    upd = {"current_location": location, "last_event_at": ev["at"]}
    if req.type in ("AVAILABLE_PICKUP", "HANDED_LOCAL_COURIER"):
        upd["last_mile"] = req.type
    push = {"route_events": ev}
    if order["status"] == "PRETE":
        shipped = datetime.now(timezone.utc)
        delay = 5
        if order.get("carrier_id"):
            c = await db.carriers.find_one({"id": order["carrier_id"]})
            if c:
                delay = int(c.get("delay_days", 5) or 5)
        upd.update(status="EXPEDIEE", shipped_at=shipped.isoformat(),
                   expected_delivery=(shipped + timedelta(days=delay)).isoformat())
        push["status_history"] = {"status": "EXPEDIEE", "at": ev["at"], "by": user["id"]}
    res = await db.orders.update_one({"id": order["id"], **({} if req.type == "POSITION" else {"last_mile": None})},
                                     {"$set": upd, "$push": push})
    if res.matched_count == 0:
        raise HTTPException(status_code=400, detail="Le colis est déjà en dernière étape de livraison")
    await audit_log(user, "PARCEL_EVENT", "order", order["id"], None, f"{req.type} {location}")
    code_hint = order.get("tracking_number") or order["ref"]
    ref = order["ref"]
    shop = await db.shops.find_one({"id": order["shop_id"]}, {"owner_id": 1})
    owner = shop["owner_id"] if shop else None
    if req.type == "AVAILABLE_PICKUP":
        await send_message(order["customer_id"], "client_parcel_available", {"ref": ref, "location": location, "code": code_hint},
                           f"/account/orders?order_id={order['id']}", "ORDER_UPDATE")
        if owner:
            await send_message(owner, "merchant_parcel_available", {"ref": ref, "location": location},
                               f"/merchant/orders?order_id={order['id']}", "ORDER_UPDATE")
        await send_to_users({"role": "RELAY_MANAGER", "relay_point_id": point_id, "status": "ACTIVE"}, "relay_parcel_to_handover",
                            {"ref": ref, "customer": order.get("customer_name", "")},
                            f"/partner/parcels?order_id={order['id']}", "PARCEL")
    elif req.type == "HANDED_LOCAL_COURIER":
        await send_message(order["customer_id"], "client_parcel_local_courier",
                           {"ref": ref, "courier": courier["name"], "phone": courier["phone"], "code": code_hint},
                           f"/account/orders?order_id={order['id']}", "ORDER_UPDATE")
        if owner:
            await send_message(owner, "merchant_parcel_picked", {"ref": ref, "location": f"livreur local {courier['name']}"},
                               f"/merchant/orders?order_id={order['id']}", "ORDER_UPDATE")
    else:
        await send_message(order["customer_id"], "client_parcel_at_relay", {"ref": ref, "location": f"{EVENT_LABELS[req.type].lower()} — {location}"},
                           f"/account/orders?order_id={order['id']}", "ORDER_UPDATE")
        if owner and not order.get("route_events"):
            await send_message(owner, "merchant_parcel_picked", {"ref": ref, "location": location},
                               f"/merchant/orders?order_id={order['id']}", "ORDER_UPDATE")
        if user["role"] == "CARRIER_AGENT" and point_id and req.type in ("POSITION", "DEPARTED"):
            await send_to_users({"role": "RELAY_MANAGER", "relay_point_id": point_id, "status": "ACTIVE"}, "relay_parcel_incoming",
                                {"ref": ref, "carrier": order.get("carrier_name") or user.get("name", "")},
                                f"/partner/parcels?order_id={order['id']}", "PARCEL")
    return {"message": "Progression du colis mise à jour", "event": ev,
            "parcel": _parcel_view(await db.orders.find_one({"id": order["id"]}))}


# ---------------- Daily reminders (platform cron) ----------------
class ReminderSettingsReq(BaseModel):
    not_collected_days: int


async def run_daily_reminders() -> dict:
    """Uncollected relay parcels -> relay managers; late deliveries -> carrier agents. Once per order per day."""
    settings = await get_settings()
    days = max(1, int(settings.get("reminder_not_collected_days") or 3))
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    stats = {"not_collected": 0, "late": 0, "relay_messages": 0, "carrier_messages": 0}
    async for o in db.orders.find({"status": "EXPEDIEE", "last_mile": "AVAILABLE_PICKUP"}):
        ev = next((e for e in reversed(o.get("route_events", [])) if e.get("type") == "AVAILABLE_PICKUP"), None)
        if not ev or o.get("reminder_not_collected_on") == today:
            continue
        waited = (now - datetime.fromisoformat(ev["at"])).days
        if waited < days:
            continue
        q = {"role": "RELAY_MANAGER", "relay_point_id": ev.get("relay_point_id"), "status": "ACTIVE"}
        stats["relay_messages"] += await db.users.count_documents(q)
        await send_to_users(q, "relay_parcel_not_collected", {"ref": o["ref"], "days": waited},
                            f"/partner/parcels?order_id={o['id']}", "PARCEL")
        await db.orders.update_one({"id": o["id"]}, {"$set": {"reminder_not_collected_on": today}})
        stats["not_collected"] += 1
    async for o in db.orders.find({"status": "EXPEDIEE", "carrier_id": {"$nin": [None, ""]},
                                   "expected_delivery": {"$lt": now.isoformat()}, "last_mile": None}):
        if o.get("reminder_late_on") == today:
            continue
        q = {"role": "CARRIER_AGENT", "carrier_id": o["carrier_id"], "status": "ACTIVE"}
        stats["carrier_messages"] += await db.users.count_documents(q)
        await send_to_users(q, "carrier_delivery_late", {"ref": o["ref"]},
                            f"/partner/parcels?order_id={o['id']}", "PARCEL")
        await db.orders.update_one({"id": o["id"]}, {"$set": {"reminder_late_on": today}})
        stats["late"] += 1
    await db.cron_runs.update_one({"_id": "last_daily_reminders"}, {"$set": {"at": now_iso(), "stats": stats}}, upsert=True)
    logger.info("Daily reminders: %s", stats)
    return stats


async def _safe_run():
    try:
        await run_daily_reminders()
    except Exception as e:
        logger.error("Daily reminders failed: %s", e)


@router.post("/cron/daily-reminders")
async def cron_daily_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ["WEBHOOK_CRON_SECRET"]
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = None
    if body is not None and not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("x-webhook-id") or (body or {}).get("run_id") or new_id()
    res = await db.cron_runs.update_one({"_id": f"run:{run_id}"}, {"$setOnInsert": {"at": now_iso(), "name": "daily-reminders"}},
                                        upsert=True)
    if res.upserted_id is None:
        return {"status": "duplicate"}
    task = asyncio.create_task(_safe_run())
    _bg.add(task)
    task.add_done_callback(_bg.discard)
    return {"status": "accepted"}


@router.get("/admin/logistics/reminders")
async def admin_reminders(user: dict = Depends(require_module("settings"))):
    s = await get_settings()
    last = await db.cron_runs.find_one({"_id": "last_daily_reminders"}) or {}
    return {"not_collected_days": int(s.get("reminder_not_collected_days") or 3), "schedule": "Tous les jours à 08:00 UTC",
            "last_run": last.get("at"), "last_stats": last.get("stats")}


@router.put("/admin/logistics/reminders")
async def admin_update_reminders(req: ReminderSettingsReq, user: dict = Depends(require_module("settings"))):
    if not 1 <= req.not_collected_days <= 60:
        raise HTTPException(status_code=400, detail="Entre 1 et 60 jours")
    await get_settings()
    await db.platform_settings.update_one({"_id": "global"}, {"$set": {"reminder_not_collected_days": req.not_collected_days}})
    await audit_log(user, "UPDATE_REMINDERS", "settings", "reminders", None, req.not_collected_days)
    return {"not_collected_days": req.not_collected_days}


@router.post("/admin/logistics/reminders/run")
async def admin_run_reminders(user: dict = Depends(require_module("settings"))):
    stats = await run_daily_reminders()
    await audit_log(user, "RUN_REMINDERS", "settings", "reminders", None, stats)
    return {"stats": stats}



# ---------------- Admin broadcast to partners ----------------
BROADCAST_TARGETS = ("ALL_RELAYS", "ALL_CARRIERS", "RELAY_POINT", "CARRIER", "ACCOUNT")


class BroadcastReq(BaseModel):
    target: str
    target_id: Optional[str] = None
    subject: str
    body: str
    email: bool = True


async def _broadcast_query(target: str, target_id: Optional[str]) -> dict:
    base = {"status": "ACTIVE"}
    if target == "ALL_RELAYS":
        return {**base, "role": "RELAY_MANAGER"}
    if target == "ALL_CARRIERS":
        return {**base, "role": "CARRIER_AGENT"}
    if not target_id:
        raise HTTPException(status_code=400, detail="Destinataire requis")
    if target == "RELAY_POINT":
        return {**base, "role": "RELAY_MANAGER", "relay_point_id": target_id}
    if target == "CARRIER":
        return {**base, "role": "CARRIER_AGENT", "carrier_id": target_id}
    try:
        return {**base, "_id": ObjectId(target_id), "role": {"$in": list(PARTNER_ROLES)}}
    except Exception:
        raise HTTPException(status_code=400, detail="Compte invalide")


@router.post("/admin/logistics/broadcast")
async def admin_broadcast(req: BroadcastReq, user: dict = Depends(require_module("settings"))):
    from business import notify
    from emailer import send_email
    from messaging import _html
    if req.target not in BROADCAST_TARGETS:
        raise HTTPException(status_code=400, detail="Destinataire invalide")
    subject, body = req.subject.strip()[:150], req.body.strip()[:4000]
    if not subject or not body:
        raise HTTPException(status_code=400, detail="Objet et message requis")
    recipients = await db.users.find(await _broadcast_query(req.target, req.target_id), {"_id": 1, "email": 1}).to_list(1000)
    if not recipients:
        raise HTTPException(status_code=400, detail="Aucun compte actif pour ce destinataire")
    for r in recipients:
        await notify(str(r["_id"]), "ADMIN_MESSAGE", subject, body, "/partner/messages")
        if req.email and r.get("email"):
            task = asyncio.create_task(send_email(to=r["email"], subject=subject, html=_html(body)))
            _bg.add(task)
            task.add_done_callback(_bg.discard)
    doc = {"id": new_id(), "target": req.target, "target_id": req.target_id, "subject": subject, "body": body,
           "email": req.email, "recipients": len(recipients), "by": user["id"], "by_name": user.get("name"), "at": now_iso()}
    await db.partner_broadcasts.insert_one(dict(doc))
    await audit_log(user, "PARTNER_BROADCAST", "broadcast", doc["id"], None, f"{req.target} x{len(recipients)}")
    return {"message": f"Message envoyé à {len(recipients)} compte(s)", "broadcast": doc}


@router.get("/admin/logistics/broadcasts")
async def admin_broadcasts(user: dict = Depends(require_module("settings"))):
    return {"broadcasts": await db.partner_broadcasts.find({}, {"_id": 0}).sort("at", -1).to_list(100)}


# ---------------- Partner daily counters ----------------
@router.get("/partner/stats")
async def partner_stats(user: dict = Depends(require_partner())):
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    late_q = {"status": "EXPEDIEE", "last_mile": None, "expected_delivery": {"$lt": now.isoformat()}}
    if user["role"] == "RELAY_MANAGER":
        pid = user.get("relay_point_id") or "__none__"
        arrived = await db.orders.count_documents({"route_events": {"$elemMatch": {
            "relay_point_id": pid, "type": "ARRIVED", "at": {"$gte": start}}}})
        handover = 0
        late = 0
        async for o in db.orders.find({"status": "EXPEDIEE", "route_events.relay_point_id": pid},
                                      {"route_events": 1, "last_mile": 1, "expected_delivery": 1}):
            last = (o.get("route_events") or [{}])[-1]
            if last.get("relay_point_id") != pid:
                continue
            if o.get("last_mile") == "AVAILABLE_PICKUP":
                handover += 1
            elif not o.get("last_mile") and o.get("expected_delivery") and o["expected_delivery"] < now.isoformat():
                late += 1
        return {"role": "RELAY_MANAGER", "counters": [
            {"key": "arrived", "label": "Arrivés aujourd'hui", "value": arrived},
            {"key": "handover", "label": "À remettre au client", "value": handover},
            {"key": "late", "label": "En retard", "value": late}]}
    cid = user.get("carrier_id") or "__none__"
    to_pick = await db.orders.count_documents({"carrier_id": cid, "status": "PRETE"})
    moved = await db.orders.count_documents({"carrier_id": cid, "route_events": {"$elemMatch": {
        "by_role": "CARRIER_AGENT", "at": {"$gte": start}}}})
    late = await db.orders.count_documents({**late_q, "carrier_id": cid})
    return {"role": "CARRIER_AGENT", "counters": [
        {"key": "to_pick", "label": "À enlever", "value": to_pick},
        {"key": "moved", "label": "Mis à jour aujourd'hui", "value": moved},
        {"key": "late", "label": "En retard", "value": late}]}
