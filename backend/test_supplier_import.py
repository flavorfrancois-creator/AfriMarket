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
