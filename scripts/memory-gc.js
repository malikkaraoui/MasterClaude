#!/usr/bin/env node
/**
 * scripts/memory-gc.js — Garbage collection + retention for 3-level memory system
 *
 * Usage:
 *   memory-gc.js [OPTIONS]
 *
 * Options:
 *   --help                   Show this help message
 *   --db <path>              Custom database path
 *   --dry-run                Report counts only, don't delete
 *
 * Retention rules:
 *   1. Delete episodes > 365 days old (delete associated embeddings first)
 *   2. Delete orphan nodes: access_count=0 AND updated_at > 90 days ago AND no edges
 *   3. Max 500 nodes: prune least accessed if over limit
 *
 * Output: [MEMORY-GC] X episode(s), Y node(s), Z embedding(s) deleted
 */

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

function usage() {
  return `Usage: memory-gc.js [OPTIONS]

Options:
  --help                   Show this help message
  --db <path>              Custom database path
  --dry-run                Report counts only, don't delete

Retention rules:
  - Episodes: delete if timestamp > 365 days ago
  - Orphan nodes: delete if access_count=0 AND updated_at > 90 days ago AND no edges
  - Node cap: max 500 nodes; prune least accessed if over

Output: [MEMORY-GC] X episode(s), Y node(s), Z embedding(s) deleted
`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  let dbPath = DB_PATH;
  let dryRun = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  try {
    const db = openDb(dbPath);
    let deletedEpisodes = 0;
    let deletedNodes = 0;
    let deletedEmbeddings = 0;

    try {
      // ─────────────────────────────────────────────────────────────
      // Rule 1: Delete episodes > 365 days old
      // ─────────────────────────────────────────────────────────────
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 365);
      const cutoffDateStr = cutoffDate.toISOString();

      // Find old episodes
      const oldEpisodes = db.prepare(`
        SELECT id FROM episodes WHERE timestamp < ?
      `).all(cutoffDateStr);

      if (oldEpisodes.length > 0 && !dryRun) {
        // Delete embeddings for old episodes
        for (const ep of oldEpisodes) {
          const embeddingRows = db.prepare(`
            SELECT id FROM embeddings WHERE ref_type = 'episode' AND ref_id = ?
          `).all(ep.id);
          deletedEmbeddings += embeddingRows.length;
        }

        // Delete old episodes
        db.prepare(`
          DELETE FROM episodes WHERE timestamp < ?
        `).run(cutoffDateStr);
      }
      deletedEpisodes = oldEpisodes.length;

      // ─────────────────────────────────────────────────────────────
      // Rule 2: Delete orphan nodes
      // ─────────────────────────────────────────────────────────────
      const orphanCutoffDate = new Date();
      orphanCutoffDate.setDate(orphanCutoffDate.getDate() - 90);
      const orphanCutoffStr = orphanCutoffDate.toISOString();

      // Find orphan nodes: access_count=0, old, no incoming/outgoing edges
      const orphanNodes = db.prepare(`
        SELECT n.id FROM nodes n
        WHERE n.access_count = 0
          AND n.updated_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM edges e
            WHERE e.source_id = n.id OR e.target_id = n.id
          )
      `).all(orphanCutoffStr);

      if (orphanNodes.length > 0 && !dryRun) {
        // Delete embeddings for orphan nodes first
        for (const node of orphanNodes) {
          const embeddingRows = db.prepare(`
            SELECT id FROM embeddings WHERE ref_type = 'node' AND ref_id = ?
          `).all(node.id);
          deletedEmbeddings += embeddingRows.length;
        }

        // Delete orphan nodes
        const placeholders = orphanNodes.map(() => '?').join(',');
        const nodeIds = orphanNodes.map(n => n.id);
        db.prepare(`
          DELETE FROM nodes WHERE id IN (${placeholders})
        `).run(...nodeIds);
      }
      deletedNodes = orphanNodes.length;

      // ─────────────────────────────────────────────────────────────
      // Rule 3: Prune least accessed if over 500 nodes
      // ─────────────────────────────────────────────────────────────
      const nodeCount = db.prepare(`SELECT COUNT(*) as count FROM nodes`).get();
      const maxNodes = 500;

      if (nodeCount.count > maxNodes) {
        const excessCount = nodeCount.count - maxNodes;

        // Find least accessed nodes to delete
        const leastAccessedNodes = db.prepare(`
          SELECT id FROM nodes
          ORDER BY access_count ASC, updated_at ASC
          LIMIT ?
        `).all(excessCount);

        if (leastAccessedNodes.length > 0 && !dryRun) {
          // Delete embeddings for these nodes first
          for (const node of leastAccessedNodes) {
            const embeddingRows = db.prepare(`
              SELECT id FROM embeddings WHERE ref_type = 'node' AND ref_id = ?
            `).all(node.id);
            deletedEmbeddings += embeddingRows.length;
          }

          // Delete edges referencing these nodes
          const placeholders = leastAccessedNodes.map(() => '?').join(',');
          const nodeIds = leastAccessedNodes.map(n => n.id);

          db.prepare(`
            DELETE FROM edges WHERE source_id IN (${placeholders})
          `).run(...nodeIds);

          db.prepare(`
            DELETE FROM edges WHERE target_id IN (${placeholders})
          `).run(...nodeIds);

          // Delete the nodes
          db.prepare(`
            DELETE FROM nodes WHERE id IN (${placeholders})
          `).run(...nodeIds);
        }
        deletedNodes += leastAccessedNodes.length;
      }

      // Output summary
      console.log(`[MEMORY-GC] ${deletedEpisodes} episode(s), ${deletedNodes} node(s), ${deletedEmbeddings} embedding(s) ${dryRun ? 'would be deleted' : 'deleted'}`);

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
