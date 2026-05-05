#!/bin/bash
# PostToolUse guard — Système Challenger
# 5 triggers : volume, feature, endurance, architecture, bug bloquant

source "$(dirname "$0")/_parse-input.sh"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
_FF="$REPO_ROOT/.claude/features.json"
python3 -c "import json,sys,os; d=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}; sys.exit(0 if d.get(sys.argv[2],True) else 1)" "$_FF" "review_copilot" 2>/dev/null || exit 0
LINES_FILE="/tmp/claude-atelier-lines-since-review"
COMMITS_FILE="/tmp/claude-atelier-commits-since-anglemort"
FAIL_FILE="/tmp/claude-atelier-fix-attempts"

# ===== TRIGGER 1-4 : git commit =====
if echo "$HOOK_COMMAND" | grep -qi "git commit"; then

  # --- Volume : compteur de lignes → /review-copilot ---
  LINES=$(cd "$REPO_ROOT" && git diff --shortstat HEAD~1 HEAD 2>/dev/null | grep -oE '[0-9]+ insertion|[0-9]+ deletion' | grep -oE '[0-9]+' | paste -sd+ - | bc 2>/dev/null || echo 0)
  PREV=$(cat "$LINES_FILE" 2>/dev/null || echo 0)
  TOTAL=$((PREV + LINES))
  echo "$TOTAL" > "$LINES_FILE"

  if [ "$TOTAL" -ge 300 ]; then
    echo ""
    echo "📋 [MOHAMED] $TOTAL lignes modifiées — Mohamed instruit le dossier."
    echo "   Tu as la tête dans le guidon. Il voit ce que tu ne vois plus."
    echo "   → /review-copilot — Mohamed prépare le handoff"
    echo "   → /angle-mort — auto-review anti-complaisance"
    echo ""
    # §25 anti-triche : AUCUN reset. Dette = git via handoff-debt.sh, reset = /integrate-review seul.
  fi

  # --- Feature/Refactor : /angle-mort ---
  COMMIT_MSG=$(cd "$REPO_ROOT" && git log -1 --pretty=%s 2>/dev/null || echo "")
  FEATURE_DONE=false

  if echo "$COMMIT_MSG" | grep -qiE "^feat:|^feature|^refactor:"; then
    FEATURE_DONE=true
  fi

  PREV_COMMITS=$(cat "$COMMITS_FILE" 2>/dev/null || echo 0)
  COMMITS=$((PREV_COMMITS + 1))
  echo "$COMMITS" > "$COMMITS_FILE"

  if [ "$FEATURE_DONE" = true ]; then
    # Amine : vérifier si des tests accompagnent la feat
    TEST_CHANGES=$(cd "$REPO_ROOT" && git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -cE "^test/" || echo 0)
    if [ "${TEST_CHANGES:-0}" -eq 0 ]; then
      echo ""
      echo "🧪 [AMINE] Feat sans tests → \"$COMMIT_MSG\""
      echo "   Chaque feat doit éclore avec ses tests. → test/hooks.js"
      echo ""
    fi
    echo ""
    echo "📋 [MOHAMED] Feature détectée : \"$COMMIT_MSG\""
    echo "   Mohamed est prêt à instruire le dossier avant que tu continues."
    echo "   → /review-copilot — Mohamed prépare le handoff"
    echo "   → /angle-mort — miroir dur, zéro complaisance"
    echo ""
    echo "   README : cette feature est-elle reflétée dans README.md (FR + EN) ?"
    echo ""
    # §25 anti-triche : AUCUN reset compteur ni checkpoint.
  elif [ "$COMMITS" -ge 10 ]; then
    echo ""
    echo "📋 [MOHAMED] $COMMITS commits sans review externe."
    echo "   Trop longtemps seul. Mohamed attend — les angles morts s'accumulent."
    echo "   → /review-copilot ou /angle-mort"
    echo ""
    # §25 anti-triche : AUCUN reset compteur ni checkpoint.
  fi

  # --- Architecture : fichiers structurants ---
  NEW_FILES=$(cd "$REPO_ROOT" && git diff --name-only --diff-filter=A HEAD~1 HEAD 2>/dev/null || echo "")
  ARCHI_FILES=""
  for f in $NEW_FILES; do
    case "$f" in
      src/stacks/*|src/skills/*/SKILL.md|hooks/*|.github/workflows/*|src/fr/ecosystem/*|src/fr/orchestration/*)
        ARCHI_FILES="$ARCHI_FILES $f"
        ;;
    esac
  done

  if [ -n "$ARCHI_FILES" ]; then
    echo ""
    echo "🏗️  [CHALLENGER] Fichier(s) architecturaux créé(s) :$ARCHI_FILES"
    echo "   Un choix d'architecture mérite un deuxième regard."
    echo "   → /review-copilot pour validation externe"
    echo ""
  fi
fi

# ===== TRIGGER 5 : échec répété =====
if [ "$HOOK_EXIT_CODE" != "0" ] && [ -n "$HOOK_COMMAND" ]; then
  CMD_HASH=$(echo "$HOOK_COMMAND" | tr -s ' ' | md5 -q 2>/dev/null || echo "$HOOK_COMMAND" | tr -s ' ' | md5sum 2>/dev/null | cut -d' ' -f1)

  PREV_HASH=$(head -1 "$FAIL_FILE" 2>/dev/null || echo "")
  PREV_COUNT=$(tail -1 "$FAIL_FILE" 2>/dev/null || echo 0)

  if [ "$CMD_HASH" = "$PREV_HASH" ]; then
    COUNT=$((PREV_COUNT + 1))
  else
    COUNT=1
  fi

  echo "$CMD_HASH" > "$FAIL_FILE"
  echo "$COUNT" >> "$FAIL_FILE"

  if [ "$COUNT" -ge 3 ]; then
    echo ""
    echo "🚨 [CHALLENGER] $COUNT tentatives échouées sur la même commande."
    echo "   STOP. Tu tournes en rond."
    echo "   → /review-copilot avec le contexte d'erreur"
    echo "   → Changer d'approche complètement"
    echo ""
    echo "" > "$FAIL_FILE"
  fi
else
  if [ -f "$FAIL_FILE" ]; then
    echo "" > "$FAIL_FILE"
  fi
fi
