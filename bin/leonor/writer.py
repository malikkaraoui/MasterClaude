"""Écriture de la note stratégique hebdomadaire."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


@dataclass
class StrategyNote:
    body: str
    models_used: list[str]
    degraded: list[str]


def _resolve_path(strategie_dir: Path, today: date) -> Path:
    iso_year, iso_week, _ = today.isocalendar()
    base = strategie_dir / f"{iso_year}-W{iso_week:02d}-leonor.md"
    if not base.exists():
        return base
    candidate = strategie_dir / f"{iso_year}-W{iso_week:02d}-leonor-bis.md"
    counter = 2
    while candidate.exists():
        candidate = strategie_dir / f"{iso_year}-W{iso_week:02d}-leonor-bis{counter}.md"
        counter += 1
    return candidate


def write_strategy(vault_root: Path, note: StrategyNote, today: date | None = None) -> Path:
    today = today or date.today()
    strategie_dir = vault_root / "strategie"
    strategie_dir.mkdir(parents=True, exist_ok=True)
    target = _resolve_path(strategie_dir, today)

    iso_year, iso_week, _ = today.isocalendar()
    frontmatter = {
        "week": f"{iso_year}-W{iso_week:02d}",
        "source": "leonor",
        "version": 1,
        "models": note.models_used,
    }
    if note.degraded:
        frontmatter["degraded"] = note.degraded

    yaml_block = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).strip()
    content = f"---\n{yaml_block}\n---\n\n{note.body}"
    target.write_text(content, encoding="utf-8")
    logger.info("note stratégique écrite : %s", target)
    return target
