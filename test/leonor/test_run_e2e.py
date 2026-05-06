"""Tests end-to-end Léonor."""

from __future__ import annotations

import subprocess

import pytest

from idriss import ollama_client
from leonor import run


class _Block:
    def __init__(self, text):
        self.text = text


class _Resp:
    def __init__(self, blocks):
        self.content = blocks


class FakeAnthropic:
    text = (
        "## 3 propositions concrètes pour la semaine\n"
        "1. Idriss\n2. Léonor\n3. Curator\n\n"
        "## Ce qui se cherche entre les projets\nLes synthèses\n\n"
        "## Chantier à enterrer\nL'idée X\n\n"
        "## Questions ouvertes\nQ?\n"
    )

    def __init__(self, *a, **k):
        class _M:
            def create(s, **kwargs):
                return _Resp([_Block(FakeAnthropic.text)])

        self.messages = _M()


class BoomAnthropic:
    def __init__(self, *a, **k):
        class _M:
            def create(self, **kwargs):
                raise RuntimeError("API 503")

        self.messages = _M()


class FakeProc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


@pytest.fixture
def patch_collect_all(monkeypatch, tmp_home_root):
    from leonor import inputs as _inputs

    original = _inputs.collect_all

    def fake(vault_root, home_root, today=None):
        return original(vault_root, tmp_home_root, today)

    monkeypatch.setattr(_inputs, "collect_all", fake)
    monkeypatch.setattr(run, "collect_all", fake)


@pytest.fixture
def patch_ollama_ok(monkeypatch):
    real_run = subprocess.run

    def fake_run(cmd, **kwargs):
        if cmd[:1] == ["ollama"]:
            return FakeProc(stdout="Sanity OK : propositions réalistes.")
        return real_run(cmd, **kwargs)

    monkeypatch.setattr(ollama_client.subprocess, "run", fake_run)


def test_run_once_e2e(monkeypatch, tmp_vault_with_bilans, tmp_path, patch_collect_all, patch_ollama_ok):
    home = tmp_path / "mc-home"
    home.mkdir()
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", home / "nope")

    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", FakeAnthropic, raising=False)

    rc = run.main(["--once"])
    assert rc == 0

    notes = list((tmp_vault_with_bilans / "strategie").glob("*-leonor*.md"))
    assert len(notes) == 1
    body = notes[0].read_text(encoding="utf-8")
    assert "propositions concrètes" in body
    assert "Sanity-check" in body


def test_run_dry_run(monkeypatch, tmp_vault_with_bilans, tmp_path, patch_collect_all, patch_ollama_ok):
    home = tmp_path / "mc-home"
    home.mkdir()
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", home / "nope")

    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", FakeAnthropic, raising=False)

    rc = run.main(["--dry-run"])
    assert rc == 0
    assert not list((tmp_vault_with_bilans / "strategie").glob("*-leonor*.md"))


def test_run_kill_switch(monkeypatch, tmp_vault_with_bilans, tmp_path):
    home = tmp_path / "mc-home"
    home.mkdir()
    kill = home / "killed"
    kill.write_text("")
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setattr(run, "KILL_SWITCH", kill)
    rc = run.main(["--once"])
    assert rc == 0


def test_run_no_sanity(monkeypatch, tmp_vault_with_bilans, tmp_path, patch_collect_all):
    home = tmp_path / "mc-home"
    home.mkdir()
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", home / "nope")

    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", FakeAnthropic, raising=False)

    rc = run.main(["--once", "--no-sanity"])
    assert rc == 0
    body = next((tmp_vault_with_bilans / "strategie").glob("*-leonor*.md")).read_text(encoding="utf-8")
    assert "Sanity-check" not in body


def test_sonnet_down(monkeypatch, tmp_vault_with_bilans, tmp_path, patch_collect_all):
    home = tmp_path / "mc-home"
    home.mkdir()
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", home / "nope")

    import anthropic as _a

    monkeypatch.setattr(_a, "Anthropic", BoomAnthropic, raising=False)

    rc = run.main(["--once", "--no-sanity"])
    assert rc == 0
    body = next((tmp_vault_with_bilans / "strategie").glob("*-leonor*.md")).read_text(encoding="utf-8")
    assert "Synthèse Sonnet indisponible" in body


def test_aucun_mode(monkeypatch, tmp_vault_with_bilans, tmp_path):
    home = tmp_path / "mc-home"
    home.mkdir()
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault_with_bilans))
    monkeypatch.setattr(run, "KILL_SWITCH", home / "nope")
    rc = run.main([])
    assert rc == 2
