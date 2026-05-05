#!/usr/bin/env bash
# scripts/install-git-hooks.sh — Installe les git hooks physiques (pre-push)
#
# Pourquoi : la pre-push-gate via CLI Claude peut être contournée par composition
# shell (ex: `bash gate | tail -N` écrase le exit code). Un git hook physique
# dans .git/hooks/pre-push est invoqué directement par git, impossible à
# bypass sans --no-verify (interdit par §13 + §22).
#
# Usage:
#   bash scripts/install-git-hooks.sh
#
# Le script est idempotent — relancer ne casse rien.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$REPO_ROOT/.git/hooks"
PRE_PUSH="$HOOK_DIR/pre-push"

if [[ ! -d "$HOOK_DIR" ]]; then
  echo "Pas de .git/hooks (pas un repo git ?) — skippé"
  exit 0
fi

# Si un hook pre-push existe déjà et ne vient pas de nous, on sauvegarde
if [[ -f "$PRE_PUSH" ]] && ! grep -q "claude-atelier" "$PRE_PUSH" 2>/dev/null; then
  BACKUP="$PRE_PUSH.backup-$(date +%s)"
  mv "$PRE_PUSH" "$BACKUP"
  echo "Hook existant sauvegardé → $BACKUP"
fi

cat > "$PRE_PUSH" <<'HOOK'
#!/usr/bin/env bash
# Git hook pre-push — claude-atelier
# Appelle scripts/pre-push-gate.sh en DIRECT (sans composition shell)
# Bypass impossible sauf --no-verify (interdit par §13/§22)
#
# Passe PUSH_TO_MAIN=true si un ref est poussé vers main/master
# → permet à la gate §25 de skipper sur les branches feature

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
GATE="$REPO_ROOT/scripts/pre-push-gate.sh"

PUSH_TO_MAIN=false
while read -r _local_ref _local_sha _remote_ref _remote_sha; do
  case "$_remote_ref" in
    refs/heads/main|refs/heads/master) PUSH_TO_MAIN=true ;;
  esac
done

export PUSH_TO_MAIN

if [[ -f "$GATE" ]]; then
  exec bash "$GATE"
fi
exit 0
HOOK

chmod +x "$PRE_PUSH"
echo "Hook installé → $PRE_PUSH"
echo "Bypass : --no-verify (INTERDIT par §13+§22)"
