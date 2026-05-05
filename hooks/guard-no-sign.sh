#!/bin/bash
# PreToolUse guard — §13 : jamais signer les commits
# Bloque si Co-Authored-By ou Signed-off-by détecté dans un git commit

source "$(dirname "$0")/_parse-input.sh"

_FF="$(cd "$(dirname "$0")/.." && pwd)/.claude/features.json"
python3 -c "import json,sys,os; d=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}; sys.exit(0 if d.get(sys.argv[2],True) else 1)" "$_FF" "git_guard_sign" 2>/dev/null || exit 0

if echo "$HOOK_COMMAND" | grep -qi "git commit"; then
  if echo "$HOOK_COMMAND" | grep -qi "Co-Authored-By\|Signed-off-by\|--signoff\|-s "; then
    echo "BLOCKED"
    echo "§13 : jamais signer les commits. Pas de Co-Authored-By, Signed-off-by, ni --signoff."
    exit 2
  fi
fi
