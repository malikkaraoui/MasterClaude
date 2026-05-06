"""Fixtures pytest partagées Idriss."""

from __future__ import annotations

import json
import os
import subprocess
from datetime import date, datetime, time
from pathlib import Path

import pytest


@pytest.fixture
def today_start_ts() -> float:
    return datetime.combine(date.today(), time.min).timestamp()


@pytest.fixture
def tmp_vault(tmp_path: Path) -> Path:
    """Faux vault Obsidian avec quelques notes today + une note ancienne + .obsidian/."""
    vault = tmp_path / "vault"
    (vault / "journal").mkdir(parents=True)
    (vault / "notes").mkdir(parents=True)
    (vault / ".obsidian").mkdir(parents=True)

    today_note = vault / "journal" / f"{date.today().isoformat()}-note.md"
    today_note.write_text("# Note du jour\n\nIdée importante.\n", encoding="utf-8")

    note2 = vault / "notes" / "idée.md"
    note2.write_text("# Idée transversale\n\nStratégie.\n", encoding="utf-8")

    old = vault / "notes" / "old.md"
    old.write_text("ancienne", encoding="utf-8")
    yesterday = datetime.now().timestamp() - 2 * 86400
    os.utime(old, (yesterday, yesterday))

    obsidian_file = vault / ".obsidian" / "workspace.json"
    obsidian_file.write_text("{}", encoding="utf-8")
    return vault


@pytest.fixture
def tmp_masterclaude_home(tmp_path: Path) -> Path:
    home = tmp_path / "mc-home"
    (home / "vault" / "handoffs").mkdir(parents=True)
    handoff = home / "vault" / "handoffs" / "2026-05-06-test.json"
    handoff.write_text(
        json.dumps({"slug": "test-feature", "title": "Feature test", "summary": "Implémenté X"}),
        encoding="utf-8",
    )
    (home / "logs" / "idriss").mkdir(parents=True)
    return home


@pytest.fixture
def tmp_repos(tmp_path: Path) -> Path:
    """Deux faux repos git avec un commit chacun aujourd'hui."""
    root = tmp_path / "repos"
    root.mkdir()

    for name in ("repo-a", "repo-b"):
        repo = root / name
        repo.mkdir()
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
        subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=repo, check=True)
        (repo / "README.md").write_text(f"# {name}\n", encoding="utf-8")
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(
            ["git", "commit", "-q", "-m", f"feat({name}): commit du jour"], cwd=repo, check=True
        )
    return root


@pytest.fixture
def fake_ollama_responses() -> dict[str, str]:
    return {
        "deepseek-v4-flash:cloud": (
            "## 1. Conviction\nIl faut livrer Idriss avant la nuit.\n\n"
            "## 2. Red-flag\nDette de tests Python.\n\n"
            "## 3. Expérience demain\nMesurer vraiment le temps gagné.\n"
        ),
        "qwen3.5:4b": (
            "## 1. Conviction\nL'idée est bonne mais la friction tue.\n\n"
            "## 2. Red-flag\nTrop de skills.\n\n"
            "## 3. Expérience demain\nÉlaguer Curator.\n"
        ),
    }


@pytest.fixture
def fake_anthropic_text() -> str:
    return (
        "## Conviction\nFaire et mesurer.\n\n"
        "## Red-flag\nTrop de chantiers ouverts.\n\n"
        "## Expérience demain\nFermer un chantier avant d'en ouvrir.\n"
    )
