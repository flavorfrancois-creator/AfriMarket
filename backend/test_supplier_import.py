import json
import socket

import pytest

import supplier_import


def test_parses_jsonld_product_details():
    page = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Sac de voyage",
        "description": "Un sac résistant",
        "image": ["https://cdn.example.com/main.jpg", "https://cdn.example.com/side.jpg"],
        "sku": "BAG-1",
        "brand": {"name": "Example"},
        "offers": {"price": "23.50", "priceCurrency": "EUR"},
    }
    html = f'<script type="application/ld+json">{json.dumps(page)}</script>'

    result = supplier_import.parse_supplier_page(html.encode(), "https://www.aliexpress.com/item/123.html")

    assert result["product"]["name"] == "Sac de voyage"
    assert result["product"]["image"] == "https://cdn.example.com/main.jpg"
    assert result["product"]["gallery"] == ["https://cdn.example.com/side.jpg"]
    assert result["product"]["source_price"] == 23.5
    assert result["product"]["source_currency"] == "EUR"
    assert result["product"]["sku"] == "BAG-1"


def test_parses_store_product_links_and_same_vendor_next_page():
    html = """
      <a href="/item/123.html">Product one</a>
      <a href="https://www.alibaba.com/product-detail/product-two.html">Product two</a>
      <a href="https://evil.example/item/456.html">External</a>
      <link rel="next" href="/store/products?page=2">
    """

    result = supplier_import.parse_supplier_page(html.encode(), "https://www.aliexpress.com/store/123")

    assert result["product"] is None
    assert result["product_links"] == [
        "https://www.aliexpress.com/item/123.html",
    ]
    assert result["next_url"] == "https://www.aliexpress.com/store/products?page=2"


def test_parses_open_graph_product_page():
    html = """
      <meta property="og:type" content="product">
      <meta property="og:title" content="Lampe de bureau">
      <meta property="og:description" content="Lampe LED">
      <meta property="og:image" content="https://cdn.example.com/lamp.jpg">
      <meta property="product:price:amount" content="15.99">
      <meta property="product:price:currency" content="USD">
    """

    product = supplier_import.parse_supplier_page(
        html.encode(), "https://www.alibaba.com/product-detail/lamp.html"
    )["product"]

    assert product["name"] == "Lampe de bureau"
    assert product["image"] == "https://cdn.example.com/lamp.jpg"
    assert product["source_price"] == 15.99
    assert product["source_currency"] == "USD"


@pytest.mark.parametrize("url", [
    "http://www.aliexpress.com/item/123.html",
    "https://aliexpress.com.evil.example/item/123.html",
    "https://user:pass@www.alibaba.com/product-detail/item.html",
    "https://www.alibaba.com:8443/product-detail/item.html",
])
def test_rejects_unsafe_supplier_urls(url):
    with pytest.raises(supplier_import.SupplierPageError):
        supplier_import.validate_supplier_url(url)


def test_rejects_supplier_host_resolving_to_private_ip(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
    )

    with pytest.raises(supplier_import.SupplierPageError, match="serveur public"):
        supplier_import.validate_supplier_url("https://www.aliexpress.com/item/123.html")


def test_reports_protected_pages_without_attempting_bypass(monkeypatch):
    class Response:
        status_code = 403
        is_redirect = False
        is_permanent_redirect = False
        headers = {"Content-Type": "text/html"}

        def close(self):
            pass

    calls = []

    def fake_get(*args, **kwargs):
        calls.append(kwargs)
        return Response()

    monkeypatch.setattr(supplier_import.socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    ])
    monkeypatch.setattr(supplier_import.requests, "get", fake_get)

    with pytest.raises(supplier_import.SupplierPageError, match="Aucun contournement"):
        supplier_import.fetch_supplier_page("https://www.aliexpress.com/item/123.html")

    assert len(calls) == 1
    assert calls[0]["allow_redirects"] is False


def test_rejects_redirect_to_another_domain(monkeypatch):
    class Response:
        status_code = 302
        is_redirect = True
        is_permanent_redirect = False
        headers = {"Location": "https://evil.example/redirect"}

        def close(self):
            pass

    calls = []

    def fake_get(*args, **kwargs):
        calls.append(args[0])
        return Response()

    monkeypatch.setattr(supplier_import.socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))
    ])
    monkeypatch.setattr(supplier_import.requests, "get", fake_get)

    with pytest.raises(supplier_import.SupplierPageError, match="Seules les adresses"):
        supplier_import.fetch_supplier_page("https://www.aliexpress.com/item/123.html")

    assert calls == ["https://www.aliexpress.com/item/123.html"]


def test_collects_all_gallery_description_images_and_variants():
    page = {"@type": "Product", "name": "Montre", "image": "https://cdn.example.com/a.jpg_80x80.jpg"}
    html = f"""
      <script type="application/ld+json">{json.dumps(page)}</script>
      <script>window.data = {{"imagePathList": ["https://cdn.example.com/a.jpg", "//cdn.example.com/b.jpg", "https://cdn.example.com/c.jpg"],
        "skuPropertyList": [{{"skuPropertyValues": [
          {{"propertyValueDisplayName": "Noir", "skuPropertyImagePath": "https://cdn.example.com/black.jpg"}},
          {{"propertyValueDisplayName": "Rouge"}}]}}]}};</script>
      <img src="https://cdn.example.com/not-in-description.jpg">
      <div id="product-description"><p><img data-src="https://cdn.example.com/d1.jpg"></p><img src="https://cdn.example.com/d2.jpg"></div>
      <img src="https://cdn.example.com/after.jpg">
    """

    product = supplier_import.parse_supplier_page(html.encode(), "https://www.aliexpress.com/item/1.html")["product"]

    assert product["image"] == "https://cdn.example.com/a.jpg"
    assert product["gallery"] == ["https://cdn.example.com/b.jpg", "https://cdn.example.com/c.jpg"]
    assert product["description_images"] == ["https://cdn.example.com/d1.jpg", "https://cdn.example.com/d2.jpg"]
    assert [v["label"] for v in product["variants"]] == ["Noir", "Rouge"]
    assert product["variants"][0]["image"] == "https://cdn.example.com/black.jpg"


def test_variant_type_comes_from_property_name():
    html = """<script>var d = {"skuPropertyList": [
      {"skuPropertyName": "Couleur", "skuPropertyValues": [{"propertyValueDisplayName": "Noir"}]},
      {"skuPropertyName": "Taille", "skuPropertyValues": [{"propertyValueDisplayName": "M"}, {"propertyValueDisplayName": "L"}]}]};</script>
      <meta property="og:type" content="product"><meta property="og:title" content="T-shirt">"""

    product = supplier_import.parse_supplier_page(html.encode(), "https://www.aliexpress.com/item/2.html")["product"]

    assert [(v["label"], v["type"]) for v in product["variants"]] == [("Noir / M", "Couleur / Taille"), ("Noir / L", "Couleur / Taille")]


def test_download_image_accepts_real_images_only(monkeypatch):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 4096

    class FakeResponse:
        is_redirect = is_permanent_redirect = False
        status_code = 200

        def __init__(self, body):
            self.body = body

        def iter_content(self, chunk_size):
            yield self.body

        def close(self):
            pass

    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("93.184.216.34", 443))])
    monkeypatch.setattr(supplier_import.requests, "get", lambda *a, **k: FakeResponse(png))
    assert supplier_import.download_image("https://cdn.example.com/a.png") == (png, "image/png", "png")

    monkeypatch.setattr(supplier_import.requests, "get", lambda *a, **k: FakeResponse(b"<html>" + b"0" * 4096))
    assert supplier_import.download_image("https://cdn.example.com/a.png") is None

    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(None, None, None, None, ("10.0.0.1", 443))])
    assert supplier_import.download_image("https://cdn.example.com/a.png") is None


def test_kikuu_hosts_and_category_details():
    from supplier_import import _root_for_host, parse_supplier_page, SupplierPageError
    assert _root_for_host("www.kikuu.cm") == "kikuu.cm"
    try:
        _root_for_host("evil-kikuu.com")
        assert False
    except SupplierPageError:
        pass
    html = b'''<script type="application/ld+json">{"@type":"Product","name":"Sac","category":"Mode > Sacs",
    "additionalProperty":[{"name":"Matiere","value":"Cuir"}],"offers":{"price":"12.5","priceCurrency":"USD"}}</script>'''
    product = parse_supplier_page(html, "https://www.kikuu.com/goods/1")["product"]
    assert product["source_category"] == "Mode > Sacs"
    assert "Matiere : Cuir" in product["description"] and product["source_price"] == 12.5


def test_kikuu_embedded_state_images():
    from supplier_import import parse_supplier_page
    state = ('window.g_initialProps = {"product":{"product":{"productDetailUrl":"https:\\u002F\\u002Fx.invalid\\u002Fd.html",'
             '"product":{"productName":"Chaussure","productBigImg0":"https://global2019-static-cdn.kikuu.com/a.jpg",'
             '"productBigImg1":"https://global2019-static-cdn.kikuu.com/b.jpg","lowestPrice":10,"priceUnitShow":"USD"}}}};')
    page = parse_supplier_page(f"<html><script>{state}</script></html>".encode(), "https://www.kikuu.com/product/1")
    product = page["product"]
    assert product["image"].endswith("/a.jpg") and product["gallery"] == ["https://global2019-static-cdn.kikuu.com/b.jpg"]
    assert product["source_price"] == 10 and product["_detail_url"] == "https://x.invalid/d.html"


def test_aliexpress_thumbnail_links_are_normalized():
    from supplier_import import normalize_image_url
    u = "https://ae-pic-a1.aliexpress-media.com/kf/S0ce4623b8630421998db3cfa75a28035R.jpg_220x220q75.jpg_.avif"
    assert normalize_image_url(u) == "https://ae-pic-a1.aliexpress-media.com/kf/S0ce4623b8630421998db3cfa75a28035R.jpg"
    from supplier_import import _root_for_host
    assert _root_for_host("www.aliexpress.us")
