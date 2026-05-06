"""Tests de l'écriture du bilan."""

from __future__ import annotations

from datetime import date

import yaml

from idriss.synthesis import Bilan
from idriss.writer import write_bilan


def _bilan(body: str = "## Conviction\nx\n") -> Bilan:
    return Bilan(body=body, models_used=["m1", "m2"], degraded=[])


def test_write_bilan_simple(tmp_path):
    target = write_bilan(tmp_path, _bilan(), today=date(2026, 5, 6))
    assert target.name == "2026-05-06-bilan.md"
    text = target.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    fm_block = text.split("---")[1]
    fm = yaml.safe_load(fm_block)
    assert fm["date"] == "2026-05-06"
    assert fm["source"] == "idriss"
    assert fm["models"] == ["m1", "m2"]


def test_write_bilan_collision_bis(tmp_path):
    write_bilan(tmp_path, _bilan(), today=date(2026, 5, 6))
    second = write_bilan(tmp_path, _bilan("autre"), today=date(2026, 5, 6))
    assert second.name == "2026-05-06-bilan-bis.md"
    third = write_bilan(tmp_path, _bilan("3e"), today=date(2026, 5, 6))
    assert third.name == "2026-05-06-bilan-bis2.md"


def test_write_bilan_avec_degraded(tmp_path):
    bilan = Bilan(body="x", models_used=["m1"], degraded=["sonnet:down"])
    target = write_bilan(tmp_path, bilan, today=date(2026, 5, 6))
    text = target.read_text(encoding="utf-8")
    fm = yaml.safe_load(text.split("---")[1])
    assert fm["degraded"] == ["sonnet:down"]
