"""Extract public product metadata from accessible AliExpress, Alibaba and Kikuu pages."""
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
_KIKUU_HOST = re.compile(r"(?:^|\.)(kikuu\.[a-z]{2,3}(?:\.[a-z]{2})?)$")
_PRODUCT_PATH = re.compile(r"/(?:item/\d+|product-detail/[^/?#]+|product/[^/?#]+|goods/[^/?#]+|products?-[^/?#]+)", re.I)
_MAX_PAGE_BYTES = 4 * 1024 * 1024
_MAX_REDIRECTS = 3
_MAX_GALLERY = 20
_MAX_DESCRIPTION_IMAGES = 40
_MAX_VARIANTS = 50
_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
_DESC_MARK = re.compile(r"desc", re.I)
_THUMB_SUFFIX = re.compile(r"(\.(?:jpe?g|png|webp))_[0-9]+x[0-9]+[^/]*$", re.I)
_IMAGE_LIST_KEYS = ("imagePathList", "imageList", "imageUrls", "productImages")
_DESC_IMAGE_KEYS = ("descriptionImages", "descImages", "detailImages")


class SupplierPageError(ValueError):
    pass


def _root_for_host(host: str) -> str:
    host = host.rstrip(".").lower()
    for root in _VENDOR_ROOTS:
        if host == root or host.endswith("." + root):
            return root
    match = _KIKUU_HOST.search(host)
    if match:
        return match.group(1)
    raise SupplierPageError("Seules les adresses AliExpress, Alibaba et Kikuu sont acceptées.")


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
        raise SupplierPageError("Utilisez une adresse HTTPS publique d'AliExpress, Alibaba ou Kikuu.")
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
        self.scripts = []
        self.desc_images = []
        self._stack = []
        self._desc_depth = None

    def handle_starttag(self, tag, attrs):
        attrs = {key.lower(): value for key, value in attrs if key}
        tag = tag.lower()
        if tag not in _VOID_TAGS:
            self._stack.append(tag)
            if self._desc_depth is None and _DESC_MARK.search((attrs.get("id") or "") + " " + (attrs.get("class") or "")):
                self._desc_depth = len(self._stack)
        if tag == "img" and self._desc_depth is not None:
            src = attrs.get("data-src") or attrs.get("data-lazy-src") or attrs.get("data-original") or attrs.get("src")
            if src and not src.startswith("data:"):
                self.desc_images.append(src)
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
        if tag in self._stack:
            while self._stack:
                if self._stack.pop() == tag:
                    break
            if self._desc_depth is not None and len(self._stack) < self._desc_depth:
                self._desc_depth = None
        if tag == "script" and self._script_depth:
            self._script_depth -= 1
            if self._script_depth == 0:
                if "ld+json" in self._script_type and self._script_parts:
                    self.jsonld.append("".join(self._script_parts))
                elif "ld+json" not in self._script_type and self._script_parts:
                    self.scripts.append("".join(self._script_parts))
                self._script_type = ""
                self._script_parts = []
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._script_depth:
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


def _images(value, base_url: str, limit: int = _MAX_GALLERY):
    values = value if isinstance(value, list) else [value]
    result = []
    for item in values:
        if isinstance(item, dict):
            item = item.get("url") or item.get("contentUrl")
        if not isinstance(item, str):
            continue
        url = _THUMB_SUFFIX.sub(r"\1", urljoin(base_url, item.strip()))
        parsed = urlsplit(url)
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password and len(url) <= 2048 and url not in result:
            result.append(url)
        if len(result) >= limit:
            break
    return result


def _embedded_values(scripts, keys):
    """Yield JSON values stored under any of the given keys in inline page scripts."""
    decoder = json.JSONDecoder()
    pattern = re.compile(r'"(?:%s)"\s*:\s*' % "|".join(re.escape(key) for key in keys))
    for script in scripts:
        for match in pattern.finditer(script):
            try:
                value, _ = decoder.raw_decode(script, match.end())
            except ValueError:
                continue
            yield value


def _variants_from_page(node: dict, scripts, base_url: str, default_currency: str):
    variants = []

    def add(label, image=None, price=None, currency="", sku="", description="", kind=""):
        label = _text(label)[:100]
        if not label or any(v["label"] == label for v in variants) or len(variants) >= _MAX_VARIANTS:
            return
        try:
            price = round(float(str(price).replace(",", ".")), 2) if price is not None else None
            if price is not None and (not math.isfinite(price) or price <= 0):
                price = None
        except (TypeError, ValueError):
            price = None
        variants.append({
            "label": label,
            "image": (_images(image, base_url, 1) or [""])[0],
            "sku": _text(sku)[:100],
            "type": _text(kind)[:100],
            "description": _text(description)[:1000],
            "source_price": price,
            "source_currency": str(currency or default_currency)[:8].upper(),
        })

    for entry in _flatten_jsonld(node.get("hasVariant") or []):
        offer = entry.get("offers") or {}
        offer = offer[0] if isinstance(offer, list) and offer else offer
        offer = offer if isinstance(offer, dict) else {}
        add(entry.get("name"), entry.get("image"), offer.get("price") or offer.get("lowPrice"),
            offer.get("priceCurrency"), entry.get("sku"), entry.get("description"))
    offers = node.get("offers")
    if not variants and isinstance(offers, list) and len(offers) > 1:
        for offer in offers:
            if isinstance(offer, dict):
                add(offer.get("name") or offer.get("sku"), offer.get("image"), offer.get("price") or offer.get("lowPrice"),
                    offer.get("priceCurrency"), offer.get("sku"))

    if not variants:
        for properties in _embedded_values(scripts, ("skuPropertyList",)):
            if not isinstance(properties, list):
                continue
            groups = []
            names = []
            for prop in properties:
                values = prop.get("skuPropertyValues") if isinstance(prop, dict) else None
                if isinstance(values, list):
                    names.append(_text(prop.get("skuPropertyName")))
                    groups.append([
                        (_text(v.get("propertyValueDisplayName") or v.get("propertyValueName")),
                         v.get("skuPropertyImagePath") or v.get("skuPropertyImageSummPath"))
                        for v in values if isinstance(v, dict)
                    ])
            combos = [("", None)]
            for group in groups:
                combos = [((f"{a} / {b}" if a else b), image or img) for a, image in combos for b, img in group][:_MAX_VARIANTS]
            kind = " / ".join(name for name in names if name)
            for label, image in combos:
                add(label, image, kind=kind)
            if variants:
                break
    return variants


def _product_images(node, parser, page_url: str):
    images = _images(node.get("image"), page_url)
    sources = [_images(parser.meta.get("og:image"), page_url)]
    for value in _embedded_values(parser.scripts, _IMAGE_LIST_KEYS):
        sources.append(_images(value if isinstance(value, list) else [], page_url))
    for extra in sources:
        images.extend(image for image in extra if image not in images)
    return images[:_MAX_GALLERY]


def _description_images(parser, page_url: str, exclude):
    found = list(parser.desc_images)
    for value in _embedded_values(parser.scripts, _DESC_IMAGE_KEYS):
        if isinstance(value, list):
            found.extend(v for v in value if isinstance(v, str))
    return [image for image in _images(found, page_url, _MAX_DESCRIPTION_IMAGES) if image not in exclude]


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
    image_values = _product_images(node, parser, page_url)

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

    category = node.get("category") or parser.meta.get("product:category") or parser.meta.get("article:section") or ""
    if isinstance(category, (list, dict)):
        category = " > ".join(_text(c.get("name") if isinstance(c, dict) else c) for c in (category if isinstance(category, list) else [category]))
    details = []
    props = node.get("additionalProperty") or []
    for prop in props if isinstance(props, list) else [props]:
        if isinstance(prop, dict) and prop.get("name") and prop.get("value") is not None:
            details.append(f"{_text(prop['name'])[:80]} : {_text(prop['value'])[:200]}")
    for key in ("color", "material", "model", "mpn", "size"):
        if node.get(key):
            details.append(f"{key.capitalize()} : {_text(node[key])[:200]}")
    if details:
        description = (description + "\n\nDétails :\n" + "\n".join(f"- {d}" for d in details[:40])).strip()

    product = None
    if title and (nodes or str(parser.meta.get("og:type", "")).lower().startswith("product")):
        product = {
            "name": title[:200],
            "short_description": description[:500],
            "description": description[:10000],
            "image": image_values[0] if image_values else "",
            "gallery": image_values[1:],
            "description_images": _description_images(parser, page_url, image_values),
            "variants": _variants_from_page(node, parser.scripts, page_url, str(currency)),
            "sku": _text(node.get("sku"))[:100],
            "source_price": price,
            "source_currency": str(currency)[:8].upper(),
            "brand": _text(node.get("brand"))[:100],
            "source_category": _text(category)[:200],
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


_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"GIF87a", "image/gif", "gif"),
    (b"GIF89a", "image/gif", "gif"),
)
MAX_IMAGE_BYTES = 6 * 1024 * 1024
_MIN_IMAGE_BYTES = 2048


def _sniff_image(data: bytes):
    for signature, content_type, ext in _IMAGE_SIGNATURES:
        if data.startswith(signature):
            return content_type, ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


def download_image(url: str):
    """Download a public HTTPS image; return (bytes, content_type, ext) or None when unusable."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        current = url
        for _ in range(_MAX_REDIRECTS + 1):
            host = urlsplit(current).hostname
            addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                return None
            response = requests.get(current, headers={"User-Agent": "AfriMarketProductImporter/1.0"},
                                    timeout=(5, 15), allow_redirects=False, stream=True)
            try:
                if response.is_redirect or response.is_permanent_redirect:
                    location = urljoin(current, response.headers.get("Location") or "")
                    if urlsplit(location).scheme != "https":
                        return None
                    current = location
                    continue
                if response.status_code != 200:
                    return None
                chunks, total = [], 0
                for chunk in response.iter_content(chunk_size=65536):
                    total += len(chunk)
                    if total > MAX_IMAGE_BYTES:
                        return None
                    chunks.append(chunk)
                data = b"".join(chunks)
            finally:
                response.close()
            kind = _sniff_image(data)
            if not kind or len(data) < _MIN_IMAGE_BYTES:
                return None
            return data, kind[0], kind[1]
    except (OSError, ValueError, requests.RequestException):
        return None
    return None
