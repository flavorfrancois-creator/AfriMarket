"""MongoDB connection and shared helpers."""
import os
import uuid
import random
import string
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def gen_invite_code() -> str:
    return "INVITE-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def gen_order_ref() -> str:
    return "CMD-" + "".join(random.choices(string.digits, k=8))


def gen_tracking() -> str:
    return "AM" + "".join(random.choices(string.digits, k=12))


def gen_sku() -> str:
    return "SKU-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def serialize(doc):
    """Convert a Mongo document to a JSON-safe dict (drop _id, keep string id field)."""
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


def oid(value: str):
    try:
        return ObjectId(value)
    except Exception:
        return None
