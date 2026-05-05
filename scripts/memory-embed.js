#!/usr/bin/env node
/**
 * scripts/memory-embed.js — Embedding CLI for 3-level memory system
 *
 * Usage:
 *   memory-embed.js --help
 *   memory-embed.js "texte à embedder"
 *   memory-embed.js --store episode <id> "texte"
 *   memory-embed.js --store node <name> "texte"
 *
 * Output (embed): JSON { dimensions, model, vector }
 * Exit codes:
 *   0 = success
 *   1 = error (include stderr)
 *   2 = ollama unavailable
 */

import { openDb, closeDb, embed, float32ToBuffer } from './memory-lib.js';
import { DB_PATH } from './memory-lib.js';

const MODEL = 'nomic-embed-text:v1.5';

function usage() {
  return `Usage: memory-embed.js [OPTIONS] [TEXT]

Options:
  --help                          Show this help message
  --store <episode|node> <id> <text>  Embed and store in database
  --db <path>                     Custom database path

Examples:
  memory-embed.js "hello world"
  memory-embed.js --store node mynode "documentation text"
  memory-embed.js --store episode sess123 "session summary"
`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  // Parse arguments
  let storeType = null;
  let storeId = null;
  let text = null;
  let dbPath = DB_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--store') {
      storeType = args[i + 1];
      storeId = args[i + 2];
      text = args[i + 3];
      i += 3;
    } else if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (!text && !args[i].startsWith('--')) {
      text = args[i];
    }
  }

  if (!text) {
    console.error('Error: TEXT required');
    process.exit(1);
  }

  try {
    const vector = await embed(text);
    if (!vector) {
      console.error('Error: Ollama unavailable or embed failed');
      process.exit(2);
    }

    const dimensions = vector.length;
    const output = {
      dimensions,
      model: MODEL,
      vector: Array.from(vector)
    };

    if (storeType && storeId) {
      // Validate storeType
      if (!['episode', 'node'].includes(storeType)) {
        console.error(`Error: storeType must be 'episode' or 'node', got '${storeType}'`);
        process.exit(1);
      }

      // Open DB and store
      const db = openDb(dbPath);
      try {
        const vectorBuffer = float32ToBuffer(vector);
        const now = new Date().toISOString();

        // For episodes, look up by session_id; for nodes, look up by name
        let refId = null;
        if (storeType === 'episode') {
          const row = db.prepare(`SELECT id FROM episodes WHERE session_id = ?`).get(storeId);
          refId = row ? row.id : null;
        } else if (storeType === 'node') {
          const row = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get(storeId);
          refId = row ? row.id : null;
        }

        if (!refId) {
          console.error(`Error: ${storeType} '${storeId}' not found in database`);
          process.exit(1);
        }

        db.prepare(`
          INSERT INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_type, ref_id, model) DO UPDATE SET
            vector = ?,
            created_at = ?
        `).run(storeType, refId, MODEL, dimensions, vectorBuffer, now, vectorBuffer, now);
      } finally {
        closeDb(db);
      }
    }

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
