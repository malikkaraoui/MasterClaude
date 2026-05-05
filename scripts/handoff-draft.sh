#!/usr/bin/env bash
# scripts/handoff-draft.sh — Génère un draft de handoff pré-rempli depuis git
#
# Usage:
#   bash scripts/handoff-draft.sh <slug>
#
# Le slug devient le nom : docs/handoffs/YYYY-MM-DD-<slug>.md
# Le script remplit automatiquement contexte + fichiers à lire depuis
# le range git <dernier-handoff-intégré>..HEAD.
#
# Les sections "Question précise" et "Intégration" restent à remplir par
# Claude (elles doivent contenir du texte réel non-template pour passer
# validate-handoff.js).

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <slug>" >&2
  echo "  Exemple: $0 lot4-enforcement-ergonomie" >&2
  exit 2
fi

SLUG="$1"
DATE=$(date +%Y-%m-%d)
FILE="$REPO_ROOT/docs/handoffs/${DATE}-${SLUG}.md"

if [[ -f "$FILE" ]]; then
  echo "ERREUR : $FILE existe déjà" >&2
  exit 1
fi

# Récupère le range depuis handoff-debt.sh puis le résout en SHAs exacts
RAW_RANGE=$(bash "$REPO_ROOT/scripts/handoff-debt.sh" --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('reviewedRange',''))" 2>/dev/null || echo "HEAD~10..HEAD")
[[ -z "$RAW_RANGE" ]] && RAW_RANGE="HEAD~10..HEAD"
RAW_FROM="${RAW_RANGE%%..*}"
RAW_TO="${RAW_RANGE##*..}"
FROM_SHA=$(git -C "$REPO_ROOT" rev-parse "$RAW_FROM" 2>/dev/null || git -C "$REPO_ROOT" rev-list --max-parents=0 HEAD 2>/dev/null | head -1)
TO_SHA=$(git -C "$REPO_ROOT" rev-parse "$RAW_TO" 2>/dev/null || git -C "$REPO_ROOT" rev-parse HEAD)
RANGE="${FROM_SHA}..${TO_SHA}"

# Liste des commits dans le range
COMMITS=$(git -C "$REPO_ROOT" log --oneline "$RANGE" 2>/dev/null | head -20 || echo "")

# Fichiers modifiés dans le range
FILES_CHANGED=$(git -C "$REPO_ROOT" diff --name-only "$RANGE" 2>/dev/null | head -20 || echo "")

# Stats
STATS=$(git -C "$REPO_ROOT" diff --shortstat "$RANGE" 2>/dev/null || echo "")

# reviewedRange doit reprendre le range exact, déjà résolu en SHAs stables.
REVIEWED_RANGE="$RANGE"

# Note: backticks dans le heredoc sont échappés (\`) pour éviter l'interprétation shell
cat > "$FILE" <<EOF
# Handoff — ${SLUG}

> Date : ${DATE}
> Type : review
> Priorité : moyenne
> reviewedRange: ${REVIEWED_RANGE}

---

## De : Claude

### Contexte

[À COMPLÉTER par Claude — 3-5 phrases sur ce qui a été fait et pourquoi]

**Range analysé** : \`${RANGE}\`
**Stats git** : ${STATS}

**Commits dans le range :**

\`\`\`text
${COMMITS}
\`\`\`

### Question précise

[À COMPLÉTER par Claude — UNE question opinionée, pas 10. Si 10 → faire 10 handoffs.]

### Fichiers à lire

\`\`\`text
${FILES_CHANGED}
\`\`\`

### Contraintes / hors scope

[À COMPLÉTER — ce que Copilot ne doit PAS faire]

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans CE MÊME FICHIER \`.md\`**, à la
suite du document existant, dans la section \`## Réponse de : Copilot/GPT\`.
**Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.**
Ce document est le **vase communicant** entre GPT et Claude : la réponse utile
doit vivre ici, pas ailleurs. Utilise ton outil d'édition de fichier
(Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à Claude."

<!-- Réponse ci-dessous -->

---

## Intégration

<!-- Rempli par Claude après réception de la réponse Copilot.
     Qu'est-ce qui a été retenu ? Qu'est-ce qui a été écarté et pourquoi ?
     Minimum 100 caractères de texte réel (validé par test/validate-handoff.js). -->
EOF

echo "Draft généré : ${FILE#$REPO_ROOT/}"
echo ""
echo "Prochaines étapes :"
echo "  1. Claude complète Contexte + Question précise + Contraintes"
echo "  2. User passe le fichier à Copilot"
echo "  3. Copilot remplit '## Réponse de :'"
echo "  4. Claude remplit '## Intégration' via /integrate-review"
echo "  5. Commit + push → dette §25 reset (validée structurellement)"
