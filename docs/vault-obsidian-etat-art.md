# Coffre-Fort Obsidian × LLM — État de l'Art (02.05.2026)

> Synthèse de 4 recherches parallèles : Graphify, Superpowers, AskUserQuestion, Obsidian+LLM landscape.
> Objectif : construire dans claude-atelier un vault Obsidian partagé multi-projets, navigable par LLM à grande vitesse.

---

## Table des matières

1. [Contexte & Vision](#1-contexte--vision)
2. [Graphify — Brique Infrastructure](#2-graphify--brique-infrastructure)
3. [Cyrus Agents — Orchestration Multi-Agents + Mémoire de Session](#3-cyrus-agents--orchestration-multi-agents--mémoire-de-session)
4. [Superpowers — Patterns Skills & Bootstrap](#4-superpowers--patterns-skills--bootstrap)
5. [AskUserQuestion — Dialogues Q&A Structurés](#5-askuserquestion--dialogues-qa-structurés)
6. [Écosystème Obsidian+LLM (02.05.2026)](#6-écosystème-obsidianllm-02052026)
7. [Architecture Recommandée pour Malik](#7-architecture-recommandée-pour-malik)
8. [Stack Technique](#8-stack-technique)
9. [Roadmap d'Implémentation](#9-roadmap-dimplémentation)
10. [Références](#10-références)

---

## 1. Contexte & Vision

### Le problème

Malik gère 5+ projets actifs et ~20 en gestation. Chaque projet accumule des notes, URLs, décisions, snippets, références vidéo/audio/photo. Cette connaissance est aujourd'hui **dispersée, non reliée, inaccessible au LLM**.

### La vision

Un **coffre-fort unique** :
- Stocke TOUTES les notes (vidéos, URLs, textes, audio, photos, code)
- **Partagé entre tous les projets** (pas de silos)
- **Navigable par Claude en millisecondes** (pas via grep/read linéaire)
- Reste **lisible par humain** (Obsidian native, markdown)
- **Zéro vendor lock-in** (markdown = format universel)

### Analogie

> "Une boîte aux lettres énorme dans laquelle Claude peut naviguer à vitesse grand V"
> = Obsidian vault + graphe de connaissances + MCP server

---

## 2. Graphify — Brique Infrastructure

> Repo : https://github.com/safishamsi/graphify — Licence MIT — PyPI : `graphifyy`

### Ce que c'est

Graphify transforme n'importe quel dossier de contenu (code, docs, images, vidéos, audio) en un **graphe de connaissances persistant et queryable**. Implémentation du pattern "LLM Wiki" d'Andrej Karpathy — mais avec une infrastructure sérieuse.

### Pipeline en 6 étapes

```
detect() → extract() → build_graph() → cluster() → analyze() → export()
```

| Étape | Ce qu'elle fait |
|-------|----------------|
| **detect** | Scanne récursivement, applique `.graphifyignore` |
| **extract** | AST (tree-sitter, 25 langages) + Whisper (audio/vidéo) + Claude subagents (docs/images) |
| **build** | Fusionne en `nx.Graph`, déduplique par ID normalisé |
| **cluster** | Leiden/Louvain → communautés par densité d'edges |
| **analyze** | God nodes + surprising connections + knowledge gaps |
| **export** | Obsidian vault, HTML interactif, JSON, SVG, Neo4j, wiki |

### Sortie principale

```
graphify-out/
├── graph.json              # Graphe persistant queryable
├── graph.html              # Visualisation interactive
├── GRAPH_REPORT.md         # Résumé : nœuds dieu, surprises, questions suggérées
├── obsidian/               # Vault Obsidian (wikilinks + YAML frontmatter + Dataview)
│   ├── _Community_Auth.md  # Hub par communauté avec live Dataview query
│   └── Node1.md            # 1 fichier par nœud
├── cache/                  # SHA256 (re-run = instant pour fichiers non modifiés)
└── wiki/                   # Wiki agent-crawlable
```

### Points forts à réutiliser

**1. Cache SHA256 + Watch Mode**
```bash
graphify . --update   # Re-extrait seulement les fichiers changés
graphify . --watch    # Observer en temps réel
```
→ Post-commit hook peut trigger `graphify update` → vault toujours à jour

**2. Export Obsidian natif** (sans plugin custom)
- 1 fichier `.md` par nœud avec wikilinks + YAML frontmatter
- 1 hub par communauté avec Dataview live query
- Compatible vanilla Obsidian

**3. MCP Server intégré**
```python
# serve.py expose ces tools MCP :
query_graph(question, mode="bfs|dfs", depth, token_budget)
get_node(label)
shortest_path(source, target)
god_nodes()                    # top-N nœuds les plus connectés
get_community(id)
```
→ Claude interroge via MCP stdio, latence <100ms, pas de re-scan

**4. Transparence EXTRACTED/INFERRED/AMBIGUOUS**
```markdown
- [[SomeClass]] - `implements` [EXTRACTED]
- [[ConfigModule]] - `likely_configures` [INFERRED]
- [[PaymentAPI]] - `possibly_integrates` [AMBIGUOUS]
```
→ On sait exactement ce qu'on a trouvé vs deviné

**5. Cross-project via `merge-graphs`**
→ Fusionner les graphes de N projets → 1 vault multi-project

### Limites

| Limite | Workaround |
|--------|-----------|
| Coût LLM ($3-10/graphe gros corpus) | `--update` (AST only), Ollama fallback |
| Sync Obsidian one-way | Post-edit hook Obsidian → `graphify update` |
| Performance dégradée >10k nœuds | Merger sub-graphs au lieu d'un monolithe |
| Pas d'access control | Permissions per-project à implémenter |

### Fichiers clés du repo

| Fichier | Rôle |
|---------|------|
| `graphify/extract.py` | Tree-sitter 25 langages + Whisper + Claude subagents |
| `graphify/export.py` | Export Obsidian, HTML, JSON, SVG, Neo4j |
| `graphify/serve.py` | MCP stdio server |
| `graphify/cache.py` | SHA256 memoization |
| `graphify/skill.md` | Claude Code skill (entry point) |

---

## 3. Cyrus Agents — Orchestration Multi-Agents + Mémoire de Session

> Repo : https://github.com/cyrusagents/cyrus

### Ce que c'est

Cyrus est un **agent d'orchestration distribué** pour Linear/GitHub/GitLab/Slack. Il automatise les tâches logicielles en intégrant des LLMs (Claude, Gemini, Codex, Cursor) avec le contrôle de version. Il reçoit les webhooks, crée des worktrees Git isolés par issue, lance des sessions d'agents, capture chaque action/pensée en temps réel, et streame les mises à jour dans le fil de l'issue.

**Stack** : TypeScript/Node.js, pnpm, Vitest, Biome, Zod, Fastify

### Architecture en 3 couches

| Couche | Package | Rôle |
|--------|---------|------|
| **Event Transport** | `*-event-transport` | Webhooks → validation signatures → EdgeWorker |
| **EdgeWorker** | `edge-worker` | Orchestrateur central, session lifecycle, état persistant |
| **Runners** | `*-runner` | Wrappers CLI (Claude, Gemini, Codex, Cursor) + streaming |

### Système de mémoire/contexte

**Persistence plate JSON v4.0** :
```typescript
SerializableEdgeWorkerState {
  agentSessions: Map<sessionId, CyrusAgentSession>
  agentSessionEntries: Map<sessionId, CyrusAgentSessionEntry[]>
  childToParentAgentSession: Map<childId, parentId>   // orchestration
  issueRepositoryCache: Map<issueId, string[]>         // multi-repo hints
}
```

**Streaming temps réel** : `StreamingPrompt` = AsyncIterable qui permet d'injecter des messages utilisateur en cours de session sans la relancer — pattern direct pour continuer une conversation.

**Activity Timeline** : Chaque step Claude → entry typée (thought / action / tool_result / response) → postée dans Linear + stockée. Source parfaite pour un log de sessions Obsidian.

### 7 patterns réutilisables pour le vault

1. **Session Entities** → note Obsidian avec frontmatter (sessionId, issueId, status, agentType, repository, branchName)
2. **Activity Log Blocks** → chaque entry → callout horodaté (thought/action avec timestamps)
3. **Repository Config Snapshots** → `config.json` versionné dans `/01-configs/` avec hash
4. **Worktree/Branch Tracking** → note par issue linking worktree path + base branch
5. **Multi-Repo Backlinks** → `issueRepositoryCache` → wikilinks `[[Issue]] → {{Repo1}}, {{Repo2}}`
6. **Streaming State Notes** → reprise mid-conversation sans re-fetch (queue + resolver pattern)
7. **Parent/Child Orchestration** → visualisé comme Dataview relations (workflows visibles en graph)

### Limites à connaître

| Limite | Impact pour vault |
|--------|-------------------|
| Single instance EdgeWorker | Pas de multi-node → acceptable pour usage solo |
| Pas de replay webhook | Pertes possibles si crashs |
| Pas de nettoyage worktrees | Accumulation à gérer manuellement |
| Multi-tenant absent | 1 instance = 1 workspace |

### 5 points clés résumés

1. **Streaming Real-Time** : AsyncIterator + resolver callbacks → entrées horodatées incrémentielles
2. **Flat Persistence v4.0** : Map simple → JSON → prêt pour frontmatter Obsidian + Dataview
3. **Multi-Agent Orchestration** : subroutines (coding → verify → git → summary) avec parent/child tracking
4. **Activity Timeline** : transparence totale chaque pensée/action → idéal pour callout blocks Obsidian
5. **Git Worktree Isolation** : 1 issue = 1 worktree = 1 branche → traçabilité parfaite cross-projets

---

## 4. Superpowers — Patterns Skills & Bootstrap

> Repo : https://github.com/obra/superpowers

### Ce que c'est

Système de **workflows méthodologiques** pour LLMs, bâti sur des skills Markdown + hooks d'auto-déclenchement. Sépare la **discipline métier** (skills stateless) du **contexte projet** (hooks + config).

### Architecture

```
superpowers/
├── skills/
│   ├── brainstorming/SKILL.md
│   ├── writing-plans/SKILL.md
│   ├── test-driven-development/SKILL.md
│   └── ...
├── hooks/
│   ├── hooks.json              # Déclaratif (SessionStart trigger)
│   └── session-start           # Bash script → injection bootstrap
└── .claude-plugin/plugin.json
```

### 3 patterns directement adaptables

**Pattern 1 : SessionStart Bootstrap dynamique**

Au lieu d'un CLAUDE.md statique, injecter le contenu du vault au démarrage :

```bash
# scripts/inject-vault-context.sh
INDEX_SUMMARY=$(head -50 vault/00-index.md | tail -30)
WORKFLOWS=$(ls vault/02-workflows/ | sed 's/.md$//' | tr '\n' ', ')

VAULT_CONTEXT="<VAULT_CONTEXT>
## Navigation
$INDEX_SUMMARY

## Workflows disponibles
$WORKFLOWS
</VAULT_CONTEXT>"

echo "{ \"additionalContext\": \"$VAULT_CONTEXT\" }"
```

Déclenché via `settings.json` hooks SessionStart — déjà en place dans claude-atelier.

**Pattern 2 : Review Loop itérative**

```
spec écrite → reviewer subagent (template markdown) → verdict
→ si ❌ Issues : fix → re-dispatch reviewer → répéter
→ si ✅ Approved : proceed
```

Templates reviewers dans `vault/reviewers/*.md` → lecture + injection en subagent.

**Pattern 3 : Frontmatter YAML standard**

```yaml
---
type: workflow | decision | incident | pattern | reference
audience: all | backend | frontend
status: active | archived | deprecated
last_updated: 2026-05-02
tags: [tdd, testing, auth]
related: [autre-doc-slug]
---
```

→ Parsing simple (50 lignes JS, zero deps) → catalog automatique

### Ce que claude-atelier a de plus que Superpowers

| Fonctionnalité | CA | Superpowers |
|---------------|-----|-------------|
| Mémoire persistante typée | ✅ `memory/` | ❌ Stateless |
| Moteur de recherche hybride | ✅ QMD (BM25 + embeddings) | ❌ Manuel |
| Handoffs inter-LLM | ✅ JSON + GitHub PR | ❌ Absent |

### Ce que Superpowers a de plus que CA

| Fonctionnalité | Superpowers | CA |
|---------------|-------------|-----|
| Bootstrap dynamique | ✅ Session-start hook | ⚠️ §0 statique |
| Review loops obligatoires | ✅ Spec → Plan → Impl | ⚠️ Ad-hoc |
| Pédagogie intégrée | ✅ Good/Bad blocs + Red Flags | ⚠️ Dispersé |

---

## 5. AskUserQuestion — Dialogues Q&A Structurés

### Ce que c'est

Outil natif Claude Code pour **interrompre l'exécution** et poser des questions structurées à l'utilisateur. Remplace les longs dialogues par des échanges Q&A directs avec options numérotées.

### Contraintes techniques

| Paramètre | Valeur |
|-----------|--------|
| Questions par appel | 1 à 4 max |
| Options par question | 2 à 4 max |
| Timeout | **60 secondes** |
| Disponible en subagent | **❌ NON** |
| Disponible via TTY/SDK | Dépend de l'environnement |

### Structure

```json
{
  "questions": [
    {
      "question": "Description claire de la décision",
      "header": "Q1",
      "options": [
        { "label": "Option A — description", "header": "A" },
        { "label": "Option B — description", "header": "B" },
        { "label": "Option C — description", "header": "C" }
      ]
    }
  ]
}
```

### Usage dans les skills

```markdown
---
name: vault-ingest
description: Ingérer une source dans le vault
askOnStart: true
---

Avant d'ingérer, clarifier le type de source :
- question: "Type de contenu ?"
  options: ["URL web", "Fichier local", "Note rapide", "Médias (audio/vidéo)"]
```

### Bonnes pratiques UX

1. **Plan Mode > Exécution** — poser les questions avant d'agir
2. **1-2 questions max** — au-delà de 2, l'utilisateur abandonne
3. **Options mutuellement exclusives** — A ou B, jamais "A et/ou B"
4. **Fallback texte libre** — accepter si l'utilisateur tape hors options
5. **Grouper les décisions liées** — "Architecture de déploiement" (4 options) > 4 questions séquentielles

### Cas d'usage idéaux pour le vault

```
/vault-ingest  → "Quel type de source ?" (URL / Fichier / Note / Média)
/vault-query   → "Scope de recherche ?" (Projets actifs / Tout / Projet spécifique)
/vault-review  → "Action ?" (Créer design / Réviser existant / Archiver)
```

### Limitation critique

**AskUserQuestion non disponible dans les subagents.** Si un subagent a besoin de clarification, il doit retourner une structure JSON signalant le besoin → le parent Claude utilise AskUserQuestion :

```json
{
  "status": "need_clarification",
  "question": "Quel projet cible pour cet ingestion ?",
  "options": ["claude-atelier", "PaperClip", "Nouveau projet"]
}
```

---

## 6. Écosystème Obsidian+LLM (02.05.2026)

### Top 5 Plugins Obsidian pour LLM

**1. Claudian** ⭐ Meilleur pour Claude Code
- Claude Code embarqué en sidebar Obsidian
- Le vault **devient** le dossier de travail de Claude
- Read/write/edit fichiers, bash, search vault, multi-step workflows
- Requis : Obsidian 1.8.9+, Claude Code CLI, clé Anthropic
- Repo : https://github.com/YishenTu/claudian

**2. Smart Connections** ⭐ Référence mémoire sémantique
- Embeddings + chat avec les notes + discovery de liens connexes
- Ollama intégré nativement (full offline, zéro API)
- Modèles : Claude, ChatGPT, Gemini, Llama 3, Ollama
- Repo : https://github.com/brianpetro/obsidian-smart-connections

**3. obsidian-claude-code-mcp** ⭐ Meilleur multi-projets
- MCP via WebSocket (port 22360) + HTTP/SSE
- Auto-découverte, ports uniques par vault
- Compatible Claude Code + Claude Desktop
- Repo : https://github.com/iansinnott/obsidian-claude-code-mcp

**4. Copilot for Obsidian** (100k+ users)
- Multi-provider, lexical + semantic indexing
- Vault-wide context
- Site : https://www.obsidiancopilot.com/en

**5. Brain** (semantic search minimal)
- Vector-based search via MCP tools
- Pattern Karpathy LLM Wiki
- Repo : https://github.com/samleeney/brain

### MCPs Obsidian disponibles

| MCP | Protocole | Clients | Notes |
|-----|-----------|---------|-------|
| `mcp-obsidian` | REST API | Claude Desktop | Community plugin requis |
| `obsidian-claude-code-mcp` | WebSocket 22360 + HTTP/SSE | Claude Code + Desktop | Auto-discovery, multi-vault |
| `obsidian-mcp-tools` | MCP natif | Claude Desktop | Semantic search builtin |
| `Brain` | MCP Anthropic | Claude Code + Desktop | Minimaliste, Karpathy pattern |

### Comparaison des outils "second brain"

| Aspect | Obsidian | Notion | Logseq | Roam |
|--------|----------|--------|--------|------|
| LLM Access | Any (MCP) | Notion AI only | Local + cloud | Limité |
| Offline | ✅ Full | ❌ Cloud | ✅ Full | ❌ Cloud |
| Markdown natif | ✅ | ❌ Notion DB | ✅ | ❌ Propriétaire |
| Dev-friendly | ✅ Excellent | ❌ | ✅ Good | ❌ |
| Prix | $1-10/mois | $10-20/user | Gratuit + $5/mois | $99/an |
| **Verdict** | **🏆 Dev+LLM** | Équipe | Budget | Historique |

---

## 7. Architecture Recommandée pour Malik

### Structure du vault

```
~/Obsidian/Master-Vault/
├── 00-index.md                      # TOC + navigation (injection SessionStart)
├── 01-principles/                   # Valeurs, philosophie, anti-patterns
│   └── rationalization-blockers.md
├── 02-workflows/                    # Patterns métiers (= skills Superpowers)
│   ├── brainstorming.md
│   ├── planning.md
│   ├── code-review.md
│   └── vault-ingest.md
├── 03-decisions/                    # ADR — Architecture Decision Records
│   └── 2026-05-01-vault-architecture.md
├── 04-incidents/                    # Post-mortems
├── 05-references/                   # Sources externes, URLs
├── Projects/                        # Liens croisés par projet
│   ├── claude-atelier/
│   ├── PaperClip/
│   └── ...
├── raw/                             # Ingestions brutes (git-ignoré)
│   ├── articles/
│   ├── videos/
│   └── notes/
├── graphify-out/                    # Graphe Graphify (graph.json + obsidian/)
└── reviewers/                       # Templates review (Superpowers pattern)
    └── design-checker.md
```

### Flux d'ingestion

```
Source (URL / fichier / note) 
  → /vault-ingest (AskUserQuestion: type ?)
  → graphify add <source>
  → graphify update (incrémental, <10s)
  → Obsidian vault mis à jour (wikilinks + frontmatter)
  → Claude peut requêter via MCP query_graph
```

### Flux de query

```
Claude Code (n'importe quel projet)
  → MCP tool: query_graph("comment X s'intègre à Y ?", mode="bfs", depth=3)
  → graphify serve → traverse graph.json (<100ms)
  → Retourne contexte pertinent (budget tokens contrôlé)
```

### Connexion multi-projets

```
~/Projets/claude-atelier/  → `graphify merge` → Master-Vault/graphify-out/
~/Projets/PaperClip/       →        ↑
~/Projets/side-project-1/  →        ↑
...
```

1 seul graph.json cross-project → Claude voit les connexions entre projets

---

## 8. Stack Technique

### Tier 1 — Socle (~2h)

| Composant | Installation | Rôle |
|-----------|-------------|------|
| Obsidian | Application desktop | Interface humain |
| Graphify | `uv tool install graphifyy` | Graphe de connaissances |
| Claudian | Plugin Obsidian community | Claude Code sidebar |
| obsidian-local-rest-api | Plugin Obsidian community | Bridge MCP |

### Tier 2 — Optimisation (~1h)

| Composant | Installation | Rôle |
|-----------|-------------|------|
| Smart Connections | Plugin Obsidian community | Embeddings sémantiques |
| Ollama local | `ollama serve` (déjà dans CA) | Embeddings offline |
| obsidian-claude-code-mcp | npm install | Multi-vault WebSocket |

### Tier 3 — Automation (~2h)

| Composant | Script | Rôle |
|-----------|--------|------|
| Post-commit hook | `graphify update` | Vault toujours à jour |
| inject-vault-context.sh | SessionStart hook | §0 dynamique |
| ingest.sh | Script bash | Ingestion source → vault |
| vault skills | `.claude/skills/vault-*.md` | Interface Claude |

### Configuration MCP dans claude-atelier

```json
// .claude/settings.json
{
  "mcpServers": {
    "graphify-vault": {
      "command": "graphify",
      "args": ["serve", "~/Obsidian/Master-Vault/graphify-out/graph.json"],
      "env": {}
    },
    "obsidian-rest": {
      "command": "npx",
      "args": ["-y", "obsidian-claude-code-mcp"],
      "env": { "OBSIDIAN_PORT": "22360" }
    }
  }
}
```

---

## 9. Roadmap d'Implémentation

### Phase 1 — Bootstrap vault (1-2h)
- [ ] Installer Obsidian + Graphify (`uv tool install graphifyy`)
- [ ] Créer structure `~/Obsidian/Master-Vault/`
- [ ] Run initial : `graphify ~/Obsidian/Master-Vault/raw --obsidian`
- [ ] Installer plugin Claudian dans Obsidian
- [ ] Tester : ouvrir Claudian sidebar → naviguer dans vault

### Phase 2 — MCP Server (30min)
- [ ] Ajouter `graphify-vault` dans `.claude/settings.json`
- [ ] Tester : `mcp__graphify__query_graph question="test"`
- [ ] Valider latence <100ms sur query simple

### Phase 3 — Ingestion workflow (1h)
- [ ] Créer skill `/vault-ingest` avec AskUserQuestion
- [ ] Script `scripts/vault-ingest.sh <source>`
- [ ] Tester : ingérer 1 URL + 1 note → voir dans Obsidian graph

### Phase 4 — SessionStart dynamique (1h)
- [ ] Créer `scripts/inject-vault-context.sh` (pattern Superpowers)
- [ ] Brancher sur hook SessionStart existant
- [ ] Vérifier injection au démarrage session

### Phase 5 — Multi-projets (2h)
- [ ] Script de merge multi-repos : `graphify merge proj1 proj2 ... vault/`
- [ ] Cron ou post-commit sur chaque projet actif
- [ ] Valider requêtes cross-project

### Estimation totale : ~6-7h

---

## 10. Références

### Repos analysés
- [Graphify](https://github.com/safishamsi/graphify) — Infrastructure graphe de connaissances
- [Superpowers](https://github.com/obra/superpowers) — Skills méthodologiques + bootstrap
- [Claudian](https://github.com/YishenTu/claudian) — Claude Code sidebar Obsidian
- [obsidian-claude-code-mcp](https://github.com/iansinnott/obsidian-claude-code-mcp) — MCP multi-vault
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) — Embeddings sémantiques
- [Brain](https://github.com/samleeney/brain) — Semantic search minimal

### Articles & Documentation
- [Obsidian + Claude Code Integration Guide](https://blog.starmorph.com/blog/obsidian-claude-code-integration-guide)
- [MCPVault — Obsidian as Live Agent Memory](https://medium.com/@ai_transfer_lab/mcpvault-the-claude-skill-that-turns-obsidian-into-a-live-agent-memory-6f3aca3dfc4c)
- [Partner OS — Claude MCP + Obsidian setup](https://erickhun.com/posts/partner-os-claude-mcp-obsidian/)
- [AskUserQuestion — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/user-input)
- [Karpathy LLM Wiki Pattern](https://github.com/NicholasSpisak/second-brain)

### Outils complémentaires
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) — Bridge MCP
- [mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian) — REST → MCP
- [obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools) — MCP natif

---

*Document généré le 02.05.2026 — claude-atelier v0.23.0*
*Analyse : 4 agents parallèles (Graphify, Superpowers, AskUserQuestion+Obsidian LLM, Cyrus)*
*Cyrus : analyse partielle, rapport Graphify+Superpowers prioritaire*
