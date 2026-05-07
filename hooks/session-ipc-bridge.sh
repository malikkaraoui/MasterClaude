#!/usr/bin/env bash
# Hook SessionStart — bridge IPC Telegram avec TTL + singleton strict
# Signal file = "<unix_ts>:<shell_pid>:<parent_pid>" → master.js parse pour SIGTERM
# - parent_pid = Claude Code lui-même (cible du restart à 60% de contexte)
# - master.js ignore signal si > 10 min (session stale)
# Singleton : tue les anciens `tail -f /tmp/tg-inbox.jsonl` (Monitor zombies)
# Injecte une obligation Monitor dans le contexte Claude via additionalContext

SIGNAL_FILE="/tmp/masterclaude-real-claude-active"
RESPONSE_DIR="/tmp/tg-responses"
INBOX_FILE="/tmp/tg-inbox.jsonl"
MONITOR_PIDS_FILE="/tmp/masterclaude-monitor-pids"

mkdir -p "$RESPONSE_DIR"
touch "$INBOX_FILE"

# Remettre à zéro le ctx% au boot — évite que master.js lise une valeur stale
echo "0" > /tmp/masterclaude-ctx-pct 2>/dev/null || true
rm -f /tmp/masterclaude-compact-pending 2>/dev/null || true

# === Singleton — tuer les Monitor zombies sur tg-inbox.jsonl ===
# Ne tuer QUE les tails orphelins (parent mort) — jamais les tails de sessions Claude vivantes.
OLD_TAILS=$(pgrep -f "tail -f .* /tmp/tg-inbox.jsonl" 2>/dev/null | tr '\n' ' ')
KILLED=""
if [ -n "$OLD_TAILS" ]; then
  for pid in $OLD_TAILS; do
    [ "$pid" = "$$" ] && continue
    TAIL_PPID=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')
    # Si le parent est encore vivant → tail d'une session Claude active → ne pas tuer
    if [ -n "$TAIL_PPID" ] && kill -0 "$TAIL_PPID" 2>/dev/null; then
      continue
    fi
    kill -TERM "$pid" 2>/dev/null && KILLED="$KILLED $pid"
  done
  [ -n "$KILLED" ] && echo "[IPC-BRIDGE] Monitor zombies tués (parent mort) :$KILLED" >&2
fi

# === Signal file : timestamp + PID shell + PID parent (Claude Code) ===
# $PPID est le process parent du shell hook = wrapper Claude Code (cible du SIGTERM restart).
echo "$(date +%s):$$:$PPID" > "$SIGNAL_FILE"

# Nettoyer les réponses et markers périmés (> 1h)
find "$RESPONSE_DIR" \( -name "*.txt" -o -name "*.done" \) -mmin +60 -delete 2>/dev/null

# Tronquer l'inbox si > 1 MB (évite accumulation infinie)
if [ -f "$INBOX_FILE" ]; then
  SIZE=$(stat -f%z "$INBOX_FILE" 2>/dev/null || stat -c%s "$INBOX_FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 1048576 ]; then
    tail -n 100 "$INBOX_FILE" > "${INBOX_FILE}.tmp" && mv "${INBOX_FILE}.tmp" "$INBOX_FILE"
    echo "[IPC-BRIDGE] Inbox tronquée (était ${SIZE} octets)" >&2
  fi
fi

# Mémoriser le PID parent pour le hook Stop (cleanup ciblé)
echo "$PPID" > "$MONITOR_PIDS_FILE"

echo "[IPC-BRIDGE] Signal créé : $SIGNAL_FILE (shell=$$, parent=$PPID, TTL=10min)" >&2

# === Replay inbox : messages orphelins (sans response file) à traiter avant le streaming ===
# Le Monitor tail -f -n 0 démarre depuis la fin du fichier — il rate donc les messages
# qui ont déclenché le réveil de cette session. On identifie ces orphelins et on les
# injecte dans additionalContext pour que Claude les traite EN PREMIER.
# Fenêtre : 10 min, max 5 messages (évite explosion de contexte sur grosse inbox).
# Construire le slug dynamiquement depuis le répertoire courant (portable inter-machines)
_PROJECT_SLUG=$(python3 -c "import os; p=os.path.realpath('$PWD'); print('-' + p.replace('/', '-'))" 2>/dev/null || echo "-Users-malik-MasterClaude")
ACTIVE_TODOS_FILE="$HOME/.claude/projects/${_PROJECT_SLUG}/memory/active-todos.md"

python3 - "$INBOX_FILE" "$RESPONSE_DIR" "$ACTIVE_TODOS_FILE" <<'PY'
import json, os, sys, time, re

inbox_path, resp_dir, todos_path = sys.argv[1], sys.argv[2], sys.argv[3]
now_ms = int(time.time() * 1000)
WINDOW_MS = 10 * 60 * 1000
MAX = 5

orphans = []
try:
    with open(inbox_path) as f:
        lines = f.readlines()
except Exception:
    lines = []

for line in reversed(lines):
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except Exception:
        continue
    mid = msg.get('id')
    ts = msg.get('ts', 0)
    if not mid:
        continue
    if now_ms - ts > WINDOW_MS:
        break
    # Skip si déjà répondu (réponse encore présente OU déjà consommée par master)
    if os.path.exists(os.path.join(resp_dir, f"{mid}.txt")):
        continue
    if os.path.exists(os.path.join(resp_dir, f"{mid}.done")):
        continue
    orphans.append({
        'id': mid,
        'user': msg.get('user', ''),
        'project': msg.get('project', 'global'),
    })
    if len(orphans) >= MAX:
        break

orphans.reverse()

if orphans:
    listing = "\n".join(
        f"  - id={o['id']} project={o['project']} user={json.dumps(o['user'])}"
        for o in orphans
    )
    ctx = (
        "BRIDGE TELEGRAM — Messages orphelins détectés.\n\n"
        f"{len(orphans)} message(s) Telegram en attente (sans réponse) :\n"
        f"{listing}\n\n"
        "Pour CHAQUE message, écris ta réponse dans /tmp/tg-responses/<id>.txt"
    )
else:
    ctx = (
        "BRIDGE TELEGRAM — Aucun message orphelin.\n\n"
        "ACTION OBLIGATOIRE : lance le Monitor sur l'inbox Telegram avant tout traitement :\n"
        f"  command: tail -f -n 0 /tmp/tg-inbox.jsonl\n"
        "  description: Telegram inbox bridge\n"
        "  persistent: true\n"
        "  timeout_ms: 3600000\n\n"
        "Ce Monitor est le seul canal de réception des messages Telegram via IPC. "
        "Sans lui, master.js écrit dans l'inbox mais rien n'est lu."
    )

# === Active todos ===
MAX_TODOS = 10
TODOS_CHAR_BUDGET = 500
pending_todos = []
try:
    with open(todos_path) as f:
        for line in f:
            m = re.match(r'^\s*-\s*\[\s*\]\s*(.+)', line)
            if m:
                pending_todos.append(m.group(1).strip())
except Exception:
    pass

if pending_todos:
    truncated = len(pending_todos) > MAX_TODOS
    visible = pending_todos[:MAX_TODOS]
    todos_block = "\n".join(f"  - [ ] {t}" for t in visible)
    if len(todos_block) > TODOS_CHAR_BUDGET:
        todos_block = todos_block[:TODOS_CHAR_BUDGET] + "\n  …"
        truncated = True
    suffix = f"\n  … ({len(pending_todos) - MAX_TODOS} de plus)" if truncated and len(pending_todos) > MAX_TODOS else ""
    ctx += (
        "\n\n⚠️ ACTIVE TODOS (promesses non honorées) :\n"
        f"{todos_block}{suffix}\n"
        "→ Si terminé : cocher dans active-todos.md ET confirmer sur Telegram."
    )

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": ctx,
    }
}))
PY
