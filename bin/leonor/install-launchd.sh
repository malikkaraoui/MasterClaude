#!/usr/bin/env bash
# Léonor : copie le plist dans ~/Library/LaunchAgents/ + montre la commande
# launchctl load (sans la lancer — Malik valide).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/launchd/com.masterclaude.leonor.plist"
DST="$HOME/Library/LaunchAgents/com.masterclaude.leonor.plist"

if [[ ! -f "$SRC" ]]; then
  echo "[leonor] plist source absent : $SRC" >&2
  exit 1
fi

cp -f "$SRC" "$DST"
plutil -lint "$DST"

echo
echo "[leonor] plist copié : $DST"
echo
echo "Pour activer (manuel, à valider) :"
echo "  launchctl load $DST"
echo
echo "Pour désactiver :"
echo "  launchctl unload $DST"
