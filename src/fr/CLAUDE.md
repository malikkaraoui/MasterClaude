# CLAUDE.md — Delta Claude-specific

> Rechargé à chaque message · détails hors core → `./rules/`, `./runtime/`, `./orchestration/`, `./autonomy/`, `./security/`, `./ecosystem/`, `../stacks/`, `../templates/`
> Règles communes à tous les agents → **`AGENTS.md`** (à la racine du projet)

## §0 Contexte projet actif

| Clé | Valeur |
| --- | --- |
| Projet courant | — |
| Phase | — |
| Stack | — |
| Repo | — |
| Conventions | — |
| Endpoints actifs | — |
| Contraintes métier | — |
| MCPs actifs | qmd (moteur recherche .md hybride) |
| Gate pré-push | `bash scripts/pre-push-gate.sh` |

Mise à jour : « Mets à jour §0 : [ce qui change] » → Claude édite + commit atomique.

## §1 Horodatage + Modèle

Le hook `routing-check.sh` injecte `[HORODATAGE] YYYY-MM-DD HH:MM:SS | model` puis `[OLLAMA] status` à chaque message (heure machine, pas serveurs Anthropic).
**Ouvrir chaque réponse avec cette ligne exacte** : `[YYYY-MM-DD HH:MM:SS | model] PASTILLE` (🟢/🟠/🔴 depuis `[METRICS]`, omettre si absent). Si non disponible → `[date estimée | modèle inconnu]`.

## §2 Langue & Ton

Français. Direct. Actionnable. Zéro pédagogie inutile. Pas de preamble, hedge ni platitude. Mise en scène contextuelle → `./runtime/theatre.md` (5 figures, micro-ouvertures sur moments forts uniquement).

## §3 Flow de traitement → `AGENTS.md`

Voir `AGENTS.md` (règle commune). Spécificité Claude : subagent Haiku si explore large. `Shift+Tab × 2` = Plan Mode.

## §4 Format de réponse

1. Solution / Plan en premier
2. Détails, variantes, pièges
3. Next steps en fin

Outils : checklists, tableaux, blocs copier-coller.

## §5 Anti-hallucination → `AGENTS.md` (absolu)

## §6 Gestion des erreurs → `AGENTS.md`

## §7 Qualité du code → `AGENTS.md`

## §8 Anti-patterns → `AGENTS.md`

## §9 Architecture → `AGENTS.md` + `../templates/project-structure.md`

## §10 Standards par stack → `../stacks/`

Chargement conditionnel selon §0 « Stack ». Disponibles : `javascript` · `python` · `java` · `react-vite` · `firebase` · `docker` · `ollama` · `ios-xcode`.

## §11 Tests → `AGENTS.md`

Spécificité Claude : pour tout hook, MAJ `test/hooks.js` + `.claude/hooks-manifest.json`.

## §12 Code Review → `AGENTS.md` + `./runtime/code-review.md`

## §13 Git Workflow → `AGENTS.md`

Spécificité Claude : `git push` précédé de la gate (§24).

## §14 Cloud / CI-CD → `AGENTS.md`

## §15 Token Management → `../templates/settings.json`

Input : ne pas relire un fichier déjà lu dans la session sauf si modifié. Settings consolidé (env + permissions + budget). Routing : Haiku exploration / Sonnet standard / Opus architecture. **En début de session, signaler le modèle actif et recommander `/model sonnet` ou `/model haiku` si surdimensionné** (ex: Opus pour du dev standard → « tu tournes sur Opus — tape `/model sonnet` pour descendre »). Compaction : `/compact` après explore, après feature, avant switch.
**QMD-first** : pour tout fichier `.md` du projet, utiliser `mcp__qmd__get` ou `mcp__qmd__query` avant `Read`. `Read` sur un `.md` n'est autorisé que si la ligne exacte est connue (offset+limit obligatoire).
**Auto-métriques** : `model-metrics.sh` émet `[METRICS]` à chaque message — mécanique, pas à ta discrétion. Lire la pastille, l'inclure en §1. Si l'utilisateur demande explicitement un switch ("passe sur haiku", "monte sur opus") : exécuter immédiatement `python3 scripts/switch_model.py <model> [pane]` sans attendre de proposition.

## §16 Orchestration → `./orchestration/`

Fork · Teammate · Worktree. Refactor > 3 fichiers → `isolation: worktree`. Détails : `modes.md` · `subagents.md` · `parallelization.md` · `spawn-rules.md` · `models-routing.md`.

## §17 Todo & Session → `./runtime/todo-session.md`

Tracking obligatoire si > 3 fichiers ou agents multiples. Reprise : dernier `[→]` ou premier `[ ]` pending.

## §18 Extended Thinking → `./runtime/extended-thinking.md`

Défaut `MAX_THINKING_TOKENS: 10000`. **Auto-montée** : architecture, plan, conception, migration, schéma DB → `high` + signaler. **Auto-descente** : tâche terminée → revenir en `medium` + signaler. Night-mode : forcer `low` sur l'exploration, `medium` sur l'implémentation.

## §19 MCP → `./orchestration/mcp-lifecycle.md`

Charger uniquement les MCPs nécessaires. Lister dans §0. Purger en fin de session. Trop de MCPs : fenêtre 200k → ~70k.

## §20 Mémoire & Évolution

Ce fichier évolue sur instruction explicite. Immuables sans validation : §5, §21, §22.

| Événement | Section |
| --- | --- |
| Nouveau projet | §0 |
| Nouvel endpoint | §0 |
| Décision archi | §9 + note §0 |
| MCP ajouté | §0 + §19 |

## §21 Hiérarchie des règles

```text
1. §5  Anti-hallucination        → absolu
2. §22 Secrets & Sécurité Git    → absolu
3.     Contrat front/back        → sans validation explicite
4. §7  Qualité / conventions     → systématique
5. §15 Optimisation tokens       → si 1-4 satisfaits
```

## §22 Secrets & Sécurité Git → `./security/`

Non négociable : jamais de clé/token en dur, `.gitignore` + `.claudeignore` obligatoires, `git push` interdit sans gate, pattern suspect → stopper. Détails : `secrets-rules.md` · `emergency.md`.

## §23 Autonomie & Mode Nuit → `./autonomy/`

Plan Pro → `acceptEdits` + allow/deny, `maxBudgetUsd` défini. Push autonome autorisé après gate verte. Détails : `permission-modes.md` · `night-mode.md` · `loop-watchers.md`.

## §24 Pre-push Gate → `./security/pre-push-gate.md`

`bash scripts/pre-push-gate.sh` — 5 étapes : secrets → fichiers sensibles → lint → build → tests. Jamais de `--no-verify`.

## §25 Inter-agents — Review Copilot auto

**Réflexe non négociable, pas un choix.** Dès que : feature terminée, bug fix critique, 100+ lignes modifiées, PR créée (même docs only), 3+ tentatives échouées, ou avant tout commit/push/bump → exécuter la **séquence intégrale** sans demander confirmation entre les étapes :

1. `/review-copilot` → handoff JSON dans `docs/handoffs/`
2. commit handoff + push
3. PR créée en **draft**
4. **PR draft → ready_for_review** (sinon Copilot ne review pas)
5. `/copilot-loop` lancé immédiatement
6. `subscribe_pr_activity` actif → webhook GitHub = réveil persistant (pas de polling manuel, pas de question utilisateur)

Le webhook PR sert de réveil ; rien à relancer. Réintégration des fixes Copilot suit automatiquement.
