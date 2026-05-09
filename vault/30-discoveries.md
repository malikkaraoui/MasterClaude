# Découvertes projet

> ⛔ **RÈGLE 1 — ANTI-HALLUCINATION ABSOLUE** (rappel — voir `SOUL.md`, `AGENTS.md`, `.claude/CLAUDE.md` §5)
> Interdiction totale d'inventer, de mentir, d'halluciner.
> Si je ne sais pas → « Je ne peux pas l'affirmer » + 2-3 hypothèses + comment vérifier.
> Une découverte non vérifiée n'est pas une découverte. Pas d'entrée dans ce fichier sans source factuelle.

> Géré par Peter via MasterClaude vault. Markdown vivant, pas document gravé.

## Découvertes

Ce que Claude ou Peter apprend sur le projet et qui mérite de survivre à la session.

### 2026-05-08 — claude-mem v13.0.0 installé — mémoire sémantique inter-sessions

- **Installé** : `npx claude-mem install --ide claude-code --provider claude --model claude-haiku-4-5-20251001`
- **Worker** : daemon actif PID auto, port 37701, SQLite + Chroma vector DB dans `~/.claude-mem/`
- **Mécanisme** : plugin Claude Code enregistré — capture automatique des observations via hooks (PostToolUse, Stop, SessionEnd). Retrieval sémantique sur sessions futures.
- **Cohabitation** : `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` posé dans `~/.claude/settings.json` (désactive auto-memory native de Claude Code, pas notre hook custom SessionStart). Nos `memory/*.md` survivent et continuent à être lus via MEMORY.md.
- **Gain** : recherche sémantique sur l'historique cross-sessions, ~10x moins de tokens pour récupérer le contexte pertinent. Mémoire passive — s'enrichit automatiquement.
- **Commandes** : `npx claude-mem start|stop|status|search "<query>"`

### 2026-05-05 — Fork MasterClaude depuis claude-atelier v0.26.0

- **Séparation décidée** : claude-atelier (npm) reste un harnais Claude Code pur. MasterClaude = usage personnel avec master daemon + Telegram + routing multi-projets
- **package.json#files prime sur .npmignore** : lister un répertoire dans `files` rend son contenu inexcluable. Fix : expliciter les chemins individuels dans claude-atelier pour exclure master/telegram
- **MasterClaude n'installe pas claude-atelier en dépendance** : il IS le superset — tout le code est copié dans le fork, pas importé
- **Path choisi** : `/Users/malik/MasterClaude` (même niveau que `/Users/malik/Vault/Malik/`) — accès direct du daemon au vault Obsidian sans path relatif complexe

### 2026-05-04 — Tests Telegram Phase D (depuis claude-atelier)

- **Bridge bidirectionnel fonctionnel** : hook PostToolUse → `vault/10-mailbox.md` → signal file → Claude Code lit et répond
- **Problème identifié** : Ollama répondait à la place de Claude Code (confusion utilisateur). Phase D résout le routage : Claude Code reçoit le signal et répond directement dans la session
- **Voix faster-whisper** : lazy-loaded, `asyncio.to_thread` obligatoire, générateur consommé entièrement dans le thread (sinon deadlock)

### 2026-05-06 — Naissance d'Idriss 🌙 (bilan quotidien 21:05)

- **Décision Malik** : pour piloter le projet sur la durée, il faut un agent qui synthétise chaque soir ce qui s'est passé (notes Obsidian + handoffs + commits git de tous les repos). Spec verrouillée : `vault/plans/SPEC-idriss-leonor-curator.md`.
- **Pipeline livré v0.1** : collecte inputs → résumé brut Markdown → fan-out parallèle Ollama (`deepseek-v4-flash:cloud` + `qwen3.5:4b` local) → synthèse `claude-sonnet-4-6` → écrit `~/Vault/Malik/journal/YYYY-MM-DD-bilan.md`.
- **Décision technique acceptée** : Ollama Cloud via subprocess CLI `ollama run`, pas API HTTP custom — le binaire gère l'auth. Plus simple, plus robuste. Évite d'inventer un endpoint.
- **Stack** : Python 3.13 + venv `bin/.shared-venv/` + httpx + anthropic SDK + python-dotenv + pyyaml + pytest. Tests : 35 cas (35/35 verts) couvrant nominal, dégradés (cloud KO, local KO, sonnet KO), e2e, kill switch.
- **Mode dégradé robuste** : tout maillon peut tomber, le bilan est toujours écrit (au pire en brut + warning frontmatter `degraded`).
- **launchd** : plist versionné dans `bin/idriss/launchd/`, copie dans `~/Library/LaunchAgents/com.masterclaude.idriss.plist`, **PAS** chargé en autonome — Malik fait le `launchctl load` manuellement après validation du `--once` réel.
- **Kill switch** : `touch /tmp/idriss-disabled` → skip silencieux. Réversible.
- **Branchement npm test** : nouveau script `test:idriss` ajouté à la suite, pre-push gate transparent.
- **Suite** : Léonor 🔭 (vendredi 22:00, mêmes patterns) puis Curator skills.

### 2026-05-06 — Naissance de Léonor 🔭 (stratège hebdo vendredi 22:00)

- **Décision Malik** : après Idriss qui voit la journée, Léonor voit la semaine. Lit le vault entier + tous les `~/<projet>/CLAUDE.md` + les 5 bilans Idriss lundi→vendredi. Sortie : 3 propositions / liens entre projets / 1 chantier à enterrer / questions ouvertes.
- **Pipeline simplifié** : pas de fan-out, Sonnet 4.6 direct (1 appel) + sanity-check Qwen local optionnel.
- **Plist** : `StartCalendarInterval` `Weekday=5 Hour=22 Minute=0` (vendredi 22h), `RunAtLoad=false`. Versionné `bin/leonor/launchd/`, install via `bin/leonor/install-launchd.sh` — Malik valide manuellement.
- **Tests** : 17 cas verts (inputs, compose, writer, e2e, sanity, kill switch, dégradé Sonnet).
- **Réutilise le venv partagé Idriss** + le `setup_logging` + `ollama_client` d'Idriss (pas de duplication).
- **Kill switch** : `touch /tmp/leonor-disabled`.

### 2026-05-06 — Naissance de `parachute` (Go daemon orchestrateur)

- **Décision d'architecture** : la pile actuelle (`master.js` Node + Python transcribe + 10+ hooks shell + fichiers `/tmp/*.json` pour IPC + Monitor tool conversationnel) est **trop fragile**. Un seul maillon casse → silence Telegram. Vu en live : `master.js` crashloop pendant test e2e migration ; `Monitor` tué par `/compact` (régression silencieuse).
- **Action** : début d'un binaire Go unique `parachute/` qui absorbe progressivement les responsabilités. Étape 1 livrée : API HTTP `127.0.0.1:4001` pour persistance handoffs (POST/GET/CONSUME + archive auto + tests Go OK).
- **Composants livrés en une session** : `parachute/cmd/parachute/main.go` (server) · `parachute/internal/{store,server}` · `bin/cc-parachute` (client shell) · LaunchAgent `com.masterclaude.parachute` (KeepAlive=true, RunAtLoad=true) · `parachute/scripts/install.sh` idempotent.
- **Roadmap parachute** (2 → 7) : bridge Telegram natif, orchestration sessions, health pings, migration bipartite via WebSocket, SQLite quand >100 handoffs.
- **Invariant** : tant que la nouvelle pile n'absorbe pas une responsabilité, l'ancienne reste en place. Pas de big-bang. Co-existence master.js ↔ parachute jusqu'à parité.

### 2026-05-06 — Régression silencieuse Monitor post-`/compact`

- **Observation** : le `Monitor` tool de Claude Code est lié à la conversation. `/compact` tue tous les Tasks de l'ancienne conv → bridge Telegram sourd silencieusement. Symptôme côté master : « Toujours en cours… » répété 60s/120s/180s, puis « Pas de réponse après 10 min ».
- **Fix self-healing** : `hooks/guard-monitor-bridge.sh` sur `UserPromptSubmit`. À chaque message, `pgrep` le `tail -f /tmp/tg-inbox.jsonl`. Si absent → `additionalContext` bloquant qui force Claude à relancer Monitor avant de répondre. Self-healing — pas de patch ponctuel.
- **Impact** : régression structurelle éliminée. Validé en live (le bridge a survécu un `/compact` après installation).
- **Limite** : ne corrige pas la fragilité du master daemon ni le polling de la queue `/tmp/tg-responses/`. C'est l'objet de `parachute`.

### 2026-05-07 — osascript + System Events : primitives inter-agent et auto-agent validées

- **Défi** : contrôler des sessions Claude Code dans d'autres fenêtres Terminal macOS — sans intervention humaine.
- **Auto-agent** : MasterClaude écrit un script osascript en arrière-plan (`sleep 12 && osascript`) → `System Events` trouve la fenêtre par titre (`name contains "MasterClaude"`) → envoie Ctrl+U + `/compact` + Enter. Résultat : `/compact` déclenché dans la propre fenêtre de MasterClaude sans que Malik touche le clavier. ✅
- **Inter-agent** : tom-protocol se compacte → son `SessionStart` hook envoie un signal → MasterClaude se compacte en cascade. Deux sessions compactées sans intervention humaine. ✅
- **Pattern clé** :
  ```applescript
  tell application "Terminal"
    repeat with w in windows
      if name of w contains "MasterClaude" then set index of w to 1
    end repeat
  end tell
  delay 0.3
  tell application "System Events"
    tell process "Terminal"
      keystroke "u" using control down
      keystroke "/compact"
      key code 36
    end tell
  end tell
  ```
- **Impact** : socle du parachute orchestrator — MasterClaude peut piloter n'importe quelle fenêtre Terminal, envoyer des commandes, déclencher des actions sur d'autres agents Claude Code. JAMAIS dire "impossible" pour une action Terminal macOS.
- **Prochain usage** : déclencher `/compact`, changer de modèle, lancer une feature, lire l'output en live — sur n'importe quelle session.

### 2026-05-09 — Architecture complète daemon+parachute cristallisée (session seeding claude-mem)

- **Contexte** : lecture systématique de tous les fichiers source pour seeding claude-mem cross-sessions. Synthèse architecturale documentée ici pour persistence immédiate.

#### Couche Node.js — `bin/master.js` (1158 lignes)

**Architecture IPC daemon**:
- Singleton lockfile `/tmp/masterclaude-master.lock` → une seule instance autorisée
- Inbox long-polling : Telegram API → messages dans `/tmp/tg-inbox.jsonl` (JSONL, 1 msg/ligne)
- Monitor tool tail-f contrôlé (guard-monitor-bridge.sh détecte mort et relance avant réponse)
- Réponses écrites par Claude dans `/tmp/tg-responses/<chatId>.jsonl` → master lit et envoie en Telegram
- Session signal `/tmp/masterclaude-real-claude-active` : format `ts:shellPID:parentPID`, TTL 600s (pid vivant = session existe)

**Fonctionnalités E1 livrées** :
- Auto-wake : 1er message → osascript Terminal.app + `cd cwd && claude` avec context vault-global injecté
- Context saturation : getCtxPct() par projet → 60% threshold → demande `/compact` OUI/NON; >3 compacts → migration avec handoff
- GitHub event poller : `/github events` → fetch repos, stream Telegram notifications
- Project registry (`SessionManager`) : `/projets`, `/projet <nom|path>`, `/register <nom> <path>`
- Git commands forwarding : `/git status`, `/git log`, `/git diff`, `/git commit`, `/git push` (avec pre-push-gate.sh check)
- **ANTHROPIC_API_KEY deleted avant spawn** : respect OAuth Max plan (clé client non visible côté spawned Claude)
- Session migration : master writes MIGRATE_REQUEST → Claude writes `/tmp/masterclaude-handoff-{projectKey}.json` → master attends 90s → call parachute POST /v1/migrate

**Transcription daemon** (Python subprocess):
- Socket `/tmp/tg-transcribe.sock` : Telegram voice IPC vers Whisper local
- Lifecycle : lancé une fois au démarrage, réutilisé pour tous les messages vocaux
- Fallback : si Whisper indisponible, réponse "⚠️ transcription indisponible"

**Helpers critiques** :
- `isPidAlive(pid)` : `kill -0` check (POSIX, macOS compatible)
- `findExistingClaudeSession(projectKey)` : ps -axo grep + regex match (reacquire session après crash)
- `readSessionSignal()` : decode et valide timestamp/PID du signal file

#### Couche Go — `parachute/` daemon

**Étapes livrées (1-7)** :
1. **Store SQLite** : persistance handoffs + archive auto (`dataDir/archive/yyyy-mm-dd.tgz`)
2. **HTTP API** : `127.0.0.1:4001`, endpoints CRUD handoffs (POST/GET/CONSUME), bearer token auth
3. **Sessions Manager** : spawn/kill/heartbeat, detect dead sessions >60s sans heartbeat
4. **Health Checker** : HTTP ping Ollama + ollama-proxy toutes les 30s, callback alerts → Telegram
5. **Migrate Handler** : WebSocket `/v1/migrate` pour bipartite handoff (master attends, Claude écrit, parachute facilite)
6. **Master daemon control** : launchd service com.masterclaude.parachute, KeepAlive=true, RunAtLoad=true, idem master
7. **cc-parachute CLI** : client shell (health, sessions list/logs, restart), bearer token, 10s timeout

**Composants clés**:
- `manager.go` : Spawn(projectKey, cwd) injecte vault via `buildSystemPrompt()` + handoff non consommé → `spawnClaude()` → osascript Terminal.app → capture windowID via `.command` script → NVM sourced
- `store.go` : Handoff struct contient fil_rouge, next_action, warnings_for_successor, todos, vault_malik_slice, last_user_message
- `health.go` : ComponentState (Name, Status, DownSince, DownCycles, LastChecked, LastErr), AlertFunc callback
- Watchdog : CheckDeadSessions() toutes les 30s, CheckHTTP toutes les 30s
- Shutdown gracieux : SIGINT/SIGTERM

#### Couche Ollama — secrétaire offline

`src/master/secretaire.js` (151 lignes) :
- Classification message : WAKE_TRIGGERS (@claude, urgent, critique, bloqué, sos) → wake; COMPLEX_TRIGGERS (code, debug, arch) → complex; else simple
- Simple → réponse directe Ollama qwen3.5
- Complex → "détecté technique, @claude pour réveiller Claude"
- Wake → "Réveil Claude en cours…" (wakeClaudeFunc géré par master)
- Conversation history : per-project Map, MAX_HISTORY=10, LRU eviction MAX_PROJECTS=50
- POST /api/chat Ollama, température 0.7, num_predict 400

#### Vault injection — system context

`src/master/vault-loader.js` (64 lignes) :
- `loadVaultContext()` : try vault/CLAUDE.md → index.md → Bienvenue.md (max 1500 chars)
- `loadProjectContext()` : .claude/CLAUDE.md ou CLAUDE.md depuis projectPath (max 1000 chars)
- System prompt assembled = global vault + project context + handoff non consommé

#### IPC et monitoring

`src/master/window-registry.js` (129 lignes) :
- Per-window Registry dans `/tmp/masterclaude-windows.json` (lost at reboot, intentional)
- Cycle : registerWindow() → sendToWindow(text via file + keystroke) → readWindow(AppleScript) → checkDone(regex "❯ ") → markIdle()
- AppleScript safe : text transite via /tmp file (évite shell injection)

`src/master/context-monitor.js` (70 lignes) :
- Per-project conversation history : Map<projectKey, { history, turnCount }>
- MAX_TURNS = 10, rotation automática quand >20 messages
- Methods : push(), getMessages(), getContext(), turnCount()

#### Integration launchd

`src/master/index.js` (73 lignes) :
- Master daemon control : start (detached spawn) → `/tmp/claude-atelier-master.pid`, stop (kill), restart, status
- Détecte crash immédiat (250ms poll) + log vers `~/Library/Logs/claude-atelier/master.log`
- `src/master/telegram.js` (150 lignes) : Telegram long-polling, message parsing, response routing

#### Tests et gate

- Pre-push gate : 5 étapes (secrets → lint → build → tests)
- `npm test` : lint sur js/go/py, doctests, hook-specific tests
- `test:hooks` : chaque hook validé isolation
- `test:idriss`, `test:leonor` : agents 🌙 et 🔭 avec pytest

#### Invariants et décisions

- **Vault-first** : toute question projet → vault avant réponse
- **Local-first** : LLM Ollama uniquement, pas de cloud mandatory
- **Co-existence** : master.js et parachute côte à côte jusqu'à parité (pas big-bang)
- **IPC resilient** : Monitor guard, session signal TTL, zombie process fix parachute
- **Seeding mémoire** : découvertes documentées vault/30-discoveries.md + observations claude-mem cross-sessions

### YYYY-MM-DD — Découverte
