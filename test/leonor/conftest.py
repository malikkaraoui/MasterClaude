"""Fixtures pytest Léonor."""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest


@pytest.fixture
def tmp_vault_with_bilans(tmp_path: Path) -> Path:
    """Vault avec bilans Idriss lundi→vendredi de la semaine en cours."""
    vault = tmp_path / "vault"
    journal = vault / "journal"
    journal.mkdir(parents=True)
    (vault / "notes").mkdir()
    (vault / "strategie").mkdir()
    (vault / ".obsidian").mkdir()

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    for i in range(5):  # lundi → vendredi
        d = monday + timedelta(days=i)
        bilan = journal / f"{d.isoformat()}-bilan.md"
        bilan.write_text(
            f"---\ndate: {d.isoformat()}\nsource: idriss\n---\n\n"
            f"## Conviction\nJour {d.weekday()}\n",
            encoding="utf-8",
        )
        ts = datetime.combine(d, time(21, 5)).timestamp()
        os.utime(bilan, (ts, ts))

    # Note hors semaine (semaine dernière)
    last_week = monday - timedelta(days=3)
    old = journal / f"{last_week.isoformat()}-bilan.md"
    old.write_text("vieille", encoding="utf-8")
    ts = datetime.combine(last_week, time(21, 5)).timestamp()
    os.utime(old, (ts, ts))

    # Note vault libre
    (vault / "notes" / "idée.md").write_text("# Idée\nrépétée", encoding="utf-8")

    # Bruit .obsidian (doit être ignoré)
    (vault / ".obsidian" / "workspace.json").write_text("{}", encoding="utf-8")

    return vault


@pytest.fixture
def tmp_home_root(tmp_path: Path) -> Path:
    """Faux ~/ avec quelques projets et leurs CLAUDE.md."""
    home = tmp_path / "home"
    home.mkdir()
    for proj in ("ProjetA", "ProjetB"):
        (home / proj).mkdir()
        (home / proj / "CLAUDE.md").write_text(f"# {proj}\nspec\n", encoding="utf-8")
    # ProjetC avec .claude/CLAUDE.md
    (home / "ProjetC" / ".claude").mkdir(parents=True)
    (home / "ProjetC" / ".claude" / "CLAUDE.md").write_text("nested\n", encoding="utf-8")
    # ProjetSansClaude (sans CLAUDE.md)
    (home / "ProjetSansClaude").mkdir()
    return home
