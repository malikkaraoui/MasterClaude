#!/bin/bash
# Hook Stop — Vérifie l'intégrité de l'entête §1 de la dernière réponse Claude.
# Émet un warning si l'entête est absent, malformé, ou si le token % est erroné (tolérance ±5%).

_RAW_INPUT=$(cat)

TRANSCRIPT=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('transcript_path', ''))
except: pass
" 2>/dev/null)

[ -z "$TRANSCRIPT" ] && exit 0
[ ! -f "$TRANSCRIPT" ] && exit 0

python3 - "$TRANSCRIPT" <<'PYEOF'
import sys, json, re

path = sys.argv[1]
lines = []
try:
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
except Exception:
    sys.exit(0)

last_text = ""
last_input_tokens = 0

for line in reversed(lines):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except Exception:
        continue

    content = None
    usage = None
    if obj.get('type') == 'assistant':
        msg = obj.get('message', {})
        content = msg.get('content', [])
        usage = msg.get('usage', {})
    elif obj.get('role') == 'assistant':
        content = obj.get('content', [])
        usage = obj.get('usage', {})

    if content:
        for block in content:
            if isinstance(block, dict) and block.get('type') == 'text':
                last_text = block.get('text', '')
                break
        if usage:
            inp = usage.get('input_tokens', 0) or 0
            if inp > 0:
                last_input_tokens = inp
        if last_text:
            break

if not last_text:
    sys.exit(0)

first_line = last_text.split('\n')[0].strip()

# Vérifier format : `[YYYY-MM-DD HH:MM:SS | MODEL] ...`
HEADER_RE = r'`?\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| ([^\]]+)\]'
m = re.search(HEADER_RE, first_line)
if not m:
    print(f"[GUARD-HEADER] ⚠️  Entête §1 ABSENT ou malformé")
    print(f"  1ère ligne reçue: {first_line[:100]!r}")
    sys.exit(0)

issues = []

# Vérifier pastille
if not re.search(r'[🟢⬆️⬇️❌]', first_line):
    issues.append("pastille manquante (🟢/⬆️/⬇️/❌)")

# Vérifier token % si on a les tokens réels
if last_input_tokens > 0:
    real_pct = round(last_input_tokens / 200000 * 100)
    pct_match = re.search(r'(\d+)%([✅🔥])', first_line)
    if pct_match:
        reported = int(pct_match.group(1))
        if abs(reported - real_pct) > 5:
            issues.append(f"token % inexact: entête={reported}%, réel={real_pct}%")
        # Vérifier cohérence icône
        reported_icon = pct_match.group(2)
        expected_icon = '🔥' if reported >= 50 else '✅'
        if reported_icon != expected_icon:
            issues.append(f"icône incohérente: {reported}% devrait être {expected_icon}")

if issues:
    print(f"[GUARD-HEADER] ⚠️  {' | '.join(issues)}")
PYEOF

# Nettoyer le signal file IPC — invalide la session pour master.js
SIGNAL_FILE="/tmp/masterclaude-real-claude-active"
if [ -f "$SIGNAL_FILE" ]; then
  rm -f "$SIGNAL_FILE"
  echo "[GUARD-HEADER] Signal file IPC supprimé — session fermée"
fi

exit 0
