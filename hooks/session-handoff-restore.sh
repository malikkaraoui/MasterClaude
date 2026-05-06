#!/bin/bash
# SessionStart hook — restaure le handoff laissé par la session précédente.
# Si /tmp/masterclaude-handoff-<projectKey>.json existe, on l'injecte en
# additionalContext, on ping Telegram "je suis frais", puis on archive.

set -eu

ROOT="$(pwd)"
PROJECT_KEY="$(basename "$ROOT")"
LIVE_HANDOFF="/tmp/masterclaude-handoff-${PROJECT_KEY}.json"
ARCHIVE_DIR="$ROOT/vault/handoffs"

[ -f "$LIVE_HANDOFF" ] || exit 0

# Lecture safe : pas de jq requis, on injecte le JSON brut + un préambule.
# La session lit le JSON et comprend.
echo "[HANDOFF-RESTORE] Reprise depuis session précédente — handoff trouvé."
echo ""
echo "## handoff.json (de ton prédécesseur)"
echo ""
echo '```json'
cat "$LIVE_HANDOFF"
echo ""
echo '```'
echo ""
echo "[HANDOFF-RESTORE] Lis ce JSON puis exécute le champ \`next_action\` en priorité. Tiens compte de \`warnings_for_successor\`."

# Ping Telegram via le bot token (env passé par le master daemon).
# Si la commande tg-notify ou le bot token n'est pas dispo, on n'échoue pas.
NEXT_ACTION="$(sed -n 's/.*"next_action": *"\([^"]*\)".*/\1/p' "$LIVE_HANDOFF" | head -1)"
NEXT_ACTION="${NEXT_ACTION:-tâche reprise}"

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  MSG="✨ Frais, douché, opérationnel. Je reprends sur : ${NEXT_ACTION}"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" >/dev/null 2>&1 || true
fi

# Archive et nettoyage du live.
mkdir -p "$ARCHIVE_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
mv "$LIVE_HANDOFF" "$ARCHIVE_DIR/${TS}-${PROJECT_KEY}-restored.json" 2>/dev/null || true
