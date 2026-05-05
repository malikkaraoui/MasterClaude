---
id: agents
title: Agents nommés
---

`claude-atelier` associe des **figures** à des contextes spécifiques. Des masques fonctionnels activés par le contexte ou un skill — pas des personnages permanents.

---

## Les 7 agents

### Steve 🍎 — iOS / Xcode

Activé par le satellite `ios-xcode.md` quand `§0 Stack = ios-xcode`.

> L'atelier ouvre un chantier Apple. Steve entre en scène — il connaît les conventions Xcode, les entitlements, les provisioning profiles.

**Domaine :** SwiftUI, Xcode, App Store, TestFlight, signing certificates.

**Skill :** `/ios-setup`

---

### Isaac 📦 — npm publish

Activé par le satellite `npm-publish.md` lors d'une livraison de package npm.

> L'atelier prépare une livraison. Isaac entre en scène — il connaît les workflows de publication, les tags git, le CHANGELOG.

**Workflow Isaac :**

```bash
npm version patch --no-git-tag-version
git add package.json && git commit -m "chore: version x.y.z"
git tag vx.y.z
git push --tags  # GitHub Actions publie sur npm
```

---

### Mohamed 📋 — Review Copilot

Activé via `/review-copilot`. Coordonne les handoffs inter-LLM.

> Mohamed passe en arrière-salle, relit les commits un par un, prépare le brief pour l'œil extérieur.

**Workflow :**
```
/review-copilot → docs/handoffs/YYYY-MM-DD.md
               → colle dans Copilot / ChatGPT
               → /integrate-review pour trier les retours
```

**Triggers automatiques (§25) :** feature terminée · bug fix critique · 100+ lignes · 3+ tentatives échouées

---

### La Bise 🌬️ — Échanges inter-LLM

Activé via `/la-bise`. Organise le passage de contexte entre Claude et d'autres modèles.

> Entre deux modèles, pas d'embrassade — juste une bise.
> Mistral fait rage sur la toile. La Bise, elle, passe là où il le faut.

Double sens voulu : vent léger qui trouve sa place là où le Mistral ne passe pas — et la bise échangée entre Claude et GPT, ni une fusion, ni un silence.

**Workflow :**
```
/la-bise → brief compact (≤ 500 tokens)
         → colle dans ChatGPT / Mistral / ollama
         → retour intégré et trié dans la session
```

**Cibles supportées :** GPT-4o · Mistral (Ollama local) · tout LLM externe

---

### Amine 🧪 — Tests & Enforcement

Le testeur interne. `test/hooks.js` porte sa signature.

```bash
npm test
# ── Amine 🧪 : 20/20 tests passés ──
```

Amine vérifie tous les guards bash — edge cases inclus.

---

### Séréna 🎨 — Design Senior + UI/UX

Activée via `/design-senior` ou automatiquement dès qu'un besoin UI/UX est détecté dans le prompt (`detect-design-need.sh`).

> La chef designer senior de l'atelier. Elle s'active quand tu parles design, UI/UX, charte.

**Domaine :** composants UI, charte graphique, accessibilité, design system.

**MCP optionnel :** magic (21st.dev) pour composants premium.

**Skill :** `/design-senior`

---

### Peter 🗂️ — Vault projet / mémoire dynamique

Activé au `SessionStart` dès qu'un `vault/` projet existe.

> Peter injecte un seul `PETER_REPORT.md` au démarrage — décisions actives, prochaine action, nœuds centraux — et maintient la mémoire projet sans brûler les tokens. Il tourne en autonome : watch daemon + cron, aucune intervention requise.

**Workflow complet :**
```bash
npx claude-atelier vault init          # crée le vault + hook SessionStart
npx claude-atelier vault update        # index incrémental SHA256
npx claude-atelier vault report        # regénère PETER_REPORT.md
npx claude-atelier vault stale         # détecte fichiers obsolètes / manquants
npx claude-atelier vault graph         # construit graph.json (nœuds + arêtes)
npx claude-atelier vault query "auth"  # recherche dans le graphe
npx claude-atelier vault path A B      # chemin entre deux nœuds
npx claude-atelier vault explain node  # détails + voisins d'un nœud
npx claude-atelier vault export --html # export graphe (HTML / GraphML / Obsidian / Neo4j / SVG / Wiki)
npx claude-atelier vault watch         # daemon surveillance temps réel
npx claude-atelier vault cron start    # planification automatique
npx claude-atelier vault maintain      # maintenance autonome (heartbeat + alertes)
npx claude-atelier vault mcp           # serveur MCP stdio (tools query_vault / get_node / neighbors)
```

**Ce qu'il apporte :**
- Index SHA256 (`manifest.json`) — détection incrémentale sans faux positifs
- Graphe navigable (`graph.json`) — nœuds fichiers / décisions / concepts / BMAD / risques + relations extraites Markdown
- Centralité pondérée — top 8 nœuds remontés dans `PETER_REPORT.md` (section `## Nœuds centraux`)
- Export multi-formats — intégration Obsidian, Neo4j, visualisation D3/SVG
- MCP stdio natif — `query_vault`, `get_node`, `neighbors`, `stale_status` accessibles par tout client MCP
- Local-first, aucun LLM externe, aucun cloud requis

**Phases livrées :** A (init + hook) · B (index + watch + cron) · C (graphe + query + export + MCP — PR #50) · Closure (storytelling vault/00-brief.md + roadmap + website/docs/ — PR #51)

**Statut v0.26.0 :** Peter tourne en autonomie complète — vault à jour, graphe navigable, MCP stdio actif, rapport hebdomadaire automatique. Master daemon actif (Telegram long-poll, routing projets, contexte Obsidian par message).

---

## Les 5 figures du Théâtre d'atelier

| Figure | Contexte | Ton |
|---|---|---|
| **Le Maître d'atelier** | Setup, vision, `/atelier-help` | Calme, structurant |
| **L'Inspecteur** | Audit, review, `/angle-mort` | Sec, lucide |
| **Le Veilleur de nuit** | Night mode, `/night-launch` | Posé, protecteur |
| **Le Forgeron** | Implémentation intense | Concentré, silencieux |
| **Le Cartographe** | Exploration, architecture | Méthodique |

Ces figures s'activent uniquement sur les **moments forts** — pas à chaque message.
