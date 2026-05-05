# Contribuer à claude-atelier

Merci de vouloir contribuer. L'atelier est construit par des devs qui utilisent Claude Code au quotidien — chaque contribution vient d'un vrai problème vécu.

## Comment contribuer

### 1. Proposer un hook (le plus impactant)

Tu as observé un comportement problématique de Claude Code qui revient plus de 2 fois ? **Hookifie-le.**

```text
Erreur observée → Pattern bash détectable ? → Script → Test → PR
```

Utilise le template d'issue [Proposition de Hook](../../issues/new?template=new_hook.yml).

Voir `src/fr/ecosystem/hookify.md` pour le guide complet.

### 2. Ajouter un satellite (stack)

Tu utilises un stack pas encore couvert (Go, Kotlin, Flutter, Terraform...) ? Crée un satellite.

1. Copier un satellite existant dans `src/stacks/`
2. Adapter le contenu au stack
3. Ajouter le trigger dans `hooks/routing-check.sh`
4. Mettre à jour le README (FR + EN)

Bonus : donne un nom d'agent avec une citation. Steve pour Apple, Isaac pour npm — à toi de jouer.

### 3. Ajouter un skill (slash command)

Un workflow que tu répètes souvent ? Transforme-le en skill.

1. Créer `src/skills/mon-skill/SKILL.md` avec le frontmatter
2. Ajouter dans `src/skills/atelier-help/atelier-help.csv`
3. Tester avec `/mon-skill` dans Claude Code

### 4. Traduire (EN, ES, etc.)

Le français est la source de vérité. Les traductions sont dans `src/en/`, `src/es/`, etc.

Voir `src/en/README.md` pour le statut de la traduction anglaise.

### 5. Améliorer la CLI

`bin/cli.js` et `bin/init.js` — la commande `update` est encore stubbée si tu cherches un challenge.

## Workflow de contribution

```bash
# Fork + clone
git clone https://github.com/<ton-user>/claude-atelier.git
cd claude-atelier

# Installer (rien à installer, pas de dépendances)
npm run lint   # vérifier que tout passe

# Développer
# ... modifier les fichiers ...

# Vérifier
npm run lint            # refs + longueur CLAUDE.md
npm run doctor          # 27+ checks

# PR
git checkout -b feat/mon-hook
git add . && git commit -m "feat: description en français"
git push -u origin feat/mon-hook
# → Créer la PR sur GitHub
```

## Conventions

- **Commits en français** — `feat:`, `fix:`, `docs:` puis description en français
- **CLAUDE.md ≤ 150 lignes** — le linter vérifie
- **README à jour** — chaque feature visible dans les deux langues
- **Pas de dépendances** — zero-dependency, c'est un choix assumé
- **Scripts bash POSIX** — les hooks doivent tourner sur macOS et Linux

## Structure du projet

```
src/fr/          → Règles runtime (source de vérité)
src/en/          → Traduction anglaise
src/stacks/      → Satellites par stack
src/skills/      → Slash commands
src/templates/   → Fichiers template (.gitignore, settings.json)
hooks/           → Scripts d'enforcement
scripts/         → pre-push-gate.sh
bin/             → CLI (init, doctor, lint)
test/            → Lint + doctor
```

## Questions ?

Ouvre une [Discussion](../../discussions) ou une issue avec le label `question`.
