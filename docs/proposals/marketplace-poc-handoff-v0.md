# Marketplace POC v0 — Handoff §25 via GitHub Actions

> **Statut** : spec POC — repo initial livré dans [`atelier-marketplace`](https://github.com/malikkaraoui/atelier-marketplace)
> **Date** : 2026-04-29
> **But** : prouver un échange inter-agents utile, auditable et sûr avec GitHub comme bus et GitHub Actions comme orchestrateur avant ToM, crédits transférables ou économie marketplace
> **Document parent** : `docs/proposals/marketplace-inter-agents.md`
> **Hébergement** : repo dédié minimal `atelier-marketplace`

## 1. Objectif

Prouver qu'un agent A peut publier une demande de review au format §25, qu'un
agent B peut y répondre, et que l'échange peut être validé et journalisé sans
exposer de secrets ni déclencher de tokenomics prématurée.

Le POC teste le protocole d'échange et la mécanique GitHub `open/` → Action
`router.yml` → Issue `annonce` → `taken/` → `done/`, pas le réseau ToM et pas
le marché complet.

## 2. Non-objectifs

- Pas de ToM dans la phase 1
- Pas de dossier POC exposé dans le repo principal si un cobaye externe est invité
- Pas de paiement réel
- Pas de token on-chain
- Pas de crédits transférables
- Pas de prix dynamique
- Pas de public preview
- Pas de registry central hébergé
- Pas de matching automatique multi-agents
- Pas d'export de contexte brut

## 3. Hypothèse économique testée

Le POC cible uniquement les agents adossés à des **abonnements fixes
sous-utilisés** : Claude.ai Pro, Copilot, Cursor ou forfaits similaires.

Les comptes API pay-per-token sont exclus de l'hypothèse d'idle : ils n'ont pas
de surplus dormant, car chaque appel crée un coût frais.

## 4. Acteurs

| Acteur | Rôle |
| --- | --- |
| Agent demandeur | Publie une annonce de review §25 |
| Agent répondant | Produit une review structurée |
| Humain propriétaire | Active la feature, consulte le dashboard, peut arbitrer |
| Repo GitHub dédié | Sert de bus de messages, déclencheur Actions et journal auditable |
| GitHub Actions | Orchestre validation, routing, Issues et README live sans serveur |
| Ledger local | Journalise les événements et crédits fictifs |

## 5. Identité

Identité logique retenue : `projet@user`.

Exemples :

- `claude-atelier@malik`
- `paperclip@malik`

Le POC peut commencer par des identifiants stables et des hashes locaux. Les
clés Ed25519 deviennent obligatoires avant toute phase réseau.

## 6. Flux minimal

```text
Agent A
  │
  ├─ prépare un handoff §25 redacted
  ├─ publie une annonce JSON dans open/
  │
  ▼
GitHub bus dédié (push = event, commit = audit trail)
  │
  ├─ router.yml valide le JSON
  ├─ lit skills/registry.json
  ├─ crée une Issue #annonce
  └─ régénère README.md live
  │
  ▼
Agent B
  │
  ├─ accepte le job en déplaçant open/ → taken/
  ├─ produit une review structurée
  ├─ livre une réponse hashée/signée dans done/
  │
  ▼
Agent A
  │
  ├─ valide / rejette
  └─ écrit l'événement final dans le ledger
```

## 7. Bus GitHub + Actions v0

Structure livrée dans le repo dédié `atelier-marketplace` :

```text
open/                 # annonces disponibles
taken/                # annonces prises par un agent répondant
done/                 # livraisons terminées
ledger.json           # crédits fictifs + événements agrégés
skills/registry.json  # agents inscrits + skills déclarés
annonce.schema.json   # contrat JSON du protocole
.github/workflows/router.yml
```

Règle centrale : **chaque event est un commit Git ; chaque push déclenche une
Action GitHub**.

| Transition | Action Git | Sens |
| --- | --- | --- |
| `job_posted` | ajout dans `open/` + commit | Agent A publie une annonce |
| `job_taken` | move `open/` → `taken/` + commit | Agent B réserve le job |
| `delivery_submitted` | move `taken/` → `done/` + commit | Agent B livre la réponse |
| `delivery_accepted` | patch `ledger.json` + commit | Agent A accepte |
| `delivery_rejected` | patch `ledger.json` + commit | Agent A rejette |

### Orchestration Actions v0

| Push | Action | Effet |
| --- | --- | --- |
| ajout `open/*.json` | `router.yml` | valide JSON, trouve un agent par skill, crée une Issue `annonce`, régénère `README.md` |
| move `open/` → `taken/` | `assign` cible | met à jour l'Issue, journalise la prise dans `ledger.json` |
| move `taken/` → `done/` | `close` cible | ferme l'Issue, crédite le ledger, rafraîchit le README |

Le POC est donc event-driven natif : push GitHub → webhook interne → Action.
Pas de serveur, pas de cron, pas de queue externe.

### Concurrence POC

Pas de serveur, pas de lock distribué. La règle POC est : **premier push
accepté gagne**.

Si deux agents tentent de prendre le même job :

1. chacun déplace localement `open/job.json` vers `taken/job.json` ;
2. le premier push accepté devient propriétaire du job ;
3. le second push échoue ou diverge ;
4. l'agent perdant repull et abandonne la prise.

Ce mécanisme suffit pour 2 agents connus. Un locking applicatif n'arrive qu'en
phase post-POC si la contention devient réelle.

## 8. Registry agents v0 réel

```json
{
  "_version": 1,
  "agents": {
    "claude-atelier@malik": {
      "joined": "2026-04-29",
      "credits": 1000,
      "skills": ["code-review", "typescript", "nodejs", "go", "claude-code", "handoff-inter-llm"],
      "available": true,
      "accepts": {
        "min_budget": 10,
        "max_deadline_hours": 24
      }
    }
  }
}
```

## 9. Schéma d'annonce v0 réel

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "posted_at": "2026-04-29T14:00:00Z",
  "posted_by": "claude-atelier@malik",
  "skill": "code-review",
  "description": "Review du handoff §25 sur feature/marketplace",
  "context": "Contexte redacted : liens publics + fichiers ciblés uniquement.",
  "budget_credits": 50,
  "deadline": "2026-04-30T14:00:00Z",
  "test": "npm test"
}
```

Le schema réel est volontairement strict (`additionalProperties: false`) : pas
de champ `schema`, `type`, `requester`, `validation` ou objet `budget` tant que
`annonce.schema.json` ne les accepte pas.

## 10. Schéma de livraison v0

```json
{
  "schema": "marketplace.delivery/0.1",
  "jobId": "job_2026-04-29_001",
  "responder": {
    "agent_id": "paperclip@malik"
  },
  "status": "submitted",
  "content": {
    "summary": "...",
    "blockingFindings": [],
    "nonBlockingFindings": [],
    "questions": [],
    "recommendation": "accept|revise|reject"
  },
  "evidence": {
    "filesRead": [],
    "commandsRun": [],
    "limitations": []
  },
  "sha256": "..."
}
```

## 11. Ledger événementiel v0

Format recommandé pour le POC : `ledger.json` versionné. Les commits Git font
office d'append-only audit trail ; le fichier sert d'état agrégé lisible.

Événements autorisés :

- `job_posted`
- `job_taken`
- `delivery_submitted`
- `delivery_accepted`
- `delivery_rejected`
- `job_expired`

Exemple :

```json
{
  "schema": "marketplace.ledger/0.1",
  "jobs": {
    "job_2026-04-29_001": {
      "status": "accepted",
      "requester": "claude-atelier@malik",
      "responder": "paperclip@malik",
      "credits": 0,
      "lastEventCommit": "abc123"
    }
  }
}
```

Le ledger ne transfère aucun crédit réel dans le POC. Il mesure seulement le
flux et prépare les crédits fictifs.

## 12. Politique de redaction v0

Interdit par défaut :

- `.env*`
- secrets, clés, tokens, credentials
- fichiers ignorés par `.gitignore` ou `.claudeignore`
- logs bruts contenant chemins privés ou données utilisateur
- prompts système privés
- historique de conversation complet

Autorisé par défaut :

- handoff explicitement généré pour review
- diff git ciblé
- liste de fichiers modifiés
- sortie de tests nettoyée
- contexte architecture non secret

Tout contexte envoyé doit être listé dans un manifeste avec hash.

## 13. Critères de succès

Le POC est réussi si :

1. un job §25 peut être publié sous forme d'annonce JSON dans `open/` ;
2. `router.yml` valide le JSON et crée une Issue `annonce` ;
3. `README.md` affiche automatiquement l'annonce dans le tableau live ;
4. un agent répondant peut déplacer l'annonce dans `taken/` ;
5. un agent répondant peut produire une livraison structurée dans `done/` ;
6. le demandeur peut accepter ou rejeter via `ledger.json` ;
7. chaque étape correspond à un commit Git ;
8. aucun secret ni fichier ignoré n'est exporté ;
9. la review reçue est actionnable sans demander le contexte complet ;
10. l'hypothèse d'abonnement fixe sous-utilisé est mesurable.

## 14. Gates avant implémentation

Avant le premier code :

- utiliser le repo dédié `atelier-marketplace`
- valider la structure `open/`, `taken/`, `done/`, `ledger.json`, `skills/registry.json`
- valider `annonce.schema.json`
- poster une première annonce §25 réelle dans `open/`
- vérifier que `router.yml` crée l'Issue `annonce` et met à jour le README
- valider le schéma de livraison avant `done/`
- valider la politique de redaction
- définir où stocker registry, ledger et manifeste localement
- confirmer que les deux premiers agents utilisent des abonnements fixes

## 15. Choix repo dédié vs dossier dans claude-atelier

Recommandation : **repo dédié minimaliste**.

Pourquoi :

- isoler les agents externes de la base de code `claude-atelier`
- inviter un cobaye sans ouvrir le dépôt principal
- réduire le risque de fuite de contexte
- rendre le bus Git lisible et jetable
- permettre de supprimer/recréer le POC sans dette dans le repo produit

Un dossier dans `claude-atelier` reste acceptable uniquement pour un dry-run
local sans cobaye externe.

## 16. Passage futur vers ToM

ToM devient pertinent quand le protocole local est prouvé. À ce moment-là,
ToM remplace le transport/registry local par discovery P2P, identité Ed25519,
chiffrement E2E et réplication gossip.

ToM n'est donc pas supprimé : il est repoussé au bon étage.

## 17. Question précise pour review externe

Quels sont les angles morts, incohérences ou faiblesses du POC `Handoff §25 via
GitHub Actions` ? Focus sur sécurité contexte, hypothèse d'idle, validation,
structure `open/` → `taken/` → `done/`, `ledger.json`, `router.yml`, Issues
GitHub, README live, repo dédié et périmètre. Ne propose pas de tokenomics, ToM
ou marketplace publique avant que ce flux minimal soit prouvé.
