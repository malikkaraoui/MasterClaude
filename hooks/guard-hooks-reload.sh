#!/bin/bash
# PostToolUse guard — détecte modification de hooks/settings/.mcp
# Rappelle de redémarrer VS Code

source "$(dirname "$0")/_parse-input.sh"

if [ -z "$HOOK_FILE_PATH" ]; then
  exit 0
fi

NEEDS_RELOAD=false
WHAT=""

if echo "$HOOK_FILE_PATH" | grep -qE "hooks/guard-|hooks/routing-|hooks/session-"; then
  NEEDS_RELOAD=true
  WHAT="hook $(basename "$HOOK_FILE_PATH")"
fi

if echo "$HOOK_FILE_PATH" | grep -qE "settings\.json"; then
  NEEDS_RELOAD=true
  WHAT="settings.json (config hooks + permissions)"
fi

if echo "$HOOK_FILE_PATH" | grep -qE "\.mcp\.json"; then
  NEEDS_RELOAD=true
  WHAT=".mcp.json (serveurs MCP)"
fi

if [ "$NEEDS_RELOAD" = true ]; then
  echo ""
  echo "⚠️  RECHARGEMENT REQUIS — $WHAT modifié"
  echo "Les hooks, permissions et MCP sont chargés au démarrage du processus."
  echo "Ce changement ne sera PAS effectif dans cette session."
  echo ""
  echo "  → Fermer et rouvrir VS Code complètement"
  echo ""
fi
