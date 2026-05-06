# Idriss 🌙 — Bilan quotidien

Lance chaque soir à **21:05** via launchd (`com.masterclaude.idriss.plist`).

## Pipeline

1. Collecte : notes Obsidian modifiées today, handoffs JSON, commits git de tous les repos `~/`
2. Compose un résumé brut Markdown
3. Fan-out parallèle :
   - `deepseek-v4-flash:cloud` (Ollama Cloud, via CLI `ollama run`)
   - `qwen3.5:4b` (local, via CLI `ollama run`)
4. Synthèse `claude-sonnet-4-6` (SDK anthropic) qui confronte les 2 IA
5. Écrit `~/Vault/Malik/journal/YYYY-MM-DD-bilan.md`

## Lancement manuel

```bash
bash bin/idriss/run.sh --dry-run    # log only, pas d'écriture
bash bin/idriss/run.sh --once       # exécution réelle
```

## Kill switch

```bash
touch /tmp/idriss-disabled    # skip silencieux au prochain run
rm /tmp/idriss-disabled       # réactive
```

## Variables d'environnement

Lues depuis `.env` racine MasterClaude :

| Var | Défaut | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | _(requis pour Sonnet)_ | clé API Anthropic |
| `MASTERCLAUDE_VAULT` | `/Users/malik/Vault/Malik` | racine vault Obsidian |
| `MASTERCLAUDE_HOME` | dérivé | racine repo |
| `IDRISS_MODEL_CLOUD` | `deepseek-v4-flash:cloud` | modèle Ollama Cloud |
| `IDRISS_MODEL_LOCAL` | `qwen3.5:4b` | modèle Ollama local |
| `IDRISS_SYNTH_MODEL` | `claude-sonnet-4-6` | modèle synthèse |
| `IDRISS_DEBUG` | `0` | passe en logs DEBUG si `1` |

## Degraded modes

- Cloud down → Qwen local seul
- Local down → DeepSeek cloud seul
- Les deux down → bilan brut sans synthèse + warning logs
- Sonnet down → bilan = brut + 2 réponses Ollama tels quels

## Logs

`logs/idriss/YYYY-MM-DD.log` (un fichier par jour, pas de rotation auto — Léonor du vendredi nettoiera).

## Tests

```bash
bin/.shared-venv/bin/pytest test/idriss/ -v
# ou via npm
npm run test:idriss
```
