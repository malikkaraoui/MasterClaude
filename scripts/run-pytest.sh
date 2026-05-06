#!/usr/bin/env bash
# scripts/run-pytest.sh — lance pytest depuis le venv partagé.
# Skip silencieux si pytest absent (machines sans Python configuré).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/bin/.shared-venv"
PYTEST="$VENV/bin/pytest"

if [[ ! -x "$PYTEST" ]]; then
  echo "[pytest] venv absent ($VENV) — skip Python tests"
  echo "[pytest] pour activer : python3 -m venv $VENV && $VENV/bin/pip install -r $ROOT/requirements.txt"
  exit 0
fi

cd "$ROOT"
exec "$PYTEST" "$@"
