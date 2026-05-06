"""Tests de la collecte d'inputs."""

from __future__ import annotations

from idriss.inputs import collect_all, collect_commits, collect_handoffs, collect_notes


def test_collect_notes_filtre_obsidian_et_ancien(tmp_vault, today_start_ts):
    notes = collect_notes(tmp_vault, today_start_ts)
    paths = {p.relative_to(tmp_vault).as_posix() for p in notes}
    # 2 notes today (journal/<date>-note.md + notes/idée.md)
    assert any("journal/" in p for p in paths)
    assert any("idée.md" in p for p in paths)
    # vieille note exclue
    assert not any("old.md" in p for p in paths)
    # rien depuis .obsidian
    assert not any(p.startswith(".obsidian/") for p in paths)


def test_collect_notes_vault_absent(tmp_path):
    assert collect_notes(tmp_path / "nope") == []


def test_collect_handoffs(tmp_masterclaude_home, today_start_ts):
    handoffs = collect_handoffs(tmp_masterclaude_home, today_start_ts)
    assert len(handoffs) == 1
    assert handoffs[0].name == "2026-05-06-test.json"


def test_collect_commits(tmp_repos):
    commits = collect_commits(tmp_repos)
    assert set(commits.keys()) == {"repo-a", "repo-b"}
    for repo_commits in commits.values():
        assert len(repo_commits) == 1
        assert "commit du jour" in repo_commits[0]


def test_collect_all(tmp_vault, tmp_masterclaude_home, tmp_repos, today_start_ts):
    inputs = collect_all(tmp_vault, tmp_masterclaude_home, tmp_repos, today_start_ts)
    assert inputs.notes
    assert inputs.handoffs
    assert inputs.commits
