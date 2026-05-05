# Challenge architecture — MIRROR

Date : 2026-05-02  
Statut : critique architecture, pas implémentation

## Verdict

Architecture séduisante mais trop fragile pour un usage solo quotidien. Le risque principal : construire un système de mémoire qui consomme plus d’attention qu’il n’en économise.

Le point cassant : confier à un petit modèle local des décisions sémantiques critiques tout en multipliant les sources de vérité, les fichiers intermédiaires et les flux différés.

## Fragilités structurelles

- Trois niveaux (`cerveau/`, `_mirror/`, `vault/`) créent trois endroits où la vérité peut diverger.
- `context.md` injecté automatiquement est dangereux : une erreur MIRROR devient une base de raisonnement fausse pour Claude.
- Le cron nocturne crée une latence cognitive : une découverte utile à 14h ne remonte qu’à 02h.
- “Contexte frais” et “pas de watcher continu” sont en tension directe.
- `flow.log` append-only deviendra vite illisible sans index, rotation, résumé et requêtes.
- Le hash prouve l’intégrité du mouvement, pas la validité ni l’utilité de l’information.
- Graphify devient une dépendance critique alors qu’il devrait rester un index secondaire.
- Notes globales, documents, décisions projet et contexte opérationnel n’ont pas le même cycle de vie.
- Absence de TTL : les informations périmées vont survivre et polluer les reprises de session.
- Une mauvaise remontée peut être propagée du projet vers le cerveau, puis redescendre vers plusieurs projets.
- Pas de stratégie claire pour conflits entre projets.
- Pas de score de confiance par source : hypothèse, décision humaine, log de test et résumé PDF ne doivent pas peser pareil.

## Sur-ingénierie pour un développeur solo

- Deux agents, Graphify, MCP, Ollama, Obsidian, cron, vaults et logs : trop de surfaces de panne.
- Le routeur `_mirror/` ajoute une couche dont la valeur n’est pas prouvée.
- Le bidirectionnel CASCADE/BUBBLE est prématuré. La remontée utile est rare ; la descente ciblée est le vrai besoin.
- `pending-up.md` + décision MIRROR ajoute une cérémonie de plus. Claude peut déjà écrire une section “À remonter”.
- Le cron 02:00 paraît simple mais casse si la machine dort, si le job échoue ou si la session commence avant consolidation.
- Automatiser le routage avant de stabiliser la taxonomie est prématuré.

## Angles morts

- Le problème dur n’est pas le stockage, c’est la sélection du contexte à injecter.
- `context.md` peut grossir jusqu’à devenir nuisible. Il faut une limite stricte.
- Claude risque de lire le contexte injecté comme vérité fraîche.
- Il manque une séparation nette entre faits vérifiés, décisions, hypothèses, dettes et éléments à revalider.
- Il manque un rituel de début de session : lire un brief court, pas tout le vault.
- Il manque un rituel de fin de session : condenser ce qui a changé, ce qui est décidé, ce qui reste fragile.
- Risque de fuite de secrets si le cerveau ingère notes, logs, URLs, PDFs et projets.
- PDF, audio et images doivent garder une source vérifiable ; sinon les résumés deviennent invérifiables.
- Pas de gestion de suppression : si une info devient fausse, comment la retirer des projets déjà contaminés ?
- Pas de rollback si MIRROR route de mauvaises lignes dans plusieurs projets.
- Pas de métrique d’utilité : impossible de savoir si le système évite vraiment des relectures.

## Modèle 3B comme MIRROR

- Qwen2.5:3b peut aider au tri, mais ne doit pas décider seul.
- Routing sémantique simple : possible.
- Routing entre projets proches : fragile.
- Détection de doublons textuels : possible.
- Détection de doublons conceptuels : faible sans embeddings solides, règles et validation humaine.
- Décision de remontée globale : trop risquée pour un 3B autonome.
- Le modèle risque de sur-router “au cas où”, donc de polluer les projets.
- Le modèle risque aussi de sous-router silencieusement, ce qui est pire car invisible.

Rôle acceptable pour MIRROR :

- proposer des tags ;
- résumer ;
- suggérer des destinations ;
- signaler des doublons probables ;
- préparer une inbox de validation.

Rôle à refuser :

- modifier directement le contexte lu par Claude ;
- arbitrer les conflits ;
- décider seul des remontées globales ;
- propager automatiquement vers plusieurs projets ;
- nettoyer le cerveau global sans validation.

## Ce qui va casser en usage réel

- `flow.log` ne sera pas relu.
- `pending-up.md` deviendra une file d’attente oubliée.
- `context.md` gonflera.
- Les projets proches recevront du contexte l’un de l’autre.
- Les notes globales contiendront trop de détails locaux.
- Les découvertes temporaires survivront trop longtemps.
- Le cron ratera des consolidations.
- Les erreurs MIRROR seront détectées trop tard.
- Le système sera contourné par écriture directe dans les fichiers.
- La maintenance de la mémoire deviendra une tâche mentale en plus.

## Alternative 80/20

Réduire à une mémoire Markdown stricte, semi-automatique, avec validation humaine légère.

Par projet :

- `memory/brief.md` : résumé court lu au démarrage ;
- `memory/decisions.md` : décisions durables datées ;
- `memory/discoveries.md` : apprentissages projet ;
- `memory/todo-context.md` : suspens et prochaines actions ;
- `memory/upstream.md` : candidats à remonter globalement.

Global :

- `~/cerveau/index.md` : carte des projets ;
- `~/cerveau/global-decisions.md` : décisions transverses ;
- `~/cerveau/patterns.md` : patterns réutilisables ;
- `~/cerveau/sources/` : sources résumées et vérifiables ;
- `~/cerveau/inbox.md` : éléments en attente de validation.

Flux recommandé :

1. Claude écrit localement dans `memory/discoveries.md`.
2. Claude propose les remontées dans `memory/upstream.md`.
3. Un script collecte les `upstream.md` vers `~/cerveau/inbox.md`.
4. MIRROR propose tags, destinations et doublons probables.
5. L’humain valide les ajouts globaux.
6. Un script régénère les `brief.md` projet depuis les sources validées.

## Règles de sécurité architecture

- MIRROR ne modifie jamais directement un fichier lu automatiquement par Claude au démarrage.
- Graphify reste un index secondaire, jamais la source de vérité.
- `brief.md` est le seul fichier injecté automatiquement.
- `brief.md` doit rester court : 100 à 200 lignes maximum.
- Toute remontée globale passe par une inbox validée.
- Toute information périssable doit avoir une date ou une condition d’expiration.
- Les secrets doivent être filtrés avant toute remontée.

## Décision recommandée

Ne pas construire MIRROR comme agent autonome.

Construire d’abord un système : append local → résumé → inbox globale → validation → brief court.

MVP réel :

- `brief.md` par projet ;
- `discoveries.md` local ;
- `upstream.md` manuel ;
- `inbox.md` global ;
- MIRROR propose, ne décide pas ;
- aucune écriture automatique dans le contexte lu par Claude.

Si ce MVP ne tient pas dans l’usage quotidien, l’architecture à trois niveaux ne tiendra pas non plus.
