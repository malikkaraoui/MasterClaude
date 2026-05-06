"""Tests de la composition du contexte hebdo."""

from __future__ import annotations

from pathlib import Path

from leonor.compose import compose_context, render_prompt
from leonor.inputs import WeeklyInputs


def test_compose_context_avec_donnees(tmp_path):
    bilan = tmp_path / "bilan.md"
    bilan.write_text("# Bilan\n", encoding="utf-8")
    md = tmp_path / "CLAUDE.md"
    md.write_text("# Projet\n", encoding="utf-8")
    note = tmp_path / "note.md"
    note.write_text("# Note\n", encoding="utf-8")

    inputs = WeeklyInputs(vault_files=[note], claude_mds=[md], idriss_bilans=[bilan])
    out = compose_context(inputs, vault_root=tmp_path)
    assert "Bilans Idriss" in out
    assert "CLAUDE.md projets" in out
    assert "Vault Obsidian" in out
    assert "bilan.md" in out


def test_compose_context_vide():
    out = compose_context(WeeklyInputs())
    assert "_(aucun bilan trouvé)_" in out
    assert "_(aucun)_" in out
    assert "_(vide)_" in out


def test_render_prompt_uses_real_template():
    template = Path(__file__).resolve().parents[2] / "bin" / "leonor" / "templates" / "prompt-strategy.txt"
    text = template.read_text(encoding="utf-8")
    assert "{context}" in text
    assert "Léonor" in text
    assert "propositions" in text


def test_render_prompt_substitution(tmp_path):
    template = tmp_path / "tpl.txt"
    template.write_text("avant\n{context}\naprès", encoding="utf-8")
    out = render_prompt(template, "CTX")
    assert "CTX" in out
