---
id: skills
title: Skills — Slash Commands
---

Les skills sont des slash commands disponibles dans Claude Code. Ils chargent dynamiquement une procédure dans le contexte.

---

## Les 20 skills

| Skill | Commande | Description |
|---|---|---|
| Atelier Help | `/atelier-help` | Vue d'ensemble, navigation, aide |
| Atelier Setup | `/atelier-setup` | Auto-découvre le projet (package.json, git, stack) et configure §0 |
| Atelier Doctor | `/atelier-doctor` | Diagnostic complet installation (27+ checks) |
| Atelier Config | `/atelier-config` | Tableau de contrôle features + état système |
| Night Launch | `/night-launch` | Lance une session de nuit avec checklist |
| Review Copilot | `/review-copilot` | Génère un handoff JSON pour Copilot via PR GitHub |
| Integrate Review | `/integrate-review` | Intègre la réponse Copilot depuis docs/handoffs/ |
| Copilot Loop | `/copilot-loop` | Loop autonome PR → review → merge |
| Angle Mort | `/angle-mort` | Auto-review anti-complaisance avant release |
| Audit Safe | `/audit-safe` | Audit sécurité + secrets sur le diff staged |
| BMAD Init | `/bmad-init` | Plan → validation → implémentation |
| Compress | `/compress` | Compresse CLAUDE.md pour réduire les tokens |
| QMD Init | `/qmd-init` | Configure l'intégration QMD |
| iOS Setup | `/ios-setup` | Workflow iOS/tvOS : VS Code + Xcode + Makefile |
| Token Routing | `/token-routing` | Recommande le bon modèle pour la tâche |
| Design Senior | `/design-senior` | Propose Séréna + installe UI/UX Pro Max |
| La Bise | `/la-bise` | Échange inter-LLM (GPT/Mistral) |
| Freebox Init | `/freebox-init` | Bootstrap autorisation app Freebox |
| Ollama Router | `/ollama-router` | Setup Ollama bout-en-bout + proxy |
| Handoff Debt | `/handoff-debt` | Affiche la dette §25 + draft handoff |

---

## Review Copilot — workflow

```
/review-copilot
      ↓
docs/handoffs/YYYY-MM-DD-<feature>.json généré
      ↓
Branche handoff/ → PR GitHub créée
      ↓
Copilot review la PR automatiquement
      ↓
/integrate-review — intègre la réponse JSON
```

Le JSON est lu directement par Copilot via la PR — pas de copier-coller.

---

## Angle Mort — auto-review

`/angle-mort` en 3 étapes :

1. Parcourt les derniers commits
2. Identifie ce qui n'a pas été challengé (tests, edge cases, doc)
3. Liste les risques — ne propose pas de fix, signale uniquement

---

## BMAD Init

Build, Map, Architect, Deliver.

```
/bmad-init
      ↓
Phase 1 : Plan (architecture, fichiers à créer)
      ↓
Validation humaine
      ↓
Phase 2 : Implement (commits atomiques)
      ↓
Phase 3 : Deliver (gate + push)
```

---

## Créer un skill custom

```markdown
---
name: mon-skill
description: Description courte pour la détection automatique
---

# Contenu du skill

Procédure, règles, templates, checklist.
```

Placement : `.claude/skills/mon-skill/SKILL.md`
