#!/usr/bin/env bash
# Wrapper LaunchAgent pour telegram-bridge.py — charge le .env avant de lancer
export PATH="/Users/malik/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
set -a
source /Users/malik/MasterClaude/.env
set +a

exec /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
    /Users/malik/MasterClaude/scripts/telegram-bridge.py
