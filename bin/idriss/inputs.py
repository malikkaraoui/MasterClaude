"""Collecte des inputs Idriss : notes Obsidian, handoffs, commits git."""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class Inputs:
    notes: list[Path] = field(default_factory=list)
    handoffs: list[Path] = field(default_factory=list)
    commits: dict[str, list[str]] = field(default_factory=dict)


def _today_start_ts() -> float:
    return datetime.combine(date.today(), time.min).timestamp()


def collect_notes(vault_root: Path, today_start: float | None = None) -> list[Path]:
    """Toutes les notes .md modifiées depuis 00:00 today, hors .obsidian/."""
    if not vault_root.exists():
        logger.warning("vault introuvable: %s", vault_root)
        return []

    cutoff = today_start if today_start is not None else _today_start_ts()
    found: list[Path] = []
    for path in vault_root.rglob("*.md"):
        if any(part == ".obsidian" for part in path.parts):
            continue
        try:
            if path.stat().st_mtime >= cutoff:
                found.append(path)
        except OSError as exc:
            logger.debug("skip %s: %s", path, exc)
    return sorted(found)


def collect_handoffs(masterclaude_home: Path, today_start: float | None = None) -> list[Path]:
    """Handoffs JSON modifiés aujourd'hui dans vault/handoffs/."""
    handoff_dir = masterclaude_home / "vault" / "handoffs"
    if not handoff_dir.exists():
        return []
    cutoff = today_start if today_start is not None else _today_start_ts()
    found: list[Path] = []
    for path in handoff_dir.glob("*.json"):
        try:
            if path.stat().st_mtime >= cutoff:
                found.append(path)
        except OSError:
            continue
    return sorted(found)


def collect_commits(repos_root: Path, max_per_repo: int = 20) -> dict[str, list[str]]:
    """git log --since='today 00:00' --oneline pour chaque repo dans repos_root/*."""
    result: dict[str, list[str]] = {}
    if not repos_root.exists():
        return result
    for entry in sorted(repos_root.iterdir()):
        if not entry.is_dir():
            continue
        if not (entry / ".git").exists():
            continue
        try:
            proc = subprocess.run(
                ["git", "log", "--since=today 00:00", "--oneline"],
                cwd=entry,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
            if lines:
                result[entry.name] = lines[:max_per_repo]
        except (subprocess.TimeoutExpired, OSError) as exc:
            logger.debug("git log skip %s: %s", entry, exc)
    return result


def read_handoff_summary(path: Path, max_chars: int = 600) -> str:
    """Renvoie un résumé court d'un handoff JSON (titre + slug + first lines)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.debug("handoff illisible %s: %s", path, exc)
        return path.name
    parts = [data.get("slug") or path.stem]
    for key in ("title", "summary", "intent", "outcome"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(f"{key}: {val.strip()}")
    out = " · ".join(parts)
    return out[:max_chars]


def collect_all(
    vault_root: Path,
    masterclaude_home: Path,
    repos_root: Path,
    today_start: float | None = None,
) -> Inputs:
    return Inputs(
        notes=collect_notes(vault_root, today_start),
        handoffs=collect_handoffs(masterclaude_home, today_start),
        commits=collect_commits(repos_root),
    )
