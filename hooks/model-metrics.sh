#!/bin/bash
# Hook UserPromptSubmit — Model Metrics (métriques de complexité automatiques)
#
# Analyse les 5 derniers tours assistant dans le transcript JSONL.
# Émet [METRICS] fit:VERDICT | model:MODEL | MESSAGE PASTILLE
# La flèche (⬆️/⬇️/=) est lue par Claude pour construire la ligne §1.
#
# Ne bloque jamais — warning-only. Silencieux si pas de transcript.
#
# Biais connu (V1) : `Bash` est toujours classé `medium` sans analyse du contenu.
# Les sessions shell-légères (ls/cat/git status/find) remontent donc en `medium`
# au lieu de `low`. Signal = mix d'outils observés, pas coût réel du travail.
# Accepté comme heuristique — ré-ingénierie reportée en V2+ si gênant en prod.

_RAW_INPUT=$(cat)

TRANSCRIPT=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('transcript_path', ''))
except: pass
" 2>/dev/null)

LIVE_MODEL=$(echo "$_RAW_INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('model', ''))
except: pass
" 2>/dev/null)

# Pas de transcript = silencieux
[ -z "$TRANSCRIPT" ] && exit 0
[ ! -f "$TRANSCRIPT" ] && exit 0

# Résoudre le modèle : live > cache
MODEL=""
if [ -n "$LIVE_MODEL" ]; then
    MODEL=$(echo "$LIVE_MODEL" | sed 's/\[.*$//' | tr -d '\r\n')
fi
if [ -z "$MODEL" ]; then
    BASE_TMP="${CLAUDE_ATELIER_TMPDIR:-/tmp}"
    MODEL=$(cat "$BASE_TMP/claude-atelier-current-model" 2>/dev/null | tr -d '\r\n')
fi
[ -z "$MODEL" ] && exit 0

# Analyse Python — 5 derniers tours assistant → classification → verdict
METRICS=$(python3 - "$TRANSCRIPT" "$MODEL" <<'PYEOF'
import sys, json

transcript_path = sys.argv[1]
model = sys.argv[2]

LOW_TOOLS  = {'Read', 'Glob', 'Grep', 'NotebookRead', 'ListMcpResourcesTool', 'ReadMcpResourceTool'}
HIGH_TOOLS = {'Agent', 'WebSearch', 'WebFetch'}
# medium = tout le reste (Edit, Write, Bash, TodoWrite, ToolSearch, etc.)
# NOTE: Bash est toujours medium — proxy grossier sur le mix d'outils observé,
# pas une estimation de complexité réelle. Les sessions shell-intensives peuvent
# produire des faux 🟢. V1 assumée comme heuristique, pas comme contrat.

lines = []
try:
    with open(transcript_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
except Exception:
    sys.exit(0)

# Extraire les tours assistant avec tool_use
assistant_turns = []
for line in lines:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except Exception:
        continue

    content = None
    if obj.get('type') == 'assistant':
        content = obj.get('message', {}).get('content', [])
    elif obj.get('role') == 'assistant':
        content = obj.get('content', [])

    if content:
        tools = [c.get('name', '') for c in content if isinstance(c, dict) and c.get('type') == 'tool_use']
        if tools:
            assistant_turns.append(tools)

last5 = assistant_turns[-5:]

# Minimum 2 tours pour émettre
if len(last5) < 2:
    sys.exit(0)

LOW_C = 0
MED_C = 0
HIGH_C = 0

for turn_tools in last5:
    low_n  = sum(1 for t in turn_tools if t in LOW_TOOLS)
    high_n = sum(1 for t in turn_tools if t in HIGH_TOOLS)
    med_n  = len(turn_tools) - low_n - high_n
    if high_n > low_n and high_n >= med_n:
        HIGH_C += 1
    elif low_n >= med_n:
        LOW_C += 1
    else:
        MED_C += 1

total = len(last5)

# Tier modèle
model_lower = model.lower()
if 'opus' in model_lower:
    tier = 'opus'
elif 'haiku' in model_lower:
    tier = 'haiku'
else:
    tier = 'sonnet'

# Complexité dominante
if HIGH_C >= total * 0.6:
    complexity = 'high'
elif LOW_C >= total * 0.6:
    complexity = 'low'
else:
    complexity = 'medium'

# Verdict + pastille
VERDICTS = {
    # pastille : ⬆️ = monter de modèle, ⬇️ = descendre, = = optimal
    ('high',   'opus'):   ('optimal',      '🟢', ''),
    ('high',   'sonnet'): ('limite',        '⬆️', '/model opus recommandé'),
    ('high',   'haiku'):  ('insuffisant',   '⬆️', 'tâches complexes → /model opus'),
    ('medium', 'sonnet'): ('optimal',       '🟢', ''),
    ('medium', 'haiku'):  ('limite basse',  '⬆️', 'tâches standard → /model sonnet'),
    ('medium', 'opus'):   ('léger surplus', '⬇️', 'tâches standard → /model sonnet'),
    ('low',    'haiku'):  ('optimal',       '🟢', ''),
    ('low',    'sonnet'): ('léger surplus', '⬇️', 'tâches simples → /model haiku'),
    ('low',    'opus'):   ('surdimensionné','⬇️', 'tâches simples → /model sonnet'),
}

verdict, pastille, suggestion = VERDICTS.get((complexity, tier), ('inconnu', '=', ''))
detail = f"{HIGH_C}h/{MED_C}m/{LOW_C}l/{total}t"

line = f"[METRICS] fit:{complexity}({detail}) | model:{model} | {verdict}"
if suggestion:
    line += f" → {suggestion}"
line += f" {pastille}"

print(line)
PYEOF
)

if [ -n "$METRICS" ]; then
    echo "$METRICS"
fi

# §1 ENTÊTE — émis toujours si model connu (indépendant du nombre de tours dans le transcript).
# Garantit que 🦙 et 🔌 apparaissent même en session compactée / début de session.
_FF="$(cd "$(dirname "$0")/.." && pwd)/.claude/features.json"
python3 -c "import json,sys,os; d=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}; sys.exit(0 if d.get('header',True) else 1)" "$_FF" 2>/dev/null || exit 0
# Pastille : extraire depuis METRICS si disponible, 🟢 par défaut (session courte / compactée)
_PASTILLE=$(printf '%s' "$METRICS" | grep -oE '(⬆️|⬇️|🟢)' | tail -1)
[ -z "$_PASTILLE" ] && _PASTILLE="🟢"
# Mode proxy : A si proxy actif, M sinon
# Validation stricte JSON {"status":"ok"} — évite les faux positifs (Vite, autres serveurs sur :4000)
_PROXY_HEALTH=$(curl -s --max-time 1 http://localhost:4000/health 2>/dev/null)
_PROXY_OK=$(echo "$_PROXY_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('status')=='ok' and d.get('proxy')=='ollama' else '')" 2>/dev/null)
if [ -n "$_PROXY_OK" ]; then
  _MMODE="A"
else
  _MMODE="M"
fi
# Détection Ollama inline (hooks parallèles — pas de dépendance fichier routing-check.sh)
_MOLLAMA=""
_MPROXY="🔌❌"
if command -v ollama &>/dev/null; then
  if [ -n "$_PROXY_OK" ]; then
    _MPROXY="🔌✅"
    _PROXY_CFG="$(cd "$(dirname "$0")/.." && pwd)/scripts/ollama-proxy/config.json"
    _OLLAMA_LLM=$(python3 -c "
import json
try:
    d = json.load(open('$_PROXY_CFG'))
    print(d.get('model', ''))
except: print('')
" 2>/dev/null)
    _TRIAGE=$(python3 -c "
import json
try:
    d = json.load(open('$_PROXY_CFG'))
    print(str(d.get('triage', False)).lower())
except: print('false')
" 2>/dev/null)
    if [ "$_TRIAGE" = "false" ]; then
      # triage=false : Ollama intercepts tout → pastille ❌ (métriques Claude N/A)
      _MOLLAMA="🦙✅${_OLLAMA_LLM:+ $_OLLAMA_LLM}"
      _PASTILLE="❌"
    else
      # triage=true : routage dynamique, Anthropic peut répondre → conserver pastille METRICS
      _MOLLAMA="🦙⚡${_OLLAMA_LLM:+ $_OLLAMA_LLM}"
    fi
  elif curl -s --max-time 1 http://localhost:11434/api/tags &>/dev/null; then
    _MOLLAMA="🦙❌"
  else
    _MOLLAMA="🦙❌"
  fi
fi
[ -n "$MODEL" ] && {
    echo "⚡ §1 ENTÊTE FINAL (pastille réelle) :"
    _S1_OLLAMA="${_MOLLAMA:+ | $_MOLLAMA}"
    # Pastille pouls (écrite par start-maestro.sh si pulse activé)
    PULSE_STATUS_FILE="/tmp/claude-atelier-pulse-status"
    _PULSE_INDICATOR=""
    if [ -f "$PULSE_STATUS_FILE" ]; then
      _PULSE_CONTENT=$(cat "$PULSE_STATUS_FILE")
      _PULSE_INDICATOR=" | ${_PULSE_CONTENT}"
    fi
    echo "\`[$(date '+%Y-%m-%d %H:%M:%S') | $MODEL] $_PASTILLE $_MMODE${_S1_OLLAMA} | $_MPROXY${_PULSE_INDICATOR}\`"
}

exit 0
