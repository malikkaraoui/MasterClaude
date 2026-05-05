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

### YYYY-MM-DD — Découverte

- Observation :
- Impact :
- Source :
