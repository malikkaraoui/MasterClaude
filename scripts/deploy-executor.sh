#!/bin/bash
# deploy-executor.sh — Déploie le template EXECUTOR dans un projet exécutant
# Usage: bash scripts/deploy-executor.sh <project_path> <project_id>
# Ex:    bash scripts/deploy-executor.sh "/Users/malik/Documents/ATELIER PROJETS/Co-Pilot" "co-pilot"

set -euo pipefail

PROJECT_PATH="${1:?Usage: deploy-executor.sh <project_path> <project_id>}"
PROJECT_ID="${2:?Usage: deploy-executor.sh <project_path> <project_id>}"
MASTER_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$MASTER_ROOT/templates/EXECUTOR.md"
[ -d "$PROJECT_PATH" ] || { echo "ERREUR: $PROJECT_PATH n'est pas un répertoire existant"; exit 1; }
echo "▶ Déploiement exécutant: $PROJECT_ID → $PROJECT_PATH"

# 1. Créer .claude/ si absent
mkdir -p "$PROJECT_PATH/.claude/hooks"

# 2. Copier + personnaliser EXECUTOR.md
sed \
  -e "s|<PROJECT_ID>|$PROJECT_ID|g" \
  -e "s|<PROJECT_PATH>|$PROJECT_PATH|g" \
  "$TEMPLATE" > "$PROJECT_PATH/.claude/EXECUTOR.md"
echo "  ✅ .claude/EXECUTOR.md"

# 3. Créer hook executor-ctx-monitor.sh
cat > "$PROJECT_PATH/.claude/hooks/executor-ctx-monitor.sh" << HOOKEOF
#!/bin/bash
# executor-ctx-monitor.sh — Surveille le contexte et alerter MasterClaude
CTX_FILE="/tmp/masterclaude-ctx-pct"
[ ! -f "\$CTX_FILE" ] && exit 0
CTX=\$(cat "\$CTX_FILE" 2>/dev/null)
[[ ! "\$CTX" =~ ^[0-9]+\$ ]] && exit 0
PROJECT_ID="$PROJECT_ID"
BUS="http://localhost:4001/v1/bus/messages"
if [ "\$CTX" -ge 35 ]; then
  curl -sf -X POST "\$BUS" -H 'Content-Type: application/json' \
    -d "{\"from\":\"\$PROJECT_ID\",\"to\":\"masterclaude\",\"type\":\"compact_req\",\"payload\":{\"ctx_pct\":\$CTX}}" &>/dev/null || true
fi
exit 0
HOOKEOF
chmod +x "$PROJECT_PATH/.claude/hooks/executor-ctx-monitor.sh"
echo "  ✅ .claude/hooks/executor-ctx-monitor.sh"

# 4. Créer/patcher .claude/settings.json (merge hook UserPromptSubmit)
SETTINGS_FILE="$PROJECT_PATH/.claude/settings.json"
HOOK_ENTRY='{"type":"command","command":"bash .claude/hooks/executor-ctx-monitor.sh"}'
if [ -f "$SETTINGS_FILE" ]; then
  # Vérifier si le hook est déjà présent
  if grep -q "executor-ctx-monitor" "$SETTINGS_FILE" 2>/dev/null; then
    echo "  ⏩ .claude/settings.json (hook déjà présent)"
  else
    # Merger avec jq si disponible
    if command -v jq &>/dev/null; then
      TMP=$(mktemp)
      jq --argjson hook "$HOOK_ENTRY" \
        '.hooks.UserPromptSubmit //= [] | .hooks.UserPromptSubmit += [{"matcher":"","hooks":[$hook]}]' \
        "$SETTINGS_FILE" > "$TMP" && mv "$TMP" "$SETTINGS_FILE"
      echo "  ✅ .claude/settings.json (hook mergé)"
    else
      echo "  ⚠️  jq absent — settings.json non modifié (ajouter hook manuellement)"
    fi
  fi
else
  cat > "$SETTINGS_FILE" << SETTINGSEOF
{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [{"type":"command","command":"bash .claude/hooks/executor-ctx-monitor.sh"}] }
    ]
  }
}
SETTINGSEOF
  echo "  ✅ .claude/settings.json (créé)"
fi

# 5. Ajouter ligne superviseur dans CLAUDE.md si présent
CLAUDE_MD="$PROJECT_PATH/.claude/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
  if ! grep -q "Superviseur.*MasterClaude" "$CLAUDE_MD" 2>/dev/null; then
    # Insérer après la première ligne de tableau §0 (Projet courant)
    echo "" >> "$CLAUDE_MD"
    echo "<!-- EXECUTOR -->" >> "$CLAUDE_MD"
    echo "| Superviseur | MasterClaude (http://localhost:4001) |" >> "$CLAUDE_MD"
    echo "| Agent ID | $PROJECT_ID |" >> "$CLAUDE_MD"
    echo "| Rôle | Exécutant — voir \`.claude/EXECUTOR.md\` |" >> "$CLAUDE_MD"
    echo "  ✅ .claude/CLAUDE.md (superviseur ajouté)"
  else
    echo "  ⏩ .claude/CLAUDE.md (superviseur déjà présent)"
  fi
else
  echo "  ⚠️  .claude/CLAUDE.md absent — créer manuellement"
fi

echo "✅ Déploiement $PROJECT_ID terminé"
