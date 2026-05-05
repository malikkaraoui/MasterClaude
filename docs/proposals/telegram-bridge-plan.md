# Chantier : Telegram Bridge bidirectionnel — claude-atelier

> Auteur : Claude Sonnet 4.6 — 2026-05-04
> Statut : Retour Copilot GPT-5.4 intégré — prêt à implémenter
> Source d'inspiration : https://github.com/RichardAtCT/claude-code-telegram

---

## Objectif

Permettre une communication bidirectionnelle complète entre l'utilisateur et Claude via Telegram :

- **Entrantes** : messages texte, vocaux (2 min+), fichiers, images
- **Sortantes** : réponses Claude, alertes mode nuit, résumés de commits, notifications d'erreur
- **100% local** : transcription vocale via `faster-whisper`, polish via Ollama — aucune API externe obligatoire hors Telegram et Anthropic

---

## Architecture globale

```
┌─────────────────────────────────────────────────────────┐
│                    UTILISATEUR                          │
│                  (Telegram mobile)                      │
└────────────────────────┬────────────────────────────────┘
                         │ vocal / texte / fichier / image
                         ▼
┌─────────────────────────────────────────────────────────┐
│            telegram-bridge.py  (service Python)         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Bot       │  │  Transcription│  │  Session      │  │
│  │  Telegram   │  │  faster-      │  │  SQLite       │  │
│  │  (polling)  │  │  whisper local│  │  (persistence)│  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
│         └────────────────▼───────────────────┘          │
│                          │                              │
│                  ┌───────▼────────┐                     │
│                  │  Ollama :11434  │                     │
│                  │  qwen2.5:3b    │                     │
│                  │  (polish texte)│                     │
│                  └───────┬────────┘                     │
└──────────────────────────┼──────────────────────────────┘
                           │ texte propre
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Claude CLI (subprocess)                 │
│              (session auto-resume par projet)           │
└────────────────────────┬────────────────────────────────┘
                         │ réponse texte
                         ▼
┌─────────────────────────────────────────────────────────┐
│   vault/.peter/inbox/telegram/  (inbox dédiée Peter)    │
│   fichier .jsonl append-only → ingestion par vault update│
│   Peter classe → décision ou découverte                 │
└─────────────────────────────────────────────────────────┘
```

---

## Flux détaillés

### A) Message texte → Claude → Telegram

```
1. Utilisateur envoie texte dans Telegram
2. Bot (polling) reçoit le message
3. Whitelist auth : ALLOWED_USERS vérifié
4. Rate limiter token bucket
5. Recherche session active (user_id, project_dir) dans SQLite
6. Si session existante → resume avec session_id
   Si nouvelle → nouvelle session Claude CLI
7. Claude CLI exécute, stream la réponse
8. Réponse formatée envoyée via bot.send_message()
9. Session mise à jour en SQLite
10. Entrée dans vault/.peter/inbox/telegram/YYYY-MM-DD.jsonl si significatif
```

### B) Vocal → transcription locale → Claude → Telegram

```
1. Utilisateur envoie vocal (ogg/mp3) dans Telegram
2. Bot télécharge le fichier audio localement (/tmp/)
3. faster-whisper (modèle à bencher — tiny ou base selon CPU) → texte brut
   - Langue : fr détectée automatiquement
   - ⚠️ bench réel tiny vs base sur 2-3 vocaux avant de figer le modèle
4. Ollama :11434 qwen2.5:3b → polish léger
   - Prompt : "Corrige légèrement ce texte transcrit sans le réécrire"
   - Timeout : 10s max, fallback = texte brut si timeout
5. Texte poli → même flux que message texte (étapes 5-10 ci-dessus)
6. Fichier audio supprimé de /tmp/ après traitement
```

### C) Claude → Telegram (notifications sortantes)

```
Mode nuit / alertes :
Claude écrit dans un FIFO Unix (mkfifo /tmp/claude-telegram-out à l'init)
    ↓
telegram-bridge.py surveille le FIFO (asyncio)
    ↓
bot.send_message(TELEGRAM_CHAT_ID, message)

Déclencheurs :
- Commit atomique effectué → "✅ Commit : {message}"
- Gate pré-push passée → "🚀 Push effectué sur {branch}"
- Gate échouée → "🔴 Gate KO : {étape} — {détail}"
- Session crashée (pouls silencieux) → "⚠️ Session silencieuse depuis {durée}"
- Erreur API 500 → "🔴 Erreur Anthropic API — Claude stoppé"
- Budget atteint → "💰 Budget {max}$ atteint — session stoppée"

Note Phase C : fiabiliser avec socket Unix ou spool append-only si FIFO instable en nuit
```

### D) Commandes Telegram → contrôle Claude

```
/status   → état session courante (modèle, coût, durée, tâche en cours)
/new      → force nouvelle session (abandon contexte courant)
/stop     → stoppe Claude proprement (équivalent Ctrl+C)
/resume   → reprend la dernière session interrompue
/cd <dir> → change le répertoire projet actif (validé via os.path.realpath)
/budget   → affiche le coût cumulé de la session
/pulse    → état du pouls (agents actifs, derniers heartbeats)
```

---

## Stack technique

### Service Python

```
telegram-bridge.py          # point d'entrée unique (~300 lignes)
├── TelegramBot             # polling, handlers, auth
├── VoiceTranscriber        # faster-whisper wrapper
├── OllamaPolisher          # appel HTTP Ollama :11434
├── SessionManager          # SQLite CRUD sessions (sqlite3 sync)
├── ClaudeRunner            # subprocess Claude CLI
├── NotificationFifo        # lecture FIFO /tmp/claude-telegram-out
└── InboxWriter             # append vault/.peter/inbox/telegram/
```

### Dépendances Python

```
python-telegram-bot>=22.6   # bot Telegram (polling)
faster-whisper>=1.0.0       # transcription vocale locale
python-dotenv               # .env loading
httpx                       # appels Ollama REST
# sqlite3 : stdlib Python — pas de dépendance externe
# anthropic SDK : non requis — Claude piloté via CLI subprocess
```

### Modèles locaux requis

| Usage                | Modèle               | Taille | Outil                    |
| :------------------- | :------------------- | :----- | :----------------------- |
| Transcription vocale | Whisper tiny ou base | 39–74M | faster-whisper (auto-DL) |
| Polish texte         | qwen2.5:3b           | ~2GB   | Ollama (déjà en place)   |

---

## Variables d'environnement

```bash
# Obligatoires
TELEGRAM_BOT_TOKEN=...          # depuis @BotFather
TELEGRAM_CHAT_ID=...            # ton ID (t.me/userinfobot)
ALLOWED_USERS=...               # ton Telegram user_id (whitelist)
APPROVED_DIRECTORY=/path/to/    # répertoire projet par défaut

# Claude
CLAUDE_MAX_TURNS=20
CLAUDE_TIMEOUT_SECONDS=300
CLAUDE_MAX_COST_USD=50.0
# ANTHROPIC_API_KEY non requis ici — géré par claude auth login

# Transcription vocale (local — pas d'API externe)
WHISPER_MODEL=tiny              # tiny par défaut, upgradé en base après bench Phase B
WHISPER_LANGUAGE=fr             # ou 'auto' pour détection

# Ollama polish
OLLAMA_HOST=http://localhost:11434
OLLAMA_POLISH_MODEL=qwen2.5:3b
OLLAMA_POLISH_TIMEOUT=10        # secondes, fallback=texte brut si dépassé
OLLAMA_POLISH_ENABLED=true      # false = skip polish, texte brut direct

# Sécurité
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=3600

# Vault Peter
VAULT_INBOX=vault/.peter/inbox/telegram
VAULT_WRITE_ENABLED=true        # false = désactive l'écriture inbox
```

---

## Structure fichiers dans claude-atelier

```
claude-atelier/
├── bin/
│   └── telegram.js              # CLI : npx claude-atelier telegram start|stop|status|test
├── scripts/
│   └── telegram-bridge.py       # service Python complet
├── .claude/
│   └── autonomy/
│       └── telegram.md          # docs usage + mode nuit
├── src/templates/
│   └── telegram.env.example     # template variables d'env
└── test/
    └── telegram.test.js         # tests smoke (bridge démarré ?)
```

---

## Intégration Peter / Vault

Le bridge écrit dans une **inbox dédiée append-only** — jamais directement dans `vault/10-mailbox.md` (risque de conflit avec Peter Node.js).

**Format inbox** (`vault/.peter/inbox/telegram/YYYY-MM-DD.jsonl`) :

```json
{"ts":"2026-05-04T22:31:00","type":"vocal","duration":"1m42s","transcript":"Pour le hook pre-push, est-ce qu'on pourrait ajouter une vérification des fichiers de config avant de push ?","response_summary":"Proposition de modifier scripts/pre-push-gate.sh étape 2 pour inclure un audit .claude/settings.json","session":"feat/pre-push-config-audit","cost_usd":0.08}
```

`vault update` ingère l'inbox → Peter promot en décision (`vault/20-decisions.md`) ou découverte (`vault/30-discoveries.md`) selon pertinence.

---

## Intégration Mode Nuit

Le bridge crée le FIFO à l'init :

```bash
mkfifo /tmp/claude-telegram-out 2>/dev/null || true
```

Claude (hook PostToolUse ou fin de tâche) écrit dans le FIFO :

```bash
echo "✅ Commit : feat: add pre-push config audit" > /tmp/claude-telegram-out
echo "🚀 Push effectué — gate verte, 3 étapes, 0 erreur" > /tmp/claude-telegram-out
```

---

## Phases d'implémentation

### Phase A — Bridge minimal bidirectionnel (texte only)

- `telegram-bridge.py` : bot polling + auth whitelist + Claude CLI subprocess
- `sqlite3` synchrone (stdlib) pour sessions
- `/status`, `/new`, `/stop`, `/cd` (avec validation `os.path.realpath`)
- Test : envoyer "bonjour" depuis Telegram, recevoir réponse Claude

### Phase B — Voix locale

- Intégration `faster-whisper` — démarrer avec modèle `tiny`
- **Bench réel** : tiny vs base sur 2–3 vocaux de 2min sur CPU Mac M-series
- Figer le modèle après bench
- Intégration Ollama polish (qwen2.5:3b), fallback texte brut si timeout

### Phase C — Notifications sortantes fiabilisées (mode nuit)

- FIFO `/tmp/claude-telegram-out` créé à l'init, surveillé en asyncio
- Hook PostToolUse écrit dans le FIFO après chaque commit/push/erreur
- Évaluation socket Unix si FIFO instable en session nuit prolongée
- `telegram.md` mise à jour avec exemples d'alertes

### Phase D — Inbox Peter + CLI

- `InboxWriter` : append `.jsonl` dans `vault/.peter/inbox/telegram/`
- `vault update` ingère l'inbox (modification Peter côté Node.js)
- `npx claude-atelier telegram start|stop|status|test` (`bin/telegram.js`)
- Lifecycle managé (PID file, restart auto)
- `test/telegram.test.js` smoke tests

---

## Contraintes et garde-fous

- **Whitelist stricte** : `ALLOWED_USERS` = liste fermée, refus silencieux si non listé
- **Path isolation** : Claude ne peut écrire **qu'à l'intérieur** de `APPROVED_DIRECTORY` — `/cd` validé via `os.path.realpath()`, refus des `..` et symlinks sortants
- **Budget hard cap** : `CLAUDE_MAX_COST_USD` — session stoppée au dépassement, alerte Telegram
- **Pas d'API externe pour la voix** : faster-whisper local, Ollama local
- **Fichiers audio éphémères** : supprimés de `/tmp/` immédiatement après transcription
- **Rate limit** : 100 requêtes / heure (token bucket)
- **Pas de secrets dans les logs** : `TELEGRAM_BOT_TOKEN` masqué
- **Zéro écriture concurrente vault** : inbox `.jsonl` dédiée, jamais de touch direct sur `10-mailbox.md`

---

## Hors scope (v1)

- Multi-utilisateurs (design pensé pour usage solo)
- Interface web de monitoring
- Upload de fichiers volumineux (>20MB)
- Réponses vocales (text-to-speech) — prévu v2
- Support de groupes Telegram (chat privé uniquement)
- Webhook mode (polling suffit pour usage solo)
