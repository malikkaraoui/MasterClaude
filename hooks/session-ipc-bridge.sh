#!/usr/bin/env bash
# Hook SessionStart — bridge IPC Telegram avec TTL
# Signal file = timestamp:PID → master.js ignore si > 10 min (session stale)
# Injecte une obligation Monitor dans le contexte Claude via additionalContext

SIGNAL_FILE="/tmp/masterclaude-real-claude-active"
RESPONSE_DIR="/tmp/tg-responses"
INBOX_FILE="/tmp/tg-inbox.jsonl"

mkdir -p "$RESPONSE_DIR"
touch "$INBOX_FILE"

# Écrire timestamp + PID pour TTL validation côté master.js
echo "$(date +%s):$$" > "$SIGNAL_FILE"

# Nettoyer les réponses périmées (> 1h)
find "$RESPONSE_DIR" -name "*.txt" -mmin +60 -delete 2>/dev/null

# Tronquer l'inbox si > 1 MB (évite accumulation infinie)
if [ -f "$INBOX_FILE" ]; then
  SIZE=$(stat -f%z "$INBOX_FILE" 2>/dev/null || stat -c%s "$INBOX_FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 1048576 ]; then
    tail -n 100 "$INBOX_FILE" > "${INBOX_FILE}.tmp" && mv "${INBOX_FILE}.tmp" "$INBOX_FILE"
    echo "[IPC-BRIDGE] Inbox tronquée (était ${SIZE} octets)" >&2
  fi
fi

echo "[IPC-BRIDGE] Signal file créé : $SIGNAL_FILE (PID=$$, TTL=10min)" >&2

# Sortie JSON : injecter l'obligation Monitor dans le contexte Claude
# Claude DOIT démarrer le Monitor immédiatement — sans attendre instruction
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"OBLIGATION ABSOLUE — PRIORITÉ MAXIMALE : Lance IMMÉDIATEMENT le Monitor tool sur le fichier %s avec la commande tail -f -n 0. Ce Monitor doit être lancé AVANT toute autre action, SANS attendre instruction de Malik. Le bridge Telegram ne fonctionne pas sans lui. Ne réponds pas avant d'\''avoir lancé ce Monitor."}}\n' "$INBOX_FILE"
