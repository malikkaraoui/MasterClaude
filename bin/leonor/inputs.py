"""Collecte des inputs Léonor : vault entier, CLAUDE.md projets, bilans Idriss de la semaine."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_FILE_CHARS = 12000


@dataclass
class WeeklyInputs:
    vault_files: list[Path] = field(default_factory=list)
    claude_mds: list[Path] = field(default_factory=list)
    idriss_bilans: list[Path] = field(default_factory=list)


def collect_vault(vault_root: Path) -> list[Path]:
    if not vault_root.exists():
        return []
    found: list[Path] = []
    for path in vault_root.rglob("*.md"):
        if any(part == ".obsidian" for part in path.parts):
            continue
        found.append(path)
    return sorted(found)


def collect_claude_mds(home_root: Path) -> list[Path]:
    """Glob /Users/malik/*/CLAUDE.md + /Users/malik/*/.claude/CLAUDE.md."""
    if not home_root.exists():
        return []
    found: list[Path] = []
    for entry in sorted(home_root.iterdir()):
        if not entry.is_dir():
            continue
        for candidate in (entry / "CLAUDE.md", entry / ".claude" / "CLAUDE.md"):
            if candidate.is_file():
                found.append(candidate)
    return found


def collect_idriss_week(vault_root: Path, today: date | None = None) -> list[Path]:
    """Bilans Idriss YYYY-MM-DD-bilan*.md du lundi → vendredi de la semaine en cours."""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)

    journal_dir = vault_root / "journal"
    if not journal_dir.exists():
        return []

    monday_ts = datetime.combine(monday, time.min).timestamp()
    friday_end_ts = datetime.combine(friday + timedelta(days=1), time.min).timestamp()

    found: list[Path] = []
    for path in journal_dir.glob("*-bilan*.md"):
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        if monday_ts <= mtime < friday_end_ts:
            found.append(path)
    return sorted(found)


def collect_all(vault_root: Path, home_root: Path, today: date | None = None) -> WeeklyInputs:
    return WeeklyInputs(
        vault_files=collect_vault(vault_root),
        claude_mds=collect_claude_mds(home_root),
        idriss_bilans=collect_idriss_week(vault_root, today),
    )


def read_truncated(path: Path, max_chars: int = MAX_FILE_CHARS) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.debug("lecture impossible %s: %s", path, exc)
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"\n…(tronqué, fichier {len(text)} chars)"
