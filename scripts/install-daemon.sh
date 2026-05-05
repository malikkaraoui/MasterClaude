#!/usr/bin/env bash
# Installe le mailbox-watcher comme LaunchAgent macOS (toujours actif, redémarre auto)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHER="$SCRIPT_DIR/mailbox-watcher.sh"
LABEL="com.claude-atelier.mailbox-watcher"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/claude-atelier"

mkdir -p "$LOG_DIR"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${WATCHER}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/mailbox-watcher.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/mailbox-watcher-error.log</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
EOF

# Décharger si déjà chargé
launchctl unload "$PLIST" 2>/dev/null || true
# Tuer le watcher manuel si actif
pkill -f "mailbox-watcher.sh" 2>/dev/null || true

launchctl load "$PLIST"
echo "✓ LaunchAgent installé : $LABEL"
echo "  Logs : $LOG_DIR/mailbox-watcher.log"
echo "  Status : launchctl list | grep claude-atelier"
