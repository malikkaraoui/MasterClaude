#!/bin/bash
# Hook UserPromptSubmit — Model Routing + Détection stack + Diagnostic périodique
#
# HYPOTHÈSE V1 — mono-session : tous les fichiers /tmp/claude-atelier-* sont des
# singletons globaux non scoppés par session_id. Avec plusieurs sessions ouvertes,
# last-writer-wins s'applique (modèle, session_id, switch-mode). À adresser avant
# V2 socket via cache nommé par session_id ou passage explicite de l'id à l'actionneur.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ===== FEATURES CONFIG =====
_FEATS_FILE="$REPO_ROOT/.claude/features.json"
_feat() {
  python3 -c "
import json, sys, os
d = json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}
sys.exit(0 if d.get(sys.argv[2], True) else 1)
" "$_FEATS_FILE" "$1" 2>/dev/null && echo 1 || echo ""
}
_F_HEADER=$(_feat header)
_F_OLLAMA=$(_feat ollama_status)
_F_ROUTING=$(_feat model_routing_hints)
_F_REVIEW=$(_feat review_copilot)
_F_STACK=$(_feat stack_detection)
_F_DIAG=$(_feat diagnostic)
_F_SESSION=$(_feat session_length_warning)

BASE_TMP="${CLAUDE_ATELIER_TMPDIR:-/tmp}"
THROTTLE_FILE="$BASE_TMP/claude-atelier-diagnostic-last"
THROTTLE_SECONDS=1800  # 30 minutes
CACHE_DIR="$BASE_TMP/claude-atelier-model-cache"
LEGACY_MODEL_FILE="$BASE_TMP/claude-atelier-current-model"

mkdir -p "$CACHE_DIR"

# Lire le message utilisateur (JSON stdin) avec python3 pour un parsing fiable
_RAW_INPUT=$(cat)

SESSION_ID=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id', ''))
except: pass
" 2>/dev/null)

# Persister session_id courant (P1 — pré-requis V2 socket actionneur)
if [ -n "$SESSION_ID" ]; then
  printf '%s\n' "$SESSION_ID" > "$BASE_TMP/claude-atelier-current-session-id"
fi

PROMPT=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('prompt', ''))
except: pass
" 2>/dev/null)

LIVE_MODEL=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('model', ''))
except: pass
" 2>/dev/null)

# ===== ROUTING (chaque message) =====
MODEL_SOURCE="inconnu"
MODEL_CACHE_KIND=""

normalize_model() {
  printf '%s' "$1" | sed 's/\[.*$//' | tr -d '\r\n'
}

wants_full_anthropic_help() {
  printf '%s' "$PROMPT" | grep -qiE "(full[[:space:]]+anthropic|anthropic[[:space:]]+direct|direct[[:space:]]+anthropic|mode[[:space:]]+anthropic|repasser([^[:alnum:]]|.*)anthropic|passer([^[:alnum:]]|.*)anthropic|retour([^[:alnum:]]|.*)anthropic|désactiver[[:space:]]+le[[:space:]]+proxy|desactiver[[:space:]]+le[[:space:]]+proxy|arrêter[[:space:]]+le[[:space:]]+proxy|arreter[[:space:]]+le[[:space:]]+proxy|stop[[:space:]]+proxy|sans[[:space:]]+proxy)"
}

is_ollama_proxy_healthy() {
  local health=""
  health=$(curl -s --max-time 1 http://localhost:4000/health 2>/dev/null || true)
  [ -n "$health" ] || return 1

  printf '%s' "$health" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if d.get('status') == 'ok' and d.get('proxy') == 'ollama' else 1)
" >/dev/null 2>&1
}

cache_scope_key() {
  if [ -n "$1" ]; then
    printf '%s' "$1"
    return
  fi

  if [ -n "$2" ]; then
    printf '%s' "$2" | cksum | awk '{print $1}'
    return
  fi

  printf 'global'
}

write_model_cache() {
  local model="$1"
  printf '%s\n' "$model" > "$MODEL_FILE"
  printf '%s\n' "$model" > "$LEGACY_MODEL_FILE"
}

read_model_cache() {
  local cached=""

  if [ -f "$MODEL_FILE" ]; then
    cached=$(cat "$MODEL_FILE" 2>/dev/null || echo "")
    if [ -n "$cached" ]; then
      MODEL_CACHE_KIND="session"
      printf '%s' "$cached"
      return
    fi
  fi

  if [ "$CACHE_SCOPE" = "global" ] && [ -f "$LEGACY_MODEL_FILE" ]; then
    cached=$(cat "$LEGACY_MODEL_FILE" 2>/dev/null || echo "")
    if [ -n "$cached" ]; then
      MODEL_CACHE_KIND="legacy"
      printf '%s' "$cached"
      return
    fi
  fi
}

TRANSCRIPT=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('transcript_path', ''))
except: pass
" 2>/dev/null)

CACHE_SCOPE=$(cache_scope_key "$SESSION_ID" "$TRANSCRIPT")
MODEL_FILE="$CACHE_DIR/${CACHE_SCOPE}.model"
MODEL=""

# Priorité : live > transcript > cache scoppé session > cache legacy global.
# Le grep "Set model to" est abandonné — trop de faux positifs (code cité dans le transcript).
# On lit plusieurs schémas connus du transcript JSONL sans supposer un seul format.

if [ -n "$LIVE_MODEL" ]; then
  MODEL=$(normalize_model "$LIVE_MODEL")
  MODEL_SOURCE="live"
  write_model_cache "$MODEL"
fi

# Extraire le modèle réel de la dernière réponse assistant dans le transcript
if [ -z "$MODEL" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  TRANSCRIPT_MODEL=$(python3 -c "
import json, sys

def candidates(node):
    if not isinstance(node, dict):
        return []
    data = node.get('data', {}) if isinstance(node.get('data', {}), dict) else {}
    message = node.get('message', {}) if isinstance(node.get('message', {}), dict) else {}
    data_message = data.get('message', {}) if isinstance(data.get('message', {}), dict) else {}
    return [
        node.get('model', ''),
        message.get('model', ''),
        data.get('model', ''),
        data_message.get('model', ''),
    ]

def assistant_like(node):
    if not isinstance(node, dict):
        return False
    node_type = node.get('type', '')
    if node_type in ('assistant', 'assistant.message'):
        return True
    data = node.get('data', {}) if isinstance(node.get('data', {}), dict) else {}
    message = node.get('message', {}) if isinstance(node.get('message', {}), dict) else {}
    data_message = data.get('message', {}) if isinstance(data.get('message', {}), dict) else {}
    roles = [node.get('role', ''), data.get('role', ''), message.get('role', ''), data_message.get('role', '')]
    return any(role == 'assistant' for role in roles)

last = ''
with open('$TRANSCRIPT') as f:
    for line in f:
        try:
            d = json.loads(line)
            if assistant_like(d):
                for m in candidates(d):
                    if isinstance(m, str) and m:
                        last = m
                        break
        except: pass
print(last)
" 2>/dev/null)
  if [ -n "$TRANSCRIPT_MODEL" ]; then
    MODEL=$(normalize_model "$TRANSCRIPT_MODEL")
    MODEL_SOURCE="transcript"
    write_model_cache "$MODEL"
  fi
fi

# Fallback cache (session-start)
if [ -z "$MODEL" ]; then
  CACHED=$(read_model_cache)
  if [ -n "$CACHED" ]; then
    MODEL=$(normalize_model "$CACHED")
    MODEL_SOURCE="cache"
  fi
fi

if [ -z "$MODEL" ]; then
  MODEL="inconnu"
fi

# ===== MODE SWITCH A/M (Auto ou Manuel) =====
# A = proxy réellement actif (health check), M = Anthropic direct (proxy off ou absent)
# ANTHROPIC_BASE_URL est une config, pas un état — un proxy éteint = mode M de fait.
SWITCH_MODE_FILE="$BASE_TMP/claude-atelier-switch-mode"

if is_ollama_proxy_healthy; then
  SWITCH_MODE="A"
  echo "A" > "$SWITCH_MODE_FILE"
else
  SWITCH_MODE="M"
  echo "M" > "$SWITCH_MODE_FILE"
fi

# ===== OLLAMA STATUS (chaque message) =====
OLLAMA_STATUS=""
PROXY_CONFIG="$REPO_ROOT/scripts/ollama-proxy/config.json"
ACTIVE_LLM=""
if [ -n "$_F_OLLAMA" ] && command -v ollama &>/dev/null; then
  OLLAMA_HEALTH=$(curl -s --max-time 1 http://localhost:11434/api/tags 2>/dev/null || echo "")
  if [ -n "$OLLAMA_HEALTH" ]; then
    PROXY_RUNNING=$(is_ollama_proxy_healthy && echo "ok" || echo "")
    if [ -n "$PROXY_RUNNING" ]; then
      if [ -f "$PROXY_CONFIG" ]; then
        ACTIVE_LLM=$(python3 -c "
import json
try:
    d = json.load(open('$PROXY_CONFIG'))
    print(d.get('model', d.get('defaultModel', '')))
except: print('')
" 2>/dev/null)
      fi
      OLLAMA_STATUS="🦙✅ proxy:4000 → $ACTIVE_LLM (v0.3.0 streaming+tool_use)"
    else
      OLLAMA_MODELS=$(echo "$OLLAMA_HEALTH" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    models = [m['name'].split(':')[0] for m in d.get('models', []) if 'embed' not in m['name']]
    print(','.join(dict.fromkeys(models).keys())[:60])
except: print('')
" 2>/dev/null)
      HAS_EMBED=$(echo "$OLLAMA_HEALTH" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    has = any('nomic-embed' in m['name'] for m in d.get('models', []))
    print('yes' if has else 'no')
except: print('no')
" 2>/dev/null)
      EMBED_TAG=""
      [ "$HAS_EMBED" = "yes" ] && EMBED_TAG=" +embed"
      if [ -n "$OLLAMA_MODELS" ]; then
        OLLAMA_STATUS="🦙⚡ ollama ready ($OLLAMA_MODELS)$EMBED_TAG — proxy off → /ollama-router"
      else
        OLLAMA_STATUS="🦙⚠️ ollama (aucun modele LLM) → /ollama-router"
      fi
    fi
  else
    OLLAMA_STATUS="🦙❌ ollama eteint → ollama serve"
  fi
else
  OLLAMA_STATUS="🦙❌ non installe → /ollama-router"
fi

# Indicateur Ollama condensé → §1 (lu par model-metrics.sh pour la pastille réelle)
if [ -n "$_F_OLLAMA" ]; then
  if echo "$OLLAMA_STATUS" | grep -q "✅"; then
    _OLLAMA_IND="🦙✅${ACTIVE_LLM:+ $ACTIVE_LLM}"
  elif echo "$OLLAMA_STATUS" | grep -q "⚡"; then
    _OLLAMA_IND="🦙⚡"
  elif echo "$OLLAMA_STATUS" | grep -q "⚠️"; then
    _OLLAMA_IND="🦙⚠️"
  else
    _OLLAMA_IND="🦙❌"
  fi
  printf '%s\n' "$_OLLAMA_IND" > /tmp/claude-atelier-ollama-indicator 2>/dev/null
else
  printf '' > /tmp/claude-atelier-ollama-indicator 2>/dev/null
fi

# ===== HORODATAGE + MODÈLE + OLLAMA (toujours en tête — machine time) =====
echo "[HORODATAGE] $(date '+%Y-%m-%d %H:%M:%S') | $MODEL"
[ -n "$_F_OLLAMA" ] && echo "[OLLAMA] $OLLAMA_STATUS"
echo "[SWITCH-MODE] $SWITCH_MODE"

# Suggestion proxy si mode M + CLI (pas VS Code)
if [ "$SWITCH_MODE" = "M" ] && [ -z "${VSCODE_PID:-}" ] && [ "${TERM_PROGRAM:-}" != "vscode" ]; then
  echo "  💡 CLI sans proxy → ANTHROPIC_BASE_URL=http://localhost:4000 claude (mode A : triage Ollama actif)"
fi

if wants_full_anthropic_help; then
  echo ""
  echo "  💡 Full Anthropic → unset ANTHROPIC_BASE_URL && rm -f .env.local && claude"
  echo "     1. Quitter la session Claude en cours"
  echo "     2. Lancer la commande depuis la racine du repo"
  echo "     3. Vérifier ensuite : [SWITCH-MODE] M"
fi

# ===== HANDOFF DEBT BANNER §25 (calculé depuis git, jamais JSON) =====
DEBT_SCRIPT="$REPO_ROOT/scripts/handoff-debt.sh"
if [ -n "$_F_REVIEW" ] && [ -f "$DEBT_SCRIPT" ] && [ -d "$REPO_ROOT/.git" ]; then
  DEBT_JSON=$(bash "$DEBT_SCRIPT" --json 2>/dev/null || echo "")
  if [ -n "$DEBT_JSON" ]; then
    EXCEEDS=$(echo "$DEBT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('exceedsThreshold', False))" 2>/dev/null)
    if [ "$EXCEEDS" = "True" ]; then
      LINES=$(echo "$DEBT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['currentDebt']['linesAdded'])" 2>/dev/null)
      COMMITS=$(echo "$DEBT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['currentDebt']['commitsSince'])" 2>/dev/null)
      DAYS=$(echo "$DEBT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['currentDebt']['daysSince'])" 2>/dev/null)
      echo ""
      echo "🔴 [HANDOFF DEBT §25] ${COMMITS} commits · +${LINES} lignes · ${DAYS}j — handoff Copilot DÛ"
      echo "   → /review-copilot pour générer · push bloqué tant que dette > seuil"
    fi
  fi
fi

# ===== LONGUEUR DE SESSION =====
if [ -n "$_F_SESSION" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  SESSION_SIZE=$(stat -f %z "$TRANSCRIPT" 2>/dev/null || stat -c %s "$TRANSCRIPT" 2>/dev/null || echo 0)
  if [ "$SESSION_SIZE" -ge 600000 ]; then
    echo ""
    echo "🔴 [SESSION] Contexte très long ($(( SESSION_SIZE / 1024 ))KB) — chaque message brûle beaucoup de tokens."
    echo "   → /compact pour compresser l'historique (économise 60-80% du contexte)"
    echo ""
  elif [ "$SESSION_SIZE" -ge 300000 ]; then
    echo "⚠️  [SESSION] Contexte long ($(( SESSION_SIZE / 1024 ))KB) → /compact recommandé bientôt"
  fi
fi

TIER=""
case "$MODEL" in
  *opus*) TIER="Opus (archi)" ;;
  *sonnet*) TIER="Sonnet (dev)" ;;
  *haiku*) TIER="Haiku (exploration)" ;;
  *) TIER="inconnu" ;;
esac

# Si modèle inconnu → alerte forte, pas silencieux
if [ "$MODEL" = "inconnu" ] || [ "$TIER" = "inconnu" ]; then
  echo ""
  echo "🚨 [ROUTING] MODÈLE INCONNU — quelque chose est cassé."
  echo "   Le modèle n'a pas été capturé au démarrage de la session."
  echo "   Causes possibles :"
  echo "   1. Le hook SessionStart (session-model.sh) n'est pas configuré dans settings.json"
  echo "   2. VS Code n'a pas été redémarré après ajout du hook"
  echo "   3. Le cache scoppé de session (ou le fallback /tmp/claude-atelier-current-model) n'existe pas ou est vide"
  echo ""
  echo "   Action : fermer et rouvrir VS Code. Si le problème persiste, vérifier .claude/settings.json"
  echo ""
else
  echo "[ROUTING] modèle actif: $MODEL ($TIER)"
  echo "[ROUTING] source modèle: $MODEL_SOURCE"
  echo "  Opus→archi/décision | Sonnet→dev quotidien | Haiku→exploration/lint"

  if [ "$MODEL_SOURCE" = "cache" ]; then
    if [ "$MODEL_CACHE_KIND" = "session" ]; then
      echo "  ⚠️  modèle issu du cache de session — si tu as fait /model, attends le prochain message live pour confirmation"
    else
      echo "  ⚠️  modèle issu du cache legacy global — fallback de compatibilité, à éviter en multi-session"
    fi
  fi

  if [ -n "$_F_ROUTING" ]; then
    # Alerte si Opus sur tâche courante (message court = tâche simple)
    PROMPT_LEN=${#PROMPT}
    if echo "$MODEL" | grep -qi "opus"; then
      if [ "$PROMPT_LEN" -gt 0 ] && [ "$PROMPT_LEN" -lt 100 ]; then
        echo "  ⚠️  Tu es sur Opus pour un message court. Sonnet suffirait → /model sonnet"
      fi
    fi

    # Suggestion Haiku pour tâches légères / exploration
    if ! echo "$MODEL" | grep -qi "haiku"; then
      if [ "$PROMPT_LEN" -gt 0 ] && [ "$PROMPT_LEN" -lt 200 ]; then
        if echo "$PROMPT" | grep -qiE "(explore|cherche|liste|lister|trouve|find|résumé|résume|grep|lint|audit|scan|parcours|inventaire|recherche|quels? fichiers|quels? sont)"; then
          if ! echo "$PROMPT" | grep -qiE "(erreur|bug|debug|crash|fail|broken|pourquoi|why|cause|fix|résoudre|bloquant|deadlock|stacktrace|flaky|architecture)"; then
            echo "  💡 Exploration détectée → /model haiku (10x moins cher)"
          fi
        fi
      fi
    fi
  fi
fi

# ===== REVIEW CHECK §25 (béton armé — cross-session) =====
if [ -z "$_F_REVIEW" ]; then true; else
# Fire au premier message de chaque session. Indépendant des commits in-session.
# Fix 2 : checkpoint dans .git/ (persiste après reboot, par repo)
LAST_REVIEW_FILE="$REPO_ROOT/.git/claude-atelier-last-reviewed-commit"
# Fix 4 : hash enrichi avec REPO_ROOT pour éviter collisions multi-projets
SESSION_HASH=$(echo "${TRANSCRIPT:-no-transcript}|${REPO_ROOT}" | cksum | cut -d' ' -f1 2>/dev/null || echo "default")
SESSION_REVIEW_FLAG="/tmp/claude-atelier-review-checked-${SESSION_HASH}"

if [ ! -f "$SESSION_REVIEW_FLAG" ] && [ -d "$REPO_ROOT/.git" ]; then
  touch "$SESSION_REVIEW_FLAG"

  CURRENT_HEAD=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "")
  STORED_HEAD=$(cat "$LAST_REVIEW_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_HEAD" ] && [ "$CURRENT_HEAD" != "$STORED_HEAD" ]; then
    if [ -n "$STORED_HEAD" ] && git -C "$REPO_ROOT" cat-file -e "${STORED_HEAD}^{commit}" 2>/dev/null; then
      REVIEW_RANGE="${STORED_HEAD}..HEAD"
    else
      REVIEW_RANGE="HEAD~30..HEAD"
    fi

    FEAT_COUNT=$(git -C "$REPO_ROOT" log $REVIEW_RANGE --oneline 2>/dev/null | grep -cE " (feat|refactor):" || echo 0)
    REVIEW_STAT=$(git -C "$REPO_ROOT" diff "$REVIEW_RANGE" --shortstat 2>/dev/null || echo "")
    REVIEW_LINES_A=$(echo "$REVIEW_STAT" | grep -oE "[0-9]+ insertion" | grep -oE "^[0-9]+" || echo 0)
    REVIEW_LINES_D=$(echo "$REVIEW_STAT" | grep -oE "[0-9]+ deletion" | grep -oE "^[0-9]+" || echo 0)
    REVIEW_TOTAL=$(( ${REVIEW_LINES_A:-0} + ${REVIEW_LINES_D:-0} ))

    if [ "${FEAT_COUNT:-0}" -gt 0 ] || [ "${REVIEW_TOTAL:-0}" -ge 100 ]; then
      echo ""
      echo "📋 [MOHAMED] Commits non reviewés depuis la dernière session :"
      git -C "$REPO_ROOT" log $REVIEW_RANGE --oneline 2>/dev/null | head -5 | sed 's/^/   /'
      echo "   → ${REVIEW_TOTAL} lignes · ${FEAT_COUNT} feat/refactor"
      echo "   → Mohamed instruit le dossier : /review-copilot"
      echo ""
      # §25 anti-triche : AUCUN reset. Dette = git, reset = /integrate-review seul.
    fi
  fi
fi
fi  # end _F_REVIEW gate

# ===== DÉTECTION STACK (chaque message) =====
if [ -z "$_F_STACK" ]; then true; else
# iOS / Xcode → Steve
if echo "$PROMPT" | grep -qiE "xcode|ios|tvos|ipados|swiftui|swift|simctl|xcodebuild|iphone|ipad|app store|testflight|make run|make tvrun"; then
  STACK_FILE="$REPO_ROOT/src/stacks/ios-xcode.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[STEVE] 🍎 Chantier Apple détecté. Steve prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# NPM Publish → Isaac
if echo "$PROMPT" | grep -qiE "npm publish|npm version|npmjs|npm token|npm tag|registry|package\.json version|npm pack"; then
  STACK_FILE="$REPO_ROOT/src/stacks/npm-publish.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[ISAAC] 📦 Livraison npm détectée. Isaac prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# C / C++ → Clara / Célia
if echo "$PROMPT" | grep -qiE "gcc|g\+\+|clang\+\+|cmake|CMakeLists|makefile.*\.c|\.h file|valgrind|sanitizer|\.cpp|\.cxx|gdb"; then
  if echo "$PROMPT" | grep -qiE "\.cpp|\.cxx|\.cc|\.hpp|c\+\+|clang\+\+|g\+\+|cmake.*cpp"; then
    STACK_FILE="$REPO_ROOT/src/stacks/cpp.md"
    if [ -f "$STACK_FILE" ]; then
      echo "[CÉLIA] ⚙️ Chantier C++ détecté. Célia prend le relais — satellite chargé."
      cat "$STACK_FILE"
    fi
  else
    STACK_FILE="$REPO_ROOT/src/stacks/c.md"
    if [ -f "$STACK_FILE" ]; then
      echo "[CLARA] 🔧 Chantier C détecté. Clara prend le relais — satellite chargé."
      cat "$STACK_FILE"
    fi
  fi
fi

# Rust → Roxane
if echo "$PROMPT" | grep -qiE "cargo|rustc|\.rs file|crate|clippy|rustfmt|tokio|Cargo\.toml|axum|actix-web|serde_json|tauri|leptos|diesel|sqlx.*rust"; then
  STACK_FILE="$REPO_ROOT/src/stacks/rust.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[ROXANE] 🦀 Chantier Rust détecté. Roxane prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# Go → Gaëlle
if echo "$PROMPT" | grep -qiE "go\.mod|go\.sum|goroutine|golang|go build|go test|go run|\.go file|gin-gonic|go-fiber|fiber\.New|ent\.NewClient|cosmtrek/air|go-chi|echo framework go"; then
  STACK_FILE="$REPO_ROOT/src/stacks/go.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[GAËLLE] 🦫 Chantier Go détecté. Gaëlle prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# PHP → Phoebe
if echo "$PROMPT" | grep -qiE "\.php|composer\.json|artisan|laravel|symfony|phpunit|phpstan|psalm"; then
  STACK_FILE="$REPO_ROOT/src/stacks/php.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[PHOEBE] 🐘 Chantier PHP détecté. Phoebe prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# C# → Carmen
if echo "$PROMPT" | grep -qiE "\.cs\b|Program\.cs|\.csproj|\.sln|dotnet|nuget|blazor|aspnet|csharp|c#"; then
  STACK_FILE="$REPO_ROOT/src/stacks/csharp.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[CARMEN] 🎵 Chantier C# détecté. Carmen prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# Ada → Ada
if echo "$PROMPT" | grep -qiE "\.adb|\.ads|gnat|spark|alire|ada 2022|ravenscar"; then
  STACK_FILE="$REPO_ROOT/src/stacks/ada.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[ADA] 👑 Chantier Ada détecté. Ada prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi

# SQL → Selma
if echo "$PROMPT" | grep -qiE "postgresql|postgres|mysql|sqlite|flyway|liquibase|\.sql file|migration sql|pgstat|pg_stat"; then
  STACK_FILE="$REPO_ROOT/src/stacks/sql.md"
  if [ -f "$STACK_FILE" ]; then
    echo "[SELMA] 🗄️ Chantier SQL détecté. Selma prend le relais — satellite chargé."
    cat "$STACK_FILE"
  fi
fi
fi  # end _F_STACK gate

# ===== DIAGNOSTIC (throttled toutes les 30 min) =====
RUN_DIAGNOSTIC=false
if [ -n "$_F_DIAG" ] && [ ! -f "$THROTTLE_FILE" ]; then
  RUN_DIAGNOSTIC=true
elif [ -n "$_F_DIAG" ]; then
  LAST_RUN=$(cat "$THROTTLE_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  ELAPSED=$(( NOW - LAST_RUN ))
  if [ "$ELAPSED" -ge "$THROTTLE_SECONDS" ]; then
    RUN_DIAGNOSTIC=true
  fi
fi

if [ "$RUN_DIAGNOSTIC" = true ]; then
  date +%s > "$THROTTLE_FILE"
  ISSUES=""

  # 1. QMD
  MD_COUNT=$(find "$REPO_ROOT" -name "*.md" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$MD_COUNT" -ge 5 ]; then
    if ! command -v qmd &>/dev/null; then
      ISSUES="${ISSUES}\n⚠️  QMD non installé ($MD_COUNT .md) → /qmd-init"
    else
      QMD_STATUS=$(qmd status 2>/dev/null | grep -c "outdated\|Outdated" || true)
      if [ "$QMD_STATUS" -gt 0 ]; then
        ISSUES="${ISSUES}\n⚠️  QMD index obsolète → qmd embed"
      fi
    fi
  fi

  # 2. §0 CLAUDE.md
  CLAUDE_MD="$REPO_ROOT/.claude/CLAUDE.md"
  if [ -f "$CLAUDE_MD" ]; then
    EMPTY_S0=$(grep -c "| — |" "$CLAUDE_MD" 2>/dev/null || echo 0)
    if [ "$EMPTY_S0" -ge 3 ]; then
      ISSUES="${ISSUES}\n⚠️  §0 incomplet ($EMPTY_S0 champs vides)"
    fi
  fi

  # 3. Handoff récent
  HANDOFF_DIR="$REPO_ROOT/docs/handoffs"
  if [ -d "$HANDOFF_DIR" ]; then
    LATEST_HANDOFF=$(find "$HANDOFF_DIR" -name "202*.md" -not -name "_template*" 2>/dev/null | sort -r | head -1)
    if [ -n "$LATEST_HANDOFF" ]; then
      FILE_MTIME=$(stat -f %m "$LATEST_HANDOFF" 2>/dev/null || stat -c %Y "$LATEST_HANDOFF" 2>/dev/null || date +%s)
      DAYS_SINCE=$(( ($(date +%s) - FILE_MTIME) / 86400 ))
      if [ "$DAYS_SINCE" -ge 7 ]; then
        ISSUES="${ISSUES}\n⚠️  Dernier handoff il y a $DAYS_SINCE jours → /review-copilot"
      fi
    fi
  fi

  # 4. Pre-push gate
  if [ ! -f "$REPO_ROOT/scripts/pre-push-gate.sh" ]; then
    ISSUES="${ISSUES}\n⚠️  pre-push-gate.sh manquant"
  fi

  # 5. Mise à jour claude-atelier disponible
  PKG_JSON="$REPO_ROOT/node_modules/claude-atelier/package.json"
  if [ -f "$PKG_JSON" ]; then
    LOCAL_VERSION=$(node -p "require('$PKG_JSON').version" 2>/dev/null || echo "")
    if [ -n "$LOCAL_VERSION" ]; then
      LATEST_VERSION=$(npm view claude-atelier version 2>/dev/null || echo "")
      if [ -n "$LATEST_VERSION" ] && [ "$LOCAL_VERSION" != "$LATEST_VERSION" ]; then
        ISSUES="${ISSUES}\n🆕 claude-atelier $LOCAL_VERSION → $LATEST_VERSION disponible → npx claude-atelier update"
      fi
    fi
  fi

  if [ -n "$ISSUES" ]; then
    echo -e "[DIAGNOSTIC]$ISSUES"
  fi
fi

# ===== §1 ENTÊTE OBLIGATOIRE — béton armé =====
if [ -z "$_F_HEADER" ]; then exit 0; fi
# Injecté en dernier pour être le plus proche de la réponse.
_HDR_TS="$(date '+%Y-%m-%d %H:%M:%S')"
_HDR_MODEL="$MODEL"
_HDR_MODE="$SWITCH_MODE"
_HDR_OLLAMA=$(cat /tmp/claude-atelier-ollama-indicator 2>/dev/null | tr -d '\r\n')
_HDR_OLLAMA_PART="${_HDR_OLLAMA:+ | $_HDR_OLLAMA}"
_HDR_PROXY=$(is_ollama_proxy_healthy && echo "🔌✅" || echo "🔌❌")
echo ""
echo "⚡⚡⚡ §1 ENTÊTE OBLIGATOIRE ⚡⚡⚡"
echo "Ta réponse DOIT commencer par (1ère ligne, exactement) :"
echo "\`[$_HDR_TS | $_HDR_MODEL] PASTILLE $_HDR_MODE${_HDR_OLLAMA_PART} | $_HDR_PROXY\`"
echo "PASTILLE = pastille issue de [METRICS] (⬆️ / ⬇️ / 🟢) — 🟢 si [METRICS] absent"
