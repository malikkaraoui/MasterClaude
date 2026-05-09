#!/bin/bash
# guard-osascript-return.sh — PreToolUse Bash
# Bloque tout appel osascript avec keystroke mais sans keystroke return.
# Garantit qu'aucune frappe dans un Terminal ne reste en attente.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except: pass
" 2>/dev/null)

# Ne s'applique que si osascript + keystroke présents
echo "$CMD" | grep -q 'osascript' || exit 0
echo "$CMD" | grep -q 'keystroke' || exit 0

# Si keystroke est présent mais pas "keystroke return" → bloquer
if ! echo "$CMD" | grep -q 'keystroke return'; then
  echo "BLOCK: osascript avec keystroke détecté mais sans 'keystroke return'. Ajoute 'keystroke return' après la frappe pour soumettre le prompt."
  exit 2
fi

exit 0
