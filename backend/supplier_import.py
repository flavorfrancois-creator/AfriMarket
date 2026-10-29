"""Extract public product metadata from accessible AliExpress and Alibaba pages."""
import html
import ipaddress
import json
import math
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit

import requests


_VENDOR_ROOTS = ("aliexpress.com", "alibaba.com")
_PRODUCT_PATH = re.compile(r"/(?:item/\d+|product-detail/[^/?#]+|product/[^/?#]+)", re.I)
_MAX_PAGE_BYTES = 4 * 1024 * 1024
_MAX_REDIRECTS = 3


class SupplierPageError(ValueError):
    pass


def _root_for_host(host: str) -> str:
    host = host.rstrip(".").lower()
    for root in _VENDOR_ROOTS:
        if host == root or host.endswith("." + root):
            return root
    raise SupplierPageError("Seules les adresses AliExpress et Alibaba sont acceptées.")


def validate_supplier_url(value: str, expected_root: str = None) -> tuple[str, str]:
    clean, root, host = _clean_vendor_url(value, expected_root)
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise SupplierPageError("Le nom de domaine du fournisseur ne peut pas être résolu.")
    if not addresses or any(not ipaddress.ip_address(entry[4][0]).is_global for entry in addresses):
        raise SupplierPageError("Cette adresse ne résout pas vers un serveur public valide.")
    return clean, root


def _clean_vendor_url(value: str, expected_root: str = None):
    if not isinstance(value, str) or len(value) > 2048:
        raise SupplierPageError("Adresse web invalide.")
    try:
        parsed = urlsplit(value.strip())
        host = parsed.hostname
        port = parsed.port
    except (ValueError, UnicodeError):
        raise SupplierPageError("Adresse web invalide.")
    root = _root_for_host(host or "")
    if parsed.scheme.lower() != "https" or parsed.username or parsed.password or (port not in (None, 443)):
        raise SupplierPageError("Utilisez une adresse HTTPS publique d'AliExpress ou Alibaba.")
    if expected_root and root != expected_root:
        raise SupplierPageError("La page suivante ne provient pas du même site fournisseur.")
    clean = parsed._replace(fragment="")
    return urlunsplit(clean), root, host


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.jsonld = []
        self.product_links = []
        self.next_url = None
        self._script_type = ""
        self._script_depth = 0
        self._script_parts = []
        self._in_title = False
        self._title_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = {key.lower(): value for key, value in attrs if key}
        tag = tag.lower()
        if tag == "meta":
            key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            if key and attrs.get("content"):
                self.meta[key] = attrs["content"]
        elif tag == "script":
            self._script_depth += 1
            if self._script_depth == 1:
                self._script_type = attrs.get("type", "").lower()
                self._script_parts = []
        elif tag == "title":
            self._in_title = True
        elif tag in ("a", "link"):
            href = attrs.get("href")
            if not href:
                return
            rel = (attrs.get("rel") or "").lower().split()
            if "next" in rel:
                self.next_url = href
            if tag == "a":
                self.product_links.append(href)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "script" and self._script_depth:
            self._script_depth -= 1
            if self._script_depth == 0:
                if "ld+json" in self._script_type and self._script_parts:
                    self.jsonld.append("".join(self._script_parts))
                self._script_type = ""
                self._script_parts = []
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._script_depth and self._script_type:
            self._script_parts.append(data)
        if self._in_title:
            self._title_parts.append(data)


def _flatten_jsonld(value):
    if isinstance(value, list):
        for item in value:
            yield from _flatten_jsonld(item)
    elif isinstance(value, dict):
        yield value
        for key in ("@graph", "mainEntity", "itemListElement", "hasVariant"):
            if key in value:
                yield from _flatten_jsonld(value[key])


def _is_product(node: dict) -> bool:
    raw_type = node.get("@type", [])
    types = raw_type if isinstance(raw_type, list) else [raw_type]
    return any(str(value).lower().endswith("product") for value in types)


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        value = value.get("name") or value.get("text") or value.get("@value") or ""
    if isinstance(value, list):
        value = " ".join(_text(part) for part in value)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", str(value)))).strip()


def _images(value, base_url: str):
    values = value if isinstance(value, list) else [value]
    result = []
    for item in values:
        if isinstance(item, dict):
            item = item.get("url") or item.get("contentUrl")
        if not isinstance(item, str):
            continue
        url = urljoin(base_url, item.strip())
        parsed = urlsplit(url)
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password and url not in result:
            result.append(url)
        if len(result) >= 20:
            break
    return result


def _product_from_page(parser: _PageParser, page_url: str):
    nodes = []
    for raw in parser.jsonld:
        try:
            nodes.extend(node for node in _flatten_jsonld(json.loads(raw)) if _is_product(node))
        except (json.JSONDecodeError, TypeError, ValueError):
            continue

    node = nodes[0] if nodes else {}
    title = _text(node.get("name")) or _text(parser.meta.get("og:title")) or _text(parser._title_parts)
    description = _text(node.get("description")) or _text(parser.meta.get("og:description"))
    image_values = _images(node.get("image"), page_url)
    image_values.extend(
        image for image in _images(parser.meta.get("og:image"), page_url) if image not in image_values
    )
    if len(image_values) > 20:
        image_values = image_values[:20]

    offers = node.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    if not isinstance(offers, dict):
        offers = {}
    price = offers.get("price") or offers.get("lowPrice") or parser.meta.get("product:price:amount")
    currency = offers.get("priceCurrency") or parser.meta.get("product:price:currency") or ""
    try:
        price = round(float(str(price).replace(",", ".")), 2) if price is not None else None
        if price is not None and (not math.isfinite(price) or price <= 0):
            price = None
    except (TypeError, ValueError):
        price = None

    product = None
    if title and (nodes or str(parser.meta.get("og:type", "")).lower().startswith("product")):
        product = {
            "name": title[:200],
            "short_description": description[:500],
            "description": description[:10000],
            "image": image_values[0] if image_values else "",
            "gallery": image_values[1:],
            "sku": _text(node.get("sku"))[:100],
            "source_price": price,
            "source_currency": str(currency)[:8].upper(),
            "brand": _text(node.get("brand"))[:100],
        }
    return product


def parse_supplier_page(content: bytes, page_url: str):
    parser = _PageParser()
    try:
        parser.feed(content.decode("utf-8", errors="replace"))
    except Exception as exc:
        raise SupplierPageError("La page fournisseur ne peut pas être analysée.") from exc

    product = _product_from_page(parser, page_url)
    links = []
    for href in parser.product_links:
        absolute = urljoin(page_url, href)
        try:
            clean_url, root, _ = _clean_vendor_url(absolute)
        except SupplierPageError:
            continue
        if root == _root_for_host(urlsplit(page_url).hostname or "") and _PRODUCT_PATH.search(urlsplit(clean_url).path):
            if clean_url != page_url and clean_url not in links:
                links.append(clean_url)
    next_url = None
    if parser.next_url:
        candidate = urljoin(page_url, parser.next_url)
        try:
            next_url, _, _ = _clean_vendor_url(candidate, _root_for_host(urlsplit(page_url).hostname or ""))
        except SupplierPageError:
            next_url = None
    return {"product": product, "product_links": links, "next_url": next_url}


def fetch_supplier_page(url: str, expected_root: str = None):
    current_url, root = validate_supplier_url(url, expected_root)
    headers = {"User-Agent": "AfriMarketProductImporter/1.0 (+public catalog metadata)"}
    for _ in range(_MAX_REDIRECTS + 1):
        response = requests.get(current_url, headers=headers, timeout=(5, 12), allow_redirects=False, stream=True)
        try:
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                if not location:
                    raise SupplierPageError("Le fournisseur a renvoyé une redirection invalide.")
                current_url, root = validate_supplier_url(urljoin(current_url, location), root)
                continue
            if response.status_code in (401, 403, 429):
                raise SupplierPageError("La page est bloquée, protégée ou soumise à une limite. Aucun contournement n’est tenté.")
            if response.status_code >= 400:
                raise SupplierPageError(f"Le fournisseur a répondu avec le code HTTP {response.status_code}.")
            content_type = response.headers.get("Content-Type", "").lower()
            if content_type and "html" not in content_type:
                raise SupplierPageError("L’adresse ne renvoie pas une page HTML publique.")
            chunks = []
            total = 0
            for chunk in response.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                total += len(chunk)
                if total > _MAX_PAGE_BYTES:
                    raise SupplierPageError("La page fournisseur dépasse la taille maximale autorisée.")
                chunks.append(chunk)
            return parse_supplier_page(b"".join(chunks), current_url)
        finally:
            response.close()
    raise SupplierPageError("Trop de redirections sur la page fournisseur.")
