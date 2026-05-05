---
id: stacks
title: Satellites par stack
---

Les satellites sont chargés conditionnellement selon la stack définie dans `§0` de `CLAUDE.md`.

---

## Stacks disponibles

| Stack | Agent | Lint | Tests |
|---|---|---|---|
| `javascript` | — | ESLint | Jest / Vitest |
| `python` | — | ruff | pytest |
| `java` | — | Checkstyle | JUnit |
| `react-vite` | — | ESLint | Vitest |
| `firebase` | — | — | Emulators |
| `docker` | — | hadolint | — |
| `ollama` | — | — | — |
| `ios-xcode` | Steve 🍎 | SwiftLint | XCTest |
| `npm-publish` | Isaac 📦 | — | — |

---

## Activer un satellite

Dans `§0` de `CLAUDE.md` :

```markdown
| Stack | javascript |
```

Claude charge automatiquement `stacks/javascript.md` au démarrage.

---

## iOS / Xcode (Steve 🍎)

Activé par `/ios-setup` ou `§0 Stack = ios-xcode`.

**Règles Steve :**
- Ne jamais committer `*.p12`, `*.mobileprovision`, `*-credentials.json`
- Vérifier les entitlements avant chaque archive
- `xcodebuild -scheme <app> -configuration Release` pour valider

---

## npm publish (Isaac 📦)

```bash
npm version patch --no-git-tag-version
git add package.json CHANGELOG.md
git commit -m "chore: version x.y.z"
git tag vx.y.z
git push && git push --tags
# → GitHub Actions publie automatiquement sur npm
```

GitHub Actions : `.github/workflows/npm-publish.yml` — se déclenche sur les tags `v*` uniquement.

---

## Ajouter un satellite

1. Créer `src/stacks/<nom>.md`
2. Format : lint + build + tests + pièges spécifiques
3. Tester : `npx claude-atelier init --dry-run`
