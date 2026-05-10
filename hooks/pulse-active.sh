#!/usr/bin/env bash
# UserPromptSubmit hook — marque l'agent comme actif à chaque message
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-set-active.js" 2>>/tmp/masterclaude-pulse.log || true
