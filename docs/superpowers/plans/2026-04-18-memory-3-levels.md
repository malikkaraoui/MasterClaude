# Memory 3 Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-level memory system (working / episodic / semantic) to claude-atelier, backed by SQLite with FTS5 hybrid search and optional Ollama vector embeddings.

**Architecture:** Single SQLite file (`.claude/memory.db`) stores episodes (session summaries) and a semantic graph (nodes + edges). A shared library handles DB access and mode detection (FULL/LEXICAL/MINIMAL). Hooks inject relevant memory at session start and first prompt. Legacy `.md` files become read-only exports.

**Tech Stack:** Node.js (ESM), `better-sqlite3`, SQLite FTS5, Ollama `nomic-embed-text` (optional)

**Spec:** `docs/superpowers/specs/2026-04-17-memory-3-levels-design.md`

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `scripts/memory-lib.js` | Shared: open DB, mode detection (FULL/LEXICAL/MINIMAL), cosine similarity, Ollama embed call |
| `scripts/memory-init.sh` | Create `memory.db` + full schema (tables, triggers, FTS5, indexes) |
| `scripts/memory-embed.js` | Standalone Ollama `nomic-embed-text` client with timeout |
| `scripts/memory-write.js` | Upsert nodes/edges by convention |
| `scripts/memory-read.js` | Hybrid search: FTS5 + vector + RRF fusion + graph expansion |
| `scripts/memory-episode.js` | Write/update session episode (summary, topics, files) |
| `scripts/memory-migrate.js` | One-shot import legacy `.md` → SQLite |
| `scripts/memory-export.js` | Export SQLite → `.md` (read-only) |
| `scripts/memory-gc.js` | Garbage collection + retention policy |
| `scripts/memory-reembed.js` | Re-generate all embeddings (model change) |
| `test/memory.js` | All memory tests (unit + integration) |

---

### Task 1: Install `better-sqlite3`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependency**

```bash
cd "/Users/malik/Documents/claude-atelier/Claude instructions"
npm install better-sqlite3
```

- [ ] **Step 2: Verify installation**

```bash
node -e "import Database from 'better-sqlite3'; console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: ajouter better-sqlite3 pour memoire SQLite"
```

---

### Task 2: Shared library `memory-lib.js`

**Files:**
- Create: `scripts/memory-lib.js`
- Test: `test/memory.js`

- [ ] **Step 1: Write the failing test for DB open + mode detection**

Create `test/memory.js`:

```js
#!/usr/bin/env node
/**
 * test/memory.js — Tests memoire 3 niveaux
 * Usage: node test/memory.js
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// --- memory-lib tests ---
console.log('\nmemory-lib');

test('openDb returns a database instance', async () => {
  const { openDb, closeDb } = await import('../scripts/memory-lib.js');
  const tmp = mkdtempSync(join(tmpdir(), 'mem-test-'));
  const dbPath = join(tmp, 'test.db');
  const db = openDb(dbPath);
  assert.ok(db);
  closeDb(db);
  rmSync(tmp, { recursive: true });
});

test('detectMode returns MINIMAL when no db', async () => {
  const { detectMode } = await import('../scripts/memory-lib.js');
  const mode = await detectMode('/nonexistent/path.db');
  assert.equal(mode, 'MINIMAL');
});

test('cosineSimilarity computes correctly', async () => {
  const { cosineSimilarity } = await import('../scripts/memory-lib.js');
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([1, 0, 0]);
  const c = new Float32Array([0, 1, 0]);
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1.0) < 0.001);
  assert.ok(Math.abs(cosineSimilarity(a, c) - 0.0) < 0.001);
});

// --- summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `Cannot find module '../scripts/memory-lib.js'`

- [ ] **Step 3: Implement `memory-lib.js`**

Create `scripts/memory-lib.js`:

```js
#!/usr/bin/env node
// scripts/memory-lib.js — Shared memory library
// Exports: openDb, closeDb, detectMode, cosineSimilarity, embed, DB_PATH

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default DB path relative to project root */
export const DB_PATH = resolve(__dirname, '..', '.claude', 'memory.db');

/** Open (or create) a SQLite database. */
export function openDb(path = DB_PATH) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Close a database. */
export function closeDb(db) {
  if (db && db.open) db.close();
}

/**
 * Detect operation mode.
 * FULL    = DB exists + Ollama running + nomic-embed-text available
 * LEXICAL = DB exists, Ollama absent
 * MINIMAL = DB absent or corrupt
 */
export async function detectMode(dbPath = DB_PATH) {
  if (!existsSync(dbPath)) return 'MINIMAL';

  try {
    const db = new Database(dbPath, { readonly: true });
    db.close();
  } catch {
    return 'MINIMAL';
  }

  // Check Ollama
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const models = data.models || [];
      const hasNomic = models.some(m => m.name && m.name.startsWith('nomic-embed-text'));
      return hasNomic ? 'FULL' : 'LEXICAL';
    }
  } catch {
    // Ollama not running
  }

  return 'LEXICAL';
}

/**
 * Cosine similarity between two Float32Array vectors.
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Call Ollama nomic-embed-text to embed text.
 * Returns Float32Array(768) or null on failure.
 */
export async function embed(text, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const arr = data.embeddings?.[0];
    return arr ? new Float32Array(arr) : null;
  } catch {
    return null;
  }
}

/**
 * Convert Float32Array to Buffer (LE bytes) for SQLite BLOB storage.
 */
export function float32ToBuffer(f32) {
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Convert Buffer (LE bytes) back to Float32Array.
 */
export function bufferToFloat32(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node test/memory.js
```

Expected: 3 passed, 0 failed

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-lib.js test/memory.js
git commit -m "feat(memory): bibliotheque partagee — DB, mode detection, cosine, embed"
```

---

### Task 3: Schema init script `memory-init.sh`

**Files:**
- Create: `scripts/memory-init.sh`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`, before the summary section:

```js
console.log('\nmemory-init');

test('memory-init.sh creates database with all tables', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-init-'));
  const dbPath = join(tmp, 'memory.db');
  const result = spawnSync('bash', [
    resolve(ROOT, 'scripts/memory-init.sh'),
    dbPath,
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `init failed: ${result.stderr}`);
  assert.ok(existsSync(dbPath), 'memory.db not created');

  // Verify tables exist
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  db.close();

  assert.ok(tables.includes('episodes'), 'missing episodes table');
  assert.ok(tables.includes('nodes'), 'missing nodes table');
  assert.ok(tables.includes('edges'), 'missing edges table');
  assert.ok(tables.includes('embeddings'), 'missing embeddings table');
  assert.ok(tables.includes('episodes_fts'), 'missing episodes_fts table');
  assert.ok(tables.includes('nodes_fts'), 'missing nodes_fts table');

  rmSync(tmp, { recursive: true });
});
```

**Important:** Since test functions use `await import(...)`, convert the `test` helper to support async:

Replace the `test` function at the top of `test/memory.js`:

```js
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}
```

And wrap all test calls in an async IIFE at the bottom:

```js
(async () => {
  // ... all test() calls here ...

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `scripts/memory-init.sh` not found or exit code non-zero

- [ ] **Step 3: Implement `memory-init.sh`**

Create `scripts/memory-init.sh`:

```bash
#!/usr/bin/env bash
# scripts/memory-init.sh — Cree memory.db + schema complet
# Usage: bash scripts/memory-init.sh [path/to/memory.db]
#   Default: .claude/memory.db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${1:-$ROOT/.claude/memory.db}"

# Creer le repertoire parent si necessaire
mkdir -p "$(dirname "$DB_PATH")"

if [ -f "$DB_PATH" ]; then
  echo "[MEMORY-INIT] $DB_PATH existe deja, skip." >&2
  exit 0
fi

echo "[MEMORY-INIT] Creation de $DB_PATH..." >&2

sqlite3 "$DB_PATH" <<'SQL'
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Niveau 2 : Episodique
CREATE TABLE episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL UNIQUE,
    timestamp     TEXT NOT NULL,
    summary       TEXT NOT NULL,
    topics        TEXT,
    files_touched TEXT,
    model_used    TEXT,
    duration_min  INTEGER,
    project       TEXT
);

-- Niveau 3 : Graphe semantique
CREATE TABLE nodes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT UNIQUE NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('script','config','concept','skill','project','person')),
    description  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    access_count INTEGER DEFAULT 0
);

CREATE TABLE edges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation   TEXT NOT NULL CHECK(relation IN ('depends_on','relates_to','part_of','uses')),
    weight     REAL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

-- Embeddings dedies
CREATE TABLE embeddings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type   TEXT NOT NULL CHECK(ref_type IN ('episode','node')),
    ref_id     INTEGER NOT NULL,
    model      TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    vector     BLOB NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(ref_type, ref_id, model)
);

-- Index
CREATE INDEX idx_episodes_project ON episodes(project);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_embeddings_ref ON embeddings(ref_type, ref_id);

-- FTS5
CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, topics);
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, description);

-- Triggers FTS5 auto-sync : episodes
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

-- Triggers FTS5 auto-sync : nodes
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
SQL

echo "[MEMORY-INIT] OK — $(sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type IN ('table','trigger')") objets crees." >&2
```

- [ ] **Step 4: Make executable and run tests**

```bash
chmod +x scripts/memory-init.sh
node test/memory.js
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-init.sh test/memory.js
git commit -m "feat(memory): script init SQLite — schema, FTS5, triggers"
```

---

### Task 4: Embed script `memory-embed.js`

**Files:**
- Create: `scripts/memory-embed.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-embed');

test('memory-embed.js --help exits 0', () => {
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-embed.js'), '--help',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage'));
});

test('float32ToBuffer roundtrips correctly', async () => {
  const { float32ToBuffer, bufferToFloat32 } = await import('../scripts/memory-lib.js');
  const original = new Float32Array([0.1, 0.2, 0.3, -1.5]);
  const buf = float32ToBuffer(original);
  assert.equal(buf.length, 16); // 4 floats * 4 bytes
  const restored = bufferToFloat32(buf);
  assert.equal(restored.length, 4);
  assert.ok(Math.abs(restored[0] - 0.1) < 0.001);
  assert.ok(Math.abs(restored[3] - (-1.5)) < 0.001);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `scripts/memory-embed.js` not found

- [ ] **Step 3: Implement `memory-embed.js`**

Create `scripts/memory-embed.js`:

```js
#!/usr/bin/env node
// scripts/memory-embed.js — Appel Ollama nomic-embed-text
// Usage: node scripts/memory-embed.js "texte a encoder"
//        node scripts/memory-embed.js --store <episode|node> <id> "texte"
// Stdout: JSON { dimensions: 768, vector: [0.1, ...] } ou stocke en DB

import { embed, float32ToBuffer, openDb, closeDb, DB_PATH } from './memory-lib.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(`Usage:
  node scripts/memory-embed.js "texte"              → JSON stdout
  node scripts/memory-embed.js --store episode 42 "texte"  → INSERT embeddings
  node scripts/memory-embed.js --store node 7 "texte"      → INSERT embeddings
  node scripts/memory-embed.js --help`);
  process.exit(0);
}

const MODEL = 'nomic-embed-text:v1.5';

if (args[0] === '--store') {
  const refType = args[1];
  const refId = parseInt(args[2], 10);
  const text = args[3];
  if (!refType || !refId || !text) {
    console.error('[MEMORY-EMBED] --store <episode|node> <id> "texte"');
    process.exit(1);
  }

  const vec = await embed(text);
  if (!vec) {
    console.error('[MEMORY-EMBED] Ollama indisponible ou erreur embed.');
    process.exit(2);
  }

  const db = openDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(refType, refId, MODEL, vec.length, float32ToBuffer(vec), now);
  closeDb(db);
  console.log(`[MEMORY-EMBED] Stocke ${refType}#${refId} (${vec.length}d)`);
} else {
  const text = args.join(' ');
  const vec = await embed(text);
  if (!vec) {
    console.error('[MEMORY-EMBED] Ollama indisponible ou erreur embed.');
    process.exit(2);
  }
  console.log(JSON.stringify({ dimensions: vec.length, model: MODEL, vector: Array.from(vec) }));
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-embed.js test/memory.js
git commit -m "feat(memory): script embed — client Ollama nomic-embed-text"
```

---

### Task 5: Write script `memory-write.js`

**Files:**
- Create: `scripts/memory-write.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-write');

test('memory-write.js upserts a node', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-write-'));
  const dbPath = join(tmp, 'memory.db');

  // Init DB first
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Write a node
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath,
    '--node', 'routing',
    '--type', 'concept',
    '--description', 'systeme de routing des modeles',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `write failed: ${result.stderr}`);

  // Verify
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM nodes WHERE name = ?').get('routing');
  db.close();
  assert.ok(row, 'node not found');
  assert.equal(row.type, 'concept');
  assert.equal(row.description, 'systeme de routing des modeles');

  rmSync(tmp, { recursive: true });
});

test('memory-write.js upserts an edge', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-edge-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Create two nodes
  for (const [name, type] of [['routing', 'concept'], ['switch_model.py', 'script']]) {
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--db', dbPath, '--node', name, '--type', type,
    ], { encoding: 'utf8', timeout: 5000 });
  }

  // Create edge
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath,
    '--edge', 'switch_model.py', 'uses', 'routing',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `edge failed: ${result.stderr}`);

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const edge = db.prepare(`
    SELECT e.*, s.name as src, t.name as tgt
    FROM edges e
    JOIN nodes s ON e.source_id = s.id
    JOIN nodes t ON e.target_id = t.id
  `).get();
  db.close();
  assert.ok(edge, 'edge not found');
  assert.equal(edge.src, 'switch_model.py');
  assert.equal(edge.tgt, 'routing');
  assert.equal(edge.relation, 'uses');

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `scripts/memory-write.js` not found

- [ ] **Step 3: Implement `memory-write.js`**

Create `scripts/memory-write.js`:

```js
#!/usr/bin/env node
// scripts/memory-write.js — Upsert nodes/edges dans le graphe semantique
// Usage:
//   node scripts/memory-write.js --node "nom" --type concept [--description "..."]
//   node scripts/memory-write.js --edge "source" "relation" "target"
//   Options: --db <path>  (defaut: .claude/memory.db)

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function getArgs(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args.slice(idx + 1, idx + 4) : null;
}

if (args.includes('--help') || args.length === 0) {
  console.log(`Usage:
  node scripts/memory-write.js --node "nom" --type concept [--description "..."]
  node scripts/memory-write.js --edge "source" "relation" "target"
  Options: --db <path>`);
  process.exit(0);
}

const dbPath = getArg('--db') || DB_PATH;
const db = openDb(dbPath);
const now = new Date().toISOString();

try {
  if (args.includes('--node')) {
    const name = getArg('--node');
    const type = getArg('--type');
    const description = getArg('--description') || null;

    if (!name || !type) {
      console.error('[MEMORY-WRITE] --node et --type requis');
      process.exit(1);
    }

    const VALID_TYPES = ['script', 'config', 'concept', 'skill', 'project', 'person'];
    if (!VALID_TYPES.includes(type)) {
      console.error(`[MEMORY-WRITE] type invalide: ${type}. Valides: ${VALID_TYPES.join(', ')}`);
      process.exit(1);
    }

    db.prepare(`
      INSERT INTO nodes (name, type, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        description = COALESCE(excluded.description, description),
        updated_at = excluded.updated_at,
        access_count = access_count + 1
    `).run(name, type, description, now, now);

    console.log(`[MEMORY-WRITE] Node upsert: ${name} (${type})`);
  }

  if (args.includes('--edge')) {
    const parts = getArgs('--edge');
    if (!parts || parts.length < 3) {
      console.error('[MEMORY-WRITE] --edge "source" "relation" "target"');
      process.exit(1);
    }
    const [sourceName, relation, targetName] = parts;

    const VALID_RELATIONS = ['depends_on', 'relates_to', 'part_of', 'uses'];
    if (!VALID_RELATIONS.includes(relation)) {
      console.error(`[MEMORY-WRITE] relation invalide: ${relation}. Valides: ${VALID_RELATIONS.join(', ')}`);
      process.exit(1);
    }

    const source = db.prepare('SELECT id FROM nodes WHERE name = ?').get(sourceName);
    const target = db.prepare('SELECT id FROM nodes WHERE name = ?').get(targetName);

    if (!source) { console.error(`[MEMORY-WRITE] Node source introuvable: ${sourceName}`); process.exit(1); }
    if (!target) { console.error(`[MEMORY-WRITE] Node target introuvable: ${targetName}`); process.exit(1); }

    db.prepare(`
      INSERT INTO edges (source_id, target_id, relation, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
        weight = weight + 1.0
    `).run(source.id, target.id, relation, now);

    console.log(`[MEMORY-WRITE] Edge upsert: ${sourceName} -[${relation}]-> ${targetName}`);
  }
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-write.js test/memory.js
git commit -m "feat(memory): script write — upsert nodes et edges"
```

---

### Task 6: Episode script `memory-episode.js`

**Files:**
- Create: `scripts/memory-episode.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-episode');

test('memory-episode.js inserts an episode', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-ep-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-episode.js'),
    '--db', dbPath,
    '--session-id', 'test-session-001',
    '--summary', 'Refacto du routing avec fallback Haiku',
    '--topics', '["routing","haiku","fallback"]',
    '--files', '["scripts/switch_model.py"]',
    '--model', 'claude-sonnet-4-5-20250514',
    '--project', 'claude-atelier',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `episode failed: ${result.stderr}`);

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM episodes WHERE session_id = ?').get('test-session-001');
  db.close();
  assert.ok(row, 'episode not found');
  assert.equal(row.summary, 'Refacto du routing avec fallback Haiku');
  assert.equal(row.project, 'claude-atelier');

  rmSync(tmp, { recursive: true });
});

test('memory-episode.js deduplicates by session_id', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-dedup-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Insert twice with same session_id
  for (const summary of ['premier', 'deuxieme']) {
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--db', dbPath,
      '--session-id', 'dup-session',
      '--summary', summary,
    ], { encoding: 'utf8', timeout: 5000 });
  }

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT * FROM episodes WHERE session_id = ?').all('dup-session');
  db.close();
  assert.equal(rows.length, 1, 'dedup failed — should be 1 row');
  assert.equal(rows[0].summary, 'deuxieme', 'should keep latest summary');

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `scripts/memory-episode.js` not found

- [ ] **Step 3: Implement `memory-episode.js`**

Create `scripts/memory-episode.js`:

```js
#!/usr/bin/env node
// scripts/memory-episode.js — Ecrit/met a jour un episode de session
// Usage: node scripts/memory-episode.js --session-id <id> --summary "..." [options]
// Options:
//   --db <path>          Chemin DB (defaut: .claude/memory.db)
//   --topics <json>      JSON array de topics
//   --files <json>       JSON array de fichiers touches
//   --model <id>         Modele utilise
//   --project <name>     Projet courant (§0)
//   --duration <min>     Duree en minutes

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

if (args.includes('--help') || args.length === 0) {
  console.log(`Usage: node scripts/memory-episode.js --session-id <id> --summary "..."
Options: --db, --topics, --files, --model, --project, --duration`);
  process.exit(0);
}

const dbPath = getArg('--db') || DB_PATH;
const sessionId = getArg('--session-id');
const summary = getArg('--summary');

if (!sessionId || !summary) {
  console.error('[MEMORY-EPISODE] --session-id et --summary requis');
  process.exit(1);
}

const topics = getArg('--topics') || null;
const files = getArg('--files') || null;
const model = getArg('--model') || null;
const project = getArg('--project') || null;
const duration = getArg('--duration') ? parseInt(getArg('--duration'), 10) : null;
const now = new Date().toISOString();

const db = openDb(dbPath);

try {
  const existing = db.prepare('SELECT id FROM episodes WHERE session_id = ?').get(sessionId);

  if (existing) {
    db.prepare(`
      UPDATE episodes SET
        summary = ?, topics = ?, files_touched = ?,
        model_used = ?, project = ?, duration_min = ?, timestamp = ?
      WHERE session_id = ?
    `).run(summary, topics, files, model, project, duration, now, sessionId);
    console.log(`[MEMORY-EPISODE] UPDATE episode session=${sessionId}`);
  } else {
    db.prepare(`
      INSERT INTO episodes (session_id, timestamp, summary, topics, files_touched, model_used, duration_min, project)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, now, summary, topics, files, model, duration, project);
    console.log(`[MEMORY-EPISODE] INSERT episode session=${sessionId}`);
  }
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-episode.js test/memory.js
git commit -m "feat(memory): script episode — ecriture/dedup episodes de session"
```

---

### Task 7: Read script `memory-read.js`

**Files:**
- Create: `scripts/memory-read.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-read');

test('memory-read.js --episodes-only returns recent episodes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-read-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Insert an episode
  spawnSync('node', [
    resolve(ROOT, 'scripts/memory-episode.js'),
    '--db', dbPath,
    '--session-id', 'read-test-001',
    '--summary', 'Test episode pour read',
    '--project', 'test-proj',
  ], { encoding: 'utf8', timeout: 5000 });

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-read.js'),
    '--db', dbPath,
    '--episodes-only',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `read failed: ${result.stderr}`);
  assert.ok(result.stdout.includes('Test episode pour read'), 'episode not in output');
});

test('memory-read.js FTS5 search finds matching nodes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-fts-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Insert nodes
  for (const [name, type, desc] of [
    ['routing', 'concept', 'systeme de routing des modeles LLM'],
    ['security', 'concept', 'securite et pre-push gate'],
    ['switch_model.py', 'script', 'script de changement de modele'],
  ]) {
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--db', dbPath, '--node', name, '--type', type, '--description', desc,
    ], { encoding: 'utf8', timeout: 5000 });
  }

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-read.js'),
    '--db', dbPath,
    'routing modele',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `fts failed: ${result.stderr}`);
  assert.ok(result.stdout.includes('routing'), 'routing not found');
});

test('memory-read.js --graph shows neighbors', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-graph-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Create nodes + edge
  spawnSync('node', [resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath, '--node', 'routing', '--type', 'concept'],
    { encoding: 'utf8', timeout: 5000 });
  spawnSync('node', [resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath, '--node', 'switch_model.py', '--type', 'script'],
    { encoding: 'utf8', timeout: 5000 });
  spawnSync('node', [resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath, '--edge', 'switch_model.py', 'uses', 'routing'],
    { encoding: 'utf8', timeout: 5000 });

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-read.js'),
    '--db', dbPath, '--graph', 'routing',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `graph failed: ${result.stderr}`);
  assert.ok(result.stdout.includes('switch_model.py'), 'neighbor not found');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL — `scripts/memory-read.js` not found

- [ ] **Step 3: Implement `memory-read.js`**

Create `scripts/memory-read.js`:

```js
#!/usr/bin/env node
// scripts/memory-read.js — Recherche hybride FTS5 + vectoriel + expansion graphe
// Usage:
//   node scripts/memory-read.js "query"                  → recherche hybride
//   node scripts/memory-read.js --episodes-only          → 5 derniers episodes
//   node scripts/memory-read.js --episodes <n>           → n derniers episodes
//   node scripts/memory-read.js --graph "node"           → voisins 1-hop
//   node scripts/memory-read.js --context                → hook: episodes + prompt context
// Options: --db <path>, --timeout <ms>, --project <name>

import { openDb, closeDb, detectMode, cosineSimilarity, embed, bufferToFloat32, DB_PATH } from './memory-lib.js';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const EMBED_MODEL = 'nomic-embed-text:v1.5';

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const dbPath = getArg('--db') || DB_PATH;
const timeoutMs = parseInt(getArg('--timeout') || '5000', 10);
const projectFilter = getArg('--project') || null;

// Timeout global
const timer = setTimeout(() => {
  console.error('[MEMORY] Timeout depasse');
  process.exit(0); // exit clean pour ne pas bloquer le hook
}, timeoutMs);

try {
  if (!existsSync(dbPath)) {
    // Mode MINIMAL — pas de DB
    console.log('[MEMORY] Mode: MINIMAL — pas de base. Utiliser: bash scripts/memory-init.sh');
    process.exit(0);
  }

  const db = openDb(dbPath);

  if (args.includes('--episodes-only') || args.includes('--episodes')) {
    const limit = parseInt(getArg('--episodes') || '5', 10);
    let query = 'SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?';
    let params = [limit];
    if (projectFilter) {
      query = 'SELECT * FROM episodes WHERE project = ? ORDER BY timestamp DESC LIMIT ?';
      params = [projectFilter, limit];
    }
    const rows = db.prepare(query).all(...params);
    if (rows.length === 0) {
      console.log('[MEMORY] Aucun episode enregistre.');
    } else {
      console.log(`[MEMORY] ${rows.length} episode(s) recent(s):`);
      for (const r of rows) {
        const topics = r.topics ? JSON.parse(r.topics).join(', ') : '';
        console.log(`  ${r.timestamp.slice(0, 10)} — ${r.summary}${topics ? ` [${topics}]` : ''}`);
      }
    }
    closeDb(db);
    process.exit(0);
  }

  if (args.includes('--graph')) {
    const nodeName = getArg('--graph');
    const node = db.prepare('SELECT * FROM nodes WHERE name = ?').get(nodeName);
    if (!node) {
      console.log(`[MEMORY] Node introuvable: ${nodeName}`);
      closeDb(db);
      process.exit(0);
    }

    // Increment access_count
    db.prepare('UPDATE nodes SET access_count = access_count + 1 WHERE id = ?').run(node.id);

    // Get neighbors (1-hop)
    const neighbors = db.prepare(`
      SELECT n.name, n.type, e.relation, 'outgoing' as direction
      FROM edges e JOIN nodes n ON e.target_id = n.id
      WHERE e.source_id = ?
      UNION ALL
      SELECT n.name, n.type, e.relation, 'incoming' as direction
      FROM edges e JOIN nodes n ON e.source_id = n.id
      WHERE e.target_id = ?
    `).all(node.id, node.id);

    console.log(`[MEMORY] Node: ${node.name} (${node.type})${node.description ? ' — ' + node.description : ''}`);
    if (neighbors.length === 0) {
      console.log('  Aucun voisin.');
    } else {
      for (const n of neighbors) {
        const arrow = n.direction === 'outgoing' ? '→' : '←';
        console.log(`  ${arrow} ${n.relation} ${n.name} (${n.type})`);
      }
    }
    closeDb(db);
    process.exit(0);
  }

  if (args.includes('--context')) {
    // Hook mode: episodes + prompt-aware context
    // Prompt is passed via $HOOK_PROMPT env var (UserPromptSubmit)
    const prompt = process.env.HOOK_PROMPT || '';

    // Recent episodes
    const episodes = db.prepare(
      'SELECT * FROM episodes ORDER BY timestamp DESC LIMIT 5'
    ).all();

    let output = '';
    if (episodes.length > 0) {
      output += `[MEMORY] ${episodes.length} episode(s):\n`;
      for (const r of episodes) {
        output += `  ${r.timestamp.slice(0, 10)} — ${r.summary}\n`;
      }
    }

    if (prompt) {
      // FTS5 search on nodes
      const keywords = prompt.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 5);
      if (keywords.length > 0) {
        const ftsQuery = keywords.join(' OR ');
        try {
          const nodes = db.prepare(`
            SELECT n.name, n.type, n.description
            FROM nodes_fts f
            JOIN nodes n ON n.id = f.rowid
            WHERE nodes_fts MATCH ?
            LIMIT 10
          `).all(ftsQuery);

          if (nodes.length > 0) {
            output += `[MEMORY] ${nodes.length} concept(s): `;
            output += nodes.map(n => `${n.name} (${n.type})`).join(', ');
            output += '\n';
          }
        } catch {
          // FTS query syntax error — skip
        }
      }
    }

    if (output) console.log(output.trim());
    closeDb(db);
    process.exit(0);
  }

  // Default: hybrid search
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  if (!query) {
    console.log(`Usage: node scripts/memory-read.js "query"`);
    closeDb(db);
    process.exit(0);
  }

  // 1. FTS5 lexical search
  const keywords = query.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  let ftsResults = [];
  if (keywords.length > 0) {
    const ftsQuery = keywords.join(' OR ');
    try {
      ftsResults = db.prepare(`
        SELECT n.id, n.name, n.type, n.description, rank
        FROM nodes_fts f
        JOIN nodes n ON n.id = f.rowid
        WHERE nodes_fts MATCH ?
        ORDER BY rank
        LIMIT 20
      `).all(ftsQuery);
    } catch { /* invalid FTS query */ }
  }

  // 2. Vector search (mode FULL only)
  let vecResults = [];
  const queryVec = await embed(query, 3000);
  if (queryVec) {
    const allEmbeddings = db.prepare(`
      SELECT e.ref_id, e.vector, n.name, n.type, n.description
      FROM embeddings e
      JOIN nodes n ON e.ref_type = 'node' AND e.ref_id = n.id
      WHERE e.model = ?
    `).all(EMBED_MODEL);

    vecResults = allEmbeddings.map(row => ({
      ...row,
      score: cosineSimilarity(queryVec, bufferToFloat32(row.vector)),
    })).sort((a, b) => b.score - a.score).slice(0, 20);
  }

  // 3. RRF fusion (k=60)
  const K = 60;
  const scores = new Map();

  ftsResults.forEach((r, i) => {
    const prev = scores.get(r.id) || { ...r, score: 0 };
    prev.score += 1 / (K + i + 1);
    scores.set(r.id, prev);
  });

  vecResults.forEach((r, i) => {
    const prev = scores.get(r.ref_id) || { id: r.ref_id, name: r.name, type: r.type, description: r.description, score: 0 };
    prev.score += 1 / (K + i + 1);
    scores.set(r.ref_id, prev);
  });

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 10);

  // 4. Graph expansion for top 5
  const expanded = new Set();
  for (const node of ranked.slice(0, 5)) {
    const neighbors = db.prepare(`
      SELECT n.name, n.type, e.relation
      FROM edges e JOIN nodes n ON e.target_id = n.id WHERE e.source_id = ?
      UNION ALL
      SELECT n.name, n.type, e.relation
      FROM edges e JOIN nodes n ON e.source_id = n.id WHERE e.target_id = ?
    `).all(node.id, node.id);
    for (const n of neighbors) expanded.add(`${n.name} (${n.type})`);
  }

  // 5. Episode search
  let episodeResults = [];
  if (keywords.length > 0) {
    try {
      episodeResults = db.prepare(`
        SELECT e.session_id, e.timestamp, e.summary, e.topics
        FROM episodes_fts f
        JOIN episodes e ON e.id = f.rowid
        WHERE episodes_fts MATCH ?
        ORDER BY rank
        LIMIT 5
      `).all(keywords.join(' OR '));
    } catch { /* invalid FTS query */ }
  }

  // Output
  const mode = queryVec ? 'FULL' : 'LEXICAL';
  console.log(`[MEMORY] Mode: ${mode} | Query: "${query}"`);
  if (ranked.length > 0) {
    console.log(`  ${ranked.length} concept(s): ${ranked.map(n => n.name).join(', ')}`);
  }
  if (expanded.size > 0) {
    console.log(`  Voisins: ${[...expanded].join(', ')}`);
  }
  if (episodeResults.length > 0) {
    console.log(`  ${episodeResults.length} episode(s):`);
    for (const ep of episodeResults) {
      console.log(`    ${ep.timestamp.slice(0, 10)} — ${ep.summary}`);
    }
  }
  if (ranked.length === 0 && episodeResults.length === 0) {
    console.log('  Aucun resultat.');
  }

  closeDb(db);
} finally {
  clearTimeout(timer);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-read.js test/memory.js
git commit -m "feat(memory): script read — recherche hybride FTS5/vectoriel/RRF"
```

---

### Task 8: Migration script `memory-migrate.js`

**Files:**
- Create: `scripts/memory-migrate.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-migrate');

test('memory-migrate.js imports .md files into SQLite', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-mig-'));
  const dbPath = join(tmp, 'memory.db');
  const memDir = join(tmp, 'memory');

  // Create mock .md files with frontmatter
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(memDir, { recursive: true });

  writeFileSync(join(memDir, 'MEMORY.md'), '- [Test](test.md) — a test memory\n');
  writeFileSync(join(memDir, 'test.md'), `---
name: test concept
description: a test memory
type: user
---

This is a test memory about routing.
`);

  // Init DB
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Run migration
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-migrate.js'),
    '--db', dbPath,
    '--memory-dir', memDir,
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `migrate failed: ${result.stderr}`);

  // Verify nodes created
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  const nodes = db.prepare('SELECT * FROM nodes').all();
  db.close();
  assert.ok(nodes.length > 0, 'no nodes created');

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL

- [ ] **Step 3: Implement `memory-migrate.js`**

Create `scripts/memory-migrate.js`:

```js
#!/usr/bin/env node
// scripts/memory-migrate.js — Import one-shot des .md legacy vers SQLite
// Usage: node scripts/memory-migrate.js [--db <path>] [--memory-dir <path>]

import { openDb, closeDb, DB_PATH } from './memory-lib.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const dbPath = getArg('--db') || DB_PATH;
const memDir = getArg('--memory-dir') || resolve(ROOT, '.claude/projects/-Users-malik-Documents-claude-atelier-Claude-instructions/memory');

if (!existsSync(memDir)) {
  console.error(`[MEMORY-MIGRATE] Repertoire memoire introuvable: ${memDir}`);
  process.exit(1);
}

const db = openDb(dbPath);
const now = new Date().toISOString();
let imported = 0;
let skipped = 0;

// Map memory types to node types
const TYPE_MAP = {
  user: 'person',
  feedback: 'concept',
  project: 'project',
  reference: 'concept',
};

try {
  const files = readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');

  for (const file of files) {
    const content = readFileSync(join(memDir, file), 'utf8');

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) { skipped++; continue; }

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    const getName = (fm) => {
      const m = fm.match(/^name:\s*(.+)$/m);
      return m ? m[1].trim() : null;
    };
    const getDesc = (fm) => {
      const m = fm.match(/^description:\s*(.+)$/m);
      return m ? m[1].trim() : null;
    };
    const getType = (fm) => {
      const m = fm.match(/^type:\s*(.+)$/m);
      return m ? m[1].trim() : null;
    };

    const name = getName(frontmatter);
    const description = getDesc(frontmatter) || body.slice(0, 200);
    const rawType = getType(frontmatter);
    const nodeType = TYPE_MAP[rawType] || 'concept';

    if (!name) { skipped++; continue; }

    // Check if already exists
    const existing = db.prepare('SELECT id FROM nodes WHERE name = ?').get(name);
    if (existing) { skipped++; continue; }

    db.prepare(`
      INSERT INTO nodes (name, type, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, nodeType, description, now, now);
    imported++;
  }

  console.log(`[MEMORY-MIGRATE] ${imported} importe(s), ${skipped} ignore(s) sur ${files.length} fichiers`);
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-migrate.js test/memory.js
git commit -m "feat(memory): script migrate — import legacy .md vers SQLite"
```

---

### Task 9: Export script `memory-export.js`

**Files:**
- Create: `scripts/memory-export.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-export');

test('memory-export.js writes MEMORY.md index', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-exp-'));
  const dbPath = join(tmp, 'memory.db');
  const outDir = join(tmp, 'export');

  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  // Add a node
  spawnSync('node', [
    resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath, '--node', 'routing', '--type', 'concept',
    '--description', 'systeme de routing',
  ], { encoding: 'utf8', timeout: 5000 });

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-export.js'),
    '--db', dbPath,
    '--out', outDir,
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `export failed: ${result.stderr}`);

  const { readFileSync } = await import('node:fs');
  const memoryMd = readFileSync(join(outDir, 'MEMORY.md'), 'utf8');
  assert.ok(memoryMd.includes('routing'), 'MEMORY.md missing node');

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL

- [ ] **Step 3: Implement `memory-export.js`**

Create `scripts/memory-export.js`:

```js
#!/usr/bin/env node
// scripts/memory-export.js — Export SQLite → .md (read-only)
// Usage: node scripts/memory-export.js [--db <path>] [--out <dir>]

import { openDb, closeDb, DB_PATH } from './memory-lib.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const dbPath = getArg('--db') || DB_PATH;
const outDir = getArg('--out') || resolve(ROOT, '.claude/projects/-Users-malik-Documents-claude-atelier-Claude-instructions/memory');

mkdirSync(outDir, { recursive: true });

const db = openDb(dbPath);

try {
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY type, name').all();
  const memoryLines = [];

  // Node type → memory type mapping (reverse of migrate)
  const TYPE_MAP = {
    person: 'user',
    concept: 'feedback',
    project: 'project',
    script: 'reference',
    config: 'reference',
    skill: 'reference',
  };

  for (const node of nodes) {
    const filename = `${node.type}_${node.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    const memType = TYPE_MAP[node.type] || 'reference';

    const content = `---
name: ${node.name}
description: ${node.description || node.name}
type: ${memType}
---

${node.description || ''}
`;

    writeFileSync(join(outDir, filename), content);
    memoryLines.push(`- [${node.name}](${filename}) — ${(node.description || '').slice(0, 100)}`);
  }

  // Write MEMORY.md index
  const memoryMd = memoryLines.join('\n') + '\n';
  writeFileSync(join(outDir, 'MEMORY.md'), memoryMd);

  console.log(`[MEMORY-EXPORT] ${nodes.length} node(s) exportes vers ${outDir}`);
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-export.js test/memory.js
git commit -m "feat(memory): script export — SQLite vers .md read-only"
```

---

### Task 10: Garbage collection `memory-gc.js`

**Files:**
- Create: `scripts/memory-gc.js`
- Modify: `test/memory.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-gc');

test('memory-gc.js prunes old episodes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-gc-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  // Insert an episode > 1 year old
  const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO episodes (session_id, timestamp, summary, project)
    VALUES ('old-session', ?, 'Tres vieux episode', 'test')
  `).run(oldDate);

  // Insert a recent episode
  db.prepare(`
    INSERT INTO episodes (session_id, timestamp, summary, project)
    VALUES ('new-session', ?, 'Episode recent', 'test')
  `).run(new Date().toISOString());

  db.close();

  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-gc.js'),
    '--db', dbPath,
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `gc failed: ${result.stderr}`);

  const db2 = new Database(dbPath, { readonly: true });
  const episodes = db2.prepare('SELECT * FROM episodes').all();
  db2.close();

  assert.equal(episodes.length, 1, 'should have pruned old episode');
  assert.equal(episodes[0].session_id, 'new-session');

  rmSync(tmp, { recursive: true });
});

test('memory-gc.js prunes orphan nodes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-gc2-'));
  const dbPath = join(tmp, 'memory.db');
  spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);

  const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  // Orphan node (no edges, no access, old)
  db.prepare(`
    INSERT INTO nodes (name, type, created_at, updated_at, access_count)
    VALUES ('orphan', 'concept', ?, ?, 0)
  `).run(oldDate, oldDate);

  // Connected node
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO nodes (name, type, created_at, updated_at, access_count)
    VALUES ('connected', 'concept', ?, ?, 5)
  `).run(now, now);

  db.close();

  spawnSync('node', [resolve(ROOT, 'scripts/memory-gc.js'), '--db', dbPath],
    { encoding: 'utf8', timeout: 10000 });

  const db2 = new Database(dbPath, { readonly: true });
  const nodes = db2.prepare('SELECT name FROM nodes').all();
  db2.close();

  assert.ok(nodes.some(n => n.name === 'connected'), 'connected should survive');
  assert.ok(!nodes.some(n => n.name === 'orphan'), 'orphan should be pruned');

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL

- [ ] **Step 3: Implement `memory-gc.js`**

Create `scripts/memory-gc.js`:

```js
#!/usr/bin/env node
// scripts/memory-gc.js — Garbage collection + retention policy
// Usage: node scripts/memory-gc.js [--db <path>] [--dry-run]
//
// Retention:
//   Episodes < 90j  → conserves
//   Episodes 90-365j → conserves (compactage futur)
//   Episodes > 365j → supprimes
//   Nodes orphelins (0 edges, 0 access, > 90j) → supprimes
//   Max 500 nodes

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const dbPath = getArg('--db') || DB_PATH;
const dryRun = args.includes('--dry-run');

const db = openDb(dbPath);
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

let deletedEpisodes = 0;
let deletedNodes = 0;
let deletedEmbeddings = 0;

try {
  // 1. Delete episodes > 365 days
  const cutoff365 = new Date(now - 365 * DAY).toISOString();
  if (dryRun) {
    const count = db.prepare('SELECT count(*) as c FROM episodes WHERE timestamp < ?').get(cutoff365);
    console.log(`[GC dry-run] ${count.c} episode(s) > 1 an`);
  } else {
    const oldEpisodeIds = db.prepare('SELECT id FROM episodes WHERE timestamp < ?').all(cutoff365);
    if (oldEpisodeIds.length > 0) {
      // Delete associated embeddings first
      for (const { id } of oldEpisodeIds) {
        deletedEmbeddings += db.prepare("DELETE FROM embeddings WHERE ref_type = 'episode' AND ref_id = ?").run(id).changes;
      }
      const result = db.prepare('DELETE FROM episodes WHERE timestamp < ?').run(cutoff365);
      deletedEpisodes = result.changes;
    }
  }

  // 2. Delete orphan nodes (0 edges + access_count 0 + updated_at > 90 days ago)
  const cutoff90 = new Date(now - 90 * DAY).toISOString();
  if (dryRun) {
    const count = db.prepare(`
      SELECT count(*) as c FROM nodes n
      WHERE n.access_count = 0
        AND n.updated_at < ?
        AND NOT EXISTS (SELECT 1 FROM edges WHERE source_id = n.id OR target_id = n.id)
    `).get(cutoff90);
    console.log(`[GC dry-run] ${count.c} node(s) orphelin(s)`);
  } else {
    const orphans = db.prepare(`
      SELECT id FROM nodes n
      WHERE n.access_count = 0
        AND n.updated_at < ?
        AND NOT EXISTS (SELECT 1 FROM edges WHERE source_id = n.id OR target_id = n.id)
    `).all(cutoff90);
    for (const { id } of orphans) {
      db.prepare("DELETE FROM embeddings WHERE ref_type = 'node' AND ref_id = ?").run(id);
      deletedNodes++;
    }
    if (orphans.length > 0) {
      db.prepare(`
        DELETE FROM nodes
        WHERE access_count = 0
          AND updated_at < ?
          AND NOT EXISTS (SELECT 1 FROM edges WHERE source_id = id OR target_id = id)
      `).run(cutoff90);
    }
  }

  // 3. Max 500 nodes — prune least accessed if over limit
  const nodeCount = db.prepare('SELECT count(*) as c FROM nodes').get().c;
  if (nodeCount > 500 && !dryRun) {
    const excess = nodeCount - 500;
    db.prepare(`
      DELETE FROM nodes WHERE id IN (
        SELECT id FROM nodes ORDER BY access_count ASC, updated_at ASC LIMIT ?
      )
    `).run(excess);
    deletedNodes += excess;
  }

  if (!dryRun) {
    console.log(`[MEMORY-GC] ${deletedEpisodes} episode(s), ${deletedNodes} node(s), ${deletedEmbeddings} embedding(s) supprimes`);
  }
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-gc.js test/memory.js
git commit -m "feat(memory): script gc — garbage collection et retention policy"
```

---

### Task 11: Re-embed script `memory-reembed.js`

**Files:**
- Create: `scripts/memory-reembed.js`

- [ ] **Step 1: Write the failing test**

Add to `test/memory.js`:

```js
console.log('\nmemory-reembed');

test('memory-reembed.js --help exits 0', () => {
  const result = spawnSync('node', [
    resolve(ROOT, 'scripts/memory-reembed.js'), '--help',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/memory.js
```

Expected: FAIL

- [ ] **Step 3: Implement `memory-reembed.js`**

Create `scripts/memory-reembed.js`:

```js
#!/usr/bin/env node
// scripts/memory-reembed.js — Re-generer tous les embeddings (changement de modele)
// Usage: node scripts/memory-reembed.js [--db <path>] [--model <name>]

import { openDb, closeDb, DB_PATH, embed, float32ToBuffer } from './memory-lib.js';

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

if (args.includes('--help')) {
  console.log(`Usage: node scripts/memory-reembed.js [--db <path>] [--model <name>]
Re-genere tous les embeddings pour episodes et nodes.
Requiert Ollama + nomic-embed-text en cours d'execution.`);
  process.exit(0);
}

const dbPath = getArg('--db') || DB_PATH;
const MODEL = getArg('--model') || 'nomic-embed-text:v1.5';

// Verify Ollama is available
const testVec = await embed('test', 3000);
if (!testVec) {
  console.error('[MEMORY-REEMBED] Ollama indisponible. Lancer: ollama serve');
  process.exit(2);
}

const db = openDb(dbPath);
let total = 0;
let errors = 0;

try {
  // Re-embed all nodes
  const nodes = db.prepare('SELECT id, name, description FROM nodes').all();
  for (const node of nodes) {
    const text = `${node.name}: ${node.description || node.name}`;
    const vec = await embed(text);
    if (!vec) { errors++; continue; }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
      VALUES ('node', ?, ?, ?, ?, ?)
    `).run(node.id, MODEL, vec.length, float32ToBuffer(vec), now);
    total++;
  }

  // Re-embed all episodes
  const episodes = db.prepare('SELECT id, summary FROM episodes').all();
  for (const ep of episodes) {
    const vec = await embed(ep.summary);
    if (!vec) { errors++; continue; }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
      VALUES ('episode', ?, ?, ?, ?, ?)
    `).run(ep.id, MODEL, vec.length, float32ToBuffer(vec), now);
    total++;
  }

  console.log(`[MEMORY-REEMBED] ${total} embedding(s) generes, ${errors} erreur(s). Modele: ${MODEL}`);
} finally {
  closeDb(db);
}
```

- [ ] **Step 4: Run tests**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add scripts/memory-reembed.js test/memory.js
git commit -m "feat(memory): script reembed — regeneration embeddings"
```

---

### Task 12: Hook integration

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.gitignore` (add `memory.db`)

- [ ] **Step 1: Add memory.db to .gitignore**

Append to `.gitignore`:

```
# Memory SQLite database (local, not tracked)
.claude/memory.db
.claude/memory.db-wal
.claude/memory.db-shm
```

- [ ] **Step 2: Add SessionStart hook**

In `.claude/settings.json`, add to the `SessionStart` hooks array:

```json
{
  "type": "command",
  "command": "node \"/Users/malik/Documents/claude-atelier/Claude instructions/scripts/memory-read.js\" --episodes-only --timeout 2000"
}
```

- [ ] **Step 3: Add UserPromptSubmit hook**

In `.claude/settings.json`, add to the `UserPromptSubmit` hooks array:

```json
{
  "type": "command",
  "command": "node \"/Users/malik/Documents/claude-atelier/Claude instructions/scripts/memory-read.js\" --context --timeout 2000"
}
```

- [ ] **Step 4: Run init to create database**

```bash
bash scripts/memory-init.sh
```

Expected: `[MEMORY-INIT] OK — X objets crees.`

- [ ] **Step 5: Run migration from existing .md files**

```bash
node scripts/memory-migrate.js
```

Expected: `[MEMORY-MIGRATE] N importe(s), M ignore(s)`

- [ ] **Step 6: Verify hooks work**

```bash
node scripts/memory-read.js --episodes-only --timeout 2000
node scripts/memory-read.js --context --timeout 2000
```

Expected: clean output, no errors

- [ ] **Step 7: Update hooks manifest**

```bash
node scripts/manifest-sync.js
```

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add .claude/settings.json .gitignore test/memory.js
git commit -m "feat(memory): integration hooks SessionStart + UserPromptSubmit"
```

---

### Task 13: End-to-end integration test

**Files:**
- Modify: `test/memory.js`

- [ ] **Step 1: Write full flow integration test**

Add to `test/memory.js`:

```js
console.log('\nintegration — full flow');

test('full flow: init → write → episode → read → gc → export', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mem-e2e-'));
  const dbPath = join(tmp, 'memory.db');

  // 1. Init
  let r = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, 'init failed');

  // 2. Write nodes
  for (const [name, type, desc] of [
    ['routing', 'concept', 'systeme routing modeles'],
    ['security', 'concept', 'securite pre-push'],
    ['switch_model.py', 'script', 'changement modele'],
    ['Malik', 'person', 'auteur principal'],
  ]) {
    r = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--db', dbPath, '--node', name, '--type', type, '--description', desc,
    ], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, `write ${name} failed`);
  }

  // 3. Write edges
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-write.js'),
    '--db', dbPath, '--edge', 'switch_model.py', 'uses', 'routing'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'edge failed');

  // 4. Write episode
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-episode.js'),
    '--db', dbPath,
    '--session-id', 'e2e-001',
    '--summary', 'Session e2e test routing et security',
    '--topics', '["routing","security"]',
    '--project', 'test',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'episode failed');

  // 5. Read — hybrid search
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-read.js'),
    '--db', dbPath, 'routing modele'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'read failed');
  assert.ok(r.stdout.includes('routing'), 'routing not in search results');

  // 6. Read — graph
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-read.js'),
    '--db', dbPath, '--graph', 'routing'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'graph failed');
  assert.ok(r.stdout.includes('switch_model.py'), 'neighbor not found');

  // 7. GC (should not delete anything recent)
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-gc.js'),
    '--db', dbPath],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'gc failed');

  // 8. Export
  const outDir = join(tmp, 'export');
  r = spawnSync('node', [resolve(ROOT, 'scripts/memory-export.js'),
    '--db', dbPath, '--out', outDir],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, 'export failed');

  const { existsSync: exists } = await import('node:fs');
  assert.ok(exists(join(outDir, 'MEMORY.md')), 'MEMORY.md not exported');

  // Verify DB integrity
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare('SELECT count(*) as c FROM nodes').get().c, 4);
  assert.equal(db.prepare('SELECT count(*) as c FROM edges').get().c, 1);
  assert.equal(db.prepare('SELECT count(*) as c FROM episodes').get().c, 1);
  db.close();

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run full test suite**

```bash
node test/memory.js
```

Expected: all pass

- [ ] **Step 3: Run `npm test`**

```bash
npm test
```

Expected: all pass including existing tests

- [ ] **Step 4: Commit**

```bash
git add test/memory.js
git commit -m "test(memory): test e2e — flow complet init/write/read/gc/export"
```

---

### Task 14: Documentation and package.json update

**Files:**
- Modify: `package.json` (add `files` entry for memory scripts)

- [ ] **Step 1: Add memory scripts to package.json files array**

Ensure `scripts/memory-*.js`, `scripts/memory-*.sh`, and `scripts/memory-lib.js` are included in the `files` array of `package.json`.

- [ ] **Step 2: Run pre-push gate**

```bash
bash scripts/pre-push-gate.sh
```

Expected: all 5 checks pass

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: ajouter scripts memoire dans package.json files"
```
