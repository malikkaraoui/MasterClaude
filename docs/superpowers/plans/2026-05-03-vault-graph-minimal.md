# Plan — Peter Phase C : graphe minimal + vault query

> Date : 2026-05-03
> Statut : prêt à donner à Claude pour dev
> Base : main `v0.23.5` — Phase B livrée
> PR cible : `feat: ajoute le graphe Peter minimal`

## 0. Contexte actuel

Phase B est livrée sur main en `v0.23.5`.

Déjà disponible :

- `claude-atelier vault init`
- `claude-atelier vault status`
- `claude-atelier vault report`
- `claude-atelier vault stale`
- `claude-atelier vault update`
- `vault/index/manifest.json`
- `vault/.peter/state.json`
- cache `vault/.peter/cache/`
- `PETER_REPORT.md` généré
- hook SessionStart Peter

Prochaine étape : Peter doit devenir **cartographe actif**.

Objectif Phase C : générer un graphe local minimal dans `vault/index/graph.json`, fournir `vault query`, et enrichir `PETER_REPORT.md` avec des nœuds centraux.

## 1. Intention produit

Peter ne doit plus seulement savoir quels fichiers existent.

Il doit commencer à répondre :

- quels documents structurent le projet ;
- quelles décisions reviennent souvent ;
- quels fichiers Markdown portent la mémoire ;
- quels concepts relient roadmap, décisions, sources et docs ;
- où Claude doit regarder avant de relire brut.

Sortie attendue côté utilisateur :

```text
[PETER] Graphe projet généré : 184 nœuds, 412 relations.
[PETER] Nœuds centraux : Peter, vault, hooks, Copilot review, Ollama proxy.
[PETER] Question utile : “quels documents expliquent la Phase C ?”
```

## 2. Scope strict de la PR

Nom de branche conseillé :

```text
feat/vault-graph-minimal
```

Commit principal conseillé :

```text
feat: ajoute le graphe minimal Peter
```

À implémenter :

1. `claude-atelier vault graph`
2. `claude-atelier vault query "..."`
3. génération `vault/index/graph.json`
4. enrichissement `vault/PETER_REPORT.md`
5. tests `test:vault`
6. README / docs si nécessaire
7. handoff Copilot obligatoire

Hors scope :

- pas de multimodal ;
- pas d’Obsidian ;
- pas de HTML graph ;
- pas de MCP ;
- pas de LLM obligatoire ;
- pas d’embeddings ;
- pas de dépendance cloud.

## 3. Commandes CLI attendues

### `vault graph`

Génère ou met à jour `vault/index/graph.json` à partir de :

- `vault/index/manifest.json` si présent ;
- fichiers `vault/*.md` ;
- Markdown projet détectés par manifest ;
- fichiers docs importants ;
- package metadata utiles.

Options :

```text
claude-atelier vault graph [--cwd <path>] [--json]
```

Sortie console :

```text
[PETER] vault graph
  Nœuds     : 42
  Relations : 95
  Source    : vault/index/manifest.json
  → vault/index/graph.json mis à jour
✓ Graphe minimal Peter prêt.
```

Sortie JSON :

```json
{
  "ok": true,
  "graphPath": ".../vault/index/graph.json",
  "nodeCount": 42,
  "edgeCount": 95,
  "centralNodes": ["Peter", "vault", "hooks"]
}
```

### `vault query`

Interroge localement `vault/index/graph.json`.

Options :

```text
claude-atelier vault query "peter phase c" [--cwd <path>] [--json]
```

Comportement :

- si `graph.json` absent : message clair → lancer `vault graph` ;
- recherche simple locale, sans LLM : labels, ids, paths, tags, excerpts ;
- retourne un contexte court et borné ;
- cite les fichiers sources ;
- donne les nœuds voisins pertinents.

Sortie console :

```text
[PETER] vault query
  Question : peter phase c

Résultats :
- concept:peter — score 4 — lié à vault/00-brief.md, vault/40-roadmap.md
- doc:docs/proposals/peter-vault-graphify-plus-plan.md — score 3

Voisins utiles :
- phase_c
- graph_json
- vault_query
```

## 4. Format `graph.json`

Versionner le format dès maintenant.

```json
{
  "version": 1,
  "generatedAt": "2026-05-03T00:00:00.000Z",
  "root": "/abs/path/project",
  "sourceManifest": "vault/index/manifest.json",
  "nodes": [],
  "edges": [],
  "stats": {
    "nodeCount": 0,
    "edgeCount": 0,
    "byType": {},
    "centralNodes": []
  }
}
```

### Node schema

```json
{
  "id": "doc:vault/00-brief.md",
  "type": "markdown_document",
  "label": "Brief projet",
  "path": "vault/00-brief.md",
  "tags": ["vault", "brief"],
  "excerpt": "Projet : claude-atelier...",
  "mtime": "...",
  "sha256": "...",
  "confidence": "EXTRACTED"
}
```

### Edge schema

```json
{
  "from": "doc:vault/00-brief.md",
  "to": "concept:peter",
  "type": "mentions",
  "confidence": "EXTRACTED",
  "source": "vault/00-brief.md",
  "weight": 1
}
```

## 5. Types de nœuds Phase C

Minimum :

- `project`
- `markdown_document`
- `vault_file`
- `decision`
- `roadmap_item`
- `source`
- `concept`
- `command`
- `package_script`
- `protected_artifact`

Ne pas encore faire :

- `function`
- `class`
- call graph code
- symbol graph complet

## 6. Types de relations Phase C

Minimum :

- `mentions`
- `contains`
- `derived_from_source`
- `documents`
- `suggests`
- `blocks`
- `classified_as`
- `protected_by_method`

Optionnel si simple :

- `relates_to`
- `supersedes`
- `needs_review`

Chaque edge doit avoir :

- `type`
- `confidence`
- `source`
- `weight`

## 7. Extraction minimale

### Depuis `vault/00-brief.md`

Créer :

- node projet ;
- concepts issus des lignes `Projet`, `Phase`, `Objectif courant` ;
- edges vers les fichiers mentionnés dans “À lire en priorité”.

### Depuis `vault/20-decisions.md`

Créer :

- node `decision:*` pour chaque `### YYYY-MM-DD — Titre` ;
- edge `documents` depuis le fichier ;
- concepts extraits du titre et de la décision.

### Depuis `vault/40-roadmap.md`

Créer :

- node `roadmap_item:*` pour chaque bullet non vide ;
- tags `sur_le_feu`, `ensuite`, `parking`, `idee_a_challenger` selon section ;
- edge `suggests` ou `blocks` si mots-clés évidents.

### Depuis `vault/90-sources.md`

Créer :

- node `source:*` ;
- edge `derived_from_source` vers documents/concepts si “Lié à” est rempli.

### Depuis Markdown projet hors vault

Créer :

- node `markdown_document` ;
- label depuis premier `#` ;
- concepts depuis titre + headings ;
- edge `mentions` vers concepts ;
- si chemin contient `handoff`, `review`, `proposal`, `plan`, ajouter tags.

### BMAD

Règle absolue : BMAD est read-only.

Si un Markdown BMAD est détecté :

- node `protected_artifact` ;
- edge `protected_by_method` vers `method:bmad` ;
- ne pas importer dans vault ;
- ne pas résumer dans `PETER_REPORT.md` comme décision Peter ;
- mentionner seulement en “artefacts protégés détectés”.

## 8. Centralité simple

Pas besoin de NetworkX.

Calcul minimal :

```text
score(node) = degree(node) + 2 * incoming_decision_edges + 2 * roadmap_edges + tag_bonus
```

Ou plus simple : degré total pondéré.

`centralNodes` = top 5 à 10, hors nodes trop génériques :

- `concept:projet`
- `concept:todo`
- `concept:update`
- `concept:readme`

## 9. Enrichissement `PETER_REPORT.md`

Ajouter sections si `graph.json` existe :

```md
## Nœuds centraux

- Peter — 12 relations — vault/00-brief.md, vault/40-roadmap.md
- vault — 10 relations — docs/proposals/..., README.md

## Documents pivots

- docs/proposals/peter-vault-graphify-plus-plan.md — plan complet Peter
- vault/40-roadmap.md — prochaine phase

## Questions utiles

- Quels documents expliquent la Phase C ?
- Quelles décisions structurent Peter ?
- Quels risques bloquent le graphe minimal ?
```

Si graphe absent :

```md
## Nœuds centraux

- Graphe absent — lancer `claude-atelier vault graph`.
```

## 10. Tests obligatoires

Ajouter dans `test/vault.js`.

### Tests `vault graph`

1. `vault graph` crée `vault/index/graph.json`.
2. `graph.json` contient `version`, `nodes`, `edges`, `stats`.
3. `vault graph --json` retourne un JSON valide.
4. Les fichiers vault de base deviennent des nodes.
5. Une décision dans `20-decisions.md` devient un node `decision`.
6. Un item roadmap devient un node `roadmap_item`.
7. Un Markdown BMAD devient `protected_artifact` et n’est pas importé.
8. `centralNodes` est non vide dès qu’il y a des edges.

### Tests `vault query`

1. Sans graphe : exit 1 + message `vault graph`.
2. Avec graphe : query sur `Peter` retourne des résultats.
3. `vault query --json` retourne `{ ok, results, neighbors }`.
4. Les résultats sont bornés : max 10 par défaut.
5. Les résultats citent au moins un `source/path`.

### Tests `PETER_REPORT`

1. Après `vault graph` puis `vault report`, le rapport contient `## Nœuds centraux`.
2. Si graphe absent, rapport contient l’instruction `vault graph`.

## 11. Fichiers probablement touchés

- `bin/vault.js`
- `test/vault.js`
- `README.md`
- `src/features.json` si aide/features doivent exposer les sous-commandes
- `bin/cli.js` si help généré/bump
- `docs/proposals/peter-vault-graphify-plus-plan.md` si besoin de préciser Phase C
- `docs/handoffs/YYYY-MM-DD-vault-graph-peter.json`

## 12. Contraintes de qualité

- Local-first.
- Pas de cloud obligatoire.
- Pas d’embeddings.
- Pas de dépendance lourde.
- Graphe déterministe.
- Sortie bornée en taille.
- Respect `.gitignore`, `.peterignore`, `.claudeignore` via manifest existant.
- Ne jamais modifier `vault/index/graph.json` à la main : fichier généré.
- Ne jamais injecter tout le graphe dans le prompt.
- BMAD : lecture seule stricte.

## 13. Validation avant push

À lancer :

```text
npm run test:vault
npm test
bash scripts/pre-push-gate.sh
```

Puis :

- commit FR sans signature ;
- handoff Copilot selon règle §25 ;
- PR ;
- intégrer review Copilot ;
- bump/publish seulement après validation.

## 14. Prompt prêt à donner à Claude

```text
Lis docs/superpowers/plans/2026-05-03-vault-graph-minimal.md et docs/proposals/peter-vault-graphify-plus-plan.md.

Phase B est livrée sur main en v0.23.5. Enchaîne avec Phase C : graphe minimal Peter.

Objectif : générer `vault/index/graph.json`, ajouter `claude-atelier vault graph`, ajouter `claude-atelier vault query "..."`, et enrichir `vault/PETER_REPORT.md` avec nœuds centraux, documents pivots et questions utiles.

Contraintes :
- local-first ;
- pas de cloud obligatoire ;
- pas d’embeddings ;
- pas de dépendance lourde ;
- format `graph.json` versionné ;
- query bornée et sourcée ;
- BMAD strictement protégé en lecture seule ;
- tests obligatoires dans `test/vault.js` ;
- `npm test` + `bash scripts/pre-push-gate.sh` avant push ;
- handoff Copilot obligatoire après feature.

Commence par une PR : `feat: ajoute le graphe Peter minimal`.
```
