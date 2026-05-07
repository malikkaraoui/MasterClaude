---
kind: session-checkpoint
date: 2026-05-06 21:18
session: 8bd53339-e139-44e5-a640-534cadf8ac95
auteur: Claude Opus 4.7 (1M)
contexte_pre_compact: 45%
---

# CHECKPOINT — Session master Malik (avant /compact)

## État courant

**3 sessions Claude Code actives en parallèle**, chacune sur sa mission :

| Session | Mission | Spec / Prompt |
|---|---|---|
| **Master (ici)** | Parachute Go Étape 3 = orchestrateur sessions (spawn/kill/heartbeat) | `parachute/PLAN.md` Étape 3 |
| **Telegram pillage** | Port `TelegramFallbackTransport` Hermes → MasterClaude (3 commits) | `vault/plans/PROMPT-telegram-pillage.md` |
| **Idriss + Léonor** | launchd quotidien 21:05 + hebdo vendredi 22h | `vault/plans/SPEC-idriss-leonor-curator.md` |

## Mission immédiate (cette session post-compact)

**Parachute v1.0.0 — Étape 3** : orchestrateur sessions Go.

- Path : `/Users/malik/MasterClaude/parachute/internal/sessions/manager.go` (à créer)
- Stack imposée par PLAN.md :
  - `modernc.org/sqlite` (pure-Go)
  - Unix socket `/tmp/parachute.sock`
  - `oklog/run` (supervision goroutines)
  - `log/slog` (JSON logs)
  - `prometheus/client_golang` (métriques)
- Composants :
  1. `manager.go` — map `projectKey → SessionState{pid, ppid, claudePid, startedAt, lastHeartbeat}`
  2. Spawn via `osascript` wrapper (porter `wake-claude.sh`)
  3. Heartbeat via Unix socket → table `session_heartbeats`
  4. Détection mort : pas de heartbeat 2× interval → kill propre + alerte Telegram
  5. Mutex spawn (porter depuis `master.js`)

**Branche actuelle** : `feat/parachute-orchestrator` (déjà créée).

**Mémoire-clé** : `feedback_parachute_impl.md` — aller DROIT au code, pas de re-cartographie. Plan = `parachute/PLAN.md`, déjà commité (`c6b20c2`).

## Contraintes (toutes sessions)

- §13 : commits FR atomiques, **pas de signing** (jamais `Co-Authored-By`)
- §22 : pas de secrets en dur, `.gitignore` couvre `.env`
- §24 : `bash scripts/pre-push-gate.sh` avant tout push, **jamais `--no-verify`**
- §25 : séquence auto `/review-copilot` → PR draft → ready → `/copilot-loop` → merge squash main une fois Copilot approuve
- §5 : anti-hallucination — doute sur API → context7 ou demander Malik

## Workflow §25 par session parallèle

Chaque session crée sa branche feat dédiée → commits → gate → review-copilot → PR draft → ready → copilot-loop → merge squash main → reporter URL+SHA.

**Verrou humain** : Copilot demande > 50 lignes de changement ou questionne l'archi → STOP, demande Malik avant de continuer.

## Prompts ready-to-paste

### Session 2 — Telegram pillage

```
Lis vault/plans/PROMPT-telegram-pillage.md (mcp__qmd__get pour économiser tokens).
3 commits A/B/C, code intégral, patches lignes ciblées.
Ordre strict A→B→C, branche feat/telegram-fallback-transport, gate pré-push, séquence §25 (PR draft → ready → copilot-loop → merge main).
EnterPlanMode d'abord, attends ma validation, puis exécute. Pas d'Agent Explore.
```

### Session 3 — Idriss + Léonor

```
Lis vault/plans/SPEC-idriss-leonor-curator.md.
Idriss en PREMIER (Léonor après stabilité 7j), Curator EXCLU de cette session.
Stack : launchd plists + Python venv partagé + Ollama (cloud+local) + Anthropic SDK.
Branche feat/idriss-daily-review, commits FR atomiques, gate pré-push, séquence §25 complète.
EnterPlanMode d'abord, attends validation. Pas d'Agent Explore — la spec est complète.
```

## Telegram bridge — invariant

Monitor `tail -f -n 0 /tmp/tg-inbox.jsonl` (persistent, 3600000ms) doit être actif sinon les réponses ne reviennent pas. À relancer au moindre `exit 144`.

## Dette §25

48 commits, +69030 lignes, handoff Copilot dû. Push bloqué tant que dette > seuil. À résoudre via les PRs des 3 sessions actives.

## Historique récent (commits master)

- `c6b20c2` docs(parachute): plan modernise v0.2.0 vers v1.0.0
- `85aa309` chore: synchroniser hooks-manifest + skill source migrate-now
- `467ad64` docs(vault): découvertes parachute Go + régression Monitor post-compact
- `60758f5` fix(bridge): self-healing Monitor Telegram post-/compact
