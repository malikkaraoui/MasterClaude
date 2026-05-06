"""Composition du résumé brut : Notes / Sessions / Commits."""

from __future__ import annotations

import logging
from pathlib import Path

from .inputs import Inputs, read_handoff_summary

logger = logging.getLogger(__name__)

MAX_NOTES = 20
MAX_NOTE_SNIPPET = 400
MAX_HANDOFFS = 10


def _read_note_snippet(path: Path, max_chars: int = MAX_NOTE_SNIPPET) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.debug("note illisible %s: %s", path, exc)
        return ""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "…"


def compose_summary(inputs: Inputs, vault_root: Path | None = None) -> str:
    """Markdown compact ≤ ~3000 tokens. Sections fixes, troncature soft."""
    lines: list[str] = ["# Résumé brut — journée Idriss", ""]

    lines.append("## Notes Obsidian modifiées aujourd'hui")
    if not inputs.notes:
        lines.append("_(aucune)_")
    else:
        for note in inputs.notes[:MAX_NOTES]:
            rel = note.relative_to(vault_root) if vault_root and vault_root in note.parents else note
            snippet = _read_note_snippet(note)
            lines.append(f"### {rel}")
            if snippet:
                lines.append(snippet)
            lines.append("")
        if len(inputs.notes) > MAX_NOTES:
            lines.append(f"_(+{len(inputs.notes) - MAX_NOTES} notes tronquées)_")
    lines.append("")

    lines.append("## Sessions Claude / Handoffs du jour")
    if not inputs.handoffs:
        lines.append("_(aucune)_")
    else:
        for handoff in inputs.handoffs[:MAX_HANDOFFS]:
            lines.append(f"- {read_handoff_summary(handoff)}")
        if len(inputs.handoffs) > MAX_HANDOFFS:
            lines.append(f"_(+{len(inputs.handoffs) - MAX_HANDOFFS} handoffs tronqués)_")
    lines.append("")

    lines.append("## Commits git du jour")
    if not inputs.commits:
        lines.append("_(aucun)_")
    else:
        for repo, commits in inputs.commits.items():
            lines.append(f"### {repo}")
            for commit in commits:
                lines.append(f"- {commit}")
            lines.append("")
    return "\n".join(lines).strip() + "\n"


def render_prompt(template_path: Path, summary: str) -> str:
    template = template_path.read_text(encoding="utf-8")
    return template.replace("{summary}", summary)
