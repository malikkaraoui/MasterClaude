#!/usr/bin/env bash
# Hook SessionStart — prépare le bridge IPC Telegram
# Crée signal file + répertoires → permet à askRealClaude() de router vers THIS session

SIGNAL_FILE="/tmp/masterclaude-real-claude-active"
RESPONSE_DIR="/tmp/tg-responses"
INBOX_FILE="/tmp/tg-inbox.jsonl"

touch "$SIGNAL_FILE"
mkdir -p "$RESPONSE_DIR"
touch "$INBOX_FILE"

echo "[IPC-BRIDGE] Signal file créé : $SIGNAL_FILE"
echo "[IPC-BRIDGE] IMPORTANT : lancer Monitor sur $INBOX_FILE (tail -f -n 0) pour activer le bridge Telegram complet."
