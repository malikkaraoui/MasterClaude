#!/usr/bin/env bash
# Léonor wrapper — réutilise le venv partagé Idriss/Léonor.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$(cd "$HERE/../.." && pwd)"
VENV="$HOME_DIR/bin/.shared-venv"

if [[ ! -d "$VENV" ]]; then
  echo "[leonor] venv absent : $VENV" >&2
  echo "[leonor] crée-le : python3 -m venv $VENV && $VENV/bin/pip install -r $HOME_DIR/requirements.txt" >&2
  exit 3
fi

export MASTERCLAUDE_HOME="${MASTERCLAUDE_HOME:-$HOME_DIR}"
export PYTHONPATH="$HOME_DIR/bin:${PYTHONPATH:-}"

exec "$VENV/bin/python" -m leonor.run "$@"
