"""Tests du client Anthropic (mock messages.create)."""

from __future__ import annotations

import pytest

from idriss import anthropic_client


class _Block:
    def __init__(self, text: str):
        self.text = text


class _Resp:
    def __init__(self, blocks):
        self.content = blocks


class FakeClient:
    def __init__(self, response_text: str = "OK", raise_on_call: bool = False):
        self.response_text = response_text
        self.raise_on_call = raise_on_call
        self.calls = []

        class _Messages:
            def __init__(self, parent):
                self.parent = parent

            def create(self, **kwargs):
                self.parent.calls.append(kwargs)
                if self.parent.raise_on_call:
                    raise RuntimeError("API down")
                return _Resp([_Block(self.parent.response_text)])

        self.messages = _Messages(self)


def test_synthesize_ok(fake_anthropic_text):
    client = FakeClient(response_text=fake_anthropic_text)
    result = anthropic_client.synthesize(
        summary="résumé",
        ollama_responses=[("a", "AAA"), ("b", "BBB")],
        api_key="sk-test",
        client_factory=lambda: client,
    )
    assert result.ok is True
    assert result.text == fake_anthropic_text.strip()
    assert client.calls
    msg = client.calls[0]["messages"][0]["content"]
    assert "résumé" in msg
    assert "AAA" in msg
    assert "BBB" in msg


def test_synthesize_sans_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = anthropic_client.synthesize(
        summary="x", ollama_responses=[], client_factory=lambda: FakeClient()
    )
    assert result.ok is False
    assert "ANTHROPIC_API_KEY" in (result.error or "")


def test_synthesize_api_raise():
    client = FakeClient(raise_on_call=True)
    result = anthropic_client.synthesize(
        summary="x",
        ollama_responses=[("a", "x")],
        api_key="sk-test",
        client_factory=lambda: client,
    )
    assert result.ok is False
    assert "API down" in (result.error or "")


def test_synthesize_response_vide():
    client = FakeClient(response_text="")
    result = anthropic_client.synthesize(
        summary="x",
        ollama_responses=[("a", "x")],
        api_key="sk-test",
        client_factory=lambda: client,
    )
    assert result.ok is False
    assert "vide" in (result.error or "")
