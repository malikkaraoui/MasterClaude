"""Test end-to-end : run.main avec tous les mocks."""

from __future__ import annotations

import subprocess
from datetime import date

import pytest

from idriss import anthropic_client, ollama_client, run


class _Block:
    def __init__(self, text):
        self.text = text


class _Resp:
    def __init__(self, blocks):
        self.content = blocks


class FakeAnthropic:
    def __init__(self, *a, **k):
        class _Messages:
            def create(self, **kwargs):
                return _Resp(
                    [
                        _Block(
                            "## Conviction\nLivrer.\n\n"
                            "## Red-flag\nTrop de chantiers.\n\n"
                            "## Expérience demain\nFermer un.\n"
                        )
                    ]
                )

        self.messages = _Messages()


class FakeProc:
    def __init__(self, stdout):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = 0


@pytest.fixture
def patch_external(monkeypatch, fake_ollama_responses):
    real_run = subprocess.run

    def fake_subprocess_run(cmd, **kwargs):
        if cmd[:1] == ["ollama"]:
            model = cmd[2]
            return FakeProc(stdout=fake_ollama_responses.get(model, "fake reply"))
        return real_run(cmd, **kwargs)

    monkeypatch.setattr(ollama_client.subprocess, "run", fake_subprocess_run)

    import anthropic as _anthropic_pkg

    monkeypatch.setattr(_anthropic_pkg, "Anthropic", FakeAnthropic, raising=False)


def test_run_once_e2e(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_repos, patch_external):
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "no-such-file")
    # repos_root patché en remplaçant Path("/Users/malik")
    import idriss.run as run_mod

    real_path = run_mod.Path

    class PatchedPath(real_path):
        pass

    # Approche plus simple : monkeypatch repos_root dans le main → on patche directement
    original_main = run_mod.main

    def patched_main(argv=None):
        # On ne peut pas modifier la variable locale ; on contourne en injectant
        # via env + patch direct de collect_all
        from idriss import inputs as _inputs

        original_collect_all = _inputs.collect_all

        def fake_collect_all(vault_root, mc_home, repos_root, today_start=None):
            return original_collect_all(vault_root, mc_home, tmp_repos, today_start)

        monkeypatch.setattr(_inputs, "collect_all", fake_collect_all)
        # collect_all est aussi importé localement dans run.py
        monkeypatch.setattr(run_mod, "collect_all", fake_collect_all)
        return original_main(argv)

    rc = patched_main(["--once"])
    assert rc == 0

    journal = tmp_vault / "journal" / f"{date.today().isoformat()}-bilan.md"
    assert journal.exists(), "bilan non écrit"
    body = journal.read_text(encoding="utf-8")
    assert "Conviction" in body
    assert "claude-sonnet-4-6" in body  # listé dans frontmatter models


def test_run_dry_run(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_repos, patch_external):
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "no-such-file")

    from idriss import inputs as _inputs

    original_collect_all = _inputs.collect_all

    def fake_collect_all(vault_root, mc_home, repos_root, today_start=None):
        return original_collect_all(vault_root, mc_home, tmp_repos, today_start)

    monkeypatch.setattr(_inputs, "collect_all", fake_collect_all)
    monkeypatch.setattr(run, "collect_all", fake_collect_all)

    rc = run.main(["--dry-run"])
    assert rc == 0
    journal_dir = tmp_vault / "journal"
    bilans = list(journal_dir.glob("*-bilan*.md"))
    assert bilans == [], "dry-run a écrit malgré l'option"


def test_run_kill_switch(monkeypatch, tmp_vault, tmp_masterclaude_home, tmp_path):
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    kill = tmp_path / "killed"
    kill.write_text("disabled")
    monkeypatch.setattr(run, "KILL_SWITCH", kill)
    rc = run.main(["--once"])
    assert rc == 0
    assert not list((tmp_vault / "journal").glob("*-bilan*.md"))


def test_run_aucun_mode(monkeypatch, tmp_vault, tmp_masterclaude_home):
    monkeypatch.setenv("MASTERCLAUDE_HOME", str(tmp_masterclaude_home))
    monkeypatch.setenv("MASTERCLAUDE_VAULT", str(tmp_vault))
    monkeypatch.setattr(run, "KILL_SWITCH", tmp_masterclaude_home / "nope")
    rc = run.main([])
    assert rc == 2
