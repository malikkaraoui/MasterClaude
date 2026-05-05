#!/bin/bash
# SessionStart hook — capture le modèle actif dans un fichier tmp.
#
# Garde-fou #1 contre corruption cache post-compaction :
# si source == "compact" et pas de HOOK_MODEL live → invalider le cache
# pour éviter qu'une valeur stale (héritée du transcript tronqué) persiste.
#
# HYPOTHÈSE V1 — mono-session : CACHE_FILE est un singleton global non scoppé
# par session_id. Avec 2 sessions simultanées, un compact de la session A peut
# invalider le cache de la session B. Acceptable tant qu'une seule session est
# active. À adresser avant V2 socket (cache par session_id).

set -eu

# shellcheck source=/dev/null
source "$(dirname "$0")/_parse-input.sh"

cache_scope_key() {
  if [ -n "${HOOK_SESSION_ID:-}" ]; then
    printf '%s' "$HOOK_SESSION_ID"
    return
  fi

  if [ -n "${HOOK_TRANSCRIPT_PATH:-}" ]; then
    printf '%s' "$HOOK_TRANSCRIPT_PATH" | cksum | awk '{print $1}'
    return
  fi

  printf 'global'
}

BASE_TMP="${CLAUDE_ATELIER_TMPDIR:-/tmp}"
CACHE_DIR="$BASE_TMP/claude-atelier-model-cache"
LEGACY_CACHE_FILE="$BASE_TMP/claude-atelier-current-model"
CACHE_SCOPE=$(cache_scope_key)
CACHE_FILE="$CACHE_DIR/${CACHE_SCOPE}.model"

mkdir -p "$CACHE_DIR"

if [ -n "${HOOK_MODEL:-}" ]; then
  # Vérité runtime disponible → écrire cache
  printf '%s\n' "$HOOK_MODEL" > "$CACHE_FILE"
  printf '%s\n' "$HOOK_MODEL" > "$LEGACY_CACHE_FILE"
elif [ "${HOOK_SOURCE:-}" = "compact" ]; then
  # Compact sans model live → invalider cache (force re-détection au prochain message)
  rm -f "$CACHE_FILE"
  if [ "$CACHE_SCOPE" = "global" ]; then
    rm -f "$LEGACY_CACHE_FILE"
  fi
fi
