#!/usr/bin/env bash
# wake-claude.sh — Helper robuste pour ouvrir une session claude CLI dans MasterClaude.
# Source unique pour tout spawn de session (manuel, hook, recovery), évite les heredocs
# osascript ad-hoc qui foirent l'escaping et ouvrent N fenêtres dans ~/.
#
# Usage :
#   scripts/wake-claude.sh                  # ouvre une session claude dans /Users/malik/MasterClaude
#   scripts/wake-claude.sh --force          # ouvre même si une session existe déjà
#   scripts/wake-claude.sh --cwd /autre/dir # cwd alternatif (rare)
#
# Idempotent par défaut : skip si un process `claude` (CLI bare) tourne déjà.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd -P )"
ROOT="$( cd "${SCRIPT_DIR}/.." && pwd -P )"
TARGET_CWD="${ROOT}"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --cwd) TARGET_CWD="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "argument inconnu : $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "${TARGET_CWD}" ]]; then
  echo "[wake-claude] cwd inexistant : ${TARGET_CWD}" >&2
  exit 1
fi

if [[ ${FORCE} -eq 0 ]]; then
  if pgrep -x claude >/dev/null 2>&1; then
    existing=$(pgrep -x claude | head -1)
    echo "[wake-claude] session claude déjà active (PID=${existing}) — skip (utiliser --force pour ignorer)"
    exit 0
  fi
fi

# Quoting AppleScript :
#   - le path peut contenir espaces/apostrophes → escape pour shell ET pour AppleScript
#   - shell : entre quotes simples, '\'' pour échapper une apostrophe
#   - AppleScript do script : double-quotes, on échappe " et \
shell_path="${TARGET_CWD//\'/\'\\\'\'}"
shell_cmd="cd '${shell_path}' && exec claude"
# Échappe \ puis " pour insérer dans la chaîne AppleScript
applescript_arg="${shell_cmd//\\/\\\\}"
applescript_arg="${applescript_arg//\"/\\\"}"

osascript <<EOF
tell application "Terminal"
  activate
  do script "${applescript_arg}"
end tell
EOF

echo "[wake-claude] Terminal lancé dans ${TARGET_CWD}"
