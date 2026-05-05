#!/usr/bin/env bash
# Start hook — Maestro §0 watcher
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-maestro.js" "$@"
