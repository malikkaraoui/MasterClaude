#!/bin/bash
# PostToolUse — Phase C Telegram FIFO alerts
# git commit → ✅ Commit : <msg> | git push → 🚀 Push : <branch>
# No-op silencieux si FIFO absent (bridge non actif)

source "$(dirname "$0")/_parse-input.sh"

FIFO_PATH="/tmp/claude-telegram-out"

# Sortir si opération échouée ou FIFO absent
[[ "${HOOK_EXIT_CODE:-1}" != "0" ]] && exit 0
[[ ! -p "$FIFO_PATH" ]] && exit 0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MSG=""

if echo "$HOOK_COMMAND" | grep -q "git commit"; then
    COMMIT_MSG=$(cd "$REPO_ROOT" && git log -1 --pretty=format:%s 2>/dev/null || echo "commit récent")
    MSG="✅ Commit : $COMMIT_MSG"
elif echo "$HOOK_COMMAND" | grep -q "git push"; then
    BRANCH=$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
    MSG="🚀 Push effectué sur $BRANCH"
fi

[[ -z "$MSG" ]] && exit 0

# Écriture non-bloquante — O_NONBLOCK portable macOS/Linux (pas de timeout GNU requis)
FIFO_PATH="$FIFO_PATH" FIFO_MSG="$MSG" python3 -c "
import os
try:
    fd = os.open(os.environ['FIFO_PATH'], os.O_WRONLY | os.O_NONBLOCK)
    os.write(fd, (os.environ['FIFO_MSG'] + '\n').encode())
    os.close(fd)
except OSError:
    pass
" 2>/dev/null || true
exit 0
