---
id: intro
slug: /
title: claude-atelier
sidebar_label: Introduction
---

<div align="center">

# 🛠️

### Framework de travail pour Claude Code

[![npm version](https://img.shields.io/npm/v/claude-atelier.svg)](https://www.npmjs.com/package/claude-atelier)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/malikkaraoui/claude-atelier/blob/main/LICENSE)

</div>

---

## Démarrage rapide

```bash
npx claude-atelier init
```

C'est tout. Claude Code est configuré avec 15 rails d'enforcement et un cockpit §1.

---

## Ce que ça fait

`claude-atelier` installe dans `.claude/` :

- **15 hooks bash** — s'exécutent automatiquement (message, commit, push, session)
- **Cockpit §1** — chaque réponse s'ouvre sur `` `[timestamp | model] 🟢 M | 🦙❌ | 🔌❌` `` : horodatage, modèle, pastille fit, mode M/A, état Ollama, état proxy — en un coup d'œil
- **20 slash commands** — `/review-copilot`, `/night-launch`, `/angle-mort`…
- **Satellites de stack** — JS, Python, iOS, Docker… chargés selon le projet
- **Mode nuit** — Claude travaille seul, le pouls surveille, vous dormez
- **Bridge Telegram** — commandes depuis mobile + alertes temps réel + messages vocaux (faster-whisper + Ollama local)
- **Gate pré-push** — 5 vérifications avant chaque `git push`

---

## 💰 Jusqu'à 90% de réduction sur les coûts de tokens

| Technique | Économie |
| --------- | -------- |
| Routing modèle — Haiku/Sonnet vs toujours-Opus | **~80%** |
| `/compact` compression de contexte | **60–80%** par session |
| Chargement conditionnel des stacks (§10) | **~30%** |
| QMD-first — recherche avant lecture complète | **~20%** |
| `maxBudgetUsd` plafond dur | 100% anti-runaway |

Session typique de 2h : **$8–12** sans framework → **$0,80–1,50** avec claude-atelier.

→ [Détails complets](./token-savings)

---

## Philosophie

> Rules in CLAUDE.md → intentions. Hooks → guarantees.

`claude-atelier` ne documente pas les bonnes pratiques — il les **enforce**.
Chaque règle critique est un script bash qui se déclenche automatiquement.
Pas de texte. Des rails.

---

## Structure installée

```
.claude/
├── CLAUDE.md              ← Runtime core (§0–§25)
├── settings.json          ← Permissions, hooks, budget
├── hooks/                 ← 15 scripts d'enforcement
├── autonomy/              ← Mode nuit, pouls, loop
├── orchestration/         ← Fork, Teammate, Worktree
├── runtime/               ← Todo, extended thinking
├── security/              ← Gate, secrets, emergency
├── ecosystem/             ← Hooks, skills, agents
└── skills/                ← 20 slash commands
scripts/
└── pre-push-gate.sh       ← Gate pré-push 5 étapes
```

---

## Navigation

- [Installation](./installation) — mise en place complète
- [Hooks d'enforcement](./hooks) — les 15 rails + cockpit §1
- [Agents nommés](./agents) — Steve, Isaac, Mohamed, Amine, Peter
- [Mode Nuit](./mode-nuit) — autonomie supervisée + pouls
- [Skills](./skills) — 20 slash commands
- [Satellites par stack](./stacks) — iOS, JS, Python…
- [Sécurité](./securite) — gate, secrets, permissions
- [Bridge Telegram](./telegram) — commandes mobile + voix + alertes FIFO
- [Contribuer](./contribuer) — ajouter un hook, un satellite
