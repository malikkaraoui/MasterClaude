"""Tests des inputs Léonor."""

from __future__ import annotations

from leonor.inputs import collect_all, collect_claude_mds, collect_idriss_week, collect_vault


def test_collect_vault_filtre_obsidian(tmp_vault_with_bilans):
    files = collect_vault(tmp_vault_with_bilans)
    assert files
    assert not any(".obsidian" in p.parts for p in files)


def test_collect_claude_mds(tmp_home_root):
    mds = collect_claude_mds(tmp_home_root)
    paths = {p.relative_to(tmp_home_root).as_posix() for p in mds}
    assert "ProjetA/CLAUDE.md" in paths
    assert "ProjetB/CLAUDE.md" in paths
    assert "ProjetC/.claude/CLAUDE.md" in paths


def test_collect_idriss_week(tmp_vault_with_bilans):
    bilans = collect_idriss_week(tmp_vault_with_bilans)
    # 5 bilans lundi→vendredi semaine en cours, pas la vieille
    assert len(bilans) == 5
    for b in bilans:
        assert "bilan" in b.name


def test_collect_all(tmp_vault_with_bilans, tmp_home_root):
    inputs = collect_all(tmp_vault_with_bilans, tmp_home_root)
    assert inputs.vault_files
    assert inputs.claude_mds
    assert inputs.idriss_bilans
