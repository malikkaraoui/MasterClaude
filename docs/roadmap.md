# claude-atelier — Roadmap

> **Document de reprise.** Permet à n'importe quelle session Claude
> de reprendre le travail exactement où il s'est arrêté.
>
> Mis à jour : 2026-04-12
> Source de vérité : ce fichier (pas la mémoire, pas le CHANGELOG).

---

## Principes directeurs

- **Bilingue FR/EN** — FR est la source de vérité, EN mirroré plus tard
- **Workflow personnel** — la config est opinionated, pas générique
- **Commits atomiques** — 1 par étape, messages français, **jamais signer**
  (pas de trailer `Co-Authored-By`)
- **CLAUDE.md ≤ 150 lignes** — règle absolue, vérifier à chaque édition
- **Zéro faux positif de hook accepté** — toujours filtrer les
  suggestions `vercel-plugin` / `ai-sdk` / etc. quand hors-sujet
- **Distribution** : A (NPM plain `npx claude-atelier init`) d'abord,
  B (Claude Code plugin) ensuite

---

## État d'avancement

### ✅ P1 — Foundation (terminée, poussée)

10 commits : LICENSE, .gitignore, package.json 0.1.0, README bilingue,
CHANGELOG Keep a Changelog, arborescence `src/`, déplacement des 5
fichiers historiques, `bin/cli.js` squelette.

### ✅ P2 — Refactor core (terminée, poussée)

9 commits :

- Résolu contradiction §5 ↔ §12 (plus de critique inventée forcée)
- Corrigé toutes les refs `/docs/claude/*` cassées
- Extrait §10 → 7 fichiers `src/stacks/` (javascript/python/java complets,
  react-vite/firebase/docker/ollama en stubs)
- Extrait §9 → `src/templates/project-structure.md`
- Consolidé `settings.json` dans `src/templates/`
  (fin de la drift §15 / §23)
- Extrait §12 → `src/fr/runtime/code-review.md`
- Extrait §17, §18 → `src/fr/runtime/todo-session.md` +
  `extended-thinking.md`
- Réduit `CLAUDE.md` de 285 → 149 lignes (cible ≤ 150)
- Warnings lint legacy réglés (MD041, MD012, MD040, MD047, MD060)

### ✅ P3.a — Ecosystem (terminée, poussée)

5 commits, 5 nouveaux satellites qui comblent des angles morts :

- `src/fr/ecosystem/skills.md` — skills system (local + plugin)
- `src/fr/ecosystem/plugins.md` — marketplace + discipline
- `src/fr/ecosystem/hooks.md` — hooks Claude Code + pièges
- `src/fr/ecosystem/memory-system.md` — auto-memory
- `src/fr/ecosystem/qmd-integration.md` — QMD pour Claude
  (guide user complet reste dans `docs/qmd-user-guide.md`)

### ✅ P3.b — Autonomy refactor (terminée, poussée)

4 commits :

- `permission-modes.md` — table des 5 modes + anti-patterns
- `night-mode.md` — **source canonique unique** (était dupliqué entre
  autonomy et orchestration)
- `loop-watchers.md` — **source canonique unique** (idem)
- Supprimé `autonomy/_legacy.md`
- Mis à jour CLAUDE.md §23 → `./autonomy/` (dossier)

---

## 🚧 P3.c — Orchestration refactor (à faire)

**Split de `src/fr/orchestration/_legacy.md` en satellites structurés.**

Fichiers à créer (un commit par fichier) :

1. **`src/fr/orchestration/modes.md`**
   Contenu : table Fork / Teammate / Worktree + activation Agent Teams
   (env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
   Règle : refactor > 3 fichiers → toujours `isolation: worktree`.

2. **`src/fr/orchestration/subagents.md`** ⭐ **NOUVEAU**
   Contenu : catalog des subagents disponibles dans un harness Claude
   Code moderne :
   - `Explore` (recherche large), `Plan` (architecte)
   - `feature-dev:code-explorer` / `code-architect` / `code-reviewer`
   - `code-simplifier:code-simplifier`
   - `superpowers:*`
   - Plugins bundlés (vercel-plugin:*, Notion:*, etc.)
   Pour chaque : quand l'utiliser, quand NE PAS, coût, sortie attendue.
   Angle mort : l'ancien CLAUDE-core.md ne parlait que de Fork/Teammate/
   Worktree, pas des subagents nommés.

3. **`src/fr/orchestration/parallelization.md`**
   Contenu : table « Quand utiliser quel mode » + section « Quand ne pas
   paralléliser » (dépendances, < 2 min, budget serré).

4. **`src/fr/orchestration/models-routing.md`**
   Contenu : table Modèle par rôle (Team Lead / Architecte / Implémenteurs
   / Tests = Sonnet / Opus / Sonnet / Haiku).

5. **`src/fr/orchestration/spawn-rules.md`**
   Contenu : règles spawn (prompt court, 5-6 tâches max, fichiers distincts,
   nettoyage, architecture plate).

6. **`src/fr/orchestration/mcp-lifecycle.md`**
   Contenu : règles de chargement MCP (purger, lister dans §0, fenêtre
   200k → ~70k avec trop de MCPs).

7. **Commit final P3.c** : supprimer `orchestration/_legacy.md`,
   mettre à jour CLAUDE.md §16 et §19 (ref vers `./orchestration/`).

> ⚠️ Pour le template de spawn et les règles, `night-mode.md` et
> `loop-watchers.md` sont les sources canoniques — ici on pointe vers
> elles, on ne duplique pas.

---

## 🚧 P3.d — Security refactor + livraison script (à faire)

**Split de `src/fr/security/_legacy.md` + enfin livrer
`scripts/pre-push-gate.sh`.**

Fichiers à créer :

1. **`src/fr/security/secrets-rules.md`**
   Contenu : principe absolu, liste `.gitignore` + `.claudeignore`,
   patterns suspects regex (sk-, AKIA, ghp_, AIza, etc.), audit manuel.

2. **`src/fr/security/pre-push-gate.md`**
   Contenu : documentation du gate (5 étapes : secrets → fichiers
   sensibles → lint → build → tests), adaptation par stack (table),
   règle « jamais `--no-verify` ».
   **Référence** le vrai script `scripts/pre-push-gate.sh` (à livrer
   au même commit).

3. **`src/fr/security/emergency.md`**
   Contenu : procédure d'urgence clé committée accidentellement
   (révoquer → filter-branch → force push → notifier).
   ⚠️ Marquer explicitement que `--force push` est le **seul cas
   autorisé**, en écho à §22.

4. **`scripts/pre-push-gate.sh`** ⭐ **ENFIN LIVRÉ**
   Le script shell complet, testable, avec shebang + exit codes clairs.
   Adapté par stack via détection auto (présence de `package.json`,
   `pyproject.toml`, `pom.xml`, `build.gradle`).

5. **`src/templates/.claudeignore`**
   Template d'ignore list pour Claude lui-même (secrets que Claude ne
   doit jamais lire).

6. **Commit final P3.d** : supprimer `security/_legacy.md`, mettre à
   jour CLAUDE.md §22 et §24.

---

## ✅ P3.e — Cleanup refs CLAUDE.md (terminé)

Toutes les refs `_legacy.md` supprimées. §16→`./orchestration/`,
§19→`./orchestration/mcp-lifecycle.md`, §22→`./security/`,
§24→`./security/pre-push-gate.md`. 0 ref cassée (vérifié par lint).

---

## ✅ P3.f — CHANGELOG P3 (terminé)

Section `[Unreleased]` mise à jour avec tous les ajouts P3.

---

## 🚧 P3.g — Étoffer les stubs de stacks (optionnel, bas prio)

4 stubs à enrichir avec du contenu vrai :

- `src/stacks/react-vite.md`, `firebase.md`, `docker.md`, `ollama.md`

À faire quand l'utilisateur démarre un projet réel utilisant chaque
stack — le contenu sera meilleur en étant dicté par le vrai besoin.

---

## ✅ P4 — CLI & tests & CI (terminé 2026-04-12)

### ✅ P4.1 — CI GitHub Actions

`.github/workflows/ci.yml` — `npm run lint` + `shellcheck` sur push
main et PR. Pas de secrets, pas d'input non fiable.

### ✅ P4.2 — `doctor` réel

`test/doctor.js` — 27 checks : CLAUDE.md longueur, 21 satellites
présents, settings.json valide, .gitignore/.claudeignore, gate
executable, refs markdown, zéro _legacy, hook git pre-push (optional).
Dual mode source repo / projet installé.

### ✅ P4.3 — `init` réel

`bin/init.js` — 32 fichiers installés. Copie `src/<lang>/` vers
`.claude/`, stacks vers `.claude/stacks/`, merge intelligent
`settings.json` (union allow/deny, preserve existant), templates
`.claudeignore` + `.gitignore` (skip si existe), `scripts/pre-push-gate.sh`.
Modes `--global`, `--lang fr|en`, `--dry-run`.

### ✅ P4.4 — Stratégie EN

FR-only pour v0.2.0. `src/en/README.md` placeholder explique la
stratégie et le guide de contribution EN. `init --lang en` est câblé.

### ✅ P4.5 — Système de handoff inter-LLM

`docs/handoffs/` — convention, template, premier handoff réel
(review P1→P4 pour Copilot/GPT). Pipeline : générer → copier →
répondre → coller → intégrer. Indexable par QMD.

---

## 🚧 P5 — Skills, agents & onboarding (en cours)

L'atelier devient un **framework complet** avec des slash commands,
un onboarding interactif, et l'intégration BMAD/QMD.

Inspiré de BMAD-METHOD (même pattern architectural : `SKILL.md` comme
entry point, progressive disclosure, step files pour workflows longs).

### P5.a — Architecture skills

Créer `src/skills/` avec le format BMAD (SKILL.md + fichiers support).
Chaque skill = un dossier = une slash command.

```text
src/skills/
├── atelier-help/          → /atelier-help  (oracle "où j'en suis")
├── atelier-setup/         → /atelier-setup (onboarding interactif)
├── review-copilot/        → /review-copilot (handoff inter-LLM)
├── audit-safe/            → /audit-safe (audit sécurité)
├── angle-mort/            → /angle-mort (review Copilot ciblée)
├── night-launch/          → /night-launch (prépare le night-mode)
├── doctor/                → /atelier-doctor (diagnostic étendu)
└── token-routing/         → /token-routing (explique le routing Haiku/Sonnet/Opus)
```

### P5.b — Skill `/atelier-help` (oracle)

Catalogue CSV de toutes les commandes. Détecte l'état du projet
(§0 rempli ? watchdog configuré ? gate installée ?) et recommande
la prochaine action. Equivalent de `bmad-help`.

### P5.c — Skill `/atelier-setup` (onboarding)

Checklist interactive post-install :

```text
[✅] .claude/CLAUDE.md installé
[✅] settings.json mergé (permissions Bash(*) + deny list)
[✅] .claudeignore + .gitignore
[✅] scripts/pre-push-gate.sh
[❌] Night Watchdog 🐶 → guide pour créer la tâche Cowork
[❌] Review Reminder → guide pour créer la tâche Cowork
[❌] §0 de CLAUDE.md → remplir projet/stack/repo
[ ] BMAD-METHOD → "Projet conséquent ? Veux-tu lancer BMAD ?"
[ ] QMD → proposé si ≥ 5 fichiers .md détectés dans le projet
```

### P5.d — Skill `/review-copilot` et `/angle-mort`

Génère automatiquement un handoff structuré dans `docs/handoffs/`.
`/review-copilot` = review générale.
`/angle-mort` = review ciblée "cherche ce que je ne vois pas".

Le prompt copier-coller est généré automatiquement avec le contexte
du projet (derniers commits, fichiers modifiés, stats).

### P5.e — Skill `/audit-safe`

Lance `scripts/pre-push-gate.sh` + scan secrets + vérifie .claudeignore
+ vérifie les deny list settings.json. Rapport structuré.

### P5.f — Skill `/night-launch`

Vérifie les prérequis (§0 rempli, watchdog 🐶 configuré, budget défini,
.claudeignore en place), génère le prompt de lancement, rappelle la
procédure du matin.

### P5.g — Intégration BMAD-METHOD

Fork de BMAD dans l'atelier (ou dépendance optionnelle).
Le skill `/atelier-setup` demande : "Projet conséquent avec phases
analyse → plan → architecture → implémentation ? Lancer BMAD ?"

Si oui : installe les skills BMAD dans `.claude/skills/`.
Si non : continue sans.

BMAD n'est **pas obligatoire** — c'est une option pour les gros projets.

### P5.h — Intégration QMD

Fork ou dépendance optionnelle.
`init` détecte le nombre de `.md` dans le projet :

- < 5 fichiers : ne propose pas QMD
- ≥ 5 fichiers : "Tu as [N] fichiers .md. QMD peut les indexer pour
  retrouver du contexte rapidement. Installer ?"

### P5.i — Méthodologie complète documentée

L'atelier ne se limite pas aux fichiers de config. C'est un **framework
de travail** qui couvre :

- **Token routing** : Haiku exploration / Sonnet standard / Opus critique.
  Configurable dans settings.json (`CLAUDE_CODE_SUBAGENT_MODEL`).
  Le but primaire : éviter que Claude mange tous les tokens en une nuit.
- **Permissions optimisées** : `Bash(*)` + deny list au lieu de 56
  règles au cas par cas. Zéro prompt de permission en night-mode.
- **Git workflow** : commits atomiques, messages français, jamais signer,
  pre-push gate 5 étapes, push précédé de tests.
- **Night-mode** : watchdog Cowork avec auto-clic permissions + iMessage.
- **Review inter-LLM** : Claude ↔ Copilot via handoffs markdown.
- **Supervision** : tâches planifiées Cowork (watchdog + review reminder).
- **Sécurité** : .claudeignore, secrets scan, deny list, gate, emergency.
- **Multi-stack** : satellites React/Vite, Firebase, Python, Java, Docker,
  Ollama chargés conditionnellement.

Tout ça est documenté dans les satellites `src/fr/` et exposé via
les slash commands pour que l'utilisateur n'ait pas à lire 33 fichiers.

### P5.j — Watchdog prompt v5 (fix "VSCode ouvert mais Claude inactif")

Le watchdog actuel ne distingue pas "VSCode ouvert sans Claude" de
"Claude actif". Le v5 vérifie le processus Claude Code spécifiquement :

```text
Vérifie si un processus Claude Code est actif :
Lance `pgrep -f "claude" | head -1` pour chercher un processus claude.
Si aucun processus claude n'est trouvé ET VSCode est ouvert :
  → "VSCode ouvert mais Claude Code n'est pas actif. Pas de session
    de travail en cours." → termine silencieusement.
Si aucun processus claude ET VSCode fermé :
  → termine silencieusement (personne ne travaille).
Seulement si un processus claude EST actif → continue le diagnostic.
```

---

## 🚧 P6 — Publication NPM + Plugin Claude Code

### P6.a — Release NPM 0.2.0

- Bump semver 0.1.0 → 0.2.0
- Tag git `v0.2.0`
- `npm publish --access public`
- Vérifier `npx claude-atelier init` depuis un dossier vierge
- `release.yml` GitHub Actions (tag `v*` → CI → publish)

### P6.b — Plugin Claude Code (marketplace)

`.claude-plugin/marketplace.json` — packager les skills comme plugin
installable via `/plugin install claude-atelier`.

---

## Backlog (quand le besoin se présente)

- `update` command (mise à jour en préservant §0 et settings.json)
- `lint-contradictions.js` (détecte les patterns §5↔§12-like)
- `lint-translations.js` (parité FR↔EN quand EN existe)
- Étoffer les 4 stubs de stacks (react-vite, firebase, docker, ollama)
- EN parity v0.3.0

---

## Ordre de priorité

```text
1. P5.a — Architecture skills (dossiers, format SKILL.md)
2. P5.b — /atelier-help (oracle)
3. P5.c — /atelier-setup (onboarding interactif)
4. P5.d — /review-copilot + /angle-mort
5. P5.e — /audit-safe
6. P5.f — /night-launch
7. P5.g — Intégration BMAD (optionnel gros projets)
8. P5.h — Intégration QMD (optionnel ≥5 .md)
9. P5.i — Doc méthodologie complète
10. P5.j — Watchdog v5 (fix VSCode ouvert sans Claude)
11. P6.a — Release NPM 0.2.0
12. P6.b — Plugin Claude Code marketplace
```

## Checklist de reprise (à suivre à chaque session)

1. Lire ce fichier en premier
2. Vérifier `git status` et `git log --oneline -5`
3. Lire la mémoire (`~/.claude/projects/*/memory/MEMORY.md`)
4. Pointer `CLAUDE.md` — toujours ≤ 150 lignes, pas de ref cassée
5. Identifier la dernière étape cochée ✅ dans ce roadmap
6. Reprendre à la première étape 🚧
