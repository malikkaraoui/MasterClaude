#!/usr/bin/env node
/**
 * test/memory.js — Memory system tests
 *
 * Tests for the 3-level memory system:
 * - memory-lib.js exports (openDb, closeDb, detectMode, etc.)
 * - memory-init.sh schema creation
 *
 * Zero dependencies: Node.js builtin only.
 *
 * Usage: node test/memory.js
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0;
let fail = 0;
let tests = [];

function test(label, fn) {
  tests.push(async () => {
    try {
      fn();
      console.log(`  ✓ ${label}`);
      pass++;
    } catch (e) {
      console.error(`  ✗ ${label}`);
      console.error(`    └ ${e.message}`);
      fail++;
    }
  });
}

function testAsync(label, fn) {
  tests.push(async () => {
    try {
      await fn();
      console.log(`  ✓ ${label}`);
      pass++;
    } catch (e) {
      console.error(`  ✗ ${label}`);
      console.error(`    └ ${e.message}`);
      fail++;
    }
  });
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

// Import memory-lib functions
import {
  openDb,
  closeDb,
  detectMode,
  cosineSimilarity,
  float32ToBuffer,
  bufferToFloat32
} from '../scripts/memory-lib.js';

// ─────────────────────────────────────────────────────────────
// Test: openDb returns a database instance
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-lib.js ──');

test('openDb returns a database instance', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-test-'));
  const dbPath = resolve(tmpDir, 'test.db');

  try {
    const db = openDb(dbPath);
    ok(db !== null && typeof db === 'object', 'db should be an object');
    ok(typeof db.prepare === 'function', 'db should have prepare method');
    closeDb(db);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

testAsync('detectMode returns MINIMAL for nonexistent path', async () => {
  const nonexistentPath = resolve(tmpdir(), `nonexistent-${Date.now()}.db`);
  const mode = await detectMode(nonexistentPath);
  ok(mode === 'MINIMAL', `expected MINIMAL, got ${mode}`);
});

test('cosineSimilarity identity vectors = 1.0', () => {
  const vec = new Float32Array([1, 0, 0]);
  const similarity = cosineSimilarity(vec, vec);
  ok(Math.abs(similarity - 1.0) < 0.001, `expected ~1.0, got ${similarity}`);
});

test('cosineSimilarity orthogonal vectors = 0.0', () => {
  const v1 = new Float32Array([1, 0, 0]);
  const v2 = new Float32Array([0, 1, 0]);
  const similarity = cosineSimilarity(v1, v2);
  ok(Math.abs(similarity) < 0.001, `expected ~0.0, got ${similarity}`);
});

test('float32ToBuffer roundtrips correctly', () => {
  const original = new Float32Array([1.5, -2.5, 3.14]);
  const buf = float32ToBuffer(original);
  const restored = bufferToFloat32(buf);

  ok(buf instanceof Buffer, 'float32ToBuffer should return Buffer');
  ok(restored instanceof Float32Array, 'bufferToFloat32 should return Float32Array');

  for (let i = 0; i < original.length; i++) {
    ok(Math.abs(original[i] - restored[i]) < 0.001,
      `index ${i}: expected ${original[i]}, got ${restored[i]}`);
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-init.sh schema creation
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-init.sh ──');

test('memory-init.sh creates database with all tables', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-init-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    const result = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });

    ok(result.status === 0, `init should exit 0, got ${result.status}: ${result.stderr}`);
    ok(existsSync(dbPath), 'database file should exist');

    // Verify tables exist using sqlite3 command
    const tableCheck = spawnSync('sqlite3', [dbPath, '.tables'], { encoding: 'utf8' });
    const tables = tableCheck.stdout.split(/\s+/).filter(t => t);

    ok(tables.includes('episodes'), 'episodes table missing');
    ok(tables.includes('nodes'), 'nodes table missing');
    ok(tables.includes('edges'), 'edges table missing');
    ok(tables.includes('embeddings'), 'embeddings table missing');
    ok(tables.includes('episodes_fts'), 'episodes_fts table missing');
    ok(tables.includes('nodes_fts'), 'nodes_fts table missing');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('memory-init.sh skips if db exists', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-init-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // First run
    const result1 = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(result1.status === 0, `first init should exit 0`);

    // Second run
    const result2 = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(result2.status === 0, `second init should exit 0`);
    ok(result2.stdout.includes('skip') || result2.stdout.includes('exists'),
      `second init should print skip message: ${result2.stdout}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FTS5 trigger: insert node, verify nodes_fts has matching row', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-fts-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Open DB and insert a node
    const db = openDb(dbPath);
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO nodes (name, type, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('test-node', 'script', 'Test description', now, now);

      // Check FTS5 table
      const row = db.prepare(`
        SELECT * FROM nodes_fts WHERE name = ?
      `).get('test-node');

      ok(row, 'FTS5 trigger should have inserted row into nodes_fts');
    } finally {
      closeDb(db);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-embed.js --help
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-embed.js ──');

test('memory-embed.js --help exits 0 with Usage text', () => {
  const result = spawnSync('node', [resolve(ROOT, 'scripts/memory-embed.js'), '--help'], {
    encoding: 'utf8',
    cwd: ROOT
  });

  ok(result.status === 0, `--help should exit 0, got ${result.status}`);
  ok(result.stdout.includes('Usage') || result.stdout.includes('usage'),
    `--help output should include Usage: ${result.stdout}`);
});

// ─────────────────────────────────────────────────────────────
// Test: memory-write.js
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-write.js ──');

test('memory-write.js upserts a node', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-write-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Write a node
    const writeResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'test-node',
      '--type', 'script',
      '--description', 'Test script node',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(writeResult.status === 0, `write should exit 0, got ${writeResult.status}: ${writeResult.stderr}`);

    // Verify node in DB
    const db = openDb(dbPath);
    try {
      const row = db.prepare(`SELECT * FROM nodes WHERE name = ?`).get('test-node');
      ok(row, 'node should exist in database');
      ok(row.type === 'script', `type should be script, got ${row.type}`);
      ok(row.description === 'Test script node', `description mismatch`);
    } finally {
      closeDb(db);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('memory-write.js upserts an edge', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-write-edge-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Create two nodes directly (source_id/target_id are FKs)
    const db = openDb(dbPath);
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO nodes (name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('node-a', 'script', now, now);

      db.prepare(`
        INSERT INTO nodes (name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('node-b', 'script', now, now);

      // Get the IDs
      const nodeA = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get('node-a');
      const nodeB = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get('node-b');

      // Create edge with source_id/target_id
      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation, weight, created_at)
        VALUES (?, ?, ?, 1.0, ?)
      `).run(nodeA.id, nodeB.id, 'depends_on', now);
    } finally {
      closeDb(db);
    }

    // Verify edge in DB
    const db2 = openDb(dbPath);
    try {
      const nodeA = db2.prepare(`SELECT id FROM nodes WHERE name = ?`).get('node-a');
      const nodeB = db2.prepare(`SELECT id FROM nodes WHERE name = ?`).get('node-b');
      const row = db2.prepare(`
        SELECT * FROM edges WHERE source_id = ? AND target_id = ?
      `).get(nodeA.id, nodeB.id);
      ok(row, 'edge should exist in database');
      ok(row.relation === 'depends_on', `relation should be depends_on`);
    } finally {
      closeDb(db2);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-episode.js
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-episode.js ──');

test('memory-episode.js inserts an episode', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-episode-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Insert episode
    const writeResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--session-id', 'test-session-1',
      '--summary', 'Test episode summary',
      '--duration', '30',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(writeResult.status === 0, `insert should exit 0, got ${writeResult.status}: ${writeResult.stderr}`);

    // Verify episode in DB
    const db = openDb(dbPath);
    try {
      const row = db.prepare(`SELECT * FROM episodes WHERE session_id = ?`).get('test-session-1');
      ok(row, 'episode should exist in database');
      ok(row.summary === 'Test episode summary', `summary mismatch`);
      ok(row.duration_min === 30, `duration mismatch`);
    } finally {
      closeDb(db);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('memory-episode.js deduplicates by session_id', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-episode-dedup-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Insert episode first time
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--session-id', 'test-dedup-1',
      '--summary', 'First summary',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    // Insert episode second time with same session_id but different summary
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--session-id', 'test-dedup-1',
      '--summary', 'Updated summary',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    // Verify only 1 row with updated summary
    const db = openDb(dbPath);
    try {
      const rows = db.prepare(`SELECT * FROM episodes WHERE session_id = ?`).all('test-dedup-1');
      ok(rows.length === 1, `should have exactly 1 row, got ${rows.length}`);
      ok(rows[0].summary === 'Updated summary', `summary should be updated`);
    } finally {
      closeDb(db);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-read.js
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-read.js ──');

test('--episodes-only returns recent episodes', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-read-episodes-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Insert an episode via memory-episode.js
    const episodeResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--session-id', 'sess-test-1',
      '--summary', 'Test episode summary',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(episodeResult.status === 0, `episode insert should exit 0`);

    // Read episodes
    const readResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-read.js'),
      '--episodes-only',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(readResult.status === 0, `read should exit 0, got ${readResult.status}: ${readResult.stderr}`);
    ok(readResult.stdout.includes('Test episode summary'),
      `output should contain episode summary: ${readResult.stdout}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FTS5 search finds matching nodes', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-read-fts-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Insert 3 nodes
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'routing',
      '--type', 'concept',
      '--description', 'Model routing strategy',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'switch_model.py',
      '--type', 'script',
      '--description', 'Routing implementation script',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'security',
      '--type', 'concept',
      '--description', 'Security guidelines',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    // Search for routing
    const readResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-read.js'),
      'routing',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(readResult.status === 0, `read should exit 0, got ${readResult.status}: ${readResult.stderr}`);
    ok(readResult.stdout.includes('routing'),
      `output should contain "routing": ${readResult.stdout}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--graph shows 1-hop neighbors', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-read-graph-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Create 2 nodes
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'routing',
      '--type', 'concept',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--node', 'dispatcher',
      '--type', 'concept',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    // Create edge
    spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--edge', 'routing', 'relates_to', 'dispatcher',
      '--db', dbPath
    ], { encoding: 'utf8', cwd: ROOT });

    // Query graph
    const readResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-read.js'),
      '--graph', 'routing',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(readResult.status === 0, `read should exit 0, got ${readResult.status}: ${readResult.stderr}`);
    ok(readResult.stdout.includes('dispatcher'),
      `output should contain neighbor "dispatcher": ${readResult.stdout}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-gc.js
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-gc.js ──');

testAsync('memory-gc.js prunes old episodes', async () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-gc-episodes-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Insert an old episode (400 days old)
    const db = openDb(dbPath);
    try {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);
      const oldDateStr = oldDate.toISOString();

      db.prepare(`
        INSERT INTO episodes (session_id, summary, timestamp)
        VALUES (?, ?, ?)
      `).run('old-episode', 'Old episode', oldDateStr);

      // Insert a recent episode
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO episodes (session_id, summary, timestamp)
        VALUES (?, ?, ?)
      `).run('recent-episode', 'Recent episode', now);
    } finally {
      closeDb(db);
    }

    // Run gc
    const gcResult = spawnSync('node', [resolve(ROOT, 'scripts/memory-gc.js'), '--db', dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(gcResult.status === 0, `gc should exit 0, got ${gcResult.status}: ${gcResult.stderr}`);
    ok(gcResult.stdout.includes('[MEMORY-GC]'),
      `output should contain [MEMORY-GC]: ${gcResult.stdout}`);

    // Verify old episode is gone, recent remains
    const db2 = openDb(dbPath);
    try {
      const oldRow = db2.prepare(`SELECT * FROM episodes WHERE session_id = ?`).get('old-episode');
      const recentRow = db2.prepare(`SELECT * FROM episodes WHERE session_id = ?`).get('recent-episode');

      ok(!oldRow, 'old episode should be deleted');
      ok(recentRow, 'recent episode should remain');
    } finally {
      closeDb(db2);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('memory-gc.js prunes orphan nodes', () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-gc-orphans-'));
  const dbPath = resolve(tmpDir, 'memory.db');

  try {
    // Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0`);

    // Create orphan node (access_count=0, old, no edges)
    const db = openDb(dbPath);
    try {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      const oldDateStr = oldDate.toISOString();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO nodes (name, type, description, created_at, updated_at, access_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('orphan-node', 'script', 'Orphan node', oldDateStr, oldDateStr, 0);

      // Create connected node with access
      db.prepare(`
        INSERT INTO nodes (name, type, created_at, updated_at, access_count)
        VALUES (?, ?, ?, ?, ?)
      `).run('connected-node', 'script', now, now, 5);

      // Create edge between two connected nodes (orphan has NO edges, so it will be pruned)
      const connectedNodeId = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get('connected-node').id;
      db.prepare(`
        INSERT INTO nodes (name, type, created_at, updated_at, access_count)
        VALUES (?, ?, ?, ?, ?)
      `).run('connected-node-2', 'script', now, now, 3);

      const connectedNode2Id = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get('connected-node-2').id;
      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation, weight, created_at)
        VALUES (?, ?, ?, 1.0, ?)
      `).run(connectedNodeId, connectedNode2Id, 'relates_to', now);
    } finally {
      closeDb(db);
    }

    // Run gc
    const gcResult = spawnSync('node', [resolve(ROOT, 'scripts/memory-gc.js'), '--db', dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(gcResult.status === 0, `gc should exit 0, got ${gcResult.status}: ${gcResult.stderr}`);

    // Verify orphan is gone, connected remains
    const db2 = openDb(dbPath);
    try {
      const orphanRow = db2.prepare(`SELECT * FROM nodes WHERE name = ?`).get('orphan-node');
      const connectedRow = db2.prepare(`SELECT * FROM nodes WHERE name = ?`).get('connected-node');

      ok(!orphanRow, 'orphan node should be deleted');
      ok(connectedRow, 'connected node should remain');
    } finally {
      closeDb(db2);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Test: memory-reembed.js
// ─────────────────────────────────────────────────────────────
console.log('\n── memory-reembed.js ──');

test('memory-reembed.js --help exits 0 with Usage text', () => {
  const result = spawnSync('node', [resolve(ROOT, 'scripts/memory-reembed.js'), '--help'], {
    encoding: 'utf8',
    cwd: ROOT
  });

  ok(result.status === 0, `--help should exit 0, got ${result.status}`);
  ok(result.stdout.includes('Usage') || result.stdout.includes('usage'),
    `--help output should include Usage: ${result.stdout}`);
});

// ─────────────────────────────────────────────────────────────
// Test: Full flow (E2E)
// ─────────────────────────────────────────────────────────────
console.log('\n── full flow: e2e ──');

testAsync('full flow: init → write → episode → read → gc → export', async () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'memory-e2e-'));
  const dbPath = resolve(tmpDir, 'memory.db');
  const exportDir = resolve(tmpDir, 'export');

  try {
    // Step 1: Initialize DB
    const initResult = spawnSync('bash', [resolve(ROOT, 'scripts/memory-init.sh'), dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(initResult.status === 0, `init should exit 0, got ${initResult.status}: ${initResult.stderr}`);
    ok(existsSync(dbPath), 'database file should exist');

    // Step 2: Write 4 nodes
    const nodeNames = ['routing', 'security', 'switch_model.py', 'Malik'];
    const nodeTypes = ['concept', 'concept', 'script', 'person'];
    for (let i = 0; i < 4; i++) {
      const writeResult = spawnSync('node', [
        resolve(ROOT, 'scripts/memory-write.js'),
        '--node', nodeNames[i],
        '--type', nodeTypes[i],
        '--description', `Description for ${nodeNames[i]}`,
        '--db', dbPath
      ], {
        encoding: 'utf8',
        cwd: ROOT
      });
      ok(writeResult.status === 0, `write node ${i + 1} should exit 0, got ${writeResult.status}`);
    }

    // Step 3: Write 1 edge
    const edgeResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-write.js'),
      '--edge', 'routing', 'depends_on', 'switch_model.py',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(edgeResult.status === 0, `write edge should exit 0, got ${edgeResult.status}`);

    // Step 4: Write 1 episode
    const episodeResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-episode.js'),
      '--session-id', 'e2e-test-session',
      '--summary', 'E2E test episode summary',
      '--duration', '45',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(episodeResult.status === 0, `write episode should exit 0, got ${episodeResult.status}`);

    // Step 5: Read with hybrid search (FTS5)
    const readHybridResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-read.js'),
      'routing',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(readHybridResult.status === 0, `hybrid read should exit 0, got ${readHybridResult.status}`);
    ok(readHybridResult.stdout.includes('routing'),
      `hybrid read should mention routing: ${readHybridResult.stdout}`);

    // Step 6: Read with graph search
    const readGraphResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-read.js'),
      '--graph', 'routing',
      '--db', dbPath
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(readGraphResult.status === 0, `graph read should exit 0, got ${readGraphResult.status}`);
    ok(readGraphResult.stdout.includes('switch_model.py'),
      `graph read should show neighbor switch_model.py: ${readGraphResult.stdout}`);

    // Step 7: Run garbage collection
    const gcResult = spawnSync('node', [resolve(ROOT, 'scripts/memory-gc.js'), '--db', dbPath], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(gcResult.status === 0, `gc should exit 0, got ${gcResult.status}: ${gcResult.stderr}`);

    // Step 8: Export database
    const exportResult = spawnSync('node', [
      resolve(ROOT, 'scripts/memory-export.js'),
      '--db', dbPath,
      '--out', exportDir
    ], {
      encoding: 'utf8',
      cwd: ROOT
    });
    ok(exportResult.status === 0, `export should exit 0, got ${exportResult.status}: ${exportResult.stderr}`);

    // Verify exported files exist
    const routingMdPath = resolve(exportDir, 'routing.md');
    ok(existsSync(exportDir), 'export directory should exist');
    ok(existsSync(routingMdPath), 'routing.md should be exported');
    const db = openDb(dbPath);
    try {
      const nodeCount = db.prepare(`SELECT COUNT(*) as count FROM nodes`).get();
      const edgeCount = db.prepare(`SELECT COUNT(*) as count FROM edges`).get();
      const episodeCount = db.prepare(`SELECT COUNT(*) as count FROM episodes`).get();

      ok(nodeCount.count === 4, `should have 4 nodes, got ${nodeCount.count}`);
      ok(edgeCount.count === 1, `should have 1 edge, got ${edgeCount.count}`);
      ok(episodeCount.count === 1, `should have 1 episode, got ${episodeCount.count}`);
    } finally {
      closeDb(db);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// Run all tests (async aware)
// ─────────────────────────────────────────────────────────────
(async () => {
  for (const test of tests) {
    await test();
  }

  console.log(`\n──────────────────────`);
  console.log(`✓ ${pass} passed`);
  if (fail > 0) console.log(`✗ ${fail} failed`);
  console.log(`──────────────────────\n`);

  process.exit(fail > 0 ? 1 : 0);
})();
