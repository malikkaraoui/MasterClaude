# PARITY — claude-atelier vs Claude Code natif

> Ce que Claude Code fournit hors-boîte vs ce que claude-atelier ajoute par-dessus. Mis à jour : 2026-04-20.

claude-atelier **ne remplace pas** Claude Code. Il configure le client officiel d'Anthropic. Ce document liste, feature par feature, ce qui est natif, ce qu'on étend, et ce qu'on n'a délibérément pas fait.

## Légende

- ✅ **Natif** — Claude Code le fournit sans config supplémentaire
- 🔧 **Étendu** — Natif mais claude-atelier ajoute des règles/guards/templates par-dessus
- ➕ **Ajouté** — N'existe pas dans Claude Code natif
- ❌ **Hors scope** — Refusé par parti pris (voir [PHILOSOPHY.md](PHILOSOPHY.md))

---

## 1. Configuration & Hierarchy

| Feature | Statut | Détails |
| --- | --- | --- |
| `CLAUDE.md` projet | ✅ | Chargé automatiquement |
| `CLAUDE.md` user (`~/.claude/`) | ✅ | Chargé automatiquement |
| Chargement conditionnel par stack | ➕ | `.claude/stacks/*.md` chargés via §10 selon contexte projet |
| Limite stricte ≤ 150 lignes du core | ➕ | `test/lint-length.js` enforce — évite la dérive du core |
| Bilingue FR-first | ➕ | Toutes les règles en français, EN secondaire pour npm |
| Section `§0 Contexte projet actif` | ➕ | Tableau projet/phase/stack/repo/MCPs en tête de CLAUDE.md |

## 2. Hooks

| Feature | Statut | Détails |
| --- | --- | --- |
| `UserPromptSubmit` hook | ✅ | Natif |
| `PreToolUse` / `PostToolUse` hooks | ✅ | Natif |
| `SessionStart` hooks | ✅ | Natif |
| `routing-check.sh` (modèle actif + cockpit) | ➕ | Injecte `[ROUTING]`, `[OLLAMA]`, `[SWITCH-MODE]` et l'instruction §1 à chaque message. Mode `A`/`M` basé sur healthcheck `:4000/health` réel — proxy off = `M` de fait, quelle que soit la config `ANTHROPIC_BASE_URL`. |
| `model-metrics.sh` (métriques de complexité) | ➕ | Analyse les 5 derniers tours assistant → verdict `optimal`/`limite`/`léger surplus` → pastille `🟢/⬆️/⬇️`. Construit le §1 ENTÊTE FINAL avec la vraie pastille + mode dérivé de son propre healthcheck (pas de race condition avec `routing-check.sh`). |
| **Cockpit §1 — heads-up display** | ➕ | Chaque réponse commence par `` `[timestamp \| model] PASTILLE MODE \| 🦙state \| 🔌proxy` ``. Pastille = fit modèle (METRICS). Mode = `M` (Anthropic direct) / `A` (proxy actif). Ollama = `🦙✅ model` (intercept tout), `🦙⚡ model` (triage dynamique), `🦙❌` (off). Proxy = `🔌✅`/`🔌❌`. |
| `guard-no-sign.sh` (anti-signature) | ➕ | Bloque tout `Co-Authored-By` ou `--signoff` dans les commits |
| `guard-commit-french.sh` | ➕ | Bloque les commits messages purement anglais (≥ 2 mots EN, 0 FR) |
| Test suite des hooks | ➕ | `test/hooks.js` — 58 tests, exécutés à chaque `npm test` |

## 3. Skills & Slash commands

| Feature | Statut | Détails |
| --- | --- | --- |
| Système de skills natif (`.claude/skills/`) | ✅ | Natif |
| 16 skills bundlés FR | ➕ | `/design-senior`, `/handoff-debt`, `/freebox-init`, `/ios-setup`, etc. — voir README |
| Skills marketplace | ❌ | On n'en publie pas pour l'instant — `npm` est notre canal |

## 4. Subagents & Orchestration

| Feature | Statut | Détails |
| --- | --- | --- |
| `Agent` tool / subagents | ✅ | Natif |
| `isolation: "worktree"` | ✅ | Natif |
| Règles de spawn (Fork / Teammate / Worktree) | 🔧 | Documentées dans `.claude/orchestration/{modes,subagents,parallelization,spawn-rules}.md` |
| Routing modèle par tâche | 🔧 | `models-routing.md` : Haiku exploration / Sonnet dev / Opus archi |
| Refactor > 3 fichiers → worktree obligatoire | ➕ | Règle §16 du core |

## 5. Plan Mode

| Feature | Statut | Détails |
| --- | --- | --- |
| Plan Mode (`Shift+Tab × 2`) | ✅ | Natif |
| Auto-déclenchement Plan Mode | ➕ | Règle §3 + §18 : architecture / migration / schéma DB → extended thinking high + Plan Mode |

## 6. MCPs

| Feature | Statut | Détails |
| --- | --- | --- |
| Système MCP natif | ✅ | Natif |
| Lifecycle MCP documenté | 🔧 | `.claude/orchestration/mcp-lifecycle.md` — charger à la demande, purger en fin de session |
| MCP `qmd` (recherche markdown hybride) | ➕ | Recommandé en §0 : 1364 docs indexés, BM25 + vec + hyde |
| Garde-fou « QMD-first » | ➕ | §15 : `Read` sur `.md` interdit sauf si offset+limit connus |

## 7. Sécurité & Pre-push Gate

| Feature | Statut | Détails |
| --- | --- | --- |
| Détection secrets ad-hoc | Partiel | Claude warne mais ne bloque pas |
| **Pre-push gate 5 étapes** | ➕ | `scripts/pre-push-gate.sh` : secrets → fichiers sensibles → lint → build → tests |
| Patterns secrets étendus | ➕ | `sk-*`, `AIza*`, `AKIA*`, `ghp_*`, `ya29.*`, BEGIN RSA/OPENSSH/EC, etc. |
| `.claudeignore` template | ➕ | Fourni avec `npx claude-atelier init` |
| Blocage tracked sensitive files (`.env`, `.pem`, `.key`...) | ➕ | Step 2 de la gate |
| Auto-sync `SECURITY.md` | ➕ | `scripts/update-security.js` synchronise les versions supportées avec `package.json` |
| `git push` interdit sans gate verte | ➕ | §22 + §24 du core |

## 8. Sessions & Memory

| Feature | Statut | Détails |
| --- | --- | --- |
| Auto-compaction | ✅ | Natif |
| `/compact` manuel | ✅ | Natif |
| Compaction à ~60% (recommandation) | ➕ | §15 : ne pas attendre 75-98% — résumé agressif garantit perte d'info |
| Todos persistants hors flux messages | 🔧 | TodoWrite natif, mais §17 explicite la propriété (survivent aux compactions) |
| Reprise après compaction | 🔧 | `runtime/todo-session.md` : règle de reprise (dernier `[→]` ou premier `[ ]` pending) |

## 9. Token Management

| Feature | Statut | Détails |
| --- | --- | --- |
| `maxBudgetUsd` | ✅ | Natif (settings.json) |
| Routing modèle par tâche | ➕ | §15 : recommandation explicite + signalement de surdimensionnement Opus |
| Limite ≤ 25 mots entre tool calls | ➕ | §2 — empêche le narrating verbeux |
| Limite ≤ 100 mots pour réponse finale | ➕ | §2 — sauf si la tâche le justifie |
| QMD-first sur tous les `.md` | ➕ | §15 — économise ~20% sur projets dense en docs |

## 10. Stacks & Standards

| Feature | Statut | Détails |
| --- | --- | --- |
| Standards par stack | ➕ | 9 stacks couverts : `javascript`, `python`, `java`, `react-vite`, `firebase`, `docker`, `ollama`, `ios-xcode`, `freebox` |
| Théâtre (figures nommées par stack) | ➕ | 11 personnages — Pascal, Anthonio, Marcel, Nicolas & Fazia, Camille, Jeffrey, Nael, Xavier, Amine, etc. |
| Chargement conditionnel | ➕ | §10 : seule la stack du projet courant est chargée |

## 11. Autonomie & Mode Nuit

| Feature | Statut | Détails |
| --- | --- | --- |
| `acceptEdits` mode | ✅ | Natif |
| Permissions allow/deny | ✅ | Natif |
| **Mode nuit supervisé** | ➕ | `.claude/autonomy/night-mode.md` : push autonome autorisé après gate verte, watchdog CAS F |
| Loop watchers | ➕ | `.claude/autonomy/loop-watchers.md` |

## 12. Inter-agents (Review Copilot)

| Feature | Statut | Détails |
| --- | --- | --- |
| **Handoff Copilot auto** | ➕ | §25 : proposer un handoff (`docs/handoffs/`) sans attendre — feature terminée, bug critique, 100+ lignes, 3+ tentatives échouées |
| Format markdown structuré | ➕ | Template handoff fourni |

## 13. Installation & CLI

| Feature | Statut | Détails |
| --- | --- | --- |
| `npx claude-atelier init` | ➕ | Installe `.claude/` + `scripts/` + `hooks/` dans le projet |
| `npx claude-atelier update` | ➕ | Fusionne les configs en préservant `§0 Contexte projet actif` |
| `npm run doctor` | ➕ | Diagnostic santé — checks lint, hooks, refs, secrets |

---

## Hors scope (refusé par parti pris)

| Feature | Pourquoi pas |
| --- | --- |
| ❌ Réimplémentation du client Claude Code | Le client officiel suffit. Voir [claw-code](https://github.com/ultraworkers/claw-code) (Rust) pour une réimpl complète |
| ❌ Runtime/agent custom | Pas de DSL maison, pas d'orchestrateur. Markdown + hooks = assez |
| ❌ Système de plugins propriétaire | Le mécanisme natif (skills/hooks/MCPs) couvre nos besoins |
| ❌ Multi-lane / event bus | Overkill pour un package de configs. Si besoin → claw-code |
| ❌ Discord / Slack integration | Atelier reste humain-first (terminal) |
| ❌ Container sandbox dédié | `npm` + permissions natives Claude Code suffisent |

---

## Couverture résumée

| Catégorie | Natif ✅ | Étendu 🔧 | Ajouté ➕ | Hors scope ❌ |
| --- | --- | --- | --- | --- |
| Configuration | 2 | 0 | 4 | 0 |
| Hooks | 4 | 0 | 7 | 0 |
| Skills | 1 | 0 | 1 | 1 |
| Orchestration | 2 | 2 | 1 | 0 |
| MCPs | 1 | 1 | 2 | 0 |
| Sécurité | 1 | 0 | 6 | 0 |
| Sessions | 2 | 2 | 1 | 0 |
| Token mgmt | 1 | 0 | 4 | 0 |
| Stacks | 0 | 0 | 3 | 0 |
| Autonomie | 2 | 0 | 2 | 0 |
| Inter-agents | 0 | 0 | 2 | 0 |
| CLI | 0 | 0 | 3 | 0 |
| **Total** | **16** | **5** | **36** | **6** |

claude-atelier **ajoute 36 features** par-dessus Claude Code, **étend 5** existantes, et **refuse explicitement 6** pour rester un package de configs (pas un framework).

---

## Versioning de ce document

`PARITY.md` est révisé à chaque bump minor (nouveau stack, nouveau hook, nouveau skill). Si une feature change de statut (✅ → 🔧 par exemple), c'est mentionné dans le `CHANGELOG.md`.
