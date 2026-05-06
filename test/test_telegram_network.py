"""Tests for lib/telegram_network.py."""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from telegram_network import (  # noqa: E402
    TelegramFallbackTransport,
    _is_retryable_connect_error,
    _normalize_fallback_ips,
    _rewrite_request_for_ip,
    parse_fallback_ip_env,
)


def test_normalize_filters_invalid():
    out = _normalize_fallback_ips(
        ["149.154.167.220", "127.0.0.1", "10.0.0.1", "::1", "not-an-ip", "  ", "8.8.8.8"]
    )
    assert out == ["149.154.167.220", "8.8.8.8"]


def test_parse_env_csv():
    assert parse_fallback_ip_env("149.154.167.220, 8.8.8.8") == ["149.154.167.220", "8.8.8.8"]
    assert parse_fallback_ip_env("") == []
    assert parse_fallback_ip_env(None) == []


def test_retryable_classification():
    assert _is_retryable_connect_error(httpx.ConnectError("x"))
    assert _is_retryable_connect_error(httpx.ConnectTimeout("x"))
    assert not _is_retryable_connect_error(httpx.ReadTimeout("x"))
    assert not _is_retryable_connect_error(ValueError("x"))


def test_rewrite_preserves_sni_and_host_header():
    original = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    rewritten = _rewrite_request_for_ip(original, "149.154.167.220")
    assert rewritten.url.host == "149.154.167.220"
    assert rewritten.headers["host"] == "api.telegram.org"
    assert rewritten.extensions.get("sni_hostname") == "api.telegram.org"
    assert rewritten.method == "GET"
    assert str(rewritten.url.path) == "/bot123/getMe"


@pytest.mark.asyncio
async def test_transport_passthrough_for_non_telegram_host(monkeypatch):
    """Non-telegram hosts go through primary transport untouched."""
    transport = TelegramFallbackTransport(["149.154.167.220"])
    calls = {"primary": 0, "fallback": 0}

    async def fake_primary(req):
        calls["primary"] += 1
        return httpx.Response(200, request=req)

    async def fake_fallback(req):
        calls["fallback"] += 1
        return httpx.Response(200, request=req)

    monkeypatch.setattr(transport._primary, "handle_async_request", fake_primary)
    for t in transport._fallbacks.values():
        monkeypatch.setattr(t, "handle_async_request", fake_fallback)

    req = httpx.Request("GET", "https://example.com/")
    resp = await transport.handle_async_request(req)
    assert resp.status_code == 200
    assert calls == {"primary": 1, "fallback": 0}
    await transport.aclose()


@pytest.mark.asyncio
async def test_transport_falls_back_on_connect_error(monkeypatch):
    """Primary ConnectError → tries fallback IPs in order, sticks on success."""
    transport = TelegramFallbackTransport(["149.154.167.220"])

    async def primary_fails(req):
        raise httpx.ConnectError("primary down")

    async def fallback_ok(req):
        return httpx.Response(200, request=req)

    monkeypatch.setattr(transport._primary, "handle_async_request", primary_fails)
    monkeypatch.setattr(
        transport._fallbacks["149.154.167.220"], "handle_async_request", fallback_ok
    )

    req = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    resp = await transport.handle_async_request(req)
    assert resp.status_code == 200
    assert transport._sticky_ip == "149.154.167.220"
    await transport.aclose()


@pytest.mark.asyncio
async def test_non_retryable_error_propagates(monkeypatch):
    """Non-connect errors (e.g. ReadTimeout) bubble up immediately."""
    transport = TelegramFallbackTransport(["149.154.167.220"])

    async def primary_read_timeout(req):
        raise httpx.ReadTimeout("read timeout")

    monkeypatch.setattr(transport._primary, "handle_async_request", primary_read_timeout)

    req = httpx.Request("GET", "https://api.telegram.org/bot123/getMe")
    with pytest.raises(httpx.ReadTimeout):
        await transport.handle_async_request(req)
    await transport.aclose()
