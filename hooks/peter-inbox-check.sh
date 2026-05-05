#!/bin/bash
# Phase D — Peter → Claude Code real-time notification
# Fires on every UserPromptSubmit; surfaces Peter's last Telegram message if unread.
SIGNAL="/tmp/peter-notify"
MAILBOX="/Users/malik/Documents/ATELIER PROJETS/Claude instructions/vault/10-mailbox.md"

[ -f "$SIGNAL" ] || exit 0

content=$(cat "$SIGNAL")
rm -f "$SIGNAL"

IFS='|' read -r ts typ transcript <<< "$content"

echo "[PETER] 📬 Nouveau message Telegram non lu :"
echo "  Heure : $ts | Type : $typ"
echo "  Message : $transcript"
echo ""
echo "  → Dernière entrée mailbox :"
grep -A5 "### ${ts}" "$MAILBOX" 2>/dev/null | head -8
