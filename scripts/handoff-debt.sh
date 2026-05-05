#!/usr/bin/env bash
# scripts/handoff-debt.sh — Calcule la dette §25 DEPUIS GIT (jamais depuis un JSON)
#
# Source de vérité : git log + docs/handoffs/
# Jamais de compteur /tmp ou de cache éditable.
#
# Usage:
#   bash scripts/handoff-debt.sh           # output texte
#   bash scripts/handoff-debt.sh --json    # output JSON
#   bash scripts/handoff-debt.sh --check   # exit 1 si seuil dépassé (pour pre-push gate)
#
# Définition de "handoff intégré" :
#   1. Fichier dans docs/handoffs/*.md ou *.json (exclus _template)
#   2. .md  : section "## Intégration" avec > 100 chars réels hors template
#      .json : champ "integration" non null avec > 100 chars réels
#   3. Passe le validateur test/validate-handoff.js
#
# Dette = git log <reviewedRange.to>..HEAD --shortstat (recalcul live)

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HANDOFF_DIR="$REPO_ROOT/docs/handoffs"

# Seuils (configurables via env)
# Anciens seuils (trop bas → boucle de dette auto-alimentée) :
#   lines=100, commits=3, days=7
# Nouveaux seuils calibrés pour bloquer les vrais oublis, pas l'infra :
THRESHOLD_LINES="${HANDOFF_THRESHOLD_LINES:-300}"
THRESHOLD_COMMITS="${HANDOFF_THRESHOLD_COMMITS:-15}"
THRESHOLD_DAYS="${HANDOFF_THRESHOLD_DAYS:-7}"
VALIDATE_TIMEOUT_SECONDS="${HANDOFF_VALIDATE_TIMEOUT_SECONDS:-3}"

MODE="text"
CHECK_ONLY=false
[[ "${1:-}" == "--json" ]] && MODE="json"
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

validate_handoff_with_timeout() {
  local file="$1"
  python3 - "$REPO_ROOT/test/validate-handoff.js" "$file" "$VALIDATE_TIMEOUT_SECONDS" <<'PY'
import subprocess
import sys

validator, target, timeout_raw = sys.argv[1], sys.argv[2], sys.argv[3]
try:
  timeout = float(timeout_raw)
except ValueError:
  timeout = 3.0

try:
  result = subprocess.run(
    ['node', validator, target],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    timeout=timeout,
    check=False,
  )
except subprocess.TimeoutExpired:
  sys.exit(1)
except Exception:
  sys.exit(1)

sys.exit(result.returncode)
PY
}

# ─── Trouver le dernier handoff intégré ────────────────────────────────────

LATEST_INTEGRATED=""
LATEST_SHA=""

if [[ -d "$HANDOFF_DIR" ]]; then
  # Rassembler tous les handoffs (md + json) dans un tableau puis ls -t en un seul appel
  # (xargs peut fragmenter le tri si la liste dépasse la taille d'argument — fix Copilot)
  _hfiles=()
  while IFS= read -r -d '' _f; do _hfiles+=("$_f"); done < <(
    find "$HANDOFF_DIR" -maxdepth 1 \( -name "202*.md" -o -name "202*.json" \) \
      -not -name "_template*" -print0 2>/dev/null
  )
  # Itérer tous les handoffs pour trouver celui avec le TO_SHA le plus récent dans git
  # (ls -t trie par mtime fichier, pas par sha git → on compare tous et on garde le meilleur)
  _all_files=()
  [[ ${#_hfiles[@]} -gt 0 ]] && while IFS= read -r f; do _all_files+=("$f"); done < <(ls "${_hfiles[@]}" 2>/dev/null)

  for f in "${_all_files[@]:-}"; do
    [[ -z "$f" ]] && continue

    CONTENT_LEN=0
    REVIEWED_RANGE=""

    if [[ "$f" == *.json ]]; then
      # Un seul appel python3 pour CONTENT_LEN + REVIEWED_RANGE (perf : 2× moins de sous-processus)
      read -r CONTENT_LEN REVIEWED_RANGE < <(python3 -c "
import json, sys
try:
    d = json.load(open('$f'))
    integ = d.get('integration') or {}
    length = len(json.dumps(integ).replace(' ', '')) if isinstance(integ, dict) else 0
    rr = d.get('meta', {}).get('reviewedRange', '') if length > 100 else ''
    print(length, rr)
except Exception:
    print(0, '')
" 2>/dev/null || echo "0 ")
    else
      INTEGRATION=$(awk '/^## Intégration/{flag=1; next} flag' "$f" 2>/dev/null || echo "")
      REAL_CONTENT=$(echo "$INTEGRATION" | sed 's/<!--.*-->//g' | grep -v "^##\|^$" | tr -d '[:space:]' || echo "")
      CONTENT_LEN=${#REAL_CONTENT}
      if [[ $CONTENT_LEN -gt 100 ]]; then
        REVIEWED_RANGE=$(grep -E "^>[[:space:]]*reviewedRange[[:space:]]*:" "$f" 2>/dev/null | head -1 | sed -E 's/^>[[:space:]]*reviewedRange[[:space:]]*:[[:space:]]*//; s/[[:space:]]+$//' || echo "")
      fi
    fi

    # validate_handoff_with_timeout appelé UNE SEULE FOIS après la boucle sur le vainqueur
    # (pas à chaque candidat → 59 validations → 1 validation)
    if [[ $CONTENT_LEN -gt 100 ]] && [[ "$REVIEWED_RANGE" =~ ^[a-f0-9]{7,40}\.\.[a-f0-9]{7,40}$ ]]; then
      TO_SHA="${REVIEWED_RANGE##*..}"
      # Garder le sha le plus récent dans git (descendant du sha courant)
      if [[ -z "$LATEST_SHA" ]]; then
        LATEST_INTEGRATED="$f"
        LATEST_SHA="$TO_SHA"
      elif git -C "$REPO_ROOT" merge-base --is-ancestor "$LATEST_SHA" "$TO_SHA" 2>/dev/null; then
        # TO_SHA est plus récent que LATEST_SHA → remplacer
        LATEST_INTEGRATED="$f"
        LATEST_SHA="$TO_SHA"
      fi
    fi
  done

  # Validation structurelle du vainqueur uniquement (1 appel au lieu de N)
  if [[ -n "$LATEST_INTEGRATED" ]] && ! validate_handoff_with_timeout "$LATEST_INTEGRATED"; then
    LATEST_INTEGRATED=""
    LATEST_SHA=""
  fi
fi

# ─── Calculer la dette depuis git ──────────────────────────────────────────

if [[ -z "$LATEST_SHA" ]]; then
  RANGE="HEAD~30..HEAD"
else
  RANGE="${LATEST_SHA}..HEAD"
fi

# Commits dans le range
COMMITS_SINCE=$(git -C "$REPO_ROOT" rev-list --count "$RANGE" 2>/dev/null || echo 0)

# Lignes ajoutées/supprimées dans le range
LINES_ADDED=0
LINES_DELETED=0
if [[ $COMMITS_SINCE -gt 0 ]]; then
  SHORTSTAT=$(git -C "$REPO_ROOT" log "$RANGE" --shortstat --format="" 2>/dev/null | awk '
    /insertion/ { for(i=1;i<=NF;i++) if($i~/^\+?[0-9]+$/ && $(i+1)~/insertion/) ins+=$i }
    /deletion/  { for(i=1;i<=NF;i++) if($i~/^\+?[0-9]+$/ && $(i+1)~/deletion/)  del+=$i }
    END { print (ins+0) " " (del+0) }
  ')
  LINES_ADDED=$(echo "$SHORTSTAT" | awk '{print $1}')
  LINES_DELETED=$(echo "$SHORTSTAT" | awk '{print $2}')
fi

# Jours depuis le dernier handoff intégré
if [[ -n "$LATEST_SHA" ]]; then
  HANDOFF_DATE=$(git -C "$REPO_ROOT" log -1 --format=%ct "$LATEST_SHA" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  DAYS_SINCE=$(( (NOW - HANDOFF_DATE) / 86400 ))
else
  DAYS_SINCE=999
fi

# Dépassement de seuil ?
EXCEEDS=false
REASONS=""
if [[ $LINES_ADDED -ge $THRESHOLD_LINES ]]; then
  EXCEEDS=true
  REASONS="${REASONS}lines_added($LINES_ADDED>=$THRESHOLD_LINES) "
fi
if [[ $COMMITS_SINCE -ge $THRESHOLD_COMMITS ]]; then
  # Compter uniquement les commits qui apportent du code (feat/fix/refactor)
  # Exclure : docs, chore, style, ci, test, build (infra pure)
  FEAT_COUNT=$(git -C "$REPO_ROOT" log "$RANGE" --format=%s 2>/dev/null | grep -cE "^(feat|fix|refactor)" || true)
  if [[ $FEAT_COUNT -ge 2 ]]; then
    EXCEEDS=true
    REASONS="${REASONS}commits($COMMITS_SINCE>=$THRESHOLD_COMMITS, $FEAT_COUNT feat/fix) "
  fi
fi
if [[ $DAYS_SINCE -ge $THRESHOLD_DAYS ]] && [[ $COMMITS_SINCE -gt 0 ]]; then
  EXCEEDS=true
  REASONS="${REASONS}days($DAYS_SINCE>=$THRESHOLD_DAYS) "
fi

# ─── Output ─────────────────────────────────────────────────────────────────

if [[ "$MODE" == "json" ]]; then
  REL_HANDOFF=""
  [[ -n "$LATEST_INTEGRATED" ]] && REL_HANDOFF="${LATEST_INTEGRATED#$REPO_ROOT/}"
  cat <<EOF
{
  "source": "git (jamais un JSON éditable)",
  "lastIntegratedHandoff": {
    "file": "$REL_HANDOFF",
    "sha": "$LATEST_SHA"
  },
  "reviewedRange": "$RANGE",
  "currentDebt": {
    "commitsSince": $COMMITS_SINCE,
    "linesAdded": $LINES_ADDED,
    "linesDeleted": $LINES_DELETED,
    "daysSince": $DAYS_SINCE
  },
  "thresholds": {
    "lines": $THRESHOLD_LINES,
    "commits": $THRESHOLD_COMMITS,
    "days": $THRESHOLD_DAYS
  },
  "exceedsThreshold": $EXCEEDS,
  "reasons": "$REASONS"
}
EOF
elif ! $CHECK_ONLY; then
  echo "Handoff debt (calculé depuis git) :"
  echo "  Dernier handoff intégré : ${LATEST_INTEGRATED:-AUCUN}"
  echo "  Range analysé           : $RANGE"
  echo "  Commits depuis          : $COMMITS_SINCE"
  echo "  Lignes ajoutées         : $LINES_ADDED  (seuil: $THRESHOLD_LINES)"
  echo "  Lignes supprimées       : $LINES_DELETED"
  echo "  Jours depuis handoff    : $DAYS_SINCE  (seuil: $THRESHOLD_DAYS)"
  echo "  Seuil dépassé           : $EXCEEDS"
  [[ -n "$REASONS" ]] && echo "  Raisons                 : $REASONS"
fi

# Exit code
if $EXCEEDS; then
  exit 1
else
  exit 0
fi
