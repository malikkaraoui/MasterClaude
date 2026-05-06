"""Tests de l'écriture stratégique Léonor."""

from __future__ import annotations

from datetime import date

import yaml

from leonor.writer import StrategyNote, write_strategy


def _note(body: str = "## Action\nx\n") -> StrategyNote:
    return StrategyNote(body=body, models_used=["claude-sonnet-4-6"], degraded=[])


def test_write_strategy_basic(tmp_path):
    target = write_strategy(tmp_path, _note(), today=date(2026, 5, 8))  # vendredi
    iso_year, iso_week, _ = date(2026, 5, 8).isocalendar()
    expected = f"{iso_year}-W{iso_week:02d}-leonor.md"
    assert target.name == expected
    text = target.read_text(encoding="utf-8")
    fm = yaml.safe_load(text.split("---")[1])
    assert fm["week"] == f"{iso_year}-W{iso_week:02d}"
    assert fm["source"] == "leonor"
    assert fm["models"] == ["claude-sonnet-4-6"]


def test_write_strategy_collision(tmp_path):
    write_strategy(tmp_path, _note(), today=date(2026, 5, 8))
    second = write_strategy(tmp_path, _note("autre"), today=date(2026, 5, 8))
    assert "leonor-bis.md" in second.name
    third = write_strategy(tmp_path, _note("3e"), today=date(2026, 5, 8))
    assert "leonor-bis2.md" in third.name


def test_write_strategy_degraded(tmp_path):
    note = StrategyNote(body="x", models_used=[], degraded=["sonnet:down"])
    target = write_strategy(tmp_path, note, today=date(2026, 5, 8))
    fm = yaml.safe_load(target.read_text(encoding="utf-8").split("---")[1])
    assert fm["degraded"] == ["sonnet:down"]
