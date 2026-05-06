#!/usr/bin/env bash
# Idriss : copie le plist dans ~/Library/LaunchAgents/ + montre la commande
# launchctl load (sans la lancer — Malik valide manuellement).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/launchd/com.masterclaude.idriss.plist"
DST="$HOME/Library/LaunchAgents/com.masterclaude.idriss.plist"

if [[ ! -f "$SRC" ]]; then
  echo "[idriss] plist source absent : $SRC" >&2
  exit 1
fi

cp -f "$SRC" "$DST"
plutil -lint "$DST"

echo
echo "[idriss] plist copié : $DST"
echo
echo "Pour activer (manuel, à valider) :"
echo "  launchctl load $DST"
echo
echo "Pour désactiver :"
echo "  launchctl unload $DST"
echo
echo "Vérifier l'état :"
echo "  launchctl list | grep masterclaude.idriss"
