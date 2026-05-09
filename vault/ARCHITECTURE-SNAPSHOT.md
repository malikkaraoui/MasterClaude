# Architecture Snapshot — 2026-05-09

> Capture structurelle complète après lecture systématique de tous les sources. Destiné à search/query par claude-mem.

## Components Index

### Daemon Orchestration

| Component | File | Purpose | Status | Notes |
| --- | --- | --- | --- | --- |
| master.js | bin/master.js | Node.js daemon entry point; Telegram long-polling; session dispatch | E1 livré | 1158 lignes; singleton lock /tmp/masterclaude-master.lock |
| session-manager.js | src/master/session-manager.js | Project registry; ~/.claude-atelier/projects.json; /projets, /projet, /register | Livré | JSON-based, in-memory during session |
| vault-loader.js | src/master/vault-loader.js | Load vault context for system prompt injection | Livré | Tries vault/CLAUDE.md → index.md → Bienvenue.md; 1500 char max |
| secretaire.js | src/master/secretaire.js | Ollama offline responder; classification (wake/complex/simple) | Livré | qwen3.5; per-project conv history; MAX_HISTORY=10, LRU eviction |
| context-monitor.js | src/master/context-monitor.js | Per-project conversation history rotation | Livré | MAX_TURNS=10; auto-rotation >20 messages |
| window-registry.js | src/master/window-registry.js | Terminal window registration + control via AppleScript | Livré | /tmp/masterclaude-windows.json; registerWindow → sendToWindow → readWindow → checkDone |
| index.js | src/master/index.js | Master daemon control (start/stop/restart/status) | Livré | PID file /tmp/claude-atelier-master.pid; detects immediate crash |
| telegram.js | src/master/telegram.js | Telegram long-polling + message parsing | Livré | 150 lignes; routes to inbox |

### Parachute Go Daemon

| Component | File | Purpose | Status | Notes |
| --- | --- | --- | --- | --- |
| main.go (parachute) | parachute/cmd/parachute/main.go | HTTP server :4001; Unix socket /tmp/parachute.sock | Livré | KeepAlive LaunchAgent; watchdog 30s ticker |
| main.go (cc-parachute) | parachute/cmd/cc-parachute/main.go | CLI client to parachute API | Livré | health, sessions, logs, restart; bearer token auth |
| manager.go | parachute/internal/sessions/manager.go | Session spawn/kill/heartbeat/watchdog | Livré | Spawn injects vault via buildSystemPrompt; osascript Terminal.app; windowID capture |
| store.go | parachute/internal/store/store.go | Handoff JSON persistence + archive auto | Livré | Post/Get/Consume; archive strategy timestamp-prefixed |
| health.go | parachute/internal/health/checker.go | HTTP health pings; DownCycles threshold; AlertFunc callback | Livré | ComponentState struct; checks Ollama :11434 + proxy :4000 |
| migrate.go | parachute/internal/migrate/handler.go | WebSocket /v1/migrate for bipartite handoff | Planned | Awaits session write + parachute facilitation |
| server.go | parachute/internal/server/server.go | HTTP routing + middleware | Planned | Bearer token validation; CORS if needed |
| dashboard.go | parachute/internal/dashboard/dashboard.go | WebUI /dashboard Go-embedded | Planned | Session uptime, token burn %, project active |

### Support Agents (Launchd)

| Agent | File | Purpose | Schedule | Status |
| --- | --- | --- | --- | --- |
| Idriss 🌙 | bin/idriss/ | Daily synthesis: vault notes + handoffs + git commits | 21:05 daily | Livré v0.1; deepseek+qwen+sonnet pipeline; robust degraded mode |
| Léonor 🔭 | bin/leonor/ | Weekly strategy: 5 bilans Idriss + vault + projects review | Vendredi 22:00 | Livré v0.1; Sonnet 4.6; 3 propositions + 1 chantier à enterrer |

### IPC Channels

| Channel | Location | Direction | Format | TTL | Notes |
| --- | --- | --- | --- | --- |
| Telegram inbox | /tmp/tg-inbox.jsonl | Telegram → master → Claude | JSONL (1 msg/line) | None (persistent until read) | Monitor tool tail -f |
| Telegram responses | /tmp/tg-responses/{chatId}.jsonl | Claude → master → Telegram | JSONL | None | Master polls dir |
| Session signal | /tmp/masterclaude-real-claude-active | master ← Claude | ts:shellPID:parentPID | 3600s (TTL check) | Master detects alive sessions |
| Window registry | /tmp/masterclaude-windows.json | window-registry.js | JSON | Lost at reboot (intentional) | registerWindow → tracking |
| Transcription | /tmp/tg-transcribe.sock | Telegram → Python worker | Unix socket | Lifetime of worker | Whisper async |
| Parachute socket | /tmp/parachute.sock | master ↔ parachute | HTTP (upgradeable WebSocket) | Session lifetime | Bearer token auth |
| Alerts JSONL | /tmp/parachute-alerts.jsonl | parachute → Telegram bridge | JSONL | None | Health checker → AlertFunc |

## Context Flow — Data Model

```
Telegram message
  ↓
master.js polls /tmp/tg-inbox.jsonl
  ↓
Classify: WAKE_TRIGGERS → wake
          COMPLEX_TRIGGERS → complex
          else → simple
  ↓
If simple & Claude sleeping → secretaire.js replies via Ollama
If complex | wake → spawn Claude session
  ↓
session-manager.js GetProjectContext()
vault-loader.js LoadVaultContext() + LoadProjectContext()
Assemble system prompt = global vault + project context + handoff non-consommé
  ↓
parachute SessionManager.Spawn(projectKey, cwd)
  → buildSystemPrompt() injects vault
  → spawnClaude() writes .command script → osascript Terminal.app
  → captures windowID → returns (PID, windowID)
  ↓
Claude session active in Terminal
  Register in window-registry
  Monitor tail -f /tmp/tg-inbox.jsonl
  ↓
Claude generates response
  → Write /tmp/tg-responses/{chatId}.jsonl
  → master polls, reads, sends Telegram
  ↓
If context saturation >60%
  → getCtxPct() detected
  → ask /compact OUI/NON
  → if OUI: compress + rewrite /tmp/tg-inbox.jsonl
  → if >3 times: MIGRATE_REQUEST
    → Claude writes /tmp/masterclaude-handoff-{projectKey}.json
    → master calls parachute POST /v1/migrate
    → session killed, new session spawned with handoff context
```

## Token Management Strategy

- **Threshold** : 60% tokens used → ask /compact
- **Compact** : Ollama qwen compresses old messages in place
- **Migration** : >3 compacts → handoff + new session (keeps context, resets tokens)
- **Auto-metrics** : getCtxPct() every message; if jumps >5%, alert

## Vault-First Design

- **Global vault** : /Users/malik/Vault/Malik/ (loaded at master boot via vault-loader.js)
- **Project context** : project-path/.claude/CLAUDE.md (1000 char max)
- **Handoff context** : JSON struct written by Claude, read at spawn
- **Bootstrap** : New spawned session has 3 levels of context injected before first prompt

## Security Invariants

1. **ANTHROPIC_API_KEY deleted before spawn** → OAuth Max plan respect
2. **Pre-push gate mandatory** → bash scripts/pre-push-gate.sh before git push
3. **Bearer token auth** → parachute API + cc-parachute CLI
4. **AppleScript safe** → text via /tmp file (shell injection prevention)
5. **Monitor guard** → guard-monitor-bridge.sh auto-relaunches if killed

## Failure Modes & Recovery

| Failure | Detection | Recovery | Timeframe |
| --- | --- | --- | --- |
| Monitor dies post-/compact | guard-monitor-bridge.sh | Auto-relaunch before response | <1s |
| Master daemon crashes | LaunchAgent KeepAlive | Restart via launchd | <30s |
| Parachute unavailable | health.go HTTP ping | Alert → fallback master.js | 30s check interval |
| Session zombie | CheckDeadSessions() | Kill + remove from registry | 60s (2×heartbeat) |
| Context saturation | getCtxPct() >60% | Ask /compact | Real-time |
| Ollama offline | health.go HTTP ping | Secretaire unavailable; wake Claude | 30s check |
| Telegram API timeout | long-poll retry | Re-poll with backoff | Configurable |

## Feature Flags (master.js)

```bash
# .env
PARACHUTE_SESSION_TAKEOVER=true    # Use parachute to spawn sessions
PARACHUTE_HANDOFF_TAKEOVER=true    # Use parachute for migration
PARACHUTE_TELEGRAM_TAKEOVER=false  # (planned) Telegram bridge via parachute
```

## Testing Strategy

- Unit : jest (js), go test (Go), pytest (Python)
- Integration : test/hooks.js per hook
- E2E : spawn real Claude session, send Telegram message, verify response
- Pre-push gate : 5 stages (secrets → lint → build → tests)

## Roadmap — Phase E2 → E5

- **E2** : Session-manager optimized (per-project spawn + cwd correct)
- **E3** : Vault injection per-project
- **E4** : Token burn detection + auto-summary + auto-restart
- **E5** : LaunchAgent install script + production-ready daemon

## Key Decisions (vault/20-decisions.md)

- **2026-05-06** : parachute Go daemon to replace fragile master.js IPC
- **2026-05-05** : Fork decision — MasterClaude (personal) ≠ claude-atelier (npm package)
- **2026-05-04** : Master daemon orchestration (Malik control via Telegram)
- **Local-first** : LLM Ollama only; no cloud mandatory for core
- **Co-existence** : master.js ↔ parachute until parity (no big-bang)

---

**Usage** : Search this doc via qmd query (semantic) or grep (keyword) before asking "how does X work". If not found, check vault/30-discoveries.md.
