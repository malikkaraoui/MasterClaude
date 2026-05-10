#!/usr/bin/env bash
# SessionStart hook — init pouls.md si absent pour l'agent courant
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-ensure-init.js" 2>>/tmp/masterclaude-pulse.log || true
