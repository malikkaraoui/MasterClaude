#!/usr/bin/env python3
"""
scripts/switch_model.py — Injecte /model <alias> dans un pane tmux Claude Code.

Fonctionne uniquement en mode terminal avec tmux.
En mode VSCode, Mode M est le contrat officiel : aucun switch auto in-session
n'est possible (pas de commande/API publique exposée par l'extension Anthropic).
L'extension ne gère pas le hot-reload du modèle — settings.json = init session only.
→ Tape /model <alias> directement dans le chat VS Code.
V2 socket/IPC exclu définitivement (testé 2026-04-15, voir handoff v2-switch-vscode-invalidation).

Usage:
    python3 scripts/switch_model.py <model> [pane_tmux]

Modèles valides : opus | sonnet | haiku | opusplan
Pane            : ID ou nom de fenêtre tmux (défaut : claude-session)
"""

import shutil
import subprocess
import sys

VALID_MODELS = ["opus", "sonnet", "haiku", "opusplan"]

# Programmes full-screen qui absorberaient l'injection de façon indésirable
_UNSAFE_COMMANDS = {"vim", "nvim", "less", "man", "nano", "more", "vi"}
# GUARD PARTIEL : pane_current_command != programme unsafe ≠ "Claude Code tourne ici".
# Un pane zsh ordinaire valide ce check. /model sera injecté dans le shell → perdu.
# Vérifier [ROUTING] au message suivant pour confirmer le switch effectif.


def _pane_current_command(pane: str) -> str:
    r = subprocess.run(
        ["tmux", "display-message", "-p", "-t", pane, "#{pane_current_command}"],
        capture_output=True, text=True,
    )
    return r.stdout.strip() if r.returncode == 0 else ""


def switch_model(model: str, pane: str = "claude-session") -> bool:
    if model not in VALID_MODELS:
        print(
            f"[ERROR] Modèle '{model}' invalide. Valides : {VALID_MODELS}",
            file=sys.stderr,
        )
        return False

    if not shutil.which("tmux"):
        print(
            "[INFO] tmux non disponible (mode VSCode).\n"
            f"→ Tape directement dans le chat : /model {model}",
            file=sys.stderr,
        )
        return False

    current_cmd = _pane_current_command(pane)
    if current_cmd in _UNSAFE_COMMANDS:
        print(
            f"[ERROR] Pane '{pane}' est dans '{current_cmd}' — injection annulée. "
            "Quitte l'éditeur puis relance.",
            file=sys.stderr,
        )
        return False

    r = subprocess.run(
        ["tmux", "send-keys", "-t", pane, f"/model {model}", "Enter"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"[ERROR] tmux send-keys: {r.stderr.strip()}", file=sys.stderr)
        return False

    print(
        f"[INJECTED] /model {model} envoyé à pane tmux '{pane}' "
        "(pas de preuve post-condition — vérifier le prochain [ROUTING])"
    )
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/switch_model.py <model> [pane_tmux]", file=sys.stderr)
        print(f"Modèles valides : {VALID_MODELS}", file=sys.stderr)
        sys.exit(1)

    model = sys.argv[1]
    pane = sys.argv[2] if len(sys.argv) > 2 else "claude-session"

    sys.exit(0 if switch_model(model, pane) else 1)
