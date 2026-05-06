#!/usr/bin/env bash
# scripts/run-pytest.sh — lance pytest depuis le venv partagé.
# Skip silencieux si pytest absent (machines sans Python configuré).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/bin/.shared-venv"
PYTEST="$VENV/bin/pytest"

if [[ ! -x "$PYTEST" ]]; then
  echo "[pytest] venv absent ($VENV) — Python tests non lancés"
  echo "[pytest] pour activer : python3 -m venv $VENV && $VENV/bin/pip install -r $ROOT/requirements.txt"
  if [[ "${CI:-}" == "1" || "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "[pytest] CI détecté — exit 1 (impossible de skip silencieusement en CI)"
    exit 1
  fi
  echo "[pytest] mode local — skip toléré"
  exit 0
fi

cd "$ROOT"
exec "$PYTEST" "$@"
