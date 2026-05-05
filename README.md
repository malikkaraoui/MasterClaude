# MasterClaude

<div align="center">

```text
  ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗
  ████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
  ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
  ██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
  ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
             C L A U D E
```

### Runtime Claude Code autonome — usage personnel

Daemon macOS · Telegram · Vault Obsidian · Ollama local · Multi-projets

[![CI](https://github.com/malikkaraoui/MasterClaude/actions/workflows/ci.yml/badge.svg)](https://github.com/malikkaraoui/MasterClaude/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/license/MIT)
[![fork of](https://img.shields.io/badge/fork%20of-claude--atelier%20v0.26.0-CB3837?style=flat-square)](https://github.com/malikkaraoui/claude-atelier)

</div>

---

## Ce que c'est

**MasterClaude** n'est pas un harnais npm générique.  
C'est un **système d'exploitation personnel** pour Claude Code :

- **Daemon macOS KeepAlive** — tourne en permanence via LaunchAgent
- **Interface Telegram** — je parle à Claude depuis iPhone, Claude agit sur ma machine
- **Vault Obsidian comme cerveau** — `/Users/malik/Vault/Malik/` injecté dans chaque session Claude comme contexte permanent (index projets, synthèses, journal)
- **LLM local via Ollama** — tool_use bidirectionnel, proxy Go :4000
- **Multi-projets** — routing Telegram → bonne session Claude selon le projet actif

```
Malik (iPhone)
    │  Telegram
    ▼
telegram-bridge.py  ←→  bin/master.js (daemon)
                              │
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              claude-atelier  MasterClaude  projet X
                    │
                    ▼
          /Users/malik/Vault/Malik/   (cerveau injecté)
```

---

## Stack

| Couche | Techno |
|--------|--------|
| Daemon / hooks / scripts | Node.js |
| Proxy Ollama bidirectionnel | Go |
| Bridge Telegram | Python |
| LLM cloud | Claude (Anthropic) |
| LLM local | Ollama (qwen, llama3…) |
| Vault | Obsidian Markdown |

---

## Fonctionnalités

| Fonction | État |
|----------|------|
| Fork claude-atelier v0.26.0 (hooks, skills, gate, Peter vault) | ✅ |
| Vault Malik injecté comme cerveau (index + synthèses) | ✅ |
| Bridge Telegram (voix, texte, mailbox, FIFO hooks) | ✅ |
| Commande `/reload` — rafraîchit le vault en live | ✅ |
| Pre-push gate 5 étapes | ✅ |
| `bin/master.js` — daemon principal | 🔄 Phase E1 |
| Session routing multi-projets | 🔄 Phase E2 |
| LaunchAgent KeepAlive macOS | 🔄 Phase E5 |

---

## Vault Malik — le cerveau

À chaque message Telegram, Claude reçoit en contexte :

- **`index.md`** — 12 projets actifs (OKazCar, Decisio, TOM Protocol, Film Crew…)
- **`syntheses/projets-synergies.md`** — vases communicants & patterns à factoriser
- **`log.md`** (50 dernières lignes) — journal des opérations récentes

La commande `/reload` dans Telegram recharge le vault sans redémarrer le bridge.

---

## Commandes Telegram

| Commande | Action |
|----------|--------|
| `/new` | Nouvelle session Claude |
| `/stop` | Arrête la session en cours |
| `/resume` | Reprend la dernière session |
| `/cd <path>` | Change de projet actif |
| `/reload` | Recharge le vault Malik en mémoire |
| `/status` | État de la session courante |
| `/budget` | Coût accumulé de la session |
| `/pulse` | Claude process actif ? |

---

## Installation

```bash
git clone https://github.com/malikkaraoui/MasterClaude
cd MasterClaude
npm install
cp src/templates/telegram.env.example .env
# remplir TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALLOWED_USERS
python3 -m pip install python-telegram-bot httpx python-dotenv
```

Lancer le bridge :
```bash
python3 scripts/telegram-bridge.py
```

---

## Relation avec claude-atelier

MasterClaude est un fork personnel de [claude-atelier](https://github.com/malikkaraoui/claude-atelier).  
**claude-atelier** = framework npm public · **MasterClaude** = runtime personnel non publié.

Tout ce qui est amélioré ici peut remonter vers claude-atelier si applicable.

---

<div align="center">
<sub>Usage personnel · non publié sur npm · MIT</sub>
</div>
