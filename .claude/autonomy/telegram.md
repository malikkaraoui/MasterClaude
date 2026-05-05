# Telegram Bridge — Mode nuit autonome

## Vue d'ensemble

Bridge unidirectionnel Telegram ↔ Claude Code. Reçoit des prompts / commandes Telegram, envoie des alertes de session en temps réel (commits, push, erreurs, budget, gate KO). Zéro dépendance cloud (Whisper + Ollama local). Idéal pour une surveillance et interaction mobile passive.

## Démarrage

```bash
# 1. Copier le template env
cp src/templates/telegram.env.example .env

# 2. Remplir les valeurs obligatoires dans .env
TELEGRAM_BOT_TOKEN=<de @BotFather>
TELEGRAM_CHAT_ID=<ton chat ID>
ALLOWED_USERS=<ton user_id Telegram>
APPROVED_DIRECTORY=/Users/moi/projects/mon-app

# 3. Vérifier Ollama est actif (:11434)
ollama list

# 4. Lancer le bridge
npx claude-atelier telegram start

# 5. Envoyer un message test au bot
```

**Prérequis** : Token Telegram, user_id, Ollama actif (4GB VRAM min), Faster-Whisper installé (pip3 install faster-whisper).

## Commandes disponibles

| Commande | Effet | Exemple |
|----------|-------|---------|
| `/status` | État session Claude + budget restant | `/status` → `✓ Actif · Budget: $38.5/$50` |
| `/new <prompt>` | Nouvelle tâche avec prompt | `/new ajouter test unitaire` |
| `/stop` | Pause la session Claude | `/stop` → `⏸️ Session pausée` |
| `/resume` | Reprend après `/stop` | `/resume` → `▶️ Session active` |
| `/cd <path>` | Change le répertoire de travail | `/cd /Users/moi/projects/autre-app` |
| `/budget` | Affiche le budget utilisé / restant | `/budget` → `Used: $11.5 / Limit: $50` |
| `/pulse` | Logs 10 dernières lignes | `/pulse` → affiche console Claude |

Vocal : envoyer un message vocal → transcrit en français (faster-whisper), polished par Ollama, envoyé à Claude.

## Mode nuit — Alertes FIFO

Claude envoie des alertes via un FIFO nommé `/tmp/claude-telegram-out`. Le bridge écoute et relaie vers Telegram.

**Format de sortie** : une ligne par alerte, **sans retour à la ligne**. Préfixe emoji standardisé.

### Alertes disponibles

```
✅ Commit : {message}
   Déclenché par : hook git post-commit, ou §25 handoff

🚀 Push effectué sur {branch}
   Déclenché par : hook git post-push

🔴 Gate KO : {étape} — {détail}
   Exemple: 🔴 Gate KO : secrets-scan — api_key trouvée en dur
   Déclenché par : pre-push-gate.sh

⚠️ Session silencieuse depuis {durée}
   Exemple: ⚠️ Session silencieuse depuis 45 min
   Déclenché par : heartbeat checker

🔴 Erreur Anthropic API — Claude stoppé
   Exemple: 🔴 Erreur Anthropic API [rate limit] — Claude stoppé
   Déclenché par : runner Claude si 401/429/500

💰 Budget {max}$ atteint — session stoppée
   Exemple: 💰 Budget $50 atteint — session stoppée
   Déclenché par : meter avant chaque appel API

⏸️ Signal SIGTERM reçu — session sauvegardée
   Déclenché par : trap dans runner
```

## Intégration FIFO — Comment écrire une alerte

Depuis un hook ou script Node.js :

```bash
# Bash (hook)
echo "✅ Commit : feat: add telegram bridge" > /tmp/claude-telegram-out

# Node.js
const fs = require('fs');
fs.writeFileSync('/tmp/claude-telegram-out', '🚀 Push effectué sur main', { flag: 'w' });
```

**Important** : le bridge écoute en continu. Chaque ligne écrite dans le FIFO déclenche une alerte Telegram immédiate (< 2s).

## Vault Peter — Enregistrement

Chaque interaction Telegram est enregistrée dans `vault/.peter/inbox/telegram/` :

```
vault/.peter/inbox/telegram/
└── 2026-05-04.jsonl    # une entrée JSON par ligne (append-only)
```

Format d'une entrée :
```json
{"ts":"2026-05-04T22:31:00","type":"text","transcript":"...","response_summary":"...","session":"abc123","cost_usd":0.01}
```

Désactiver : `VAULT_WRITE_ENABLED=false` dans `.env`.

## Sécurité

- **Whitelist** : `ALLOWED_USERS` = seul ce user_id peut invoquer Claude
- **Path isolation** : `APPROVED_DIRECTORY` = racine de tous les chemins relatifs
- **Rate limit** : `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` bloque les flood
- **Secrets** : jamais de logs API keys, tokens relayés via env vars uniquement
- **Token Telegram** : jamais en dur, toujours `.env` ignoré par git

Vérifier : `.gitignore` inclut `.env` et `/tmp/claude-telegram-*`.
