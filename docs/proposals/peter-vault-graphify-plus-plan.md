# Peter Vault — Graphify minimum, puis au-delà

> Statut : plan d’implémentation à donner à Claude
> Date : 2026-05-02
> Intention : ne pas faire une pâle copie de Graphify. Faire au minimum l’équivalent utile, puis construire une couche Peter plus personnelle, plus vivante, plus orientée projet et plus actionnable.

## 1. Vision produit

Peter n’est pas un dossier Markdown.

Peter est le **majordome mémoire du projet** : il accueille les idées qui arrivent en vrac, les relie au code, comprend ce qui compte, prépare Claude avant chaque session, et évite que Malik doive tout réexpliquer.

Graphify donne une carte.

Peter doit donner :

1. une carte ;
2. un graphe ;
3. une mémoire vivante ;
4. un tri des idées entrantes ;
5. une compréhension projet ;
6. une stratégie de reprise ;
7. des alertes sur ce qui devient obsolète ;
8. des propositions d’actions ;
9. un pont entre notes personnelles, roadmap, code et décisions ;
10. un bibliothécaire capable de ranger les Markdown projet selon leur nature, sans toucher aux artefacts BMAD.

La promesse utilisateur :

> “Je capture une idée n’importe où. Peter la retrouve, la range, la relie au bon projet, et Claude démarre déjà avec la bonne mémoire.”

## 2. Storytelling Peter

Peter doit avoir une identité claire, pas un nom collé sur un script.

### Rôle narratif

Peter est :

- le bibliothécaire du projet ;
- le majordome qui prépare le bureau avant l’arrivée de Claude ;
- le greffier qui date les décisions ;
- le cartographe qui tient la carte à jour ;
- le veilleur qui signale ce qui sent le renfermé ;
- le facteur qui vide la mailbox des idées entrantes ;
- le bibliothécaire qui classe les Markdown éparpillés sans casser les méthodes projet.

### Ton

Peter parle peu, mais utile.

Exemples de sorties :

```text
[PETER] Bureau préparé : 3 décisions actives, 2 idées entrantes, 1 risque stale.
[PETER] La roadmap a bougé depuis la dernière session. Lire vault/40-roadmap.md avant d’agir.
[PETER] Cette note ressemble à Freebox + claude-atelier. Je l’ai mise en quarantaine multi-projets.
```

### Règles de personnalité

- Peter ne flatte pas.
- Peter ne transforme jamais une hypothèse en fait.
- Peter garde les sources.
- Peter préfère “à challenger” à “certain”.
- Peter protège le contexte : il résume avant de déverser.
- Peter propose l’action suivante, pas une archive morte.

## 3. Positionnement face à Graphify

Peter doit reprendre les meilleurs mécanismes de Graphify, puis ajouter la couche projet/personnelle manquante.

| Sujet | Graphify | Peter Vault cible |
| --- | --- | --- |
| Carte courte | `GRAPH_REPORT.md` | `vault/PETER_REPORT.md` + injection SessionStart |
| Graphe | `graphify-out/graph.json` | `vault/index/graph.json` |
| Visualisation | `graph.html` | `vault/index/graph.html` puis vue D3/HTML locale |
| Cache | `graphify-out/cache/` | `vault/.peter/cache/` par SHA + mtime |
| Ignore | `.graphifyignore` | `.peterignore` + respect `.gitignore` |
| Hooks always-on | PreToolUse Glob/Grep + CLAUDE.md | SessionStart + PreToolUse Read/Grep/Glob + rappel stale |
| Obsidian | option `--obsidian` | export Obsidian + vault natif Markdown |
| Multimodal | code/docs/PDF/images/audio/video/URLs | même base + Apple Notes + captures + notes vocales + URLs personnelles |
| Query | `graphify query/path/explain` | `vault query/path/explain/brief/route/stale` |
| MCP | serveur graph optionnel | MCP Peter natif à terme |
| Mémoire projet | indirecte via graphe | centrale : décisions, mailbox, discoveries, roadmap |
| Agent dédié | skill `/graphify` | Peter comme agent mainteneur et protocole de session |
| Classement Markdown | non prioritaire | classification bugfix/update/fail/review/brainstorming/etc. + protection BMAD |

## 4. Architecture cible

```text
vault/
├── PETER.md                         # charte de Peter
├── 00-brief.md                      # synthèse courte maintenue
├── 10-mailbox.md                    # notes entrantes routées
├── 20-decisions.md                  # décisions durables
├── 30-discoveries.md                # apprentissages projet
├── 40-roadmap.md                    # roadmap vivante
├── 50-questions.md                  # questions ouvertes / à challenger
├── 60-architecture.md               # carte architecture humaine
├── 70-rituals.md                    # routines projet, commandes, gates
├── 80-links.md                      # URLs utiles enrichies
├── 90-sources.md                    # registre des sources
├── PETER_REPORT.md                  # carte générée courte façon GRAPH_REPORT
├── inbox/
│   ├── raw/                         # captures brutes entrantes
│   ├── parsed/                      # versions extraites/transcrites
│   └── quarantine/                  # contenu ambigu/multi-projets
├── library/
│   ├── catalog.json                  # catalogue des Markdown projet classés
│   ├── migrations.json               # propositions d'import/rangement vers vault
│   └── protected.json                # fichiers protégés, notamment BMAD
├── index/
│   ├── graph.json                   # graphe projet
│   ├── graph.html                   # visualisation locale
│   ├── wiki/                        # pages par communauté/nœud
│   ├── obsidian/                    # export Obsidian optionnel
│   └── manifest.json                # fichiers scannés + signatures
└── .peter/
    ├── cache/                       # cache SHA256/extractions
    ├── cost.json                    # coût token estimé/réel
    ├── state.json                   # dernier run, version, health
    ├── routes.json                  # règles de routage projet
    └── events.jsonl                 # journal append-only
```

## 5. Commandes CLI à implémenter

### Commandes MVP++

```text
claude-atelier vault init
claude-atelier vault status
claude-atelier vault report
claude-atelier vault update
claude-atelier vault watch
claude-atelier vault add <file|url|text>
claude-atelier vault route <source>
claude-atelier vault docs scan
claude-atelier vault docs classify
claude-atelier vault docs organize --plan
claude-atelier vault docs organize --apply
claude-atelier vault query "question"
claude-atelier vault path <nodeA> <nodeB>
claude-atelier vault explain <node>
claude-atelier vault stale
claude-atelier vault doctor
claude-atelier vault export --obsidian
claude-atelier vault export --html
claude-atelier vault mcp
```

### Détail fonctionnel

#### `vault report`

Génère `vault/PETER_REPORT.md`.

Contenu minimum :

- état projet ;
- god nodes / concepts centraux ;
- décisions actives ;
- risques ;
- idées entrantes non traitées ;
- connexions surprenantes ;
- fichiers chauds ;
- questions que le graphe peut aider à résoudre ;
- prochaine action recommandée.

#### `vault update`

Met à jour :

- `vault/index/manifest.json` ;
- `vault/index/graph.json` ;
- `vault/PETER_REPORT.md` ;
- `vault/.peter/cache/` ;
- éventuellement `vault/index/wiki/`.

Mode incremental : ne retraiter que les fichiers modifiés.

#### `vault add`

Accepte :

- chemin fichier ;
- URL ;
- texte inline ;
- transcript ;
- capture OCR déjà extraite ;
- YouTube/public video URL si dépendances disponibles.

Place d’abord dans `vault/inbox/raw/`, puis produit une entrée structurée dans `10-mailbox.md` ou `inbox/parsed/`.

#### `vault route`

Classe une note vers :

- ce projet ;
- un autre projet candidat ;
- multi-projets ;
- global/MIRROR futur ;
- rejet/quarantaine.

Ne jamais supprimer la source.

#### `vault docs scan`

Scanne tous les Markdown du projet et produit un catalogue sans rien déplacer.

Sortie cible : `vault/library/catalog.json`.

Pour chaque Markdown :

- chemin original ;
- titre principal ;
- taille ;
- date de modification ;
- sha256 ;
- nature détectée ;
- confiance ;
- statut : `active | archive | duplicate_candidate | protected | candidate_for_vault | ignore` ;
- raison de classement ;
- destination vault suggérée si pertinente ;
- relation au graphe.

#### `vault docs classify`

Classe les Markdown par nature.

Taxonomie minimale :

- `bug_fix` ;
- `update` ;
- `fail` ;
- `incident` ;
- `review` ;
- `handoff` ;
- `brainstorming` ;
- `architecture` ;
- `decision` ;
- `roadmap` ;
- `research` ;
- `runbook` ;
- `release` ;
- `test_report` ;
- `audit_security` ;
- `prompt` ;
- `meeting_notes` ;
- `source_note` ;
- `unknown`.

Le classement doit être explicable : Peter doit dire pourquoi il range un document dans une catégorie.

#### `vault docs organize --plan`

Génère un plan de rangement, sans modifier le repo.

Sortie cible : `vault/library/migrations.json` + résumé dans `PETER_REPORT.md`.

Le plan peut proposer :

- garder le fichier à sa place ;
- référencer le fichier depuis `vault/90-sources.md` ;
- créer une synthèse dans `vault/30-discoveries.md` ;
- créer/mettre à jour une décision dans `vault/20-decisions.md` ;
- créer une entrée roadmap dans `vault/40-roadmap.md` ;
- déplacer vers une archive projet si et seulement si explicitement demandé ;
- mettre en quarantaine si ambigu.

Par défaut, Peter **ne déplace pas** les Markdown existants. Il propose, référence, synthétise et attend `--apply`.

#### `vault docs organize --apply`

Applique uniquement les migrations sûres.

Règles strictes :

- ne jamais supprimer un Markdown source ;
- ne jamais déplacer sans copie/trace ;
- ne jamais modifier les fichiers protégés ;
- écrire un journal dans `vault/.peter/events.jsonl` ;
- écrire les sources dans `vault/90-sources.md` ;
- préférer la synthèse dans le vault plutôt que le déplacement physique.

### Protection BMAD — règle absolue

Peter ne doit pas toucher ce qui émane de la méthode BMAD.

Définition pratique : un fichier est `protected` si :

- son chemin contient `.bmad`, `bmad`, `BMAD`, `bmad-core`, `bmad-method` ;
- il est dans un dossier BMAD ;
- son frontmatter, titre ou contenu déclare BMAD ;
- il correspond à un artefact connu BMAD : PRD, architecture, story, epic, checklist, agent config BMAD ;
- son origine est incertaine mais ressemble à BMAD.

Pour un fichier BMAD/protégé, Peter peut :

- le détecter ;
- le lister dans `vault/library/protected.json` ;
- créer une référence read-only dans le graphe ;
- signaler qu’il existe.

Peter ne peut pas :

- le déplacer ;
- le renommer ;
- le réécrire ;
- le résumer dans un fichier vault comme s’il était source Peter ;
- l’importer dans `vault/` ;
- l’utiliser pour générer une décision sans validation explicite.

Message attendu :

```text
[PETER] BMAD détecté : fichier protégé, indexé en lecture seule, aucune migration proposée.
```

#### `vault query`

Interroge `vault/index/graph.json` et retourne un contexte court avec :

- nœuds pertinents ;
- relations ;
- sources ;
- niveau de confiance ;
- fichiers à lire ensuite.

#### `vault stale`

Détecte :

- brief ancien ;
- roadmap ancienne ;
- décisions non revalidées ;
- mailbox qui grossit ;
- sources sans traitement ;
- graph plus vieux que le dernier commit.

## 6. Graphe Peter

Peter doit construire un graphe local, pas une simple liste Markdown.

### Types de nœuds

- `project`
- `file`
- `symbol`
- `function`
- `class`
- `decision`
- `idea`
- `source`
- `url`
- `note`
- `roadmap_item`
- `risk`
- `question`
- `person`
- `external_project`
- `concept`
- `markdown_document`
- `doc_category`
- `protected_artifact`

### Types d’arêtes

- `mentions`
- `implements`
- `depends_on`
- `rationale_for`
- `decided_by`
- `contradicts`
- `duplicates`
- `supersedes`
- `blocks`
- `suggests`
- `belongs_to_project`
- `candidate_for_project`
- `derived_from_source`
- `semantically_similar_to`
- `needs_review`
- `classified_as`
- `candidate_for_vault_import`
- `protected_by_method`
- `summarized_into`

### Niveaux de confiance

Comme Graphify, chaque relation doit être taguée :

- `EXTRACTED` : trouvé directement dans source/code/doc ;
- `INFERRED` : inférence raisonnable ;
- `AMBIGUOUS` : nécessite validation ;
- `USER_CONFIRMED` : validé explicitement par Malik ;
- `STALE` : potentiellement obsolète.

## 7. Extraction / ingestion

### Code

Minimum Graphify-like :

- AST local quand possible ;
- imports ;
- fonctions/classes ;
- commentaires `WHY`, `NOTE`, `HACK`, `IMPORTANT` ;
- liens test ↔ code ;
- commandes package/scripts.

Pour Node.js MVP : parser léger via regex/AST simple, puis extension plus tard.

### Markdown/docs

Extraire :

- titres ;
- décisions ;
- TODO ;
- liens ;
- concepts ;
- sections “risques”, “roadmap”, “architecture”.

Peter doit aussi classifier les Markdown existants du projet par nature : bug fix, update, fail, review, brainstorming, handoff, architecture, décision, roadmap, recherche, runbook, release, audit, prompt, notes de réunion.

Le but n’est pas de “mettre tout dans le vault”. Le but est de :

1. savoir ce qui existe ;
2. éviter les doublons ;
3. relier chaque document au graphe ;
4. importer dans le vault seulement ce qui devient mémoire projet utile ;
5. laisser à leur place les documents qui appartiennent à une méthode, une release, une PR, une doc officielle ou BMAD.

### Rangement Markdown projet

Peter doit agir comme un bibliothécaire conservateur : il classe avant de bouger.

Pipeline :

1. scan des Markdown hors dossiers ignorés ;
2. détection des zones protégées, notamment BMAD ;
3. classification par nature ;
4. score de pertinence vault ;
5. proposition de destination ;
6. indexation dans `vault/library/catalog.json` ;
7. création de relations dans `vault/index/graph.json` ;
8. import/synthèse uniquement si pertinent et non protégé.

Score de pertinence vault :

- `high` : décision, découverte durable, contexte projet, roadmap active, risque majeur ;
- `medium` : review utile, bug fix structurant, incident résolu, brainstorming exploitable ;
- `low` : changelog ponctuel, note temporaire, log de test, brouillon faible ;
- `protected` : BMAD ou méthode externe — lecture seule, aucun rangement.

Destination suggérée :

- décision durable → `vault/20-decisions.md` ;
- découverte durable → `vault/30-discoveries.md` ;
- roadmap/idée → `vault/40-roadmap.md` ou `vault/10-mailbox.md` ;
- source externe → `vault/90-sources.md` ;
- architecture humaine → `vault/60-architecture.md` ;
- rituel/gate/commande → `vault/70-rituals.md` ;
- doute/contradiction → `vault/50-questions.md` ;
- ambigu → `vault/inbox/quarantine/`.

### URLs

Pipeline :

1. télécharger metadata + contenu lisible si possible ;
2. stocker source dans `vault/inbox/raw/` ;
3. résumer dans `inbox/parsed/` ;
4. créer nœuds `url`, `source`, `concept`, `idea` ;
5. proposer routage projet.

### YouTube/audio/video

Objectif parité Graphify :

- optionnel via dépendances ;
- transcription locale si possible ;
- cache transcripts ;
- extraction concepts/relations depuis transcript.

Ne pas bloquer le core si les dépendances manquent.

### Apple Notes / captures / vocaux

Peter doit prévoir les connecteurs, même si implémentation progressive :

- dossier d’import `vault/inbox/raw/apple-notes/` ;
- import manuel `.txt`, `.md`, `.html`, `.json` ;
- OCR/capture plus tard ;
- vocaux transcrits via pipeline local ou fichier transcript fourni ;
- routage multi-projets.

## 8. Hooks always-on

### SessionStart

Injecter seulement :

- `PETER_REPORT.md` si présent ;
- fraîcheur des fichiers ;
- alertes stale ;
- mailbox non traitée ;
- prochaine action.

Ne jamais injecter tout le vault.

### PreToolUse Read/Grep/Glob

Si l’agent cherche dans le repo alors que `vault/index/graph.json` existe :

```text
[PETER] Graphe projet disponible. Lire vault/PETER_REPORT.md ou lancer vault query avant de fouiller brut.
```

### PostToolUse Edit/Write

Si un fichier important change :

- marquer `vault/.peter/state.json` comme `needs_update` ;
- rappeler `claude-atelier vault update`.

### Git hooks optionnels

- post-commit : rebuild léger code-only ;
- post-checkout : vérifier stale ;
- pre-push : alerter si graph/report obsolète, sans bloquer au début.

## 9. `PETER_REPORT.md` attendu

Structure cible :

```md
# PETER_REPORT

## Bureau préparé

- Projet : ...
- Phase : ...
- Dernière mise à jour : ...
- Fraîcheur : OK | STALE | PARTIEL

## À savoir avant d’agir

- ...

## Nœuds centraux

- ...

## Décisions actives

- ...

## Connexions surprenantes

- ...

## Risques / contradictions

- ...

## Mailbox à traiter

- ...

## Questions utiles

- ...

## Prochaine action recommandée

- ...

## Sources prioritaires

- ...
```

## 10. Stratégie d’implémentation

### Phase A — Peter devient une vraie carte

Objectif : remplacer l’injection de trois fichiers par un vrai rapport généré.

À coder :

1. `vault report` ;
2. génération `PETER_REPORT.md` ;
3. mise à jour hook SessionStart pour lire `PETER_REPORT.md` en priorité ;
4. fallback sur `00-brief.md`, `10-mailbox.md`, `40-roadmap.md` si pas de rapport ;
5. tests hook/report.

### Phase B — Index + cache

Objectif : ne pas relire le repo à chaque fois.

À coder :

1. `vault/index/manifest.json` ;
2. scan repo avec respect `.gitignore`, `.peterignore`, `.claudeignore` ;
3. SHA256 par fichier ;
4. cache `vault/.peter/cache/` ;
5. `vault update` incremental ;
6. `vault stale` ;
7. `vault docs scan` ;
8. `vault docs classify` ;
9. détection BMAD/protected ;
10. catalogue `vault/library/catalog.json`.

### Phase B2 — Bibliothèque Markdown Peter

Objectif : ranger les Markdown projet selon leur nature sans toucher BMAD.

À coder :

1. taxonomie Markdown ;
2. `vault docs organize --plan` ;
3. `vault/library/migrations.json` ;
4. `vault/library/protected.json` ;
5. import sélectif vers `vault/20-decisions.md`, `30-discoveries.md`, `40-roadmap.md`, `50-questions.md`, `60-architecture.md`, `70-rituals.md`, `90-sources.md` ;
6. mode `--apply` sans suppression ni déplacement destructif ;
7. tests anti-régression BMAD : aucun fichier BMAD modifié, déplacé, résumé ou importé.

### Phase C — Graphe minimal utile

Objectif : parité cœur Graphify, sans tout refaire d’un coup.

À coder :

1. `vault/index/graph.json` ;
2. nœuds fichiers/docs/décisions/idées ;
3. relations extraites Markdown + imports simples ;
4. `vault query` ;
5. `vault path` ;
6. `vault explain` ;
7. génération “nœuds centraux” dans `PETER_REPORT.md`.

### Phase D — Inbox intelligente

Objectif : répondre au vrai besoin Malik.

À coder :

1. `vault add` ;
2. stockage source brute ;
3. entrée mailbox structurée ;
4. `vault route` ;
5. quarantaine multi-projets ;
6. statut `nouveau | à challenger | intégré | rejeté`.

### Phase E — Exports Graphify++

Objectif : ne pas être en dessous de Graphify.

À coder :

1. `vault export --html` ;
2. `vault export --obsidian` ;
3. `vault/index/wiki/index.md` ;
4. pages par communauté ;
5. visualisation simple D3/vis.js locale.

### Phase F — Multimodal

Objectif : notes, vocaux, captures, URLs, YouTube.

À coder progressivement :

1. URL fetch + extraction texte ;
2. import transcripts ;
3. support fichiers images comme sources brutes ;
4. OCR optionnel ;
5. audio/video optionnel via dépendances externes ;
6. cache transcripts.

### Phase G — MCP Peter

Objectif : rendre le graphe consultable comme outil.

À coder :

1. `claude-atelier vault mcp` ;
2. tools : `query_vault`, `get_node`, `neighbors`, `shortest_path`, `stale_status`, `route_note` ;
3. config `.mcp.json` optionnelle.

## 11. Critères d’acceptation

Peter n’est acceptable que si :

- il a une sortie narrative claire ;
- il garde les sources ;
- il sait dire “je ne sais pas” ;
- il produit une carte courte ;
- il construit un graphe persistant ;
- il a un cache incrémental ;
- il sait ingérer une note entrante ;
- il sait classer les Markdown projet par nature ;
- il protège strictement les artefacts BMAD ;
- il importe dans le vault seulement ce qui est pertinent ;
- il sait router une idée ;
- il sait signaler le stale ;
- il ne crame pas le contexte ;
- il est testable sans dépendance cloud ;
- il reste local-first ;
- il peut évoluer vers multimodal/MCP/Obsidian.

## 12. Tests à prévoir

### Unitaires

- génération `PETER_REPORT.md` ;
- parsing Markdown ;
- classification Markdown par nature ;
- détection BMAD/protected ;
- plan de migration Markdown ;
- manifest SHA ;
- cache hit/miss ;
- graph nodes/edges ;
- query/path/explain ;
- route note ;
- stale detection.

### Hooks

- SessionStart lit `PETER_REPORT.md` ;
- fallback si absent ;
- PreToolUse rappelle le graphe ;
- PostToolUse marque `needs_update`.

### CLI

- `vault update` idempotent ;
- `vault docs scan` catalogue les Markdown ;
- `vault docs classify` classe bug fix/update/fail/review/brainstorming ;
- `vault docs organize --plan` ne modifie rien ;
- `vault docs organize --apply` ne touche jamais BMAD ;
- `vault add` conserve source brute ;
- `vault report` borné en taille ;
- `vault export --obsidian` génère les fichiers attendus ;
- `vault doctor` détecte état cassé.

## 13. Pièges à éviter

- Ne pas réduire Peter à `README + trois fichiers`.
- Ne pas copier Graphify sans valeur propre.
- Ne pas injecter tout le vault dans le contexte.
- Ne pas transformer les inférences en faits.
- Ne pas dépendre d’un service cloud pour le core.
- Ne pas rendre l’usage quotidien lourd.
- Ne pas bloquer sur le multimodal avant d’avoir le graphe et la mailbox.
- Ne pas oublier que le vrai input vient souvent d’ailleurs que le repo.
- Ne jamais toucher les artefacts BMAD : pas de move, pas de rewrite, pas d’import implicite dans le vault.
- Ne pas transformer le rangement Markdown en grand ménage destructif : Peter propose d’abord, applique ensuite, journalise toujours.

## 14. Première PR recommandée

Nom : `feat: transforme Peter en carte projet générée`

Scope strict :

1. ajouter `vault report` ;
2. générer `vault/PETER_REPORT.md` ;
3. modifier hook pour lire `PETER_REPORT.md` ;
4. ajouter `vault stale` minimal ;
5. tests ;
6. README ;
7. handoff Copilot.

Ne pas encore coder tout le graphe dans cette PR.

Pourquoi : Peter doit d’abord devenir visible et utile à chaque session. Ensuite seulement on branche graph/cache/query.

## 15. Deuxième PR recommandée

Nom : `feat: ajoute index et bibliothèque Markdown Peter`

Scope :

1. manifest ;
2. cache ;
3. `vault docs scan` ;
4. classification Markdown ;
5. protection BMAD ;
6. `vault docs organize --plan` ;
7. catalogue `vault/library/catalog.json` ;
8. enrichissement `PETER_REPORT.md` avec état bibliothèque.

## 15bis. Troisième PR recommandée

Nom : `feat: ajoute graphe Peter minimal`

Scope :

1. graph.json ;
2. nodes/edges Markdown + fichiers ;
3. relations `classified_as`, `candidate_for_vault_import`, `protected_by_method` ;
4. `vault query` ;
5. enrichissement `PETER_REPORT.md` avec nœuds centraux.

## 16. Quatrième PR recommandée

Nom : `feat: ajoute inbox et routage Peter`

Scope :

1. `vault add` ;
2. `vault route` ;
3. raw/parsed/quarantine ;
4. statut mailbox ;
5. sources reliées au graphe.

## 17. Message à Claude pour démarrer

```text
Lis docs/proposals/peter-vault-graphify-plus-plan.md.

Objectif : Peter ne doit pas être une version simplifiée de Graphify. Il doit viser la parité utile Graphify, puis aller plus loin avec une mémoire projet vivante, narrative, routable et maintenue.

Commence par la première PR recommandée : `feat: transforme Peter en carte projet générée`.

Contraintes :
- implémentation incrémentale ;
- tests obligatoires ;
- hook SessionStart borné en taille ;
- pas de cloud obligatoire ;
- pas de suppression de sources ;
- ne jamais toucher les artefacts BMAD ;
- handoff Copilot après feature.
```

## 18. Message à Claude pour la Phase B Markdown

```text
Lis docs/proposals/peter-vault-graphify-plus-plan.md.

Phase A est livrée. Enchaîne avec la capacité bibliothèque Markdown Peter.

Objectif : Peter doit scanner et classer tous les Markdown d'un projet selon leur nature : bug fix, update, fail, incident, review, handoff, brainstorming, architecture, décision, roadmap, recherche, runbook, release, audit, prompt, notes de réunion.

Règle absolue : Peter ne doit pas toucher ce qui émane de la méthode BMAD. Les artefacts BMAD sont protégés : lecture seule, pas de déplacement, pas de réécriture, pas d'import implicite dans le vault, pas de synthèse transformée en mémoire Peter sans validation explicite.

Implémente une PR `feat: ajoute index et bibliothèque Markdown Peter`.

Scope :
- `claude-atelier vault docs scan`
- `claude-atelier vault docs classify`
- `claude-atelier vault docs organize --plan`
- génération `vault/library/catalog.json`
- génération `vault/library/protected.json`
- génération `vault/library/migrations.json`
- enrichissement `PETER_REPORT.md` avec état bibliothèque Markdown
- tests BMAD : aucun artefact BMAD ne doit être modifié, déplacé, importé ou résumé
- tests de classification : bug fix, update, fail, review, brainstorming

Contraintes :
- par défaut aucun fichier Markdown existant n'est déplacé ;
- `--plan` ne modifie rien ;
- `--apply` ne fait que des imports/synthèses sûrs dans le vault ;
- toujours conserver la source originale ;
- journaliser dans `vault/.peter/events.jsonl` ;
- handoff Copilot après feature.
```
