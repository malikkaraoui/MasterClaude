#!/usr/bin/env bash
# scripts/pre-push-gate.sh — Pre-push gate for claude-atelier projects
#
# 5 checks: secrets → tracked sensitive files → lint → build → tests
# Exit codes: 0 = pass, 1 = blocked
#
# Usage:
#   bash scripts/pre-push-gate.sh          # run all 5 checks
#   bash scripts/pre-push-gate.sh --quick  # secrets + tracked files only (2 checks)
#
# Stack auto-detection: the script detects the stack from the project
# files and adjusts lint/build/test commands accordingly.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# ─── 0/6 Remote sync check ────────────────────────────────────────────────────
# Si le remote a des commits que le local n'a pas, les intégrer maintenant
# plutôt que de se faire rejeter après 6 checks.
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git fetch --quiet 2>/dev/null || true
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")
    BASE=$(git merge-base "$LOCAL" "$REMOTE" 2>/dev/null || echo "$LOCAL")
    if [[ "$LOCAL" == "$REMOTE" ]]; then
        : # Déjà synchronisé, rien à faire
    elif [[ "$BASE" == "$LOCAL" ]]; then
        # Remote ahead, local behind → rebase simple
        echo -e "${YELLOW}[SYNC]${NC} Remote a des commits non intégrés — rebase automatique..."
        if ! git pull --rebase --quiet; then
            git rebase --abort 2>/dev/null || true
            echo -e "${RED}[FAIL]${NC} Rebase échoué et annulé. Résous manuellement puis relance."
            exit 1
        fi
        echo -e "${GREEN}[SYNC]${NC} Rebase OK — local à jour avec remote."
    elif [[ "$BASE" == "$REMOTE" ]]; then
        : # Local ahead (fast-forward possible), rien à faire
    else
        # Divergence réelle : local ET remote ont chacun des commits
        if [[ "${FORCE_PUSH:-}" == "1" ]]; then
            echo -e "${YELLOW}[SYNC]${NC} FORCE_PUSH=1 — divergence acceptée (rebase intentionnel)."
        else
            echo -e "${RED}[FAIL]${NC} Branches divergentes (local et remote ont chacun des commits)."
            echo -e "         Fais 'git pull --rebase' manuellement, ou FORCE_PUSH=1 si rebase intentionnel."
            exit 1
        fi
    fi
fi

# ─── Auto-sync SECURITY.md ────────────────────────────────────────────────────
if [[ -f "scripts/update-security.js" ]] && [[ -f "package.json" ]]; then
    node scripts/update-security.js 2>/dev/null || true
fi

pass()  { echo -e "${GREEN}[PASS]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
step()  { echo -e "\n${YELLOW}[$1/6]${NC} $2"; }

QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

# ─── 1/5 Secrets in staged diff ──────────────────────────────────────────────

step 1 "Audit secrets dans le diff..."

SECRET_PATTERNS='(api_key|api[-_]?secret|secret[-_]?key|access[-_]?token|auth[-_]?token|password|private_key|BEGIN RSA|BEGIN OPENSSH|BEGIN EC|sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{35}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|ya29\.[a-zA-Z0-9_-]+)'

if git diff --cached --diff-filter=ACMR 2>/dev/null | grep -iEq "$SECRET_PATTERNS"; then
    echo ""
    git diff --cached --diff-filter=ACMR | grep -iE "$SECRET_PATTERNS" | head -20
    echo ""
    fail "SECRET DETECTE dans le diff staged. Push annule."
fi

# Also check unstaged changes that would be pushed
if git diff HEAD 2>/dev/null | grep -iEq "$SECRET_PATTERNS"; then
    warn "Pattern suspect detecte dans les changements non staged. Verifier avant push."
fi

pass "Aucun secret detecte"

# ─── 2/5 Tracked sensitive files ─────────────────────────────────────────────

step 2 "Fichiers sensibles trackes..."

TRACKED_SENSITIVE=$(git ls-files 2>/dev/null | grep -E '\.(env|pem|key|p12|pfx|keystore)$' || true)

if [[ -n "$TRACKED_SENSITIVE" ]]; then
    echo "$TRACKED_SENSITIVE"
    fail "Fichiers sensibles trackes par git. Les retirer avec git rm --cached."
fi

pass "Aucun fichier sensible tracke"

# Quick mode stops here
if $QUICK; then
    echo -e "\n${GREEN}GATE RAPIDE PASSEE${NC} (2/5 checks, --quick mode)"
    exit 0
fi

# ─── Stack detection ─────────────────────────────────────────────────────────

detect_stack() {
    if [[ -f "package.json" ]]; then
        echo "node"
    elif [[ -f "pyproject.toml" ]] || [[ -f "requirements.txt" ]] || [[ -f "setup.py" ]]; then
        echo "python"
    elif [[ -f "pom.xml" ]]; then
        echo "maven"
    elif [[ -f "build.gradle" ]] || [[ -f "build.gradle.kts" ]]; then
        echo "gradle"
    else
        echo "unknown"
    fi
}

STACK=$(detect_stack)

# ─── 3/5 Lint ─────────────────────────────────────────────────────────────────

step 3 "Lint ($STACK)..."

case "$STACK" in
    node)
        if npm run lint --if-present 2>&1 | tail -5; then
            pass "Lint OK"
        else
            fail "Lint echoue"
        fi
        ;;
    python)
        if command -v ruff &>/dev/null; then
            if ruff check . 2>&1 | tail -5; then
                pass "Lint OK (ruff)"
            else
                fail "Lint echoue (ruff)"
            fi
        elif command -v flake8 &>/dev/null; then
            if flake8 . 2>&1 | tail -5; then
                pass "Lint OK (flake8)"
            else
                fail "Lint echoue (flake8)"
            fi
        else
            warn "Pas de linter Python installe (ruff ou flake8). Lint skippe."
        fi
        ;;
    maven)
        if mvn checkstyle:check -q 2>&1 | tail -5; then
            pass "Lint OK"
        else
            fail "Lint echoue"
        fi
        ;;
    gradle)
        if ./gradlew checkstyleMain -q 2>&1 | tail -5; then
            pass "Lint OK"
        else
            fail "Lint echoue"
        fi
        ;;
    *)
        warn "Stack non reconnue. Lint skippe."
        ;;
esac

# ─── 4/5 Build ────────────────────────────────────────────────────────────────

step 4 "Build ($STACK)..."

case "$STACK" in
    node)
        if npm run build --if-present 2>&1 | tail -10; then
            pass "Build OK"
        else
            fail "Build echoue"
        fi
        ;;
    python)
        warn "Pas de step de build standard pour Python. Skippe."
        ;;
    maven)
        if mvn compile -q 2>&1 | tail -10; then
            pass "Build OK"
        else
            fail "Build echoue"
        fi
        ;;
    gradle)
        if ./gradlew compileJava -q 2>&1 | tail -10; then
            pass "Build OK"
        else
            fail "Build echoue"
        fi
        ;;
    *)
        warn "Stack non reconnue. Build skippe."
        ;;
esac

# ─── 5/5 Tests ─────────────────────────────────────────────────────────────────

step 5 "Tests ($STACK)..."

case "$STACK" in
    node)
        if npm test -- --passWithNoTests 2>&1 | tail -20; then
            pass "Tests OK"
        else
            fail "Tests echoues"
        fi
        ;;
    python)
        if command -v pytest &>/dev/null; then
            if pytest --tb=short -q 2>&1 | tail -20; then
                pass "Tests OK (pytest)"
            else
                fail "Tests echoues (pytest)"
            fi
        else
            warn "pytest non installe. Tests skippes."
        fi
        ;;
    maven)
        if mvn test -q 2>&1 | tail -20; then
            pass "Tests OK"
        else
            fail "Tests echoues"
        fi
        ;;
    gradle)
        if ./gradlew test -q 2>&1 | tail -20; then
            pass "Tests OK"
        else
            fail "Tests echoues"
        fi
        ;;
    *)
        warn "Stack non reconnue. Tests skippes."
        ;;
esac

# ─── 6/6 Handoff debt §25 (calculé depuis git, pas JSON) ─────────────────────

step 6 "Handoff debt §25..."

# Pré-vérification : reviewedRange non résolu (HEAD au lieu d'un SHA)
# Bloque avant la dette pour donner un message utile immédiatement.
_HANDOFF_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs/handoffs"
if [[ -d "$_HANDOFF_DIR" ]]; then
  _UNRESOLVED=$(grep -rl "reviewedRange:.*\bHEAD\b" "$_HANDOFF_DIR" 2>/dev/null | grep -v "_template" || true)
  if [[ -n "$_UNRESOLVED" ]]; then
    echo ""
    echo "  Handoffs avec reviewedRange non résolu (HEAD au lieu d'un SHA) :"
    while IFS= read -r _f; do echo "    - ${_f##*/}"; done <<< "$_UNRESOLVED"
    echo "  → Remplace HEAD par le SHA réel : git rev-parse HEAD"
    echo "  → Ou utilise : bash scripts/handoff-draft.sh <slug> (résout automatiquement)"
    fail "reviewedRange non résolu dans un handoff — corrige avant push"
  fi
fi

HANDOFF_DEBT_SCRIPT="$(cd "$(dirname "$0")" && pwd)/handoff-debt.sh"
VALIDATE_HANDOFF="$(cd "$(dirname "$0")/.." && pwd)/test/validate-handoff.js"

if [[ -f "$HANDOFF_DEBT_SCRIPT" ]]; then
    # §25 skip pour les branches feature
    # Workflow GitHub mailbox : push feature → Copilot review PR → handoff JSON → merge main
    # La gate §25 s'applique uniquement quand on pousse vers main/master
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
    if [[ "${PUSH_TO_MAIN:-false}" != "true" ]]; then
        pass "Branche feature ($CURRENT_BRANCH) — §25 skip · Copilot review attendu sur la PR avant merge dans main"
    else
        # 6a : check dette depuis git (push vers main uniquement)
        if bash "$HANDOFF_DEBT_SCRIPT" --check 2>/dev/null; then
            # 6b : validation structurelle du dernier handoff INTÉGRÉ
            if [[ -f "$VALIDATE_HANDOFF" ]]; then
                REPO_6B="$(cd "$(dirname "$0")/.." && pwd)"
                LATEST_REL=$(bash "$HANDOFF_DEBT_SCRIPT" --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['lastIntegratedHandoff']['file'])" 2>/dev/null || echo "")
                if [[ -n "$LATEST_REL" ]] && node "$VALIDATE_HANDOFF" "$REPO_6B/$LATEST_REL" >/dev/null 2>&1; then
                    pass "Dette sous seuil + handoff intégré valide structurellement"
                elif [[ -n "$LATEST_REL" ]]; then
                    echo ""
                    node "$VALIDATE_HANDOFF" "$REPO_6B/$LATEST_REL"
                    fail "Handoff intégré $LATEST_REL invalide structurellement"
                else
                    pass "Dette sous seuil (aucun handoff intégré à valider)"
                fi
            else
                pass "Dette sous seuil"
            fi
        else
            echo ""
            bash "$HANDOFF_DEBT_SCRIPT"
            echo ""
            echo "  Pour debloquer (aucun bypass possible via --no-verify, §13+§22) :"
            echo "    1. Lance /review-copilot pour generer un handoff JSON"
            echo "    2. Pousse sur une branche feature → Copilot review automatique sur la PR"
            echo "    3. Lis les commentaires Copilot (gh pr view --json reviews)"
            echo "    4. Complete response.content puis integration dans le .json"
            echo "    5. Commit le handoff — le prochain push main verra la dette = 0"
            fail "Dette §25 depassee. Handoff Copilot requis avant push vers main."
        fi
    fi
else
    warn "scripts/handoff-debt.sh absent — check §25 skippé"
fi

# ─── Done ──────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}GATE PASSEE${NC} — push autorise"
exit 0
