# Brief review Claude — Marketplace POC v0 GitHub Actions

## Contexte

Repo : `claude-atelier` — framework Claude Code.
Stack : Node.js + Bash + Go/Ollama proxy.
Chantier : marketplace inter-agents, mais POC volontairement local et porté par
GitHub comme bus de messages + GitHub Actions comme orchestrateur natif.

## Fichiers à lire

1. `docs/proposals/marketplace-inter-agents.md`
2. `docs/proposals/marketplace-poc-handoff-v0.md`

## Sujet

Le retour Claude a été intégré :

- Scénario D conservé : handoff §25 comme seed du POC
- ToM retiré du POC Phase 1 et repoussé à la phase réseau
- POC limité à GitHub Actions : `open/` → `router.yml` → Issue `annonce` →
  `taken/` → `done/`
- `ledger.json` sert d'état agrégé ; chaque event reste un commit Git
- Repo dédié minimal `atelier-marketplace` créé plutôt qu'un dossier dans
  `claude-atelier`
- README live auto-généré par Action pour afficher annonces, stats agents et
  crédits fictifs
- Hypothèse économique explicitée : idle seulement sur abonnements fixes sous-utilisés
- API pay-per-token exclue du raisonnement idle
- Annonce publique repoussée après preuve technique + audit TOS

## Question précise

Quels sont les angles morts restants dans ce POC `Handoff §25 via GitHub Actions` ?
Focus sur ce qui casse réellement :

- structure `open/`, `taken/`, `done/`
- repo dédié vs dossier dans `claude-atelier`
- concurrence Git : deux agents qui prennent le même job
- `router.yml` : validation schema, matching skill, création Issue, README live
- `ledger.json` comme état agrégé
- format d'annonce §25
- validation de livraison
- redaction / fuite de contexte
- hypothèse abonnements fixes vs API pay-per-token
- TOS avant communication publique
- passage futur vers ToM

## Contraintes de review

- Ne pas proposer ToM dans la Phase 1
- Ne pas proposer de serveur ou queue externe dans la Phase 1
- Ne pas proposer de tokenomics avant POC fonctionnel
- Ne pas proposer de marketplace publique avant audit TOS
- Ne pas faire de cosmétique Markdown
- Classer les points : bloquant / important / amélioration
- Donner pour chaque point : problème, impact, correction exacte
