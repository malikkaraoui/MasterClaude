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

# === Singleton — tuer les Monitor zombies sur tg-inbox.jsonl ===
# Cible précise : `tail -f -n 0 /tmp/tg-inbox.jsonl` lancé par d'anciennes sessions Claude.
# Critère strict pour ne pas frapper le tail courant (qui n'existe pas encore au SessionStart).
OLD_TAILS=$(pgrep -f "tail -f .* /tmp/tg-inbox.jsonl" 2>/dev/null | tr '\n' ' ')
if [ -n "$OLD_TAILS" ]; then
  for pid in $OLD_TAILS; do
    [ "$pid" != "$$" ] && kill -TERM "$pid" 2>/dev/null
  done
  echo "[IPC-BRIDGE] Anciens Monitor tail tués : $OLD_TAILS" >&2
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
python3 - "$INBOX_FILE" "$RESPONSE_DIR" <<'PY'
import json, os, sys, time

inbox_path, resp_dir = sys.argv[1], sys.argv[2]
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
    ctx = "BRIDGE TELEGRAM — Aucun message orphelin."

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": ctx,
    }
}))
PY
