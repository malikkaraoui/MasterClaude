"""Écriture du bilan dans vault/journal/YYYY-MM-DD-bilan.md (jamais d'écrasement)."""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

import yaml

from .synthesis import Bilan

logger = logging.getLogger(__name__)


def _resolve_path(journal_dir: Path, today: date) -> Path:
    base = journal_dir / f"{today.isoformat()}-bilan.md"
    if not base.exists():
        return base
    candidate = journal_dir / f"{today.isoformat()}-bilan-bis.md"
    counter = 2
    while candidate.exists():
        candidate = journal_dir / f"{today.isoformat()}-bilan-bis{counter}.md"
        counter += 1
    return candidate


def write_bilan(
    vault_root: Path,
    bilan: Bilan,
    today: date | None = None,
) -> Path:
    today = today or date.today()
    journal_dir = vault_root / "journal"
    journal_dir.mkdir(parents=True, exist_ok=True)
    target = _resolve_path(journal_dir, today)

    frontmatter = {
        "date": today.isoformat(),
        "source": "idriss",
        "version": 1,
        "models": bilan.models_used,
    }
    if bilan.degraded:
        frontmatter["degraded"] = bilan.degraded

    yaml_block = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).strip()
    content = f"---\n{yaml_block}\n---\n\n{bilan.body}"
    target.write_text(content, encoding="utf-8")
    logger.info("bilan écrit : %s", target)
    return target
