# PLAN — parachute v0.2.0 → v1.0.0

> Roadmap modernisée après recherche 2025-2026 (sub-agent web research, voir handoff). Stack cible **zéro infra externe** : un binaire Go, SQLite pur-Go, Unix socket, telego, Prometheus natif. Le tout local-first.

## Stack cible (validé par recherche)

| Composant | Choix | Pourquoi |
|---|---|---|
| HTTP/IPC interne | **Unix domain socket** (`/tmp/parachute.sock`) | ~50% latence vs TCP loopback (130µs vs 334µs). Sécurité kernel. Zéro deps. |
| HTTP externe (debug, hooks legacy) | net/http standard sur 127.0.0.1:4001 | Conservé pour curl/cc-parachute legacy. |
| State storage | **modernc.org/sqlite** (pure-Go) | Pas de CGo, cross-compile trivial, SQL queryable. |
| Telegram bot | **mymmrac/telego** | Best-in-class 2025, long-polling+webhook mixtes, handlers net/http-like. |
| Process supervision interne | **oklog/run** | 2 goroutines pattern, graceful shutdown trivial. Pas de PM2/runit. |
| Supervision externe | LaunchAgent macOS standard | Déjà en place. |
| Logs | `log/slog` JSON | Standard Go ≥1.21. |
| Metrics | **prometheus/client_golang** + `/metrics` | Native, 0.5-1% CPU. Pas d'OTel (overkill). |
| Tracing | aucun | Logs+metrics suffisent pour usage perso. |

## Étape 2 — Bridge Telegram natif (priorité haute)

**Objectif** : `parachute` polle Telegram directement, plus besoin de `master.js` Node pour le bridge.

- [ ] Ajouter `telego` (`go get github.com/mymmrac/telego`)
- [ ] `internal/telegram/bot.go` : long polling, dispatch handlers
- [ ] Handlers : `/help`, `/health`, `/migrate [raison]`, `/sessions`, freeform → route vers session active
- [ ] Dédup messages via SQLite (table `telegram_inbox` avec `message_id` unique)
- [ ] Worker queue : `telegram_outbox` table (status `pending|sent|failed`) + retry exponentiel
- [ ] Auth : whitelist `chat_id` (env `PARACHUTE_TG_ALLOWED_CHAT_IDS`)
- [ ] Tests : mock Telegram API via httptest

**Migration `master.js` → `parachute`** : feature flag `PARACHUTE_TELEGRAM_TAKEOVER=1`. Quand actif, `master.js` désactive son polling Telegram et déléguer à parachute via socket.

## Étape 3 — Orchestrateur sessions (priorité haute)

**Objectif** : `parachute` gère le cycle de vie des sessions Claude (spawn/kill/health).

- [ ] `internal/sessions/manager.go` : map `projectKey → SessionState{pid, ppid, claudePid, startedAt, lastHeartbeat}`
- [ ] Spawn via osascript wrapper (porté depuis `wake-claude.sh`)
- [ ] Heartbeat : Claude écrit `/tmp/parachute.sock` périodiquement (via cc-parachute heartbeat) → table `session_heartbeats`
- [ ] Détection mort : pas de heartbeat depuis 2× interval → kill propre + alerte Telegram
- [ ] Mutex spawn (déjà en place côté master.js, à porter)

## Étape 3b — Vault Malik : injection contexte global au spawn session

**Objectif** : chaque nouvelle session Claude reçoit au boot le contexte global Malik (Vault Obsidian) + le handoff de la session précédente. Continuité cross-sessions sans mémoire conversationnelle.

### Flux complet

```
parachute spawn(projectKey)
  │
  ├─ 1. vault-loader lit /Users/malik/Vault/Malik/
  │       → PETER_REPORT.md (si < 2h) OU fallback vault/00-brief.md
  │       → vault/20-decisions.md (décisions durables)
  │       → vault/30-discoveries.md (découvertes récentes, 10 dernières)
  │       → Assemble VaultContext{summary, decisions, discoveries}
  │
  ├─ 2. handoff-loader lit SQLite
  │       → SELECT body FROM handoffs WHERE project_key=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1
  │       → HandoffContext{taskSummary, nextStep, openTodos, warnings}
  │
  ├─ 3. context-builder assemble le system prompt d'injection
  │       → template Go : vault_context.tmpl
  │       → Résultat : bloc markdown < 800 tokens (budget fixe)
  │
  └─ 4. spawn claude --append-system-prompt "$(context)" --cwd /Users/malik/<project>
```

### Implémentation Go

- [ ] `internal/vault/loader.go`
  - `LoadVaultContext(vaultPath string) (VaultContext, error)`
  - Lit PETER_REPORT.md si `mtime < 2h`, sinon reconstruit depuis `00-brief.md` + `20-decisions.md` + `30-discoveries.md`
  - Troncature à 600 tokens max (approximation : 4 chars/token)
- [ ] `internal/vault/template.go`
  - Template `vault_context.tmpl` : section Vault + section Handoff dans un bloc `<system-context>`
  - Budget strict : vault ≤ 600 tokens, handoff ≤ 200 tokens, total ≤ 800 tokens
- [ ] `internal/sessions/manager.go` (extension Étape 3)
  - Appel `vault.LoadVaultContext` + `handoff.LoadUnconsumed` avant chaque spawn
  - Flag `--append-system-prompt` passé à `claude` CLI
- [ ] Schema SQLite (extension) :
  ```sql
  CREATE TABLE vault_snapshots (
    id INTEGER PRIMARY KEY,
    project_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    vault_hash TEXT NOT NULL,   -- SHA256 du contenu injecté
    token_count INTEGER NOT NULL
  );
  ```
- [ ] Tests :
  - `TestLoadVaultContext_FreshReport` : PETER_REPORT.md récent → utilisé
  - `TestLoadVaultContext_StaleReport` : PETER_REPORT.md > 2h → fallback 00-brief.md
  - `TestBuildContextUnder800Tokens` : troncature correcte
  - `TestSpawnInjectsVaultContext` : mock spawn, vérifie `--append-system-prompt` présent

### Règles de budget token

| Source | Max tokens | Priorité |
|---|---|---|
| Handoff (tâche courante) | 200 | 1 — jamais tronqué |
| vault/00-brief.md (état projet) | 200 | 2 |
| vault/20-decisions.md (décisions) | 150 | 3 |
| vault/30-discoveries.md (10 dernières) | 150 | 4 |
| vault/40-roadmap.md (sur le feu) | 100 | 5 — tronqué en premier |
| **Total** | **800** | |

### Invariants

- Si vault inaccessible → spawn quand même, log warning, Telegram alerte
- Si PETER_REPORT.md absent → fallback 00-brief.md sans erreur
- Vault injecté en lecture seule — parachute ne modifie jamais les fichiers vault
- Hash SHA256 du contexte injecté stocké dans `vault_snapshots` (traçabilité)

## Étape 4 — Health pings + alertes Telegram automatiques

- [ ] `internal/health/checker.go` : check master.js, ollama-proxy, parachute lui-même, FIFO Telegram
- [ ] Si composant down >2 cycles : envoie Telegram « ⚠ X est down depuis Ys »
- [ ] `/metrics` Prometheus : `parachute_component_up{name=...}`, `parachute_session_count`, `parachute_handoff_total`, `parachute_vault_inject_tokens{project=...}`
- [ ] Dashboard Grafana optionnel (mais pas requis pour MVP)

## Étape 5 — Migration handoff via Unix socket

**Objectif** : remplacer le polling de fichiers `/tmp/masterclaude-handoff-*.json` par un protocole `parachute` natif.

- [ ] Endpoint Unix socket : `POST /v1/migrate` (Claude pousse handoff + signal "ready to die")
- [ ] `parachute` répond `200 OK`, écrit handoff en SQLite, kill l'ancienne session, spawn nouvelle
- [ ] Session nouvelle au boot : `cc-parachute consume <projectKey>` (HTTP ou socket) → reçoit handoff JSON
- [ ] Migration legacy : `hooks/session-handoff-restore.sh` modifié pour appeler `cc-parachute consume` avant fallback `cat /tmp/*.json`
- [ ] Schema SQLite :
  ```sql
  CREATE TABLE handoffs (
    id INTEGER PRIMARY KEY,
    project_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMP NULL,
    body JSON NOT NULL
  );
  CREATE INDEX idx_project_unconsumed ON handoffs (project_key, consumed_at);
  ```

## Étape 6 — Migration legacy ⇒ parachute (cutover)

- [ ] `master.js` devient un thin wrapper qui forward tout à parachute via socket
- [ ] Feature flags séquentielles : `PARACHUTE_TELEGRAM_TAKEOVER`, `PARACHUTE_SESSION_TAKEOVER`, `PARACHUTE_HANDOFF_TAKEOVER`
- [ ] Une fois tous activés en prod stable 1 semaine → suppression `master.js` (devient un script de transition)

## Étape 7 — Fonctionnalités v1.0

- [ ] Sub-commands `cc-parachute logs`, `cc-parachute sessions`, `cc-parachute restart <projectKey>`
- [ ] WebUI minimaliste (Go embed + fetch) sur `/dashboard` : sessions actives, handoffs récents, derniers messages Telegram
- [ ] Multi-projets : un parachute, N projets routables (clé = `projectKey`)
- [ ] Backup automatique SQLite : dump quotidien dans `parachute/data/backups/`

## Hors scope (volontaire)

- ❌ OpenTelemetry / tracing distribué (overkill mono-machine)
- ❌ Kubernetes / Docker (perd le sens du local-first)
- ❌ gRPC / Protocol Buffers (HTTP+JSON suffit, debug curl trivial)
- ❌ ScyllaDB / Redis / NATS (SQLite tient largement la charge attendue)
- ❌ Web framework (gin/echo/fiber) — `net/http` + go1.22 mux pattern suffit

## Anti-patterns à fuir (vu pendant la session)

- Pas de polling de fichiers `/tmp/*.json` entre composants — Unix socket / SQLite à la place
- Pas de `Monitor` tool conversationnel critique pour la production — daemon externe owne le bridge
- Pas de `master.js` qui crashloop silencieusement — health pings + alertes Telegram
- Pas de fichiers IPC sans dédup ou TTL — SQLite avec contraintes UNIQUE et index
- Pas d'injection vault > 800 tokens — budget fixe, troncature prioritaire

## Métriques de succès

| Métrique | Cible v1.0 |
|---|---|
| Disponibilité bridge Telegram | ≥ 99.5% (mesuré sur 7 jours) |
| Migration handoff réussie | ≥ 99% (timeout < 5%) |
| Latence handoff push (Claude → consumed) | < 50ms p99 |
| Restart session après crash | < 5s |
| Faux positifs alertes | < 1/semaine |
| Continuité contexte vault cross-sessions | 100% (vault injecté à chaque spawn) |

## Sources de la recherche modernisée

- Claude Code Sessions API : <https://code.claude.com/docs/en/agent-sdk/sessions>
- mymmrac/telego : <https://github.com/mymmrac/telego>
- modernc.org/sqlite : <https://pkg.go.dev/modernc.org/sqlite>
- oklog/run : <https://github.com/oklog/oklog>
- Unix sockets perf : <https://www.baeldung.com/linux/ipc-performance-comparison>
- Prometheus vs OTel 2025 : <https://promlabs.com/blog/2025/07/17/why-i-recommend-native-prometheus-instrumentation-over-opentelemetry/>
