"""Idempotent seeding: super admin account and default categories only (no demo data)."""
import os

from security import hash_password
from db import now_iso, new_id, gen_invite_code
from config_data import currency_for_country

DEFAULT_CATEGORIES = ["Mode & Vêtements", "Électronique", "Maison & Cuisine", "Alimentation", "Beauté & Cosmétiques", "Artisanat"]


async def _ensure_super_admin(db, email, password):
    if await db.users.find_one({"email": email}):
        return
    cur = currency_for_country("Sénégal")
    await db.users.insert_one({
        "name": "Super Admin", "email": email, "password_hash": hash_password(password),
        "phone": "", "role": "SUPER_ADMIN", "country": "Sénégal", "currency": cur["code"],
        "token_version": 0, "phone_verified": True, "email_verified": True, "kyc_status": "NONE",
        "invite_code": gen_invite_code(), "referred_by": None, "is_partner": False, "created_at": now_iso(),
    })


async def seed(db):
    await _ensure_super_admin(db, os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"])
    if await db.categories.count_documents({}) == 0:
        for c in DEFAULT_CATEGORIES:
            await db.categories.insert_one({"id": new_id(), "name": c, "parent_id": None, "active": True,
                                            "proposed_by": "system", "status": "APPROVED", "created_at": now_iso()})
