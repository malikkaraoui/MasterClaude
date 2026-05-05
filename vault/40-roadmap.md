# Roadmap vivante

> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.

## Roadmap vivante

### Livré

- ✅ Telegram bridge Phase A — service Python, sessions SQLite, CLI npx (PR #47)
- ✅ Telegram bridge Phase B — voix faster-whisper + Ollama polish + 6 fixes robustesse (PR #49)
- ✅ Peter Phase A — `vault init`, hook SessionStart, 00-brief/20-decisions/40-roadmap
- ✅ Peter Phase B — index SHA256 `manifest.json`, `vault update` incrémental, PETER_REPORT, watch daemon, cron
- ✅ Peter Phase C — graphe navigable `graph.json`, `vault query/path/explain`, export multi-formats (HTML/GraphML/Obsidian/Neo4j/SVG/Wiki), MCP stdio, `vault maintain` autonome — Lots 0+4+10 (PR #50)

### Sur le feu

- **Bump version v0.23.12**
- **Telegram Phase C** — FIFO hardening : hook PostToolUse → alertes commit/push/gate en temps réel
- proxy tool_use mapping Go (ollama-proxy bidirectionnel)

### Ensuite

- Telegram Phase D — vault inbox + lifecycle CLI
- Peter Phase D — `vault add` (inbox intelligente) + `vault route` (classification automatique)
- Enrichissement storytelling Peter dans website/docs/agents.md

### Idées à challenger

- MCP Peter natif (`vault mcp` — tools query_vault, get_node, neighbors)
- Export Obsidian (`vault export --obsidian`)
- Visualisation D3/vis.js locale (`vault export --html`)
- Multimodal : URL fetch, transcripts, Apple Notes import

### Parking

- Peter Phase F — Apple Notes / captures / vocaux (dépendances lourdes)
- Peter Phase G — MCP Peter complet
- MIRROR global multi-projets (futur lointain)

---

### Phase E — Master Daemon (claude-atelier runtime universel)

**Objectif** : `claude-atelier master start` → daemon autonome, LaunchAgent, orchestre tous les projets via Telegram

**Composants à construire** :
1. `bin/master.js` — event loop principal (Telegram polling + dispatch)
2. `src/master/session-manager.js` — spawn/monitor/restart sessions `claude` par projet
3. `src/master/context-monitor.js` — détecte token burn → summary → relance
4. `src/master/vault-loader.js` — charge Obsidian au boot comme system context
5. `src/master/telegram-router.js` — parse commandes → route vers projet ou répond Master
6. LaunchAgent plist Master (séparé du watcher existant)

**Séquence de build** :
- E1 : `bin/master.js` + Telegram polling minimal + réponse Claude stateless
- E2 : session-manager (spawn claude dans bon cwd, track PIDs)
- E3 : vault-loader (injecter Obsidian brief en system prompt)
- E4 : context-monitor (token threshold → summary → restart)
- E5 : LaunchAgent + boot automatique

**Dépendances** : MCP obsidian-vault (✅ configuré), telegram-bridge existant, .env BOT_TOKEN/CHAT_ID
