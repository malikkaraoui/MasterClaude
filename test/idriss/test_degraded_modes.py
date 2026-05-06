"""Tests des modes dégradés : cloud down, local down, sonnet down, tout down."""

from __future__ import annotations

import subprocess

import pytest

from idriss import ollama_client, run


class FakeProc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class _Block:
    def __init__(self, text):
        self.text = text


class _Resp:
    def __init__(self, blocks):
        self.content = blocks


def _fake_anthropic_factory(text="## Conviction\nx\n"):
    class FakeAnthropic:
        def __init__(self, *a, **k):
            class _M:
                def create(self, **kwargs):
                    return _Resp([_Block(text)])

            self.messages = _M()

    return FakeAnthropic


def _patch_collect_all(monkeypatch, tmp_repos):
    from idriss import inputs as _inputs

    original = _inputs.collect_all

    def fake(vault_root, mc_home, repos_root, today_start=None):
        return original(vault_root, mc_home, tmp_repos, today_start)

    monkeypatch.setattr(_inputs, "collect_all", fake)
    monkeypatch.setattr(run, "collect_all", fake)


def test_cloud_down(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_repos):
    """Cloud KO + Local OK + Sonnet OK → bilan écrit avec local seul."""

    def fake_run(cmd, **kwargs):
        if "cloud" in cmd[2]:
            return FakeProc(stderr="cloud unreachable", returncode=1)
        return FakeProc(stdout="## Conviction\nlocal\n")

    monkeypatch.setattr(ollama_client.subprocess, "run", fake_run)
    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", _fake_anthropic_factory(), raising=False)
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "nope")
    _patch_collect_all(monkeypatch, tmp_repos)

    assert run.main(["--once"]) == 0
    body = next((tmp_vault / "journal").glob("*-bilan*.md")).read_text(encoding="utf-8")
    assert "cloud unreachable" in body
    assert "local" in body


def test_tous_ollama_down(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_repos):
    """Cloud + Local KO → pas d'appel Sonnet, bilan dégradé."""

    def fake_run(cmd, **kwargs):
        return FakeProc(stderr="dead", returncode=1)

    monkeypatch.setattr(ollama_client.subprocess, "run", fake_run)
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "nope")
    _patch_collect_all(monkeypatch, tmp_repos)

    assert run.main(["--once"]) == 0
    body = next((tmp_vault / "journal").glob("*-bilan*.md")).read_text(encoding="utf-8")
    assert "indisponible" in body


def test_sonnet_down(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_repos):
    """Ollama OK + Sonnet KO → bilan brut + 2 réponses Ollama."""

    def fake_run(cmd, **kwargs):
        return FakeProc(stdout="## Conviction\nx\n")

    class BoomAnthropic:
        def __init__(self, *a, **k):
            class _M:
                def create(self, **kwargs):
                    raise RuntimeError("API 503")

            self.messages = _M()

    monkeypatch.setattr(ollama_client.subprocess, "run", fake_run)
    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", BoomAnthropic, raising=False)
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "nope")
    _patch_collect_all(monkeypatch, tmp_repos)

    assert run.main(["--once"]) == 0
    body = next((tmp_vault / "journal").glob("*-bilan*.md")).read_text(encoding="utf-8")
    assert "Synthèse Sonnet indisponible" in body
    assert "API 503" in body
