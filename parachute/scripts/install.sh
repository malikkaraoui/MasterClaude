#!/usr/bin/env bash
# install.sh — installe parachute en LaunchAgent (com.masterclaude.parachute).
# Build le binaire, génère le plist depuis le template, charge l'agent.
#
# Idempotent : peut être relancé pour refresh (rebuild + reload).

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/bin"
BIN_PATH="$BIN_DIR/parachute"
DATA_DIR="$ROOT/data"
LOG_PATH="$HOME/Library/Logs/parachute.log"
PLIST_TMPL="$ROOT/scripts/com.masterclaude.parachute.plist.tmpl"
PLIST_DEST="$HOME/Library/LaunchAgents/com.masterclaude.parachute.plist"
LABEL="com.masterclaude.parachute"

mkdir -p "$BIN_DIR" "$DATA_DIR" "$(dirname "$LOG_PATH")"

echo "[install] build → $BIN_PATH"
( cd "$ROOT" && go build -o "$BIN_PATH" ./cmd/parachute )

echo "[install] generate plist → $PLIST_DEST"
sed \
  -e "s|__BIN__|$BIN_PATH|g" \
  -e "s|__DATA__|$DATA_DIR|g" \
  -e "s|__LOG__|$LOG_PATH|g" \
  -e "s|__ROOT__|$ROOT|g" \
  "$PLIST_TMPL" > "$PLIST_DEST"

if launchctl list | grep -q "$LABEL"; then
  echo "[install] reload existing agent"
  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
fi

echo "[install] bootstrap agent"
launchctl bootstrap "gui/$UID" "$PLIST_DEST"
launchctl enable "gui/$UID/$LABEL"

sleep 1
if curl -fsS http://127.0.0.1:4001/health > /dev/null 2>&1; then
  echo "[install] ✅ parachute live sur :4001"
else
  echo "[install] ⚠ parachute n'a pas répondu — voir $LOG_PATH"
  exit 1
fi
