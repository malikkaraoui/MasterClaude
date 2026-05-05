---
id: hooks
title: Hooks d'enforcement
---

> Rules in CLAUDE.md → intentions. Hooks → guarantees.

Les hooks sont des scripts shell exécutés automatiquement par le harness Claude Code. Ils ne dépendent pas du raisonnement de Claude — ils s'exécutent inconditionnellement.

---

## Cockpit §1 — heads-up display

Chaque réponse Claude s'ouvre sur une ligne d'en-tête générée par les hooks :

```
`[2026-04-20 15:12 | claude-sonnet-4-6] 🟢 M | 🦙❌ | 🔌❌`
```

| Champ | Valeurs | Signification |
|---|---|---|
| `timestamp` | `YYYY-MM-DD HH:MM:SS` | Horodatage machine |
| `model` | `claude-sonnet-4-6` | Modèle actif (extrait du transcript live) |
| Pastille | `🟢` optimal · `⬆️` upgrade · `⬇️` downgrade | Fit modèle/complexité (METRICS) |
| Mode | `M` Anthropic direct · `A` proxy actif | Basé sur healthcheck `:4000/health` réel |
| Ollama | `🦙✅ qwen3.5` · `🦙⚡ qwen3.5` · `🦙❌` | Intercept total · triage dynamique · off |
| Proxy | `🔌✅` · `🔌❌` | Port 4000 répond ou non |

Un vrai tableau de bord pilote : modèle, coût, routage, infrastructure — en un coup d'œil.

---

## Les rails actifs

| # | Hook | Événement | Ce qu'il fait |
|---|---|---|---|
| 1 | `routing-check.sh` | `UserPromptSubmit` | Routing modèle (live > transcript > cache), détection stack, diagnostic throttled 30 min, longueur session, §1 instruction cockpit |
| 2 | `model-metrics.sh` | `UserPromptSubmit` | Analyse 5 derniers tours assistant → pastille `🟢/⬆️/⬇️` → §1 ENTÊTE FINAL avec vraie pastille + mode/Ollama/proxy |
| 3 | `detect-design-need.sh` | `UserPromptSubmit` | Détecte besoin UI/UX/design → propose Séréna 🎨 |
| 4 | `guard-no-sign.sh` | `PreToolUse` (commit) | Bloque `Co-Authored-By`, `--signoff` |
| 5 | `guard-commit-french.sh` | `PreToolUse` (commit) | Bloque messages purement anglais |
| 6 | `guard-tests-before-push.sh` | `PreToolUse` (push) | Exige `npm test` vert avant push |
| 7 | `guard-review-auto.sh` | `PostToolUse` (commit) | Challenger : 100+ lignes, feat, 10 commits, archi |
| 8 | `guard-anti-loop.sh` | `PostToolUse` | Détecte 3+ tentatives identiques → STOP |
| 9 | `guard-hooks-reload.sh` | `PostToolUse` (Edit/Write) | Rappel rechargement si hooks/settings modifiés |
| 10 | `guard-qmd-first.sh` | `PreToolUse` (Read) | Redirige `.md` vers QMD avant lecture complète |
| 11 | `session-model.sh` | `SessionStart` | Cache le modèle de session pour routing cross-hooks |
| 12 | `guard-no-force-push.sh` | `PreToolUse` (push) | Bloque `git push --force` |
| 13 | `vault-context.sh` | `SessionStart` | Charge le résumé Peter (PETER_REPORT) en contexte |
| 14 | `memory-read.js` | `SessionStart` + `UserPromptSubmit` | Injecte les épisodes et le contexte mémoire |
| 15 | `detect-design-need.sh` | `UserPromptSubmit` | Détecte besoin UI/UX/design → propose Séréna 🎨 |

---

## Principe de fonctionnement

```
Utilisateur envoie un message
         ↓
UserPromptSubmit hooks (routing-check, model-metrics, detect-design)
         ↓
Claude raisonne + choisit un outil
         ↓
PreToolUse hooks s'exécutent
  Exit 0 → l'outil s'exécute
  Exit 2 → bloqué, message injecté dans le contexte
         ↓
PostToolUse hooks s'exécutent
```

---

## Mode A/M — logique de routage

Le mode est déterminé par un **healthcheck réel**, pas par la variable d'environnement `ANTHROPIC_BASE_URL` :

| État proxy | Mode | En-tête |
|---|---|---|
| `curl :4000/health` répond | `A` — Auto (proxy actif) | `🦙✅/🦙⚡ \| 🔌✅` |
| `curl :4000/health` timeout | `M` — Manuel (Anthropic direct) | `🦙❌ \| 🔌❌` |

`ANTHROPIC_BASE_URL=localhost:4000` + proxy éteint → affiche `M` de fait. La config ne ment pas.

---

## Pastille METRICS — fit modèle/complexité

`model-metrics.sh` analyse les 5 derniers tours assistant et classe chaque outil utilisé :

| Catégorie | Outils |
|---|---|
| `low` | Read, Glob, Grep, NotebookRead |
| `high` | Agent, WebSearch, WebFetch |
| `medium` | tout le reste (Edit, Write, Bash…) |

Si 60%+ des tours sont `high` → complexité `high`. Si 60%+ sont `low` → complexité `low`. Sinon `medium`.

| Complexité + Modèle | Verdict | Pastille |
|---|---|---|
| high + opus | optimal | 🟢 |
| high + sonnet | limite | ⬆️ |
| medium + sonnet | optimal | 🟢 |
| medium + opus | léger surplus | ⬇️ |
| low + haiku | optimal | 🟢 |
| low + sonnet | léger surplus | ⬇️ |

---

## Challenger — le garde-fou automatique

Le hook `guard-review-auto.sh` détecte 5 situations :

| Trigger | Signal | Action proposée |
|---|---|---|
| 100+ lignes modifiées | Volume élevé | `/review-copilot` ou `/angle-mort` |
| Commit `feat:` / `refactor:` | Feature terminée | `/angle-mort` avant de continuer |
| 10 commits sans review | Endurance | `/angle-mort` pause minimale |
| Fichier architecturant créé | Choix structurant | `/review-copilot` validation |
| 3+ tentatives échouées | Boucle | STOP, changer d'approche |

Le Challenger **propose**, il ne bloque pas. Exit code 0 toujours.

---

## Hooks et chemins machine-spécifiques

Les hooks dans `settings.json` contiennent des **chemins absolus** propres à chaque machine. `claude-atelier init` et `claude-atelier update` les **régénèrent systématiquement** — ils ne sont jamais réutilisés depuis une ancienne installation.

:::caution Ne pas copier settings.json entre machines
Les chemins de hooks sont absolus et machine-spécifiques. Lancer `claude-atelier init` sur chaque machine pour générer les bons chemins.
:::

---

## Tests des hooks

```bash
npm test
```

(`test/hooks.js`) — 37+ tests couvrant routing, METRICS, mode M/A, Ollama, race condition inter-hooks, gate handoff. Doit passer avant tout push.
