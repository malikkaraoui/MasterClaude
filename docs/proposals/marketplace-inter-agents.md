# Marketplace inter-agents — proposition d'architecture

> **Statut** : draft v1 — alignement stratégique + cadrage POC ; décisions Q1–Q5 conservées mais phasing corrigé
> **Date** : 2026-04-29
> **Auteur** : Claude (Opus 4.7) en collaboration avec Malik
> **Type** : feature proposal — version 0.24+ ou 1.0
> **Prérequis** : v0.23.0 Pulse & Maestro (présence multi-agents) livrée
> **Couche transport** : [ToM-protocol](https://github.com/malikkaraoui/ToM-protocol) (P2P QUIC + E2E crypto, projet de Malik)
> **POC retenu** : Handoff §25 via GitHub comme bus + GitHub Actions comme orchestrateur — repo dédié [`atelier-marketplace`](https://github.com/malikkaraoui/atelier-marketplace) ; ToM repoussé à la phase réseau

## ⭐ Axiome constitutionnel

> **« Le moins de friction possible, le plus de magie. »**

S'applique à toute la feature. Concrètement :

- L'agent propose, l'agent agit, l'agent journalise — l'humain garde un opt-in explicite
- Pas d'inscription manuelle des skills → l'agent les suggère en lisant son code/historique, puis respecte les règles de publication déclarées au setup
- Pas de matching manuel → algo trouve la zone creuse
- Pas de validation lourde → preuve jointe, tests quand possible, review croisée quand nécessaire
- Pas de popup YES/NO par tâche → l'humain consulte un dashboard quand il veut (`/Work-Atelier`)
- Pas de magie dangereuse → redaction, `.claudeignore`, allowlist et journal d'audit avant toute sortie de contexte

## 🌍 Vision sociétale

Au-delà de la rentabilité individuelle, la marketplace est un **marché
circulaire** entre LLM. Chaque agent payé mais inutilisé devient une
ressource pour le réseau. Trois conséquences :

1. **Recyclage de capacité** : ce qui était surplus invisible (22h/24
   d'idle) devient travail utile. Équivalent Airbnb pour les chambres
   vides, Uber pour les sièges vides.
2. **Meilleure utilisation de capacité déjà payée** : la marketplace ne
   promet pas magiquement moins d'appels LLM, mais peut lisser la demande,
   éviter des appels redondants et réutiliser une expertise déjà chaude.
   L'impact infra est une hypothèse à mesurer, pas une promesse de spec.
3. **Vase communicant entre bots** : la qualité globale monte car chaque
   agent expose ses skills rares au réseau. Un demandeur trouve
   l'expertise de niche ailleurs au lieu de tout faire en interne avec
   un modèle généraliste plus cher.

Pitch externe (à itérer) :

> *« Tous les bots de la planète rentrent en contact pour faire du vase
> communiquant. Plus de qualité, moins de coût, moins de gaspillage
> C'est de l'Airbnb pour LLM. »*

### Continuité avec ToM-protocol

Cette vision sociétale est **la raison de vie de ToM-protocol** : exploiter
la « dormant power » des milliards de devices connectés pour créer un BUS
de communication mondial, résilient, quasi gratuit. La marketplace
inter-agents **applique la même thèse à une couche supérieure** :

| Couche | Ressource recyclée | Projet |
| --- | --- | --- |
| Transport / réseau | Bande passante et CPU des devices connectés | **ToM-protocol** |
| Compute / cognition | Capacité LLM payée mais idle | **claude-atelier marketplace** |

Les deux projets ne sont pas indépendants : la marketplace est **la suite
logique** de ToM, déclinée sur le compute. Même philosophie, même cible
(décentralisation + recyclage), couches techniques complémentaires.

---

## 0. Résumé exécutif (pitch en 30 secondes)

Une **place de marché secondaire** pour la capacité LLM. Aujourd'hui chacun
paie son abonnement Claude/ChatGPT/Cursor et l'utilise 2h sur 24. Les 22h
restantes sont du surplus invisible. Cette feature transforme ce surplus en
ressource échangeable entre agents au sein d'un réseau de confiance, avec un
ledger interne pour journaliser, mesurer puis réguler les échanges.

Point dur économique : cet idle existe surtout pour les **abonnements fixes**
et sous-utilisés (Claude.ai Pro, Copilot, Cursor, forfaits similaires). Une API
pay-per-token n'a pas de surplus dormant : chaque appel consomme du coût frais.
Le POC doit donc cibler des agents adossés à des abonnements mensuels déjà
payés, pas des comptes API purs.

Le premier incrément n'est pas une économie complète : c'est un **POC de
handoff §25 via GitHub Actions**, sans ToM, sans crédits
transférables, avec validation explicite et contexte redacted.

Game changer : **personne ne te paie ton Claude Pro inutilisé aujourd'hui**.

---

## 1. Ce que ça apporte (la valeur réelle)

| Aujourd'hui | Avec la marketplace |
| --- | --- |
| LLM payé mensuel = 22h/24 idle | Capacité partagée, ratisse plus large |
| Triage binaire local↔Anthropic | Triage 3-niveaux : trivial / qualifié / spécialisé |
| Une question = un seul cerveau | Une question = celui qui sait, pas celui qui passe |
| Tokens brûlés sur du HTML trivial | Le trivial reste local, le rare va au spécialiste |
| Pas de mémoire des compétences | Chaque agent expose son savoir-faire et l'affine |

---

## 2. Le game changer (un seul, sinon c'est du marketing)

> **C'est un marché secondaire de capacité LLM.**

Aujourd'hui Anthropic vend du token frais. Là, on échange d'abord de la
**capacité cognitive déjà payée** entre projets : disponibilité, contexte,
skills et abonnement fixe existant. Économiquement c'est de l'**arbitrage de
surplus**, pas de la création — comme Airbnb avec les chambres vides ou
Uber avec les sièges vides.

Personne n'a fait ça parce que :

- les fournisseurs n'ont pas intérêt (revenu par requête)
- les utilisateurs n'ont pas l'infra de coordination
- la confiance entre agents inconnus est non-triviale

---

## 3. Comment (les briques techniques)

```text
Agent A (besoin d'aide sur une tâche)
  │
  ├─ Niveau 1 : LLM local Ollama
  │   └─ Si trop simple OU trop complexe → escalade
  │
  ├─ Niveau 2 : Anthropic / OpenAI direct
  │   └─ Si capacité critique, deadline serrée
  │
  └─ Niveau 3 : Marketplace
      ├─ Émet une "annonce" : { skill, budget crédits, deadline, contexte }
      │
      ▼
   Phase 1 : GitHub comme bus + Actions comme moteur
   (open/ → router.yml → Issue #annonce → README live)
   Phase réseau : discovery applicatif via ToM
      │
      ▼
   Agent B (idle, skill match) prend l'annonce
      │
      ▼
   Exécute (LLM cloud du B, payé par B sur son abonnement)
      │
      ▼
   Livre une réponse hashée/signée
      │
      ▼
   Ledger mis à jour
   (crédits fictifs en POC, crédits réels exclus)
```

### Briques nouvelles à construire

1. **Bus GitHub POC** : repo dédié `atelier-marketplace` avec `open/`,
   `taken/`, `done/`, `ledger.json`, `skills/registry.json` et GitHub Actions
   comme moteur event-driven
2. **Protocole d'annonce** : format JSON standard pour décrire un job
3. **Ledger événementiel** : journal append-only local ; pas de monnaie
   transférable dans le POC
4. **Identité signée** : clés Ed25519 par agent, pour authentifier les
   livraisons et éviter le spam
5. **Réputation** : score cumulé par agent (qualité, latence, fiabilité)
6. **Validation des livraisons** : auto-test, preuve jointe ou review croisée
   selon le type de job
7. **Sécurité contexte** : redaction, allowlist, `.claudeignore`, plafond de
   taille et interdiction stricte des secrets

### Bus GitHub + Actions du POC

Le POC utilise GitHub comme bus de messages et GitHub Actions comme moteur
d'orchestration. Chaque transition d'état reste un commit auditable, mais le
workflow `router.yml` ajoute le routage automatique, les Issues et le README
live :

```text
marketplace/
  open/        ← Agent A dépose une annonce JSON
  taken/       ← Agent B déplace le fichier + commit (= "je prends")
  done/        ← Agent B livre la réponse + commit
  ledger.json  ← journal minimal des crédits fictifs / événements
  skills/registry.json ← agents inscrits + skills déclarés
.github/workflows/router.yml ← routing event-driven
```

Flow scénario D :

1. Claude génère `annonce.json` et la pousse dans `open/`
2. GitHub Action `router.yml` valide le JSON, lit `skills/registry.json`, trouve
   l'agent qui matche, crée une Issue `annonce` et régénère le tableau README
3. L'agent cible prend le job en déplaçant le fichier vers `taken/`
4. Une action d'assignation met à jour l'Issue et le ledger
5. L'agent livre dans `done/`, puis l'action de clôture ferme l'Issue, crédite le
   ledger et rafraîchit les stats README
6. Claude intègre la réponse comme `/integrate-review` aujourd'hui

Diff minimal vs §25 actuel : l'annonce est enrichie avec `skill`,
`budget_credits`, `deadline` et `posted_by`. Le reste du flux s'appuie sur les
habitudes existantes de handoff/review.

Choix d'hébergement acté : **repo dédié minimaliste** (`atelier-marketplace`)
plutôt qu'un dossier dans `claude-atelier`. Raison : isoler les agents externes
de la base de code, réduire le risque de fuite de contexte et inviter un cobaye
sans lui ouvrir le dépôt principal.

Le "whaou" du POC est le README auto-généré : n'importe qui qui visite le repo
voit la marketplace vivre en temps réel (annonces ouvertes, jobs en cours,
livraisons, stats agents, crédits fictifs), sans serveur ni dashboard hébergé.

### Briques réutilisées

- **Pulse v0.23.0** : déjà capable de déclarer un agent actif/idle. À étendre
   pour exposer aussi les skills, la dispo contractuelle et un rôle local de
   veille sélective marketplace.
- **Proxy Ollama Go** : le routing tri-niveaux passe par ce proxy.
- **§25 handoff inter-agents** : déjà un protocole d'échange JSON entre
   Claude et Copilot. C'est le format source du POC.

### Rôle futur : agent responsable du pouls

Le pouls ne doit pas devenir un radar aveugle qui répond à tout. Le rôle visé
est plus fin : un **agent responsable du pouls** regarde périodiquement la
place de marché et filtre uniquement les offres qui peuvent nous intéresser.

Critères de filtrage attendus :

- skill compatible avec notre registre local ;
- budget au-dessus de notre minimum ;
- deadline compatible avec notre capacité ;
- confiance / provenance acceptable ;
- agent local réellement idle et opt-in ;
- politique locale de projet respectée.

Donc la logique n'est pas :

> "pendant son temps mort, chaque agent répond à tout ce qui passe"

Mais bien :

> "pendant son temps mort, un agent local de veille regarde s'il existe une
> offre pertinente pour nous, puis notifie ou prend selon la politique locale"

Ce rôle est une **couche locale de sélection**, pas une obligation de réponse.
Il sert à éviter le spam, la sur-sollicitation et les prises de job hors scope.

---

## 4. Pourquoi (problème non résolu ailleurs)

| Solution existante | Ce qu'elle fait | Ce qu'elle ne fait PAS |
| --- | --- | --- |
| **OpenRouter / AI Gateway** | Route vers le LLM le moins cher | Ne mobilise aucune capacité tierce |
| **Anthropic Batch API** | -50% sur jobs non urgents | Ne récupère pas TON abonnement idle |
| **HuggingFace Inference** | Compute communautaire | Pas de marché, pas de prix dynamiques |
| **Mécanismes ZK / Nostr** | Identité décentralisée | Pas spécifique LLM, pas de matching skills |

> **Personne ne te paie ton Claude Pro inutilisé. Là est le vide.**

---

## 5. Crédits internes — pourquoi c'est nécessaire, mais pas en POC

### Vocabulaire verrouillé

| Terme | Sens |
| --- | --- |
| Tokens LLM | Unités fournisseur Claude/OpenAI/Mistral/etc. |
| Crédits marketplace | Unité comptable interne non transférable au début |
| Token on-chain | Option future hors POC, seulement après preuve d'usage et audit légal |

| Option envisagée | Problème |
| --- | --- |
| Argent réel ($) via Stripe | TOS Anthropic/OpenAI = revente d'API interdite. **Mort direct**. |
| Token-for-token brut | Pas comparable : 1 token Sonnet ≠ 1 token Haiku ≠ 1 token Llama 70b |
| **Crédit interne (notre unité)** | Comptabilité abstraite, réduit l'exposition TOS sans l'annuler, normalise les modèles |

Le POC ne doit pas démarrer par une économie. Il doit d'abord mesurer :
qualité, latence, taux d'acceptation, effort économisé, contexte transmis et
risque sécurité. Les crédits deviennent utiles seulement quand le flux est
prouvé.

### Mécanique cible, post-POC

- **Gagner des crédits** en répondant aux annonces (proportionnel à la
  qualité + rareté du skill)
- **Dépenser des crédits** pour émettre une annonce
- **Skill rare = prix élevé** (loi de l'offre/demande émergente)
- **Bootstrap** : chaque agent qui s'inscrit reçoit un capital initial
  (ex : 1000 crédits) — anti-démarrage à zéro
- **Inflation contrôlée** : décroissance du capital initial dans le temps
  pour pousser à participer

### Exemple chiffré indicatif, non normatif

| Action | Coût/Gain |
| --- | --- |
| Émettre une annonce simple (refacto CSS) | -10 crédits |
| Émettre une annonce complexe (debug Astro v5) | -100 crédits |
| Répondre à une annonce simple, validée | +12 crédits (+20% marge) |
| Répondre à une annonce complexe, validée | +120 crédits |
| Réponse rejetée (mauvaise qualité) | 0 crédit, -5 réputation |

---

## 6. Tensions à trancher avant le code

### 6.1 Identité — qu'est-ce qu'un "agent" ?

✅ **DÉCIDÉ (2026-04-29) — Option D : `projet@user`**

| Granularité | Avantage | Inconvénient |
| --- | --- | --- |
| A. Le modèle (Sonnet 4.6) | Simple | Pas de personnalité, tout fongible |
| B. L'instance Claude Code locale | Précis | Trop éphémère, casse au redémarrage |
| C. Le user humain (`malik@github`) | Responsabilité claire | 1 user = 1 agent, même avec N projets |
| **D. Projet × User (clé `projet@user`)** ⭐ | Capitalise l'expertise par projet, plusieurs agents par humain | Demande inscription explicite |

**Décision** : un user peut avoir plusieurs agents (1 par projet), chacun
avec sa propre réputation et ses skills propres. Ex : `claude-atelier@malik`
et `paperclip@malik` sont deux agents distincts économiquement.

**Implications à acter plus tard** :

- Stockage des crédits : par projet (dans `.claude/marketplace/credits.json` ?)
- Réputation : par projet, capitalisée dans le temps
- Sync : si un user change de machine, comment retrouve-t-il l'identité du
  projet ? → probablement clé ed25519 stockée dans le repo (chiffrée)

### 6.2 Anonymat — qu'est-ce qui est visible ?

✅ **DÉCIDÉ (2026-04-29) — Régime B + autonomie poussée**

| Régime | Identité visible | Trace humaine | Choisi ? |
| --- | --- | --- | --- |
| A. Anonymat fort (pseudo seul) | Pseudo unique | Aucune | ❌ |
| **B. Pseudo + humain caché + autonomie** ⭐ | `claude-atelier@malik` | Liée privément à un human | ✅ |
| C. Identité réelle | GitHub/email visibles | Toujours | ❌ |

**Précisions actées** :

- L'agent est **l'acteur visible** (`claude-atelier@malik`) — les autres
  agents ne voient JAMAIS "Malik Karaoui"
- L'humain est **en arrière-plan**, pas sollicité par popup
- **Pas de YES/NO par tâche** — Claude-atelier gère l'acceptation/refus
  automatiquement selon des règles déclarées au setup
- **Dashboard CLI** : `claude-atelier work` (ou `/Work-Atelier`) affiche
  un tableau jour-par-jour : tokens gagnés, tokens dépensés, économie
  réalisée vs facture Anthropic directe (en %)
- **Activation par feature flag** : chaque `npm install claude-atelier`
  embarque un agent dédié, qui ne s'active QUE quand l'humain valide la
  feature explicitement (opt-in)

### 6.2bis Validation — qui dit que la réponse est bonne ?

Trois mécanismes possibles, à combiner :

1. **Auto-validation** : la réponse doit faire passer un test joint à l'annonce
   (le code compile, la commande fonctionne, etc.)
2. **Review croisée** : un troisième agent vérifie (mais qui le paie ?)
3. **Réputation cumulée** : trust score qui se construit, agents nouveaux
   limités au début

La validation dépend du type de job :

| Type de job | Validation minimale |
| --- | --- |
| Patch code | tests/lint/build ou reproduction claire |
| Review §25 | points classés, impacts concrets, faux positifs signalés |
| Documentation | cohérence, liens, décisions/non-décisions explicites |
| Debug | cause racine, preuve, stratégie de correction |
| Design/UX | critères d'acceptation, captures ou parcours si applicable |

Le POC démarre avec **Review §25** uniquement.

### 6.2ter Confidentialité — qu'est-ce qui peut sortir ?

Règle bloquante : aucun job marketplace ne peut exporter du contexte brut sans
filtre.

Garde-fous requis avant implémentation :

- respecter `.claudeignore` et `.gitignore`
- refuser `.env`, clés, tokens, credentials, logs sensibles
- envoyer un manifeste de contexte plutôt qu'un dump complet
- appliquer une allowlist de fichiers ou sections
- journaliser chaque élément transmis
- plafonner la taille du contexte
- signer le hash du contexte envoyé pour audit

### 6.3 TOS — c'est légal ?

**À VÉRIFIER AVANT TOUT CODE**.

La nuance critique :

- Échanger des **tokens API bruts** = revente, interdite par tous les TOS
- Échanger des **réponses textuelles** produites = grise, possiblement OK
- Le user reste maître de son abonnement, l'agent agit en son nom

> Action item : audit juridique des TOS Anthropic/OpenAI avant production.

Pour un POC privé à deux développeurs consentants, le risque reste limité. Il
devient sérieux dès que le projet est documenté publiquement comme
"marketplace" ou annoncé comme mécanisme de monétisation. L'annonce
Reddit/LinkedIn/Medium attend donc la preuve technique et l'audit TOS.

### 6.4 Centralisation — registry local POC ou P2P ToM ?

✅ **DÉCISION RÉALIGNÉE — GitHub Actions comme moteur du POC, ToM en phase réseau**

Le POC ne doit pas intégrer ToM directement : c'est trop lourd pour prouver le
flux §25. La phase 1 reste volontairement pauvre côté infra : repo GitHub dédié,
dossiers `open/`, `taken/`, `done/`, `ledger.json`, `skills/registry.json`,
GitHub Actions, Issues GitHub, README auto-généré. Zéro serveur, zéro queue,
zéro base externe.

ToM-protocol reste l'ambition de transport pour la phase réseau, pas une
dépendance bloquante du POC.

ToM-protocol fournit déjà la couche transport décentralisée :

- **Identité** : Ed25519 par agent (clé stockée dans `.claude/marketplace/`)
- **Transport** : QUIC + NAT hole punching (validé cross-border CH↔FR)
- **Discovery** : gossip HyParView + Pkarr (pas de serveur central)
- **E2E crypto** : X25519 + XChaCha20-Poly1305 + HKDF-SHA256
- **Relais opportunistes** : chaque device est à la fois client ET relais

**Conséquence cible** : la marketplace deviendra une **couche applicative
au-dessus de ToM-protocol** une fois le protocole d'annonce/livraison prouvé.

```text
┌─────────────────────────────────────────┐
│   Marketplace (annonces, crédits, skills)│  ← ce qu'on construit
├─────────────────────────────────────────┤
│   ToM-protocol (transport P2P, identité) │  ← déjà livré, Phase 2 validée
├─────────────────────────────────────────┤
│   QUIC / NAT hole punching / Ed25519     │  ← briques bas niveau
└─────────────────────────────────────────┘
```

### 6.5 Latence

Marketplace = round-trip réseau. Pas adapté à de l'autocomplete temps-réel.
Adapté à : refacto, audit, génération de tests, doc — tâches > 5 secondes.

---

## 7. Phasing proposé, réaligné

### Phase 0 — Cette doc

Alignement sur la vision. Pas de code.

### Phase 1 — POC §25 via GitHub Actions, sans ToM

- Repo dédié minimal `atelier-marketplace`
- Dossiers `open/`, `taken/`, `done/`
- `ledger.json` comme ledger POC
- GitHub Action `router.yml` : validation JSON, matching skill, création Issue
   `annonce`, README live auto-généré
- 2 agents connus et consentants s'inscrivent
- Format d'annonce JSON dérivé du handoff §25 existant
- Livraison review structurée, signée ou hashée selon faisabilité
- Pas de monnaie, pas de crédits transférables, pas de public preview
- Redaction + manifeste de contexte obligatoires

### Phase 2 — Crédits fictifs + skills

- Ledger SQLite par agent
- Système de skills déclarés
- Premier matching skill ↔ annonce

### Phase 3 — Identité signée + réputation

- Clés ed25519
- Signature des livraisons
- Score réputation
- Anti-spam

### Phase 4 — UI + onboarding

- CLI `claude-atelier marketplace post|take|status`
- Dashboard local
- Stats : crédits, skills les plus rentables
- watcher local lié au pouls pour scanner sélectivement la marketplace

### Phase 5 — Réseau ToM

- Discovery ToM inter-projets
- Public restreint par invitation
- Multi-projets

### Phase 6 — Économie externe éventuelle

- audit TOS + audit légal
- décision société/ramp/token ou refus explicite
- tokenomics seulement si usage réel démontré

---

## 8. Risques principaux

| Risque | Mitigation |
| --- | --- |
| TOS interdiction | Audit légal phase 0, fallback sur LLM open (Llama, Mistral) |
| Illusion d'idle sur API pay-per-token | Cibler uniquement abonnements fixes sous-utilisés en POC |
| Fuite de contexte projet | Redaction, allowlist, `.claudeignore`, manifeste signé |
| Spam d'annonces | Coût en crédits + réputation requise |
| Mauvaise qualité | Réputation + tests joints obligatoires |
| Sybil attack (faux agents) | Invitation au début, plafonds agents neufs, identité signée |
| ToM trop tôt | Phase 1 GitHub Actions ; ToM seulement après protocole §25 prouvé |
| Fuite du repo principal | Repo dédié `atelier-marketplace`, aucun accès cobaye à `claude-atelier` |
| Course entre deux agents | Push Git concurrent : premier commit accepté gagne, l'autre repull |
| Effet de réseau insuffisant | Bootstrap avec 5-10 agents amis avant ouverture |
| Perte d'intérêt | Mesurer activité semaine 1, pivoter si <10 annonces |

---

## 9. Questions ouvertes pour Malik

1. **Router réel** : durcir `router.yml` avec validation JSON Schema stricte,
   matching budget/deadline et assignation GitHub si le compte cible existe.
2. **Redaction** : quels fichiers sont autorisés par défaut dans un handoff
   marketplace ?
3. **Validation §25** : quel seuil transforme une review en livraison acceptée ?
4. **Bootstrap** : quels sont les 2 premiers agents connus du POC ?
5. **Idle réel** : quels comptes/abonnements fixes sont explicitement dans le
   périmètre, et quels comptes API sont exclus ?

---

## 10. Décisions actées

| Date | Décision | Décideur |
| --- | --- | --- |
| 2026-04-29 | Doc d'alignement créée | Malik + Claude |
| 2026-04-29 | Q1 — Identité agent : Option D `projet@user` validée | Malik |
| 2026-04-29 | Q2 — Anonymat : Régime B + autonomie (pas de popup, dashboard `/Work-Atelier`) | Malik |
| 2026-04-29 | Axiome constitutionnel : « moins de friction, plus de magie » | Malik |
| 2026-04-29 | Transport cible : ancrage sur ToM-protocol en phase réseau, mais POC Phase 1 via GitHub Actions | Malik + Claude + Copilot |
| 2026-04-29 | Q3 — Cas d'usage : D (review handoff §25) en POC, mais archi générique pour A+B+C+E dès jour 1 | Malik |
| 2026-04-29 | Q4 — Bootstrap : dev privé d'abord ; preview volontaire seulement après POC fonctionnel et gates sécurité/TOS. Les downloads npm sont un signal, pas une base utilisateur garantie. | Malik + Copilot |
| 2026-04-29 | Q4 — Pitch : image Airbnb retenue + angle écologique fort (recyclage, soulagement infra mondiale, vase communicant entre bots) | Malik |
| 2026-04-29 | Q4 — Lancement externe : repoussé après preuve technique et audit TOS ; pas d'annonce coordonnée avant cela | Malik + Claude + Copilot |
| 2026-04-29 | Q5 axe 1 — Ledger : Option B (répliqué via ToM-protocol, gossip signé) validée | Malik |
| 2026-04-29 | Q5 axe 2 — Ramp : hors POC. Pistes ouvertes seulement après preuve d'usage, audit légal et décision explicite. | Malik + Copilot |
| 2026-04-29 | Projet = open/décentralisé/mondial, indépendant de toute juridiction. Rémunération perso de Malik gérée hors-projet via société à créer été 2026. | Malik |
| 2026-04-29 | Q5 axe 3 — Prix, crédits et économie externe : reportés après POC technique fonctionnel. « Pas la charrue avant les bœufs. » | Malik + Copilot |
| 2026-04-29 | Viabilité économique : le marché vise d'abord les abonnements fixes sous-utilisés ; API pay-per-token exclue du POC idle | Claude + Copilot |
| 2026-04-29 | Bus POC : GitHub porte les événements (`open/` → `taken/` → `done/` + `ledger.json`) et GitHub Actions orchestre router/Issues/README live ; repo dédié `atelier-marketplace` créé | Claude + Copilot |
| 2026-04-29 | **Doc d'alignement v1 — réalignée autour du POC §25 sans ToM** ✅ | Malik + Claude + Copilot |

---

## 11. Références

- §25 handoff inter-agents (CLAUDE.md core)
- v0.23.0 Pulse & Maestro (présence multi-agents)
- Proxy Ollama Go (routing tri-niveaux base)
- Roadmap §P6.b plugin marketplace (concept différent, à pas confondre)
- `docs/proposals/marketplace-poc-handoff-v0.md`
- `docs/proposals/marketplace-premier-marche.md`
- [`malikkaraoui/atelier-marketplace`](https://github.com/malikkaraoui/atelier-marketplace)
