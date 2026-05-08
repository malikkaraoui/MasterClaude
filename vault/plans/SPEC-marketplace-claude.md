---
title: SPEC — Marketplace inter-agents Claude
author: MasterClaude (agent Haiku)
date: 2026-05-08
status: draft
phase: planning
references:
  - "Project Deal: https://www.anthropic.com/features/project-deal"
  - "Anthropic Multi-Agent Research: https://www.anthropic.com/engineering/multi-agent-research-system"
  - "Pinchwork (task marketplace): GitHub"
  - "Yoyo (social network for AI agents): GitHub"
  - "Claude Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview"
---

# SPEC — Marketplace inter-agents Claude

## Vision

Lorsqu'un agent Claude (MasterClaude, Idriss, Léonor, ou agents tiers) n'est plus occupé, il peut proposer ses ressources (capacité de traitement, MCPs, outils) sur une **marketplace décentralisée**. Des tâches sont affichées : research, data processing, file encoding, etc. Les agents bidouille, se mettent d'accord sur un prix (crédits internes ou API calls Anthropic à crédit), et les agents qui remportent le bid exécutent la tâche. Revenue = crédit API remboursé à Malik, ou partage de profit. C'est le premier pas vers une **économie inter-agents autonome**.

---

## État du marché (ce qui existe)

### Anthropic Reference Projects

| Projet | Lien | Statut | Observation |
|--------|------|--------|-------------|
| **Project Deal** | https://www.anthropic.com/features/project-deal | ✅ Livré (déc 2025) | Marketplace expérimentale où les employés Anthropic remplacent humains par agents Claude dans une vraie transaction commerciale (achat/vente marketplace). 4 versions avec Opus 4.5 et Haiku 4.5 compétissent. Preuve de concept : agents autonomes peuvent négocier et conclure des deals réels. Non open-source ; scénario propriétaire. |
| **Claude Managed Agents** | https://platform.claude.com/docs/en/managed-agents/overview | ✅ Livré (2026) | Infrastructure managée par Anthropic pour déployer et exécuter des agents sans gérer l'infrastructure. Inclut auth, sandboxing, outils. Ne cible pas inter-agent task distribution (c'est B2B agent-as-a-service, pas peer-to-peer). |
| **Agent Skills Specification** | Décembre 2025 — standard Anthropic + OpenAI | ✅ Standard accepté | Spécification ouverte pour distribuer et réutiliser des "skills" (MCP servers, tools, workflows). OpenAI/Codex aussi adopté. Permet aux agents de découvrir/charger des skills dinamiquement. |
| **Multi-Agent Research System** | https://www.anthropic.com/engineering/multi-agent-research-system | ✅ Livré (interne) | Orchestre un lead agent + N subagents parallèles. Pattern clé : delegation + execution isolation. Pas une marketplace — c'est une pattern de orchestration (ne traite pas task bidding/auction). |

### GitHub Active Projects

| Projet | Lien | Statut | Observation |
|--------|------|--------|-------------|
| **Pinchwork** | GitHub (non confirmé — à vérifier) | 🔍 Candidat | Marketplace open-source agent-to-agent task où agents délèguent, pickent du travail, gagnent des crédits. REST API, Python SDK, intégrations LangChain/CrewAI/MCP. Non confirmé en recherche web — repéré dans liste secondaire. À explorer. |
| **Yoyo** | GitHub (non confirmé — à vérifier) | 🔍 Candidat | Réseau social premier pour agents AI. Agents connectables via MCP, post/chat/follow/discover/reputation. 10 MCP tools natifs, open-source. Focus : social graph et discovery, moins sur task distribution. À explorer. |
| **Human Pages** | GitHub/API | 🔍 Candidat | MCP server pour agents chercher des humains (skill + location), envoyer offres, messaging. Inverse de task marketplace (humains = ressource matchée). À explorer. |
| **500 AI Agents Projects** | https://github.com/ashishpatel26/500-AI-Agents-Projects | ✅ Curated list | Référence de 500+ cas agent actuels. Aucun n'est une marketplace inter-agent propriée ; tous sont single-agent ou orchestration fermée. |

### Synthèse du marché

**Non confirmé en open-source : une véritable marketplace peer-to-peer inter-agents Claude avec bid/assign/settle.** Il y a Pinchwork (candidat fort), des réseaux sociaux d'agents (Yoyo), mais rien de documenté publiquement comme standard ou référence de production.

**Anthropic n'a pas ouvert de marketplace inter-agents** — Project Deal était expérimental + interne. Managed Agents = infrastructure, pas marketplace.

**Conclusion** : le terrain est vierge pour MasterClaude. Aucun concurrent documenté en prod.

---

## Architecture proposée

### Composants clés

#### 1. **Task Broker** (Golang + HTTP)
- **Rôle** : Registry de tâches disponibles + matching engine.
- **API** :
  - `POST /tasks` — Agent soumet une tâche (titre, description, tools nécessaires, bid max, deadline).
  - `GET /tasks?filter=available` — Liste tâches pas assignées.
  - `POST /tasks/:id/bid` — Agent soumets une offre (prix en crédits, ETA).
  - `GET /tasks/:id/bids` — Voir les bids existants (closed auction si past deadline).
  - `POST /tasks/:id/assign` — Task creator accepte un bid → tâche assignée à agent.
- **Storage** : SQLite (parachute déjà present, réutiliser).
- **Pattern** : auction simple (first-price sealed bid, deadline = 5–30 min selon task).

#### 2. **Agent Registry** (HTTP)
- **Rôle** : Chaque agent publie sa capacité ("je suis libre avec 20% contexte restant + MCPs [qmd, obsidian, github]").
- **API** :
  - `POST /agents/register` — Agent enregistre profil + tools + availability.
  - `GET /agents?tools=qmd,obsidian` — Cherche agents ayant certains tools.
  - `POST /agents/:id/heartbeat` — Agent signale "je suis vivant".
- **Storage** : Redis (cache) + SQLite (persistance).
- **TTL** : registration expire en 24h sans heartbeat.

#### 3. **Execution Engine** (Node.js)
- **Rôle** : Agent assigné exécute la tâche en session isolée.
- **Pré-requis** : tâche = code + inputs + spec sortie.
- **Pattern** :
  1. Tâche reçue via broker.
  2. Nouveau processus `claude` lancé avec cwd/context spécifique (worktree si complexe).
  3. Agent execute + récolte output.
  4. Output signé + hashé → broker confirmé.
  5. Task creator valide output + release paiement.
- **Fallback** : si agent crash, task relancée à un autre agent.

#### 4. **Payment Ledger** (SQLite + Anthropic Credit API)
- **Rôle** : Tracking crédit inter-agents.
- **Model** :
  - `[from_agent_id, to_agent_id, amount_credits, task_id, status:pending|confirmed|disputed]`
  - Tous en crédits internes (1 crédit = ~0.001 USD, Anthropic API cost basis).
- **Règlement** :
  - Malik configure `ANTHROPIC_CREDIT_ACCOUNT` (API key pour bulk credit purchase).
  - À fin de cycle (mensuel), tâches complétées → crédits "cashed out" → API calls Anthropic remboursées à Malik.
  - Optionnel : profit-share si tâche créée par Malik et réalisée par agent (ex: 10% Malik, 90% agent).

#### 5. **Task Runner CLI** (bin/task-runner)
- **Rôle** : Interface agent pour prendre du travail.
- **Commandes** :
  - `task-runner available` — Liste tâches + bids gagnants.
  - `task-runner accept :id` — Accepte une tâche assignée.
  - `task-runner execute :id` — Lance Claude session isolée pour tâche.
  - `task-runner report :id [output]` — Soumet résultat.
- **Intégration** : peut être triggering automatiquement via scheduler (`task-runner auto` = boucle qui accepte tâches libres).

### Flux d'exécution

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Task Creation                                             │
├──────────────────────────────────────────────────────────────┤
│ Malik / Agent crée tâche :                                  │
│  POST /tasks                                                │
│  {                                                           │
│    "title": "Analyze 100 GitHub PRs for security issues",   │
│    "description": "Use GitHub MCP to scan repos...",        │
│    "tools_required": ["github", "qmd"],                     │
│    "bid_max_credits": 50,                                   │
│    "deadline_minutes": 60,                                  │
│    "output_spec": "JSON array of findings"                  │
│  }                                                           │
│  → Task ID created, listed in /tasks?filter=available      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. Agent Discovery & Bidding                                 │
├──────────────────────────────────────────────────────────────┤
│ Agent (e.g., Léonor) sees /tasks, filters by tools         │
│ → Has [github, qmd] ✓ ; context available 30% ✓           │
│                                                              │
│ POST /tasks/:id/bid                                         │
│ {                                                           │
│   "agent_id": "leonor",                                    │
│   "bid_price": 35,  # moins que max (économique)          │
│   "eta_minutes": 15                                        │
│ }                                                           │
│ → Bid enregistré, 3 autres agents bident aussi             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. Auction Closes & Assignment                               │
├──────────────────────────────────────────────────────────────┤
│ Deadline hit. Broker sélectionne lowest-price bid:         │
│  → Agent Léonor (35 credits) gagne                         │
│                                                              │
│ POST /tasks/:id/assign                                      │
│ {                                                           │
│   "winning_agent": "leonor",                               │
│   "bid_accepted": 35                                       │
│ }                                                           │
│ → Task status = ASSIGNED, blocked pour autres agents       │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. Execution                                                  │
├──────────────────────────────────────────────────────────────┤
│ Léonor calls:                                               │
│  task-runner accept :id                                    │
│  task-runner execute :id                                   │
│                                                              │
│ Spawns new Claude session + context:                       │
│  TASK_ID=:id TASK_SPEC="{...}" claude --project marketplace│
│                                                              │
│ Claude reads task_spec, exécutes (15 min ETA), récolte     │
│ résultat structuré.                                        │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. Settlement & Validation                                    │
├──────────────────────────────────────────────────────────────┤
│ Léonor reports:                                             │
│  task-runner report :id [JSON output]                      │
│  → Signature check + hash verification                     │
│                                                              │
│ Task Creator validates:                                     │
│  POST /tasks/:id/validate                                  │
│  { "approved": true }                                       │
│                                                              │
│ Ledger update:                                              │
│  INSERT INTO ledger:                                        │
│  (creator_id, executor_id, amount=35, task_id, status)    │
│  status = CONFIRMED                                        │
│                                                              │
│ → Crédit transféré Malik → Léonor (ou décentralisé)       │
└──────────────────────────────────────────────────────────────┘
```

---

## MVP minimal (réalisable semaine 1–2, stack actuelle)

### Périmètre MVP

1. **Task Broker HTTP** (Go, dans `parachute/`)
   - `POST /tasks` + `GET /tasks` + `POST /tasks/:id/bid` + `POST /tasks/:id/assign`
   - SQLite dans `parachute/store/` existant (réutiliser).
   - Pas d'orchestration d'exécution — manuel pour MVP.

2. **Agent Registry** (HTTP simple)
   - `POST /agents/register` — fichier JSON local ou Redis simple (en-mémoire).
   - `GET /agents?tools=...` — basic filtering.
   - Heartbeat = touch de fichier dans `/tmp/agents/`.

3. **Task Runner CLI** (Node.js, `bin/task-runner`)
   - `task-runner available` — appelle broker, affiche tâches.
   - `task-runner bid :id --price 30 --eta 20` — soumets un bid.
   - `task-runner report :id --output '[...]'` — valide et enregistre.
   - Pas de spawn Claude isolé : l'agent run la tâche manuellement dans sa session, copie/colle résultat dans CLI.

4. **Ledger simple** (SQLite)
   - Table `ledger(id, from_agent, to_agent, amount, task_id, status, created_at)`.
   - Pas de règlement automatique — trace seulement.

5. **Manual Test Scenario**
   - Malik crée une tâche (curl) : "résume cet article en 200 mots".
   - Deux agents (Idriss, Léonor) bident (CLI).
   - Malik accepte le meilleur bid (curl).
   - Agent exécute manuellement, reporte output (CLI).
   - Malik valide (curl) → ledger confirmée.

### Dépendances (existantes dans MasterClaude)

- ✅ **parachute** (Go daemon) — utiliser pour broker.
- ✅ **Node.js** — CLI + bridge.
- ✅ **SQLite** — parachute/store/ déjà présent.
- ✅ **Agent introspection** — `CLAUDE_PID`, `CLAUDE_PROJECT` déjà dans master.js.

### Code skeleton (pseudo)

**Go Broker** (`parachute/internal/marketplace/broker.go`)
```go
type Task struct {
  ID        string    `json:"id"`
  CreatorID string    `json:"creator_id"`
  Title     string    `json:"title"`
  Status    string    `json:"status"` // "open", "assigned", "completed"
  Bids      []Bid     `json:"bids"`
  CreatedAt time.Time `json:"created_at"`
}

type Bid struct {
  AgentID string `json:"agent_id"`
  Price   int    `json:"price_credits"`
  ETA     int    `json:"eta_minutes"`
}

// HTTP routes
POST   /tasks              → CreateTask
GET    /tasks              → ListTasks (filters: status, tools_required)
POST   /tasks/:id/bid      → SubmitBid
POST   /tasks/:id/assign   → AssignTask (task creator)
POST   /tasks/:id/validate → ConfirmCompletion + settle ledger
```

**Node.js CLI** (`bin/task-runner`)
```bash
task-runner available        # GET /tasks?status=open
task-runner bid :id --price P --eta E
task-runner report :id --output JSON  # POST /tasks/:id/validate
```

---

## Roadmap phases

### Phase 1 : MVP (Semaine 1–2)
- [ ] Task Broker HTTP + SQLite (parachute).
- [ ] Agent Registry simple (JSON file + heartbeat).
- [ ] Task Runner CLI (bid, report).
- [ ] Ledger table + manual settlement.
- [ ] Manual end-to-end test (Malik créateur, Idriss/Léonor exécuteurs).

### Phase 2 : Auto-execution (Semaine 3–4)
- [ ] Spawn Claude en session isolée depuis broker (worktree + context inject).
- [ ] Output validation (schema check + signature verify).
- [ ] Auto-heartbeat d'agents (hook SessionStart).
- [ ] Task assignment → auto-accept si agent libre (daemon loop).

### Phase 3 : Monétisation (Mois 2)
- [ ] Intégration Anthropic API credit account.
- [ ] Settlement automatique (chaque fin-de-tâche → ledger → credit transfer).
- [ ] Dashboard (état ledger, agents actifs, tâches complétées).
- [ ] Profit-sharing policy configurable.

### Phase 4 : Décentralisation (Mois 3+)
- [ ] Multi-Malik support (plusieurs utilisateurs = plusieurs instances parachute).
- [ ] Ethereum/Polygon payment layer (optionnel — plus tard, si traction).
- [ ] Cross-project task distribution (MasterClaude ↔ atelier ↔ autres repos).

---

## Risques et questions ouvertes

### Risques

| Risque | Probabilité | Mitigation |
|--------|-------------|-----------|
| **Timeout d'exécution** | Élevée | ETA souvent faux. Solution : deadline flexible + retry budget (3 tentatives). |
| **Output non validable** | Moyenne | Spécifier schema strictement (JSON schema). Validateur dans broker. |
| **Collision de ressources** (deux agents sur même file) | Moyenne | Mutex Redis ou SQLite row locking. |
| **Credit abuse** (agent bid 1 crédit pour tâche 50-crédit) | Basse | Blanc-seing du créateur au moment du bid acceptance. Immuable. |
| **Ghost tasks** (agent assign mais pas execute) | Moyenne | Timeout = 3× ETA → tâche back to open, bid fee déductible. |
| **Anthropic API cost > revenue** | Élevée | MVP = pas monétisation. Phase 3 = pricing calibration. |

### Questions ouvertes

1. **Monnaie** : Crédits API Anthropic ? Crypto ? Fiat ? → Réponse Phase 3.
2. **Pricing** : Comment calibrer le prix par tâche ? Complexité ? Token count ? → À explorer.
3. **Reputation** : Agents avec mauvaise track record → baissent-ils ? Ou kick-out ? → MVP = aucune, Phase 2 = simple score (tasks_completed / tasks_attempted).
4. **Inter-project** : Les agents d'un projet peuvent-ils bidder sur tâches d'un autre ? → À décider (prob non en MVP).
5. **Malik exclusivity** : C'est sa marketplace privée ? Ou open à d'autres users ? → Spec dit privé (son usage personnel), mais archit extensible.

---

## Conclusion

Cette spec trace un **marketplace peer-to-peer inter-agents opérationnel** en 2 semaines MVP, puis extensible vers monétisation. L'existant (Pinchwork, Project Deal) valide le concept ; aucun concurrent en prod open-source. MasterClaude a l'occasion d'être first-mover dans cette niche : **agents Claude autonomes qui se vendent du travail l'un l'autre**.

**Next step** : valider l'architecture avec Malik, puis lancer Phase 1 (broker Go + CLI Node).
