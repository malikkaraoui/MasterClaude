#!/usr/bin/env bash
# Envoie un message Telegram depuis Claude Code + log dans vault/10-mailbox.md
set -euo pipefail

MESSAGE="${1:-}"
if [[ -z "$MESSAGE" ]]; then
  echo "Usage: claude-notify.sh <message>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

if [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]]; then
  echo "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants" >&2
  exit 1
fi

# Strip éventuel préfixe "Claude :" déjà présent pour éviter le doublon
CLEAN_MESSAGE="${MESSAGE#Claude : }"
CLEAN_MESSAGE="${CLEAN_MESSAGE#Claude: }"

# Envoi Telegram
RESPONSE=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  --data-urlencode "text=Claude : ${CLEAN_MESSAGE}")

OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok','false'))")

if [[ "$OK" != "True" ]]; then
  echo "Erreur Telegram : $RESPONSE" >&2
  exit 1
fi

# Log dans vault/10-mailbox.md
MAILBOX="$SCRIPT_DIR/../vault/10-mailbox.md"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
cat >> "$MAILBOX" <<EOF

### ${TIMESTAMP} — Claude Code [outbound]

- Source : claude-code
- Statut : envoyé
- Résumé : ${MESSAGE}
EOF

echo "✓ Telegram envoyé + loggé dans vault/10-mailbox.md"
