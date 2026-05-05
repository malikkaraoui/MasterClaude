#!/bin/bash
# PreToolUse guard — QMD-first: redirige les lectures .md vers QMD
# Injecte le rappel + les commandes exactes avant chaque Read sur un .md

source "$(dirname "$0")/_parse-input.sh"

FILE_PATH="$HOOK_FILE_PATH"

# Ignorer si pas un fichier .md
if ! echo "$FILE_PATH" | grep -qE "\.md$"; then
  exit 0
fi

# Ignorer les fichiers de guidage / système (Claude en a besoin pour être guidé)
if echo "$FILE_PATH" | grep -qE "(CLAUDE\.md$|MEMORY\.md$|README\.md$|/\.claude/|/memory/|/tmp/|CHANGELOG\.md$|LICENSE|/hooks/|/rules/|/runtime/|/orchestration/|/autonomy/|/security/|/handoffs/|/templates/)"; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")

echo ""
echo "⚡ [QMD-FIRST] §15 : ce .md est probablement dans l'index QMD."
echo "   Utilise QMD — plus rapide, moins de tokens :"
echo ""
echo "   Accès direct :  mcp__qmd__get path='$BASENAME'"
echo "   Recherche :     mcp__qmd__query searches='[{\"type\":\"vec\",\"query\":\"...\"}]'"
echo "   Multi :         mcp__qmd__multi_get glob='*.md'"
echo ""
echo "   Read autorisé uniquement si tu connais la ligne exacte (offset+limit)."
echo ""
