#!/bin/bash
# PreToolUse guard — §13 : commits en français
# Alerte si le message de commit semble être en anglais

source "$(dirname "$0")/_parse-input.sh"

_FF="$(cd "$(dirname "$0")/.." && pwd)/.claude/features.json"
python3 -c "import json,sys,os; d=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}; sys.exit(0 if d.get(sys.argv[2],True) else 1)" "$_FF" "git_guard_french" 2>/dev/null || exit 0

if echo "$HOOK_COMMAND" | grep -qi "git commit"; then
  # Extraire le message de commit (-m "...")
  MSG=$(echo "$HOOK_COMMAND" | sed -n 's/.*-m[[:space:]]*["'"'"']\([^"'"'"']*\)["'"'"'].*/\1/p')
  if [ -n "$MSG" ]; then
    # grep -o compte les OCCURRENCES de mots (pas les lignes)
    EN_WORDS=$(echo "$MSG" | grep -oiwE "add|update|remove|implement|change|create|delete|move|rename|improve|merge|release" | wc -l | tr -d ' ')
    FR_WORDS=$(echo "$MSG" | grep -oiwE "ajout|corriger|corrige|mettre|supprimer|implementer|modifier|creer|deplacer|renommer|ameliorer|fusionner|version|feat|fix|refactor|docs" | wc -l | tr -d ' ')

    if [ "$EN_WORDS" -ge 2 ] && [ "$FR_WORDS" -eq 0 ]; then
      echo "§13 : les messages de commit doivent être en français. Message détecté en anglais."
      exit 2
    fi

    # §25 — rappel doux ciblé (Copilot v4 : éviter l'usure du signal)
    # S'affiche UNIQUEMENT si : (a) diff staged > 50 lignes OU (b) dette déjà dépassée
    if echo "$MSG" | grep -qiE "^(feat|fix|refactor):"; then
      if ! echo "$MSG" | grep -qiE "\[(needs-review|no-review-needed:[^]]+)\]"; then
        REPO_ROOT_25="$(cd "$(dirname "$0")/.." && pwd)"
        STAGED_LINES=$(cd "$REPO_ROOT_25" && git diff --cached --shortstat 2>/dev/null | grep -oE "[0-9]+ insertion" | grep -oE "^[0-9]+" || echo 0)
        DEBT_EXCEEDS=false
        if [ -f "$REPO_ROOT_25/scripts/handoff-debt.sh" ]; then
          bash "$REPO_ROOT_25/scripts/handoff-debt.sh" --check >/dev/null 2>&1 || DEBT_EXCEEDS=true
        fi
        if [ "${STAGED_LINES:-0}" -gt 50 ] || [ "$DEBT_EXCEEDS" = true ]; then
          PREFIX=$(echo "$MSG" | awk -F: '{print $1}')
          echo "§25 : commit ${PREFIX}: (staged ${STAGED_LINES} lignes, debt_exceeds=${DEBT_EXCEEDS}) — envisage [needs-review] ou [no-review-needed: raison]."
          echo "      → /handoff-debt pour voir la dette et générer un draft."
        fi
      fi
    fi
  fi
fi
