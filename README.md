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

### Your personal Claude Code operating system

macOS daemon · Telegram · Obsidian Vault as brain · Local Ollama · Multi-project routing

[![CI](https://github.com/malikkaraoui/MasterClaude/actions/workflows/ci.yml/badge.svg)](https://github.com/malikkaraoui/MasterClaude/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/license/MIT)
[![fork of](https://img.shields.io/badge/fork%20of-claude--atelier%20v0.26.0-CB3837?style=flat-square)](https://github.com/malikkaraoui/claude-atelier)

</div>

---

## What it is

**MasterClaude** is not a generic npm harness.  
It's a **personal operating system for Claude Code** — a macOS KeepAlive daemon that runs permanently, receives Telegram messages, and orchestrates Claude Code sessions per project on your local machine, without mandatory cloud.

---

## How it works

```
You (iPhone)
    │  Telegram message (text or voice)
    ▼
┌─────────────────────────────────────┐
│  telegram-bridge.py                 │
│  • Whisper  → voice-to-text         │
│  • Qwen 3b  → transcript cleanup    │
│  • /reload  → refresh vault live    │
└──────────────┬──────────────────────┘
               │ clean text + vault context
               ▼
┌─────────────────────────────────────┐
│  bin/master.js  (daemon)            │
│  LaunchAgent macOS  KeepAlive=true  │
└──────┬──────────────────────────────┘
       │  spawn · route · supervise
       ├──────────────────┬───────────────────┐
       ▼                  ▼                   ▼
  Claude session     Claude session      Claude session
  project A          project B           project C
       │
       ▼
  Obsidian Vault (/Vault/Malik/)   ← injected as brain
  • index.md    — 12 active projects
  • syntheses/  — cross-project synergies
  • log.md      — recent operations (last 50 lines)
```

**Every Telegram message → Claude already knows your projects, decisions, and context. You never re-explain.**

---

## Message pipeline

```
Voice message                    Text message
     │                                │
     ▼                                │
 Whisper (faster-whisper)             │
 → audio to raw text                  │
     │                                │
     ▼                                │
 Qwen 2.5:3b (Ollama local)           │
 → clean up transcript                │
 (fixes stutters, punctuation)        │
     │                                │
     └───────────────┬────────────────┘
                     ▼
              Claude (you)
              + vault context injected
              → responds / acts on your machine
```

---

## Stack

| Layer | Tech |
|-------|------|
| Daemon / hooks / scripts | Node.js |
| Bidirectional Ollama proxy | Go |
| Telegram bridge | Python |
| Cloud LLM | Claude (Anthropic) |
| Local LLM | Ollama (Qwen, Llama 3…) |
| Vault / brain | Obsidian Markdown |

---

## Features

| Feature | Status |
|---------|--------|
| Fork of claude-atelier v0.26.0 (hooks, skills, gate, vault) | ✅ |
| Obsidian Vault injected as brain (index + synergies + log) | ✅ |
| Telegram bridge — text, voice (Whisper), mailbox, FIFO hooks | ✅ |
| `/reload` — refresh vault context live without restart | ✅ |
| 5-step pre-push gate | ✅ |
| `bin/master.js` — main daemon | 🔄 Phase E1 |
| Multi-project session routing | 🔄 Phase E2 |
| macOS LaunchAgent KeepAlive | 🔄 Phase E5 |

---

## Telegram commands

| Command | Action |
|---------|--------|
| `/new` | Start a new Claude session |
| `/stop` | Kill the current session |
| `/resume` | Resume the last session |
| `/cd <path>` | Switch active project |
| `/reload` | Reload the Obsidian Vault into memory |
| `/status` | Current session info |
| `/budget` | Accumulated session cost |
| `/pulse` | Is Claude process active? |

---

## Setup

```bash
git clone https://github.com/malikkaraoui/MasterClaude
cd MasterClaude
npm install
cp src/templates/telegram.env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALLOWED_USERS, VAULT_MALIK_PATH
python3 -m pip install python-telegram-bot httpx python-dotenv faster-whisper
```

Start the bridge:
```bash
python3 scripts/telegram-bridge.py
```

Key env vars:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Your bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your personal chat ID |
| `ALLOWED_USERS` | Comma-separated Telegram user IDs |
| `VAULT_MALIK_PATH` | Path to your Obsidian vault (default: `/Users/malik/Vault/Malik`) |
| `OLLAMA_POLISH_ENABLED` | Enable Qwen transcript cleanup (default: `true`) |
| `OLLAMA_CHAT_MODEL` | If set, replaces Claude CLI with Ollama entirely |

---

## Relationship with claude-atelier

MasterClaude is a personal fork of [claude-atelier](https://github.com/malikkaraoui/claude-atelier).

| | claude-atelier | MasterClaude |
|-|----------------|--------------|
| Scope | Public npm framework | Personal runtime |
| Published | ✅ npm | ❌ personal use |
| Purpose | Shareable rails for Claude Code | Full OS for one person |
| Vault | Project vault (Peter) | Obsidian personal brain |

Improvements made here may be upstreamed to claude-atelier when applicable.

---

<details>
<summary>🇫🇷 Version française</summary>

## Ce que c'est

**MasterClaude** n'est pas un harnais npm générique.  
C'est un **système d'exploitation personnel** pour Claude Code :

- **Daemon macOS KeepAlive** — tourne en permanence via LaunchAgent
- **Interface Telegram** — tu parles à Claude depuis ton iPhone, il agit sur ta machine
- **Vault Obsidian comme cerveau** — ton vault injecté dans chaque session (index projets, synthèses, journal). Claude sait déjà tout, tu ne ré-expliques jamais.
- **LLM local via Ollama** — Whisper pour la voix, Qwen pour nettoyer la transcription, Claude pour raisonner
- **Multi-projets** — routing Telegram → bonne session Claude selon le projet actif

### Pipeline message vocal

```
Message vocal → Whisper (audio→texte) → Qwen (nettoyage) → Claude (+ vault injecté)
Message texte → Claude directement (+ vault injecté)
```

### But en une phrase

Tu envoies un message depuis ton iPhone. Claude répond et agit sur ta machine, en connaissant déjà tous tes projets.

</details>

---

<div align="center">
<sub>Personal use · not published on npm · MIT</sub>
</div>
