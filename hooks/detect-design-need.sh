#!/bin/bash
# UserPromptSubmit hook — détecte un besoin design/UI/UX et propose Séréna
# Throttle : max 1 proposition par session (session_id si disponible, sinon fallback transcript/repo)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$(dirname "$0")/_parse-input.sh"

_FF="$REPO_ROOT/.claude/features.json"
python3 -c "import json,sys,os; d=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else {}; sys.exit(0 if d.get(sys.argv[2],True) else 1)" "$_FF" "design_detection" 2>/dev/null || exit 0

PROMPT=$(printf '%s' "$HOOK_PROMPT" | tr '[:upper:]' '[:lower:]')

if [ -n "$HOOK_SESSION_ID" ]; then
  FLAG_SCOPE="session:${HOOK_SESSION_ID}|repo:${REPO_ROOT}"
elif [ -n "$HOOK_TRANSCRIPT_PATH" ]; then
  FLAG_SCOPE="transcript:${HOOK_TRANSCRIPT_PATH}|repo:${REPO_ROOT}"
else
  FLAG_SCOPE="repo:${REPO_ROOT}"
fi

FLAG_HASH=$(printf '%s' "$FLAG_SCOPE" | cksum | awk '{print $1}')
FLAG="/tmp/claude-atelier-serena-proposed-${FLAG_HASH}"

if [ -f "$FLAG" ]; then
  exit 0
fi

DESIGN_KEYWORDS="charte graphique|design system|palette|typographie|landing page|maquette|wireframe|composant ui|component ui|ui\/ux|ux\/ui|interface utilisateur|front.?end design|shadcn|tailwind ui|hero section|dark mode|light mode|responsive design|mobile app design|web design|site vitrine|template site|bouton|navbar|sidebar|footer|card component|modal design|form design|dashboard ui|admin panel|design token"

if echo "$PROMPT" | grep -qEi "$DESIGN_KEYWORDS"; then
  touch "$FLAG"
  echo ""
  echo "🎨 [SÉRÉNA] Besoin design détecté."
  echo "   Séréna, chef designer senior, est disponible."
  echo "   Tape /design-senior pour activer son expertise."
  echo "   (UI/UX Pro Max + MCP magic 21st.dev)"
  echo ""
fi

exit 0
