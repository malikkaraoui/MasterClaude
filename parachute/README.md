# parachute

> Orchestrateur Go local pour MasterClaude. Remplace progressivement le bricolage Python+Node+JSON-files par un binaire unique.

## Pourquoi

Le runtime actuel de MasterClaude empile : `master.js` (Node, daemon Telegram), Python (transcribe, bridge), hooks shell (10+ scripts), fichiers `/tmp/*.json` pour l'IPC, `Monitor` tool conversationnel pour le bridge Telegram. Chaque maillon est indépendant et fragile — un crash de master.js, un `/compact` qui tue Monitor, et le bridge Telegram tombe en silence.

`parachute` est un daemon Go unique qui doit, à terme, absorber **tous** ces maillons :

- 🪂 **handoffs** (Étape 1 — livré) : persistance HTTP + archive automatique
- 📨 **bridge Telegram** (Étape 2) : long polling natif, dédup, retries
- 🎬 **orchestrator** (Étape 3) : spawn/kill sessions Claude, KeepAlive
- 💓 **health** (Étape 4) : ping check des composants, alertes Telegram automatiques
- 🔄 **migration bipartite** (Étape 5) : tunnel HTTP plutôt que fichiers `/tmp`

## État actuel — Étape 1

API HTTP locale sur `127.0.0.1:4001`. Stockage JSON-on-disk avec archive horodatée.

### Endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Liveness + version + uptime |
| GET | `/v1/projects` | Liste les projets ayant un handoff actif |
| GET | `/v1/handoff/{projectKey}` | Récupère le handoff live (404 si absent) |
| POST | `/v1/handoff/{projectKey}` | Écrit le handoff (overwrite + archive auto) |
| POST | `/v1/handoff/{projectKey}/consume` | Lit + supprime le live (atomique). Archive conservée. |

### Run

```bash
cd parachute
go build -o /tmp/parachute-bin ./cmd/parachute
PARACHUTE_DATA=./data /tmp/parachute-bin
```

### Variables d'env

| Variable | Défaut | Description |
|---|---|---|
| `PARACHUTE_ADDR` | `127.0.0.1:4001` | Adresse d'écoute |
| `PARACHUTE_DATA` | `./data` | Répertoire de stockage |
| `PARACHUTE_TOKEN` | _(vide)_ | Bearer token. Si vide, pas d'auth (localhost-only assume) |

### Test rapide

```bash
curl http://127.0.0.1:4001/health
curl -X POST http://127.0.0.1:4001/v1/handoff/MasterClaude \
  -H "Content-Type: application/json" \
  -d '{"version":1,"project_key":"MasterClaude","cwd":"/tmp","reason":"test","fil_rouge":"…","next_action":"…"}'
curl http://127.0.0.1:4001/v1/handoff/MasterClaude
```

## Architecture

```
parachute/
├── cmd/parachute/         # entrée du binaire
│   └── main.go
├── internal/
│   ├── store/             # persistance handoffs (JSON-on-disk + mutex)
│   │   └── store.go
│   └── server/            # API HTTP (router go1.22+)
│       └── server.go
├── data/                  # storage runtime (gitignored)
│   ├── {projectKey}.json  # handoff live
│   └── archive/           # historique horodaté
│       └── {ts}-{projectKey}.json
├── go.mod
└── README.md
```

Schéma `Handoff` aligné sur `/tmp/masterclaude-handoff-*.json` pour rétrocompat avec `hooks/session-handoff-restore.sh` actuel.

## Roadmap

1. ✅ HTTP store handoff
2. 🚧 Client Go `cc-parachute` (binaire CLI pour les hooks shell)
3. 🚧 Bridge Telegram natif (remplace `master.js` polling)
4. 🚧 Health pings + alertes Telegram automatiques
5. 🚧 Orchestration sessions (spawn/kill via osascript wrap)
6. 🚧 Migration bipartite via WebSocket (Claude POST handoff → server kills + spawns)
7. 🚧 SQLite quand >100 handoffs ou queries complexes
8. 🚧 Plist LaunchAgent + KeepAlive
