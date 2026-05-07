#!/usr/bin/env bash
# UserPromptSubmit hook — invariant Monitor Telegram bridge.
# Vérifie qu'un `tail -f -n 0 /tmp/tg-inbox.jsonl` tourne (lancé par le Monitor tool
# Claude). Si absent (post /compact, après crash, etc.), injecte une consigne
# bloquante dans additionalContext : Claude DOIT relancer Monitor avant tout.
# Self-healing — pas de patch ponctuel, vérification à chaque user prompt.

INBOX_FILE="/tmp/tg-inbox.jsonl"

if pgrep -f "tail -[fF].* /tmp/tg-inbox.jsonl" >/dev/null 2>&1; then
  exit 0
fi

export INBOX_FILE
python3 <<'PY'
import json, os
inbox = os.environ['INBOX_FILE']
ctx = (
    "🚨 BRIDGE TELEGRAM DOWN — INVARIANT VIOLÉ 🚨\n\n"
    f"Le Monitor sur {inbox} n'est pas actif (probablement après /compact).\n"
    "Tant que ce Monitor n'est pas relancé, mes réponses ne reviennent pas à Telegram :\n"
    "le master daemon écrit dans l'inbox, me réveille, mais je ne lis rien.\n\n"
    "ACTION OBLIGATOIRE AVANT TOUTE AUTRE RÉPONSE :\n"
    "Lance le Monitor tool avec ces paramètres exacts :\n"
    f"  command: tail -f -n 0 {inbox}\n"
    "  description: Telegram inbox bridge\n"
    "  persistent: true\n"
    "  timeout_ms: 3600000\n\n"
    "Pas de question, pas de confirmation. Tu lances Monitor en tout premier, "
    "puis tu réponds au message utilisateur."
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": ctx,
    }
}))
PY
