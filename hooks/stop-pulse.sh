#!/usr/bin/env bash
# Stop hook — met à jour pouls.md pour l'agent courant
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-update.js" "$@"
