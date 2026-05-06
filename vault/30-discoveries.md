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

### YYYY-MM-DD — Découverte

- Observation :
- Impact :
- Source :
