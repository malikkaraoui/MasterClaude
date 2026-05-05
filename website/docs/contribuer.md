---
id: contribuer
title: Contribuer
---

## Ajouter un hook

### 1. Créer le script

```bash
touch src/fr/hooks/guard-mon-hook.sh
chmod +x src/fr/hooks/guard-mon-hook.sh
```

Structure minimale :

```bash
#!/usr/bin/env bash
# guard-mon-hook.sh — Description en une ligne
set -euo pipefail

INPUT=$(cat)

# Logique...

echo "Message pour Claude" >&2
exit 0  # 0 = ok, 1 = erreur, 2+ = bloquant
```

### 2. Tests obligatoires

Dans `test/hooks.js` :

```javascript
test('bloque X', () => { ... });
test('laisse passer Y', () => { ... });
```

```bash
npm test
```

### 3. Brancher dans settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/guard-mon-hook.sh" }
        ]
      }
    ]
  }
}
```

---

## Ajouter un satellite de stack

```bash
touch src/stacks/ma-stack.md
```

Format :

```markdown
---
kind: stack
name: ma-stack
loads_when: "§0 Stack = ma-stack"
---

## Lint
## Build
## Tests
## Conventions
## Pièges
```

---

## Ajouter un skill

```bash
mkdir -p src/skills/mon-skill
```

`src/skills/mon-skill/SKILL.md` :

```markdown
---
name: mon-skill
description: Description pour la détection automatique
---

## Quand l'utiliser
## Procédure
```

---

## Process de contribution

```bash
git clone https://github.com/malikkaraoui/claude-atelier.git
npm install
# ... développer ...
npm test
bash scripts/pre-push-gate.sh
# PR avec description claire
```

**Règles commits :** français · atomiques · pas de `Co-Authored-By` · préfixes `feat:` `fix:` `docs:` `chore:`

---

## Issues

[github.com/malikkaraoui/claude-atelier/issues](https://github.com/malikkaraoui/claude-atelier/issues)
