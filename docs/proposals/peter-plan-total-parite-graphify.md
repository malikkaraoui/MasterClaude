# Peter — plan total parité Graphify + différenciation Atelier

> Date : 2026-05-04
> Statut : plan d’exécution total
> Intention : reprendre toutes les capacités utiles de Graphify open-source, les adapter à `claude-atelier`, puis ajouter la couche Peter qui le rend plus utile qu’un simple moteur graphe.

## 1. Ligne directrice

Peter ne doit pas être une pâle copie de Graphify.

La cible est :

1. atteindre la **parité utile** Graphify ;
2. rester **local-first** pour le core ;
3. réutiliser les patterns déjà présents dans `claude-atelier` ;
4. ajouter les différenciants Peter : mémoire projet, mailbox, classement Markdown, protection BMAD, stale intelligent, autonomie réelle.

Formule produit :

> Graphify donne une carte technique.
> Peter doit donner une carte, une mémoire projet, un tri documentaire, une stratégie de reprise, et un veilleur autonome.

---

## 2. Ce qui existe déjà dans le repo

### Commandes déjà livrées

Peter dispose déjà de ces briques dans `bin/vault.js` :

- `vault init`
- `vault status`
- `vault report`
- `vault stale`
- `vault update`
- `vault graph`
- `vault query`
- `vault maintain`
- `vault cron start|stop|status`

### Artefacts déjà présents

- `vault/PETER_REPORT.md`
- `vault/index/manifest.json`
- `vault/index/graph.json`
- `vault/.peter/state.json`
- `vault/.peter/events.jsonl`
- `vault/.peter/cron.json`
- `vault/10-mailbox.md`

### Réutilisation interne intelligente

Il ne faut pas repartir de zéro.

Patterns déjà réutilisables :

- watcher/daemon : `src/pulse/marketplace.js`
- boucle de fond : `scripts/pulse-marketplace-watch.js`
- feature flags : `src/features-registry.json`
- logique stale/report/heartbeat déjà en place dans `bin/vault.js`

---

## 3. Cible fonctionnelle complète

### 3.1 Parité Graphify à atteindre

Peter doit implémenter :

- extraction AST multi-langages ;
- ingestion PDF / images / audio / vidéo / URLs ;
- `query`, `path`, `explain` ;
- `watch` continu ;
- hooks git auto-rebuild ;
- export HTML / wiki / Obsidian / SVG / GraphML / Neo4j ;
- MCP Peter ;
- pipeline incrémental large ;
- réveil réel via scheduler.

### 3.2 Différenciants Peter à pousser plus loin

Peter doit aussi faire ce que Graphify ne fait pas au centre de son design :

- classification Markdown explicable ;
- protection BMAD stricte ;
- mailbox projet ;
- routage note/source/URL vers bon contexte ;
- quarantaine multi-projets ;
- stale intelligent orienté projet ;
- prochaine action recommandée ;
- mémoire narrative projet ;
- intégration native avec les hooks et le pouls `claude-atelier`.

---

## 4. Architecture cible

```text
src/vault/
├── cli/
│   ├── commands.js
│   └── output.js
├── core/
│   ├── manifest.js
│   ├── state.js
│   ├── events.js
│   ├── cache.js
│   └── scheduler.js
├── graph/
│   ├── build.js
│   ├── query.js
│   ├── path.js
│   ├── explain.js
│   ├── community.js
│   └── export.js
├── docs/
│   ├── scan.js
│   ├── classify.js
│   ├── organize.js
│   └── protect-bmad.js
├── inbox/
│   ├── add.js
│   ├── route.js
│   ├── quarantine.js
│   └── normalize.js
├── watch/
│   ├── daemon.js
│   ├── loop.js
│   ├── hooks.js
│   └── pid.js
├── extractors/
│   ├── markdown.js
│   ├── javascript.js
│   ├── typescript.js
│   ├── json.js
│   ├── shell.js
│   ├── go.js
│   ├── url.js
│   ├── pdf.js
│   ├── image.js
│   ├── audio.js
│   └── video.js
└── mcp/
    ├── server.js
    └── tools.js
```

Sorties projet côté vault :

```text
vault/
├── inbox/
│   ├── raw/
│   ├── parsed/
│   └── quarantine/
├── library/
│   ├── catalog.json
│   ├── protected.json
│   └── migrations.json
├── index/
│   ├── manifest.json
│   ├── graph.json
│   ├── graph.html
│   ├── wiki/
│   ├── obsidian/
│   ├── graph.graphml
│   ├── graph.svg
│   └── neo4j/
└── .peter/
    ├── cache/
    ├── state.json
    ├── cron.json
    ├── watch.json
    ├── cost.json
    └── events.jsonl
```

---

## 5. Contrats de données à poser

### 5.1 Catalogue Markdown

`vault/library/catalog.json`

Chaque entrée doit contenir :

- `path`
- `title`
- `sha256`
- `mtime`
- `size`
- `kind`
- `confidence`
- `status`
- `vaultRelevance`
- `reason`
- `suggestedDestination`
- `protected`
- `bmadSignals`
- `graphNodeId`

### 5.2 Graphe Peter v2

Nœuds minimum :

- `project`
- `file`
- `markdown_document`
- `doc_category`
- `decision`
- `idea`
- `source`
- `url`
- `symbol`
- `function`
- `class`
- `roadmap_item`
- `risk`
- `question`
- `protected_artifact`
- `community`
- `concept`

Arêtes minimum :

- `contains`
- `mentions`
- `classified_as`
- `imports`
- `calls`
- `implements`
- `depends_on`
- `derived_from_source`
- `candidate_for_vault_import`
- `protected_by_method`
- `duplicates`
- `contradicts`
- `blocks`
- `suggests`
- `summarized_into`
- `semantically_similar_to`

Confiance :

- `EXTRACTED`
- `INFERRED`
- `AMBIGUOUS`
- `USER_CONFIRMED`
- `STALE`

---

## 6. Lots de réalisation

## Lot 0 — socle propre

Objectif : arrêter de gonfler `bin/vault.js` et rendre Peter extensible.

À faire :

- sortir la logique en modules `src/vault/*` ;
- définir schémas JSON ;
- centraliser les helpers Git isolés ;
- centraliser cache/state/events ;
- garder `bin/vault.js` comme façade CLI fine.

Livrable : moteur Peter modulaire.

## Lot 1 — bibliothèque Markdown Peter

Objectif : ranger l’existant Markdown avant de viser le multimodal.

Commandes :

- `vault docs scan`
- `vault docs classify`
- `vault docs organize --plan`
- `vault docs organize --apply`

Obligations :

- taxonomie complète ;
- justification de classification ;
- score de pertinence vault ;
- détection BMAD stricte ;
- aucun déplacement destructif ;
- aucune modification des artefacts protégés.

Livrables :

- `catalog.json`
- `protected.json`
- `migrations.json`
- enrichissement de `PETER_REPORT.md`

## Lot 2 — graphe utile complet

Objectif : dépasser le graphe minimal actuel.

À faire :

- intégrer catégories documentaires dans le graphe ;
- ajouter types `risk`, `question`, `community`, `symbol` ;
- ajout des relations `classified_as`, `duplicates`, `contradicts` ;
- calcul des communautés ;
- nœuds centraux plus solides.

Livrable : `graph.json` v2.

## Lot 3 — query / path / explain

Objectif : atteindre la vraie navigation graphe.

Commandes :

- `vault query "..."`
- `vault path <nodeA> <nodeB>`
- `vault explain <node>`

Résultat attendu :

- score + voisins + sources ;
- plus court chemin ;
- explication textuelle des relations ;
- niveau de confiance affiché.

## Lot 4 — AST multi-langages

Objectif : commencer la parité Graphify côté code.

Ordre réaliste :

### V1

- JavaScript
- TypeScript
- JSON
- shell
- Go minimal

### V2

- Python
- Rust
- Java
- YAML/TOML si pertinent

Extraction minimum :

- imports ;
- exports ;
- fonctions ;
- classes ;
- symboles ;
- scripts package ;
- commentaires `NOTE`, `HACK`, `IMPORTANT`, `TODO`.

Choix technique recommandé :

- Tree-sitter si disponible ;
- sinon fallback parseur léger par langage sur MVP.

## Lot 5 — watch continu + auto-rebuild

Objectif : passer de maintenance manuelle à maintenance vivante.

Commandes :

- `vault watch start`
- `vault watch stop`
- `vault watch status`
- `vault watch once`

Design :

- réutiliser la structure watcher de `src/pulse/marketplace.js` ;
- PID file ;
- boucle polling légère ;
- patch incrémental ;
- rebuild partiel du graphe ;
- relance report ;
- log dans `events.jsonl`.

Hooks git :

- post-commit : patch léger ;
- post-checkout : stale check ;
- pre-push : warning si report/graph trop vieux.

## Lot 6 — scheduler réel

Objectif : ne plus mentir sur l’autonomie.

Aujourd’hui `vault cron start` arme un état.

Il faut brancher ce mécanisme à un réveil réel :

- `CronCreate` si l’environnement le permet ;
- fallback macOS `launchd` ;
- fallback daemon Peter local.

Résultat attendu :

- `vault cron start` crée vraiment un réveil ;
- `vault cron status` affiche l’état runtime ;
- `vault maintain` est déclenché sans session active.

## Lot 7 — inbox / route / quarantaine

Objectif : la vraie couche Peter, pas seulement le graphe.

Commandes :

- `vault add <file|url|text>`
- `vault route <source>`

À faire :

- ingestion source brute ;
- normalisation ;
- entrée mailbox ;
- lien au graphe ;
- routage projet / multi-projets / quarantaine ;
- conservation systématique de la source.

## Lot 8 — exports Graphify parity

Commandes :

- `vault export --html`
- `vault export --obsidian`
- `vault export --wiki`
- `vault export --svg`
- `vault export --graphml`
- `vault export --neo4j`

Livrables :

- `vault/index/graph.html`
- `vault/index/obsidian/`
- `vault/index/wiki/`
- `vault/index/graph.svg`
- `vault/index/graph.graphml`
- `vault/index/neo4j/`

## Lot 9 — multimodal

Ordre conseillé :

1. URLs
2. PDF
3. images
4. audio
5. vidéo
6. Apple Notes imports

Règle :

- si dépendance absente, Peter dégrade proprement ;
- pas de blocage du core ;
- cache systématique des extractions lourdes.

## Lot 10 — MCP Peter

Commande :

- `vault mcp`

Tools minimum :

- `query_vault`
- `get_node`
- `neighbors`
- `shortest_path`
- `explain_node`
- `stale_status`
- `route_note`

---

## 7. Ordre d’attaque recommandé pour la journée Claude

### Matin

1. modulariser Peter ;
2. poser schémas JSON ;
3. implémenter `docs scan` ;
4. implémenter `docs classify` ;
5. implémenter détection BMAD.

### Début d’après-midi

6. implémenter `docs organize --plan` ;
7. enrichir le graphe avec catégories ;
8. implémenter `path` ;
9. implémenter `explain`.

### Milieu d’après-midi

10. créer watcher Peter réutilisant le pattern pulse ;
11. ajouter `watch start|stop|status` ;
12. brancher patch incrémental ;
13. hooks git warnings.

### Fin d’après-midi

14. export HTML ;
15. export Obsidian ;
16. export wiki ;
17. export GraphML / Neo4j / SVG.

### Soir

18. URL ingest ;
19. squelette PDF ;
20. squelette MCP Peter ;
21. scheduler réel ;
22. tests + README + handoff.

---

## 8. Priorisation réelle si le temps serre

Si tout ne tient pas dans une seule journée, on ne coupe pas au hasard.

Ordre de priorité :

1. modularisation moteur ;
2. bibliothèque Markdown + BMAD ;
3. `path` + `explain` ;
4. watch ;
5. export HTML + Obsidian ;
6. scheduler réel ;
7. URL/PDF ;
8. MCP Peter.

---

## 9. Critères d’acceptation

Peter n’est acceptable que si :

- il reste local-first sur le core ;
- il classe les Markdown du repo ;
- il explique ses classifications ;
- il protège BMAD sans faille ;
- il sait répondre à `query`, `path`, `explain` ;
- il sait watcher et patcher en incrémental ;
- il exporte au moins HTML + Obsidian ;
- il dispose d’un réveil réel ;
- il garde toujours les sources ;
- il reste testable sans cloud ;
- il propose la prochaine action utile.

---

## 10. Tests à rendre obligatoires

### Unitaires

- scan Markdown ;
- classification ;
- détection BMAD ;
- graph build ;
- shortest path ;
- explain ;
- export HTML/Obsidian ;
- cache hit/miss ;
- scheduler state ;
- route/quarantine.

### CLI

- `vault docs scan`
- `vault docs classify`
- `vault docs organize --plan`
- `vault path`
- `vault explain`
- `vault watch status`
- `vault export --html`
- `vault export --obsidian`
- `vault cron status`

### Non-régression

- aucun fichier BMAD touché ;
- aucun déplacement destructif ;
- `maintain` reste correct même si `GIT_DIR` / `GIT_WORK_TREE` sont pollués ;
- watch idempotent ;
- exports rejouables.

---

## 11. Ce qu’il ne faut surtout pas faire

- copier le code Graphify tel quel ;
- réduire Peter à un README amélioré ;
- injecter tout le vault en contexte ;
- prétendre à l’autonomie sans scheduler réel ;
- faire du multimodal avant de maîtriser le noyau ;
- déplacer des Markdown existants sans trace ;
- toucher aux artefacts BMAD ;
- rendre Peter dépendant du cloud pour son cœur.

---

## 12. Conclusion

Le bon objectif n’est pas :

> “faire un Graphify moins bien”.

Le bon objectif est :

> “reprendre toutes les capacités utiles de Graphify, les adapter à la stack `claude-atelier`, puis y ajouter la couche Peter : mémoire projet, classification documentaire, mailbox, stale intelligent, BMAD-safe, watch et autonomie réelle.”

Autrement dit :

- **parité Graphify** sur le moteur ;
- **supériorité Peter** sur la mémoire projet et l’exploitation quotidienne.
