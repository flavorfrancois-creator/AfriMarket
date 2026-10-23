"""Categories & sub-categories: admin CRUD, merchant proposals validated by admins."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db, new_id, now_iso
from security import get_current_user
from business import audit_log, notify
from rbac import require_module, is_staff

router = APIRouter(prefix="/api")
FR = {"locale": "fr", "strength": 1}


class CategoryReq(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    active: Optional[bool] = None
    position: Optional[int] = None


class DecisionReq(BaseModel):
    decision: str
    note: Optional[str] = ""


def _view(c: dict) -> dict:
    return {k: c.get(k) for k in ("id", "name", "parent_id", "status", "active", "position", "proposed_by",
                                   "proposer_name", "created_at")} | {"active": c.get("active", True)}


async def _dup(name: str, parent_id: Optional[str], exclude: Optional[str] = None):
    q = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "parent_id": parent_id, "status": {"$ne": "REJECTED"}}
    if exclude:
        q["id"] = {"$ne": exclude}
    if await db.categories.find_one(q):
        raise HTTPException(status_code=400, detail="Une catégorie portant ce nom existe déjà à cet endroit")


async def _parent(parent_id: Optional[str]) -> Optional[dict]:
    if not parent_id:
        return None
    p = await db.categories.find_one({"id": parent_id, "parent_id": None, "status": "APPROVED"})
    if not p:
        raise HTTPException(status_code=400, detail="Catégorie parente introuvable")
    return p


async def valid_pair(category: str, subcategory: str) -> bool:
    if not category:
        return not subcategory
    parent = await db.categories.find_one({"name": category, "parent_id": None, "status": "APPROVED", "active": {"$ne": False}})
    if not parent:
        return False
    return not subcategory or bool(await db.categories.find_one(
        {"name": subcategory, "parent_id": parent["id"], "status": "APPROVED", "active": {"$ne": False}}))


async def check_pair(category: Optional[str], subcategory: Optional[str]):
    if not await valid_pair((category or "").strip(), (subcategory or "").strip()):
        raise HTTPException(status_code=400, detail="Catégorie ou sous-catégorie invalide : choisissez-en une dans la liste ou proposez-la à l'administrateur")


async def _move_commission(old: str, new: Optional[str]):
    s = await db.platform_settings.find_one({"_id": "global"}, {"category_commissions": 1}) or {}
    cc = s.get("category_commissions") or {}
    if old not in cc:
        return
    rate = cc.pop(old)
    if new:
        cc[new] = rate
    await db.platform_settings.update_one({"_id": "global"}, {"$set": {"category_commissions": cc}})


async def _notify_merchants(query: dict, title: str, body: str):
    shop_ids = await db.products.distinct("shop_id", query)
    owners = {s["owner_id"] async for s in db.shops.find({"id": {"$in": shop_ids}}, {"owner_id": 1})}
    for o in owners:
        await notify(o, "CATEGORY", title, body, "/merchant/products")


# ---------------- Public / merchants ----------------
@router.get("/categories")
async def list_categories():
    rows = await db.categories.find({"status": "APPROVED", "active": {"$ne": False}}, {"_id": 0}, collation=FR).sort([("position", 1), ("name", 1)]).to_list(1000)
    parents = [_view(c) | {"children": []} for c in rows if not c.get("parent_id")]
    by_id = {p["id"]: p for p in parents}
    for c in rows:
        if c.get("parent_id") in by_id:
            by_id[c["parent_id"]]["children"].append(_view(c))
    return {"categories": parents}


@router.post("/categories")
async def propose_category(req: CategoryReq, user: dict = Depends(get_current_user)):
    name = (req.name or "").strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    if user["role"] != "MERCHANT" and not is_staff(user):
        raise HTTPException(status_code=403, detail="Réservé aux commerçants")
    await _parent(req.parent_id)
    await _dup(name, req.parent_id or None)
    admin = user["role"] in ("SUPER_ADMIN", "ADMIN")
    doc = {"id": new_id(), "name": name, "parent_id": req.parent_id or None, "status": "APPROVED" if admin else "PENDING",
           "active": True, "position": 999, "proposed_by": user["id"], "proposer_name": user.get("name"), "created_at": now_iso()}
    await db.categories.insert_one(dict(doc))
    return {"category": _view(doc),
            "message": "Catégorie créée" if admin else "Proposition envoyée à l'administrateur pour validation"}


# ---------------- Admin ----------------
@router.get("/admin/categories")
async def admin_categories(user: dict = Depends(require_module("products"))):
    rows = await db.categories.find({"status": {"$ne": "REJECTED"}}, {"_id": 0}, collation=FR).sort([("position", 1), ("name", 1)]).to_list(2000)
    names = {c["id"]: c["name"] for c in rows}
    out = []
    for c in rows:
        v = _view(c)
        if c.get("parent_id"):
            v["products"] = await db.products.count_documents({"category": names.get(c["parent_id"]), "subcategory": c["name"], "status": {"$ne": "DELETED"}})
        else:
            v["products"] = await db.products.count_documents({"category": c["name"], "status": {"$ne": "DELETED"}})
        out.append(v)
    uncategorized = await db.products.count_documents({"category": {"$in": ["", None]}, "status": {"$ne": "DELETED"}})
    return {"categories": out, "uncategorized": uncategorized}


@router.post("/admin/categories")
async def admin_create_category(req: CategoryReq, user: dict = Depends(require_module("products"))):
    name = (req.name or "").strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    await _parent(req.parent_id)
    await _dup(name, req.parent_id or None)
    doc = {"id": new_id(), "name": name, "parent_id": req.parent_id or None, "status": "APPROVED", "active": True,
           "position": req.position if req.position is not None else 999, "proposed_by": user["id"],
           "proposer_name": user.get("name"), "created_at": now_iso()}
    await db.categories.insert_one(dict(doc))
    await audit_log(user, "CREATE_CATEGORY", "category", doc["id"], None, name)
    return {"category": _view(doc)}


@router.put("/admin/categories/{cid}")
async def admin_update_category(cid: str, req: CategoryReq, user: dict = Depends(require_module("products"))):
    c = await db.categories.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    upd = {}
    if req.active is not None:
        upd["active"] = req.active
    if req.position is not None:
        upd["position"] = req.position
    name = (req.name or "").strip()[:80]
    if name and name != c["name"]:
        await _dup(name, c.get("parent_id"), cid)
        upd["name"] = name
        if c.get("parent_id"):
            p = await db.categories.find_one({"id": c["parent_id"]})
            await db.products.update_many({"category": p["name"] if p else None, "subcategory": c["name"]}, {"$set": {"subcategory": name}})
        else:
            await db.products.update_many({"category": c["name"]}, {"$set": {"category": name}})
            await _move_commission(c["name"], name)
    if upd:
        await db.categories.update_one({"id": cid}, {"$set": upd})
    await audit_log(user, "UPDATE_CATEGORY", "category", cid, c.get("name"), upd)
    return {"category": _view(await db.categories.find_one({"id": cid}))}


@router.put("/admin/categories/{cid}/decision")
async def admin_decide_category(cid: str, req: DecisionReq, user: dict = Depends(require_module("products"))):
    if req.decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Décision invalide")
    c = await db.categories.find_one_and_update({"id": cid, "status": "PENDING"},
                                                {"$set": {"status": "APPROVED" if req.decision == "APPROVE" else "REJECTED",
                                                          "decided_by": user["id"], "decided_at": now_iso()}})
    if not c:
        raise HTTPException(status_code=404, detail="Proposition introuvable ou déjà traitée")
    if c.get("proposed_by"):
        ok = req.decision == "APPROVE"
        await notify(c["proposed_by"], "CATEGORY", "Proposition de catégorie " + ("acceptée" if ok else "refusée"),
                     f"« {c['name']} » a été {'acceptée' if ok else 'refusée'}." + (f" {req.note}" if req.note else ""), "/merchant/products")
    await audit_log(user, "DECIDE_CATEGORY", "category", cid, None, req.decision)
    return {"message": "Proposition traitée"}


@router.delete("/admin/categories/{cid}")
async def admin_delete_category(cid: str, user: dict = Depends(require_module("products"))):
    c = await db.categories.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    if c.get("parent_id"):
        p = await db.categories.find_one({"id": c["parent_id"]}) or {}
        q = {"category": p.get("name"), "subcategory": c["name"], "status": {"$ne": "DELETED"}}
        affected = await db.products.count_documents(q)
        await _notify_merchants(q, "Sous-catégorie supprimée",
                                f"La sous-catégorie « {c['name']} » ({p.get('name', '')}) a été supprimée. Réattribuez une sous-catégorie à vos articles concernés.")
        await db.products.update_many(q, {"$set": {"subcategory": ""}})
        await db.categories.delete_one({"id": cid})
    else:
        q = {"category": c["name"], "status": {"$ne": "DELETED"}}
        affected = await db.products.count_documents(q)
        await _notify_merchants(q, "Catégorie supprimée",
                                f"La catégorie « {c['name']} » a été supprimée. Vos articles concernés sont passés dans « Sans catégorie » : réattribuez une catégorie et une sous-catégorie.")
        await db.products.update_many({"category": c["name"]}, {"$set": {"category": "", "subcategory": ""}})
        await db.categories.delete_many({"$or": [{"id": cid}, {"parent_id": cid}]})
        await _move_commission(c["name"], None)
    await audit_log(user, "DELETE_CATEGORY", "category", cid, c["name"], affected)
    return {"message": f"Catégorie supprimée ({affected} article(s) à réattribuer)", "affected": affected}
