"""Composition du contexte hebdomadaire pour Léonor."""

from __future__ import annotations

from pathlib import Path

from .inputs import WeeklyInputs, read_truncated

MAX_VAULT_FILES = 30
MAX_CLAUDE_MDS = 12


def compose_context(inputs: WeeklyInputs, vault_root: Path | None = None) -> str:
    parts: list[str] = ["# Contexte hebdomadaire", ""]

    parts.append("## Bilans Idriss de la semaine")
    if not inputs.idriss_bilans:
        parts.append("_(aucun bilan trouvé)_")
    else:
        for bilan in inputs.idriss_bilans:
            parts.append(f"### {bilan.name}")
            parts.append(read_truncated(bilan, max_chars=4000))
            parts.append("")

    parts.append("## CLAUDE.md projets")
    if not inputs.claude_mds:
        parts.append("_(aucun)_")
    else:
        for md in inputs.claude_mds[:MAX_CLAUDE_MDS]:
            parts.append(f"### {md}")
            parts.append(read_truncated(md, max_chars=4000))
            parts.append("")
        if len(inputs.claude_mds) > MAX_CLAUDE_MDS:
            parts.append(f"_(+{len(inputs.claude_mds) - MAX_CLAUDE_MDS} CLAUDE.md tronqués)_")

    parts.append("## Vault Obsidian (extraits)")
    if not inputs.vault_files:
        parts.append("_(vide)_")
    else:
        for vault_file in inputs.vault_files[:MAX_VAULT_FILES]:
            rel = (
                vault_file.relative_to(vault_root)
                if vault_root and vault_root in vault_file.parents
                else vault_file
            )
            parts.append(f"### {rel}")
            parts.append(read_truncated(vault_file, max_chars=2000))
            parts.append("")
        if len(inputs.vault_files) > MAX_VAULT_FILES:
            parts.append(f"_(+{len(inputs.vault_files) - MAX_VAULT_FILES} fichiers vault tronqués)_")

    return "\n".join(parts).strip() + "\n"


def render_prompt(template_path: Path, context: str) -> str:
    template = template_path.read_text(encoding="utf-8")
    return template.replace("{context}", context)
