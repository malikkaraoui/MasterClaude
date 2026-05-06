# Roadmap vivante

> Géré par Peter via MasterClaude vault. Markdown vivant, pas document gravé.

## Livré

- ✅ v0.1.0 — Fork depuis claude-atelier v0.26.0 · CLAUDE.md §0+§1 MasterClaude · VISION.md
- ✅ Telegram bridge (Phase A+B+D hérités de claude-atelier) — bridge Python, SQLite, voix, mailbox
- ✅ Peter vault (Phases A+B+C hérités) — index SHA256, graphe, query/path/explain, MCP
- ✅ **parachute Étape 1** — store SQLite + API HTTP (handoff CRUD + sessions CRUD) · PR #3
- ✅ **parachute Étape 3** — sessions manager (spawn/kill/heartbeat/watchdog) · PR #3
- ✅ **parachute Étape 5** — migrate handler Unix socket `/tmp/parachute.sock` · PR #3
- ✅ **parachute Étape 4** — health.Checker + alertFn → `/tmp/parachute-alerts.jsonl` → Telegram · commit b562225
- ✅ **parachute Étape 6** — `bin/master.js` thin wrapper feature flags (`PARACHUTE_SESSION_TAKEOVER`, `PARACHUTE_HANDOFF_TAKEOVER`, `PARACHUTE_TELEGRAM_TAKEOVER`) · commit b562225

## Sur le feu

- ✅ **parachute Étape 7** — `cc-parachute` CLI (health/sessions/logs/restart), WebUI `/dashboard` Go-embed, backup quotidien tar.gz · commit 00cd464
- **Phase E1** — `bin/master.js` : Telegram polling minimal + dispatch commandes
- **Phase E2** — `src/master/session-manager.js` : spawn/monitor sessions `claude` par projet (cwd correct)
- Adapter Telegram routing pour multi-projets (était mono-projet dans claude-atelier)

## Ensuite

- **Phase E3** — `src/master/vault-loader.js` : injecter `/Users/malik/Vault/Malik/` en system context au boot
- **Phase E4** — `src/master/context-monitor.js` : détecter token burn → summary → restart session
- **Phase E5** — `scripts/install-daemon.sh` + LaunchAgent plist · KeepAlive=true · boot automatique

## Idées à challenger

- Route Telegram vers plusieurs projets depuis une commande (`/claude atelier fix X`)
- Dashboard état sessions (uptime, token burn %, projet actif)
- MCP Peter natif pour MasterClaude (`vault mcp`)

## Parking

- Multimodal : URL fetch, transcripts, Apple Notes import
- Marketplace inter-agents (concept évoqué via Telegram 2026-05-04 — à planifier)
- Phase F/G Peter (scope lourd — après daemon stable)
