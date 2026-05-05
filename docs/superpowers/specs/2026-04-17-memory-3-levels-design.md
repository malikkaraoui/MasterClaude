# Spec — Memoire 3 niveaux pour claude-atelier

> Inspiree de GoClaw (github.com/nextlevelbuilder/goclaw)
> Date: 2026-04-17 | Rev: 2 (post-review Copilot)
> Phase 1 sur 3 (memoire → pipeline → routing)

## Contexte

Le systeme memoire actuel de claude-atelier est flat : fichiers `.md` dans `/memory/` + index `MEMORY.md`. Un seul niveau, pas de recherche semantique, pas de resume automatique, pas de graphe relationnel.

GoClaw implemente 3 niveaux de memoire (working / episodique / semantique) avec recherche hybride. On s'en inspire pour upgrader claude-atelier.

## Architecture

```text
┌─────────────────────────────────────────────┐
│              Claude Code session             │
│                                              │
│  Niveau 1 — WORKING MEMORY                   │
│  (fenetre de contexte, existe deja)          │
│         ↕ lecture/ecriture                    │
│  ┌───────────────────────────────────────┐   │
│  │  Niveau 2 — EPISODIQUE               │   │
│  │  SQLite: table `episodes`             │   │
│  │  Resume auto en cloture de session    │   │
│  └───────────────┬───────────────────────┘   │
│                  ↕                            │
│  ┌───────────────────────────────────────┐   │
│  │  Niveau 3 — SEMANTIQUE               │   │
│  │  SQLite: tables `nodes`, `edges`      │   │
│  │  + table `embeddings` (dedicee)       │   │
│  │  Ollama nomic-embed-text (optionnel)  │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
         Fichier unique: .claude/memory.db
```

## Arbitrage 1 — Evenement canonique de fin de session

**Decision** : commande explicite + detection heuristique, deduplication par session_id.

**Contrainte technique** : Claude Code ne supporte pas de hook `Notification:exit`. Les hooks disponibles sont `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`.

| Signal | Mecanisme | Priorite |
| ------ | --------- | -------- |
| `/memory-save` | Commande explicite de l'utilisateur | Primaire |
| Hook §0 logbook | Le logbook de cloture (§0 CLAUDE.md) declenche `memory-episode.js` | Secondaire |
| Phase 2+ : idle timeout | Watchdog cron sur `/tmp/claude-atelier-session-id` (pas en Phase 1) | Futur |

Deduplication : avant INSERT episode, verifier `SELECT 1 FROM episodes WHERE session_id = ?`. Si existe deja, UPDATE le summary (le plus recent gagne).

**Note** : le session_id est deja ecrit dans `/tmp/claude-atelier-current-session-id` par `routing-check.sh` (hook `UserPromptSubmit`).

## Arbitrage 2 — Source de verite SQLite vs legacy .md

**Decision** : SQLite = source de verite unique. Les `.md` deviennent un export read-only.

- Les fichiers `/memory/*.md` + `MEMORY.md` continuent d'exister pour la retrocompat avec le systeme auto-memory natif de Claude Code
- Un edit manuel d'un `.md` n'est **pas** reimporte automatiquement (sens unique : SQLite → .md)
- `memory-migrate.js` fait l'import initial one-shot des .md existants → SQLite
- Apres migration, les .md sont regeneres par `memory-export.js` (optionnel, pour lisibilite humaine)

## Arbitrage 3 — Politique d'extraction des nodes/edges

**Decision** : extraction par convention, pas par LLM (cout prohibitif).

### Types d'entites autorisees (whitelist)

| Type | Exemples | Regle d'extraction |
| ---- | -------- | ------------------- |
| `script` | `memory-read.js`, `pre-push-gate.sh` | Fichiers dans `scripts/`, `bin/`, `hooks/` |
| `config` | `CLAUDE.md`, `settings.json` | Fichiers de config edites pendant la session |
| `concept` | `routing`, `security`, `pipeline` | Mots-cles extraits des topics d'episodes + sections CLAUDE.md |
| `skill` | `review-copilot`, `night-launch` | Fichiers dans `.claude/skills/` |
| `project` | `claude-atelier`, `okazcar` | Valeur de §0 "Projet courant" |
| `person` | `Malik` | Auteurs git uniques |

### Regles anti-explosion

- **Stoplist** : `node`, `npm`, `git`, `github`, `README.md`, `package.json`, `index.js` — jamais de node pour ces termes generiques
- **Seuil de creation** : un concept doit apparaitre dans >= 2 episodes distincts avant de devenir un node (sauf types `script` et `config` qui sont crees au premier touch)
- **Max nodes** : 500 nodes max. Au-dela, pruning des nodes sans edge (orphelins) et sans acces depuis 90 jours

### Creation des edges

- `uses` : script A mentionne dans le meme episode que concept B
- `depends_on` : detecte par import/require dans le code, ou reference explicite dans un .md
- `part_of` : fichier contenu dans un repertoire-concept (ex: `scripts/memory-*.js` → `part_of` memoire)
- `relates_to` : co-occurrence dans >= 3 episodes

## Arbitrage 4 — Strategie de sync FTS5

**Decision** : triggers SQLite. Zero sync applicative.

```sql
-- Triggers auto-sync FTS5 pour episodes
CREATE TRIGGER episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, summary, topics)
    VALUES (new.id, new.summary, new.topics);
END;

CREATE TRIGGER episodes_au AFTER UPDATE ON episodes BEGIN
    UPDATE episodes_fts SET summary = new.summary, topics = new.topics
    WHERE rowid = new.id;
END;

CREATE TRIGGER episodes_ad AFTER DELETE ON episodes BEGIN
    DELETE FROM episodes_fts WHERE rowid = old.id;
END;

-- Triggers auto-sync FTS5 pour nodes
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, name, description)
    VALUES (new.id, new.name, new.description);
END;

CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
    UPDATE nodes_fts SET name = new.name, description = new.description
    WHERE rowid = new.id;
END;

CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE rowid = old.id;
END;
```

## Arbitrage 5 — Mode degrade (Ollama indisponible)

**Decision** : 3 modes d'operation, detection automatique au startup.

```text
Mode FULL    : Ollama running + nomic-embed-text present → FTS5 + vectoriel
Mode LEXICAL : Ollama absent ou timeout > 3s            → FTS5 seul (pas d'embeddings)
Mode MINIMAL : SQLite absent ou corrompu                → fallback /memory/*.md legacy
```

Detection au startup (`memory-read.js`) :

1. Tester `curl -s --max-time 3 http://localhost:11434/api/tags` → si OK, mode FULL
2. Sinon, mode LEXICAL (FTS5 seul, embeddings = NULL dans les colonnes)
3. Si `memory.db` n'existe pas ou erreur open → mode MINIMAL + warning stderr

Message utilisateur en mode degrade :

```text
[MEMORY] Mode lexical — Ollama non detecte. Recherche semantique desactivee.
         Pour activer : ollama pull nomic-embed-text && ollama serve
```

## Arbitrage 6 — Format des embeddings + retention

### Format embeddings

| Champ | Valeur |
| ----- | ------ |
| Format stockage | `Float32Array` → `Buffer` (bytes bruts Little Endian) |
| Dimensions | 768 (nomic-embed-text v1.5) |
| Verification | colonne `model TEXT` dans la table `embeddings` |

Table `embeddings` dedicee (corrige l'incoherence signalee par Copilot) :

```sql
CREATE TABLE embeddings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type    TEXT NOT NULL,           -- 'episode' ou 'node'
    ref_id      INTEGER NOT NULL,        -- FK vers episodes.id ou nodes.id
    model       TEXT NOT NULL,           -- 'nomic-embed-text:v1.5'
    dimensions  INTEGER NOT NULL,        -- 768
    vector      BLOB NOT NULL,           -- Float32Array as Buffer
    created_at  TEXT NOT NULL,
    UNIQUE(ref_type, ref_id, model)
);
```

Si le modele d'embedding change (ex: v1.5 → v2.0) :
- Les anciens embeddings restent (colonne `model` les identifie)
- Un script `memory-reembed.js` regenere tous les vecteurs avec le nouveau modele
- La recherche vectorielle filtre par `model = <current_model>`

### Retention policy

| Regle | Seuil | Action |
| ----- | ----- | ------ |
| Episodes recents | < 90 jours | Conserves integralement |
| Episodes anciens | 90-365 jours | Resumes compactes (merge episodes similaires par topic) |
| Episodes > 1 an | > 365 jours | Supprimes (les nodes/edges qu'ils ont cree persistent) |
| Nodes orphelins | 0 edges + 0 acces 90j | Supprimes |
| Max episodes injectes au contexte | 5 | Les 5 plus pertinents (score hybride) |
| Max nodes injectes au contexte | 10 | Les 10 plus pertinents |
| Deduplication episodes | meme session_id | UPDATE, pas INSERT |

Script `memory-gc.js` : garbage collection lancee une fois par semaine via cron ou manuellement.

## Schema SQLite (rev. 2)

```sql
-- Niveau 2 : Episodique
CREATE TABLE episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL UNIQUE,
    timestamp     TEXT NOT NULL,
    summary       TEXT NOT NULL,
    topics        TEXT,                  -- JSON array
    files_touched TEXT,                  -- JSON array
    model_used    TEXT,
    duration_min  INTEGER,
    project       TEXT                   -- valeur de §0 au moment de la session
);

-- Niveau 3 : Graphe semantique
CREATE TABLE nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('script','config','concept','skill','project','person')),
    description TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    access_count INTEGER DEFAULT 0      -- pour retention policy
);

CREATE TABLE edges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation    TEXT NOT NULL CHECK(relation IN ('depends_on','relates_to','part_of','uses')),
    weight      REAL DEFAULT 1.0,
    created_at  TEXT NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

-- Embeddings dedies (versionnes par modele)
CREATE TABLE embeddings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type    TEXT NOT NULL CHECK(ref_type IN ('episode','node')),
    ref_id      INTEGER NOT NULL,
    model       TEXT NOT NULL,
    dimensions  INTEGER NOT NULL,
    vector      BLOB NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE(ref_type, ref_id, model)
);

-- Index
CREATE INDEX idx_episodes_project ON episodes(project);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_embeddings_ref ON embeddings(ref_type, ref_id);

-- FTS5 (peuple par triggers, voir Arbitrage 4)
CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, topics);
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, description);

-- Triggers FTS5 (voir section Arbitrage 4 pour le code complet)
```

## Flow de donnees (rev. 2)

### Session start (hook SessionStart)

Contrainte : **< 2 secondes** total, sinon timeout et skip.
**Note** : SessionStart ne recoit pas le prompt utilisateur (seulement `model` et `source`).

1. Mode detection : FULL / LEXICAL / MINIMAL
2. Si FULL ou LEXICAL :
   - Query FTS5 episodes : 5 derniers du meme projet (via §0 "Projet courant")
   - Injection contexte des episodes recents (~100 tokens)
3. Session ID deja gere par `routing-check.sh` (pas de duplication)

### Premier message (hook UserPromptSubmit)

Le prompt utilisateur est disponible ici via `$HOOK_PROMPT`.

1. Si FULL : embed du prompt → recherche vectorielle nodes → top 10
2. Si LEXICAL : FTS5 nodes avec mots-cles du prompt → top 10
3. Expansion graphe : voisins 1-hop des top 5 nodes
4. Injection contexte supplementaire (~200 tokens)

### Pendant la session

- Detection de concepts par convention (pas par LLM) selon whitelist Arbitrage 3
- Upsert node + edges en batch (pas a chaque message, mais a chaque commit ou fin de tache)
- `access_count++` sur les nodes requetes

### Cloture de session

Declenchee par `/memory-save` ou par le logbook §0 de fin de session.

1. Lire session_id depuis `/tmp/claude-atelier-current-session-id`
2. Deduplication : si `session_id` existe deja → UPDATE
3. Resume de la session (prompt interne minimal)
4. Si mode FULL : embed du resume → INSERT embeddings
5. Upsert nodes/edges finaux

## API de recherche

### Recherche hybride (memory-read.js)

1. **FTS5 (lexical)** — BM25 sur `nodes_fts` / `episodes_fts`
2. **Vectoriel** (mode FULL uniquement) — cosine similarity sur `embeddings.vector`
3. **Fusion RRF** — `score = 1/(k+rank_lex) + 1/(k+rank_vec)` → top 10
4. **Expansion graphe** — pour chaque node top 5, voisins 1-hop via `edges`
5. **Episodes lies** — sessions passees matchant la query

En mode LEXICAL : etapes 2 et 3 sautees, FTS5 seul.

### Format de sortie

```text
[MEMORY] Mode: FULL | 3 concepts: routing (→ switch_model.py, §15),
security (→ pre-push-gate), pipeline (→ §3).
Dernier episode: "2026-04-15 — refacto routing, fallback Haiku"
```

## Interface CLI

| Commande | Action |
| -------- | ------ |
| `node scripts/memory-read.js "query"` | Recherche hybride |
| `node scripts/memory-read.js --graph "node"` | Voisins d'un concept |
| `node scripts/memory-read.js --episodes 5` | 5 derniers episodes |
| `node scripts/memory-write.js --node "nom" --type concept` | Ajout manuel |
| `node scripts/memory-migrate.js` | Import .md existants → SQLite |
| `node scripts/memory-export.js` | Export SQLite → .md (read-only) |
| `node scripts/memory-gc.js` | Garbage collection (retention policy) |
| `node scripts/memory-reembed.js` | Re-generer tous les embeddings |

## Integration hooks (settings.json)

```json
{
  "hooks": {
    "SessionStart": [{
      "command": "node scripts/memory-read.js --episodes-only --timeout 2000"
    }],
    "UserPromptSubmit": [{
      "command": "node scripts/memory-read.js --context --timeout 2000"
    }]
  }
}
```

Note : la cloture est declenchee par `/memory-save` (skill) ou par le logbook §0,
pas par un hook (Claude Code n'a pas de hook de sortie).

## Scripts a creer

| Script | Role |
| ------ | ---- |
| `scripts/memory-init.sh` | Cree `memory.db` + tables + triggers + FTS5 |
| `scripts/memory-read.js` | Query hybride FTS5 + vectoriel, mode detection |
| `scripts/memory-write.js` | Upsert nodes/edges par convention |
| `scripts/memory-episode.js` | Resume + embedding cloture session |
| `scripts/memory-embed.js` | Appel Ollama nomic-embed-text, gestion timeout |
| `scripts/memory-migrate.js` | Import one-shot .md → SQLite |
| `scripts/memory-export.js` | Export SQLite → .md (read-only) |
| `scripts/memory-gc.js` | Garbage collection + retention |
| `scripts/memory-reembed.js` | Re-embed tous les vecteurs (changement modele) |

## Dependances

- `better-sqlite3` (npm) — driver SQLite natif pour Node.js
- Ollama + `nomic-embed-text` — **optionnel** (mode LEXICAL si absent)
- Aucune dependance cloud

## Nommage et articulation avec l'existant

| Terme atelier actuel | Terme memoire 3 niveaux | Relation |
| -------------------- | ----------------------- | -------- |
| Fenetre de contexte | Niveau 1 — Working | Identique, pas de changement |
| `/memory/*.md` + `MEMORY.md` | Legacy (export read-only) | SQLite = source de verite |
| QMD (recherche .md) | Complementaire | QMD = docs du projet, memoire = connaissances cross-session |
| `auto memory` (systeme natif Claude) | Cohabite | Le systeme natif continue de fonctionner, SQLite l'enrichit |

## Lien avec phases futures

| Phase | Concept | Dependance memoire |
| ----- | ------- | ------------------ |
| Phase 2 | Pipeline 8 etapes | Etapes 1 (contexte) et 7 (stockage) lisent/ecrivent la memoire |
| Phase 3 | Routing capability-based | Historique episodes + stats modele → routing data-driven |

## Decisions prises (rev. 2)

- **Stockage** : SQLite fichier unique, source de verite
- **Embeddings** : table dedicee `embeddings`, versionnee par modele
- **Format** : Float32Array → Buffer LE, 768d, modele tag
- **Resume episodique** : `/memory-save` + logbook §0 + dedup (idle timeout phase 2+)
- **Recherche** : hybride FTS5 + vectoriel + fusion RRF
- **Sync FTS5** : triggers SQLite automatiques
- **Mode degrade** : FULL → LEXICAL → MINIMAL, detection auto
- **Extraction concepts** : par convention (whitelist), pas par LLM
- **Retention** : 90j complet, 90-365j compact, >1an supprime, GC hebdo
- **Legacy .md** : export read-only, SQLite = source unique
- **Ollama** : optionnel, fallback lexical si absent

## Limites connues Phase 1

- **Session ID singleton** : `/tmp/claude-atelier-current-session-id` est last-writer-wins. Si 2 sessions tournent en parallele, seule la derniere ecrit son ID. Acceptable en P1 (usage mono-session majoritaire), a resoudre en P2 avec un ID par PID ou par fichier nomme.

---

## Reponse de : Copilot/GPT

Oui : **je veux quelques changements/clarifications avant le plan d'implementation**. La spec est prometteuse, mais elle cache plusieurs zones fragiles qui vont sinon se transformer en dette de design des la phase 1.

### 1. Le point le plus fragile : la notion de “fin de session” n'est pas definie

Tu ecris :
- “Resume auto fin de session (hook)”
- puis dans les hooks : `PostToolUse` avec `matcher: "stop"`

Ca ne decrit pas une fin de session. Ca ressemble plutot a “apres un tool” ou “a un arret intermediaire”. Si tu stockes l'episode trop souvent, tu vas generer :
- des resumes fragmentes ;
- du bruit ;
- des doublons de quasi-meme session ;
- un graphe renforce artificiellement.

**A clarifier avant plan** : quel est l'evenement canonique de cloture ? fermeture explicite, idle timeout, commande manuelle, hook terminal, ou snapshot periodique assume ?

Sans cette reponse, le niveau episodique n'a pas de frontiere fiable.

### 2. Gros flou sur l'extraction des concepts et des relations

“Chaque concept nouveau/mentionne → upsert node + edges” est trop vague pour etre planifiable.

Il manque le contrat d'extraction :
- qu'est-ce qu'un “concept” ? un fichier ? un script ? un stack ? une section de doc ? un outil externe ?
- qui cree les `edges` ? heuristique regex ? LLM ? mapping par conventions ?
- quand eviter l'explosion du graphe (`README.md`, `package.json`, `npm`, `Node`, `GitHub`, etc.) ?

**A clarifier avant plan** : il faut une politique minimale d'entites autorisees et de creation des relations. Sinon tu vas construire un graphe tres vite, mais pas un graphe utile.

### 3. Incoherence entre l'architecture annoncee et le schema reel

Le schema d'architecture parle de tables `nodes`, `edges`, `embeddings`.
Le schema SQL ne contient **pas** de table `embeddings` ; les embeddings sont stockes dans `episodes.embedding` et `nodes.embedding`.

Ce n'est pas cosmetique. Ca change :
- la migration ;
- les updates ;
- la possibilite de re-embed ;
- la compatibilite si le modele d'embedding change.

**A corriger avant plan** : choisir une seule verite. Table dediee, ou colonnes BLOB inline. Mais pas les deux modeles en meme temps dans le texte.

### 4. FTS5 sous-specifie : population et synchronisation absentes

Tu declares `episodes_fts` et `nodes_fts`, mais tu ne dis jamais :
- comment elles sont peuplees ;
- qui les met a jour ;
- ce qui se passe sur update/delete.

Sans triggers, sans pipeline de sync explicite, le risque est une **derive silencieuse** entre tables sources et index FTS.

**A clarifier avant plan** : triggers SQLite, sync applicative explicite, ou regen complete. Il faut choisir.

### 5. Retrocompatibilite “legacy .md” trop floue

Tu annonces :
- les `.md` restent en sync ;
- SQLite est un niveau superieur ;
- migration progressive.

Mais tu ne dis pas quelle est la source de verite.

Questions bloquees :
- si SQLite et `/memory/*.md` divergent, qui gagne ?
- sync bidirectionnelle ou export one-way ?
- un edit manuel d'un `.md` recree des nodes/episodes, ou non ?

**A clarifier avant plan** : il faut une source de verite unique. Sinon tu construis deux systemes concurrents et le debug va etre miserable.

### 6. La recherche hybride est ambitieuse, mais les contraintes de latence sont absentes

Session start :
1. lire episodes ;
2. embed du premier message ;
3. recherche vectorielle ;
4. expansion graphe ;
5. injection contexte.

C'est beaucoup pour un hook de debut. Il manque :
- budget de latence max ;
- comportement si Ollama embedding est lent ou indisponible ;
- fallback lexical-only ;
- timeout et mode degrade.

**A clarifier avant plan** : quel SLA local acceptable au demarrage ? 200 ms ? 2 s ? 10 s ? Sans ca, impossible de dessiner un flow robuste.

### 7. Le stockage des embeddings est sous-specifie techniquement

`embedding BLOB` ne suffit pas comme spec exploitable.

Il manque :
- format exact (`float32`, `float64`, JSON, bytes bruts) ;
- ordre / dimension verifiee ;
- strategie si `nomic-embed-text` change de dimension ;
- metadata du modele d'embedding.

**A clarifier avant plan** : il faut versionner le format d'embedding, pas seulement le stocker.

### 8. Risque d'explosion de volume sans retention policy

Episodes, nodes, edges, embeddings, sync legacy `.md` : tout cela grandit sans limite dans le texte actuel.

Il manque :
- politique de retention ;
- deduplication des episodes ;
- compactage / pruning ;
- limite max d'episodes injectables au contexte.

**A clarifier avant plan** : que garde-t-on apres 3 mois, 6 mois, 1 an ? Sinon “portable, scalable” reste une promesse non justifiee.

### 9. “Ollama + nomic-embed-text deja installe” est une hypothese trop forte

Je ne peux pas l'affirmer comme invariant produit. Pour beaucoup d'installations, ce ne sera pas vrai.

Donc il faut specifier :
- detection ;
- message d'erreur ;
- mode sans embeddings ;
- comportement si seul SQLite/FTS marche.

Sinon la phase 1 depend d'un prerequis local non garanti mais non traite.

### 10. Collision conceptuelle probable avec la memoire deja exposee ailleurs

Tu appelles les niveaux `working / episodique / semantique`. C'est coherent en interne, mais fais attention : dans l'ecosysteme actuel, il existe deja souvent des memoires “user / session / repo” ou equivalents.

Ce n'est pas bloquant, mais il y a un **risque de confusion de vocabulaire** entre :
- scope de persistance ;
- type cognitif de memoire.

**A clarifier avant plan** : nommage final et articulation avec la memoire deja existante dans l'atelier.

### Ce que je te demande de changer avant le plan

Je te conseille de verrouiller explicitement ces 6 points avant de planifier :

1. **Evenement canonique de fin de session**
2. **Source de verite entre SQLite et legacy `.md`**
3. **Politique d'extraction des nodes/edges**
4. **Strategie de sync FTS5**
5. **Mode degrade si embeddings/Ollama indisponibles**
6. **Format/versioning des embeddings + retention policy**

### Verdict

Je ne bloquerais pas l'idee.
Je **bloquerais le plan d'implementation tant que ces points ne sont pas arbitres**.

En l'etat, la spec dit bien *quoi* construire, mais pas encore assez *ou sont les frontieres et les fallback*. Et sur une memoire persistante, c'est exactement la ou naissent les regressions silencieuses.
