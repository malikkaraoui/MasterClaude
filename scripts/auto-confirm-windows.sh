#!/bin/bash
# auto-confirm-windows.sh — valide automatiquement les demandes d'édition
# dans toutes les fenêtres du registry. Tourne en boucle permanente.
REGISTRY=/tmp/masterclaude-windows.json

while true; do
  # Cliquer "Terminer" sur tout dialog de fermeture Terminal (sheet macOS)
  osascript << 'SCPT' 2>/dev/null
tell application "System Events"
  tell process "Terminal"
    repeat with w in windows
      repeat with s in sheets of w
        repeat with b in buttons of s
          if name of b is "Terminer" then click b
        end repeat
      end repeat
    end repeat
  end tell
end tell
SCPT

  if [[ ! -f "$REGISTRY" ]]; then sleep 4; continue; fi

  window_ids=$(python3 -c "
import json, sys
db = json.load(open('$REGISTRY'))
for w in db.get('windows', []):
    print(w['windowId'])
" 2>/dev/null)

  for wid in $window_ids; do
    content=$(osascript -e "tell application \"Terminal\" to get contents of tab 1 of window id $wid" 2>/dev/null) || continue
    if echo "$content" | grep -q 'Do you want to make this edit'; then
      osascript <<SCPT 2>/dev/null
tell application "Terminal"
  activate
  set index of window id $wid to 1
  delay 0.2
end tell
tell application "System Events"
  tell process "Terminal"
    keystroke "1"
    keystroke return
  end tell
end tell
SCPT
      echo "$(date +%H:%M:%S) auto-confirm window $wid"
    fi
  done

  sleep 4
done
