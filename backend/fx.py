"""Exchange rates (ExchangeRate-API open access), cached in MongoDB, plus cross-border logistics helpers."""
import math
import os
import time
import logging

import httpx

from db import db, now_iso
from config_data import COUNTRIES, currency_for_country

logger = logging.getLogger("fx")
CACHE_TTL = 3600
_mem = {"rates": None, "fetched": 0.0, "updated_at": None}

# Approximate geographic centroids (lat, lon) by ISO2
CENTROIDS = {
    "DZ": (28.0, 2.6), "AO": (-12.3, 17.5), "BJ": (9.3, 2.3), "BW": (-22.3, 24.7), "BF": (12.2, -1.6),
    "BI": (-3.4, 29.9), "CV": (15.1, -23.6), "CM": (5.7, 12.4), "CF": (6.6, 20.9), "TD": (15.4, 18.7),
    "KM": (-11.9, 43.9), "CD": (-2.9, 23.7), "CG": (-0.7, 15.2), "CI": (7.6, -5.5), "DJ": (11.8, 42.6),
    "EG": (26.8, 30.8), "GQ": (1.6, 10.3), "ER": (15.2, 39.8), "SZ": (-26.5, 31.5), "ET": (9.1, 40.5),
    "GA": (-0.8, 11.6), "GM": (13.4, -15.3), "GH": (7.9, -1.0), "GN": (9.9, -9.7), "GW": (11.8, -15.2),
    "KE": (0.0, 37.9), "LS": (-29.6, 28.2), "LR": (6.4, -9.4), "LY": (26.3, 17.2), "MG": (-18.8, 46.9),
    "MW": (-13.3, 34.3), "ML": (17.6, -4.0), "MR": (21.0, -10.9), "MU": (-20.3, 57.6), "MA": (31.8, -7.1),
    "MZ": (-18.7, 35.5), "NA": (-22.9, 18.5), "NE": (17.6, 8.1), "NG": (9.1, 8.7), "RW": (-1.9, 29.9),
    "ST": (0.2, 6.6), "SN": (14.5, -14.5), "SC": (-4.7, 55.5), "SL": (8.5, -11.8), "SO": (5.2, 46.2),
    "ZA": (-30.6, 22.9), "SS": (6.9, 31.3), "SD": (12.9, 30.2), "TZ": (-6.4, 34.9), "TG": (8.6, 0.8),
    "TN": (33.9, 9.5), "UG": (1.4, 32.3), "ZM": (-13.1, 27.8), "ZW": (-19.0, 29.2),
}
_ISO_BY_NAME = {c["name"]: c["iso2"] for c in COUNTRIES}


async def get_rates(force: bool = False) -> dict:
    """Rates relative to USD. Memory cache -> Mongo cache -> API."""
    now = time.time()
    if not force and _mem["rates"] and now - _mem["fetched"] < CACHE_TTL:
        return {"base": "USD", "rates": _mem["rates"], "updated_at": _mem["updated_at"], "source": "cache"}
    cached = await db.fx_rates.find_one({"_id": "USD"})
    if not force and cached and now - cached.get("fetched_ts", 0) < CACHE_TTL:
        _mem.update(rates=cached["rates"], fetched=cached["fetched_ts"], updated_at=cached.get("updated_at"))
        return {"base": "USD", "rates": cached["rates"], "updated_at": cached.get("updated_at"), "source": "cache"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(os.environ["FX_API_URL"])
            data = r.json()
        if data.get("result") != "success":
            raise ValueError(data.get("error-type", "fx error"))
        rates = data["rates"]
        updated = data.get("time_last_update_utc") or now_iso()
        await db.fx_rates.update_one({"_id": "USD"}, {"$set": {"rates": rates, "fetched_ts": now,
                                                                "updated_at": updated, "fetched_at": now_iso()}}, upsert=True)
        _mem.update(rates=rates, fetched=now, updated_at=updated)
        return {"base": "USD", "rates": rates, "updated_at": updated, "source": "api"}
    except Exception as e:
        logger.warning("FX fetch failed: %s", e)
        if cached:
            _mem.update(rates=cached["rates"], fetched=now - CACHE_TTL + 300, updated_at=cached.get("updated_at"))
            return {"base": "USD", "rates": cached["rates"], "updated_at": cached.get("updated_at"), "source": "stale"}
        raise


async def rate(from_cur: str, to_cur: str) -> float:
    """Multiplier converting an amount in from_cur to to_cur."""
    if not from_cur or not to_cur or from_cur == to_cur:
        return 1.0
    rates = (await get_rates())["rates"]
    if from_cur not in rates or to_cur not in rates:
        raise ValueError(f"Devise non supportée : {from_cur}/{to_cur}")
    return rates[to_cur] / rates[from_cur]


def buyer_currency(user: dict) -> str:
    return user.get("currency") or (currency_for_country(user["country"])["code"] if user.get("country") else "")


def distance_km(country_a: str, country_b: str) -> float:
    a, b = CENTROIDS.get(_ISO_BY_NAME.get(country_a)), CENTROIDS.get(_ISO_BY_NAME.get(country_b))
    if not a or not b or country_a == country_b:
        return 0.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(h)), 1)
