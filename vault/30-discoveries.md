# Découvertes projet

> Géré par Peter via MasterClaude vault. Markdown vivant, pas document gravé.

## Découvertes

Ce que Claude ou Peter apprend sur le projet et qui mérite de survivre à la session.

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

### YYYY-MM-DD — Découverte
