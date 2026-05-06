"""Tests de la composition du résumé."""

from __future__ import annotations

from pathlib import Path

from idriss.compose import compose_summary, render_prompt
from idriss.inputs import Inputs


def test_compose_summary_avec_donnees(tmp_path):
    note = tmp_path / "note.md"
    note.write_text("# Titre\n\nCorps.\n", encoding="utf-8")
    inputs = Inputs(
        notes=[note],
        handoffs=[],
        commits={"repo-a": ["abc1234 feat: x"]},
    )
    out = compose_summary(inputs, vault_root=tmp_path)
    assert "## Notes Obsidian" in out
    assert "## Sessions Claude" in out
    assert "## Commits git" in out
    assert "abc1234" in out


def test_compose_summary_vide():
    out = compose_summary(Inputs())
    assert "_(aucune)_" in out
    assert "_(aucun)_" in out


def test_render_prompt(tmp_path):
    template = tmp_path / "tpl.txt"
    template.write_text("Avant\n{summary}\nAprès\n", encoding="utf-8")
    out = render_prompt(template, "RÉSUMÉ")
    assert "RÉSUMÉ" in out
    assert "Avant" in out
    assert "Après" in out


def test_render_prompt_uses_real_template():
    """Vérifie que le template livré contient bien {summary}."""
    template = Path(__file__).resolve().parents[2] / "bin" / "idriss" / "templates" / "prompt-question.txt"
    text = template.read_text(encoding="utf-8")
    assert "{summary}" in text
    assert "Conviction" in text
    assert "Red-flag" in text
