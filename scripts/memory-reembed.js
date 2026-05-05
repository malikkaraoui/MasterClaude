#!/usr/bin/env node
/**
 * scripts/memory-reembed.js — Re-embed all nodes and episodes
 *
 * Usage:
 *   memory-reembed.js [OPTIONS]
 *
 * Options:
 *   --help                   Show this help message
 *   --db <path>              Custom database path (default: .claude/memory.db)
 *   --model <name>           Model name (default: nomic-embed-text:v1.5)
 *
 * Process:
 *   1. Check ollama available: POST "test" to embed endpoint
 *   2. Re-embed all nodes (text = "name: description")
 *   3. Re-embed all episodes (text = summary)
 *   4. INSERT OR REPLACE into embeddings table
 *
 * Output: [MEMORY-REEMBED] N embedding(s) generated, M error(s). Model: ...
 */

import { openDb, closeDb, DB_PATH, embed } from './memory-lib.js';

function usage() {
  return `Usage: memory-reembed.js [OPTIONS]

Options:
  --help                   Show this help message
  --db <path>              Custom database path (default: .claude/memory.db)
  --model <name>           Model name (default: nomic-embed-text:v1.5)

Process:
  1. Checks if Ollama is available
  2. Re-embeds all nodes (text = "name: description")
  3. Re-embeds all episodes (text = summary)
  4. Stores embeddings in database

Output: [MEMORY-REEMBED] N embedding(s) generated, M error(s). Model: ...

Examples:
  memory-reembed.js
  memory-reembed.js --db /path/to/memory.db --model nomic-embed-text:v1.5
`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  let dbPath = DB_PATH;
  let model = 'nomic-embed-text:v1.5';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--model') {
      model = args[i + 1];
      i += 1;
    }
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // Check if Ollama is available by embedding a test string
    // ─────────────────────────────────────────────────────────────
    const testEmbed = await embed('test', 5000);
    if (!testEmbed) {
      console.error('Error: Ollama is not available or embed endpoint failed');
      process.exit(2);
    }

    const db = openDb(dbPath);
    let totalEmbeddings = 0;
    let errors = 0;

    try {
      // ─────────────────────────────────────────────────────────────
      // Re-embed all nodes
      // ─────────────────────────────────────────────────────────────
      const nodes = db.prepare(`
        SELECT id, name, description FROM nodes
      `).all();

      for (const node of nodes) {
        try {
          const text = `${node.name}: ${node.description || ''}`;
          const embedding = await embed(text, 5000);

          if (!embedding) {
            errors++;
            continue;
          }

          // Convert Float32Array to Buffer (already done in memory-lib)
          const { float32ToBuffer } = await import('./memory-lib.js');
          const vectorBuffer = float32ToBuffer(embedding);

          // INSERT OR REPLACE
          db.prepare(`
            INSERT OR REPLACE INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run('node', node.id, model, embedding.length, vectorBuffer, new Date().toISOString());

          totalEmbeddings++;
        } catch (err) {
          errors++;
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Re-embed all episodes
      // ─────────────────────────────────────────────────────────────
      const episodes = db.prepare(`
        SELECT id, summary FROM episodes
      `).all();

      for (const episode of episodes) {
        try {
          const text = episode.summary || '';
          const embedding = await embed(text, 5000);

          if (!embedding) {
            errors++;
            continue;
          }

          // Convert Float32Array to Buffer
          const { float32ToBuffer } = await import('./memory-lib.js');
          const vectorBuffer = float32ToBuffer(embedding);

          // INSERT OR REPLACE
          db.prepare(`
            INSERT OR REPLACE INTO embeddings (ref_type, ref_id, model, dimensions, vector, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run('episode', episode.id, model, embedding.length, vectorBuffer, new Date().toISOString());

          totalEmbeddings++;
        } catch (err) {
          errors++;
        }
      }

      // Output summary
      console.log(`[MEMORY-REEMBED] ${totalEmbeddings} embedding(s) generated, ${errors} error(s). Model: ${model}`);

      process.exit(0);
    } finally {
      closeDb(db);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
