# MasterClaude — Vision globale

> Runtime Claude Code autonome · Usage personnel · 2026-05-05

---

## Ce que c'est

MasterClaude n'est **pas** un harnais npm générique.
C'est un **système d'exploitation personnel** pour Claude Code :
un daemon macOS KeepAlive qui tourne en permanence, reçoit des messages Telegram,
et orchestre des sessions Claude Code par projet, sur machine locale, sans cloud obligatoire.

**claude-atelier** (npm public) = le framework partageable — hooks, skills, gate, Peter vault.
**MasterClaude** (usage personnel) = claude-atelier + master daemon + Telegram + routing multi-projets.

---

## Architecture

```
Malik (iPhone)
      │  Telegram
      ▼
┌─────────────────────────────────────────┐
│  bin/telegram.js  (Telegram bridge)     │
│  scripts/telegram-bridge.py             │
│  scripts/mailbox-watcher.sh             │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  bin/master.js  (Master daemon)         │
│  src/master/                            │
│  LaunchAgent macOS  KeepAlive=true      │
│  scripts/install-daemon.sh              │
└──────┬──────────────────────────────────┘
       │  spawn / route / supervise
       ▼
┌────────────────────┐  ┌────────────────────┐  ┌──────────────┐
│ Claude session     │  │ Claude session     │  │  Claude …    │
│ claude-atelier     │  │ MasterClaude       │  │  projet X    │
└────────────────────┘  └────────────────────┘  └──────────────┘
       │
       ▼
/Users/malik/Vault/Malik/   (vault Obsidian, lu par le daemon)
```

---

## Ce qui vient de claude-atelier (hérité)

| Composant | Rôle |
|---|---|
| `.claude/` complet | Règles, skills, orchestration, sécurité |
| `hooks/` | PreToolUse, PostToolUse, Stop, Notification |
| `scripts/pre-push-gate.sh` | Gate 5-étapes avant tout push |
| `scripts/peter-*.js` | Agent Peter : vault, inbox, graphe |
| `test/` | Suite complète : hooks, pulse, vault, merge |
| `src/skills/`, `src/stacks/`, `src/templates/` | Contenu embarqué pour `claude-atelier init` |

---

## Ce qui est MasterClaude-specific

| Composant | Rôle |
|---|---|
| `bin/master.js` | Daemon principal, loop de supervision |
| `bin/telegram.js` | Entrée CLI pour le bridge Telegram |
| `src/master/` | Logique routing, state machine projets |
| `scripts/telegram-bridge.py` | Polling/webhook Telegram API |
| `scripts/mailbox-watcher.sh` | Watch vault/10-mailbox.md → signal Claude |
| `scripts/claude-notify.sh` | Push notification vers Telegram |
| `scripts/install-daemon.sh` | Install LaunchAgent + plist macOS |

---

## Milestones

| Milestone | État | Description |
|---|---|---|
| v0.1.0 Fork initial | ✅ | Repo créé, structure copiée depuis claude-atelier v0.26.0 |
| v0.2.0 LaunchAgent | 🔲 | `install-daemon.sh` fonctionnel, daemon stable au boot |
| v0.3.0 Telegram routing | 🔲 | Routage projet depuis Telegram, multi-sessions |
| v0.4.0 Context burn detection | 🔲 | Alerte Telegram si fenêtre > 60%, auto-compact |
| v1.0.0 Runtime stable | 🔲 | 30 jours sans intervention manuelle |

---

## Règles non négociables

- **Local-first** : le core tourne sans service externe (cloud = optionnel)
- **Pas sur npm** : MasterClaude n'est pas publié — usage personnel uniquement
- **Gate avant tout push** : `bash scripts/pre-push-gate.sh` — jamais `--no-verify`
- **Vault Obsidian** : `/Users/malik/Vault/Malik/` — source de vérité contexte global Malik
- **Secrets externalisés** : `.env` jamais committé, TELEGRAM_BOT_TOKEN hors repo
