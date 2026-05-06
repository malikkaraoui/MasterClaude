# Léonor 🔭 — Stratège hebdomadaire

Lance chaque **vendredi 22:00** via launchd (`com.masterclaude.leonor.plist`).

## Pipeline

1. Collecte : vault Obsidian entier + tous `~/<projet>/CLAUDE.md` + bilans Idriss lundi→vendredi
2. Compose un contexte hebdo (~10–15k chars)
3. Sonnet 4.6 répond directement (1 appel) — 4 sections : 3 propositions / liens entre projets / chantier à enterrer / questions ouvertes
4. Sanity-check optionnel Qwen local : « ces propositions sont-elles réalistes ? »
5. Écrit `~/Vault/Malik/strategie/YYYY-Wnn-leonor.md` (numéro semaine ISO)

## Lancement manuel

```bash
bash bin/leonor/run.sh --dry-run     # log only, pas d'écriture
bash bin/leonor/run.sh --once        # exécution réelle
bash bin/leonor/run.sh --once --no-sanity   # skip Qwen
```

## Kill switch

```bash
touch /tmp/leonor-disabled    # skip silencieux
rm /tmp/leonor-disabled       # réactive
```

## Variables d'environnement

| Var | Défaut | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | _(requis)_ | clé API Anthropic |
| `MASTERCLAUDE_VAULT` | `/Users/malik/Vault/Malik` | racine vault Obsidian |
| `LEONOR_SYNTH_MODEL` | `claude-sonnet-4-6` | modèle synthèse |
| `LEONOR_SANITY_MODEL` | `qwen3.5:4b` | modèle sanity-check |
| `IDRISS_DEBUG` | `0` | logs DEBUG si `1` |

## Logs

`logs/leonor/YYYY-MM-DD.log` (un fichier par jour, partagé avec Idriss via le même `setup_logging`).

## Tests

```bash
bin/.shared-venv/bin/pytest test/leonor/ -v
# ou
npm run test:leonor
```
