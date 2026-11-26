"""Emergent object storage helper (product images, uploads)."""
import os
import logging

import requests

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "afrimarket"

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "csv": "text/csv", "txt": "text/plain",
}

_storage_key = None
LOCAL_DIR = os.environ.get("LOCAL_STORAGE_DIR", "/data/uploads")


def _local_path(path: str) -> str:
    full = os.path.realpath(os.path.join(LOCAL_DIR, path))
    if not full.startswith(os.path.realpath(LOCAL_DIR) + os.sep):
        raise ValueError("invalid path")
    return full


def _remote_enabled() -> bool:
    return bool(EMERGENT_KEY)


def _put_local(path: str, data: bytes) -> dict:
    full = _local_path(path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as fh:
        fh.write(data)
    return {"path": path, "size": len(data)}


def init_storage(force: bool = False):
    global _storage_key
    if not _remote_enabled():
        os.makedirs(LOCAL_DIR, exist_ok=True)
        return "local"
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if not _remote_enabled():
        return _put_local(path, data)
    try:
        return _put_remote(path, data, content_type)
    except Exception as exc:
        logger.warning("remote storage failed, using local disk: %s", exc)
        return _put_local(path, data)


def _put_remote(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    try:
        full = _local_path(path)
        if os.path.isfile(full):
            with open(full, "rb") as fh:
                ext = full.rsplit(".", 1)[-1].lower()
                return fh.read(), MIME_TYPES.get(ext, "application/octet-stream")
    except ValueError:
        pass
    if not _remote_enabled():
        raise FileNotFoundError(path)
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def delete_object(path: str) -> bool:
    """Best-effort removal of a stored object; returns False when the storage refuses or is unreachable."""
    try:
        full = _local_path(path)
        if os.path.isfile(full):
            os.remove(full)
            return True
    except (ValueError, OSError):
        pass
    if not _remote_enabled():
        return True
    try:
        key = init_storage()
        resp = requests.delete(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=30)
        return resp.status_code in (200, 202, 204, 404)
    except requests.RequestException as exc:
        logger.warning("storage delete failed for %s: %s", path, exc)
        return False
