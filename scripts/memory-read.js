#!/usr/bin/env node
/**
 * scripts/memory-read.js — Search interface for 3-level memory system
 *
 * Usage:
 *   memory-read.js --episodes-only [--project <name>] [--db <path>]
 *   memory-read.js --episodes <n> [--db <path>]
 *   memory-read.js --graph <nodename> [--db <path>]
 *   memory-read.js --context [--db <path>]
 *   memory-read.js <query> [--db <path>] [--timeout <ms>] [--project <name>]
 *
 * Modes:
 * 1. --episodes-only: 5 most recent episodes (optionally filtered by --project)
 * 2. --episodes <n>: n most recent episodes
 * 3. --graph "nodename": show 1-hop neighbors (both directions), increment access_count
 * 4. --context: hook mode: recent episodes + FTS5 nodes matching $HOOK_PROMPT env var
 * 5. "query" (default): full hybrid search
 */

import { openDb, closeDb, DB_PATH, detectMode, embed, cosineSimilarity, bufferToFloat32 } from './memory-lib.js';
import { existsSync } from 'fs';

const DEFAULT_TIMEOUT_MS = 5000;

function usage() {
  return `Usage: memory-read.js [QUERY|MODE] [OPTIONS]

Modes:
  --episodes-only              5 most recent episodes (default)
  --episodes <n>               n most recent episodes
  --graph <nodename>           Show 1-hop neighbors
  --context                    Hook mode: recent episodes + FTS5 nodes

Default (query):
  memory-read.js "routing"     Full hybrid search

Options:
  --db <path>                  Custom database path
  --timeout <ms>               Timeout for embeddings (default 5000)
  --project <name>             Filter by project

Examples:
  memory-read.js --episodes-only
  memory-read.js --episodes 10
  memory-read.js --graph "routing"
  memory-read.js "model routing" --timeout 3000
`;
}

function formatOutput(runtimeMode, query, results) {
  let output = `[MEMORY] Mode: ${runtimeMode}`;
  if (query) output += ` | Query: "${query}"`;
  output += '\n';

  if (results.concepts && results.concepts.length > 0) {
    output += `  ${results.concepts.length} concept(s): ${results.concepts.map(c => c.name).join(', ')}\n`;
  }

  if (results.neighbors && results.neighbors.length > 0) {
    output += `  Voisins: ${results.neighbors.map(n => n.name).join(', ')}\n`;
  }

  if (results.episodes && results.episodes.length > 0) {
    output += `  ${results.episodes.length} episode(s):\n`;
    results.episodes.forEach(ep => {
      const date = ep.timestamp ? ep.timestamp.split('T')[0] : 'N/A';
      const summary = ep.summary ? ep.summary.substring(0, 50) : '';
      output += `    ${date} — ${summary}...\n`;
    });
  }

  return output;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  // Parse arguments
  let mode = 'FULL';
  let query = null;
  let episodesCount = 5;
  let graphNode = null;
  let dbPath = DB_PATH;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let projectFilter = null;
  let contextMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--episodes-only') {
      mode = 'EPISODES_ONLY';
    } else if (args[i] === '--episodes') {
      mode = 'EPISODES';
      episodesCount = parseInt(args[i + 1], 10);
      i += 1;
    } else if (args[i] === '--graph') {
      mode = 'GRAPH';
      graphNode = args[i + 1];
      i += 1;
    } else if (args[i] === '--context') {
      mode = 'CONTEXT';
      contextMode = true;
    } else if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--timeout') {
      timeoutMs = parseInt(args[i + 1], 10);
      i += 1;
    } else if (args[i] === '--project') {
      projectFilter = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('--')) {
      // Positional argument = query
      query = args[i];
      mode = 'FULL';
    }
  }

  // Detect runtime mode (FULL/LEXICAL/MINIMAL)
  const runtimeMode = await detectMode(dbPath);

  if (runtimeMode === 'MINIMAL') {
    console.log('[MEMORY] Mode: MINIMAL — pas de base.');
    process.exit(0);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let db;
  try {
    db = openDb(dbPath);
  } catch {
    console.log('[MEMORY] Mode: MINIMAL — base corrompue.');
    process.exit(0);
  }

  try {
    try {
      const results = {
        concepts: [],
        neighbors: [],
        episodes: []
      };

      if (mode === 'EPISODES_ONLY' || mode === 'EPISODES') {
        // Mode 1 & 2: Recent episodes
        const limit = mode === 'EPISODES_ONLY' ? 5 : episodesCount;
        let sql = `SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?`;
        const params = [limit];

        if (projectFilter) {
          sql = `SELECT * FROM episodes WHERE project = ? ORDER BY timestamp DESC LIMIT ?`;
          params.unshift(projectFilter);
        }

        results.episodes = db.prepare(sql).all(...params);
        console.log(formatOutput(runtimeMode, null, results));

      } else if (mode === 'GRAPH') {
        // Mode 3: Show 1-hop neighbors
        if (!graphNode) {
          console.error('Error: --graph requires a nodename');
          process.exit(1);
        }

        // Check if node exists
        const node = db.prepare(`SELECT * FROM nodes WHERE name = ?`).get(graphNode);
        if (!node) {
          console.log(`[MEMORY] Mode: ${runtimeMode} | Node: "${graphNode}" not found`);
          process.exit(0);
        }

        // Increment access_count
        db.prepare(`UPDATE nodes SET access_count = access_count + 1 WHERE name = ?`).run(graphNode);

        // Get 1-hop neighbors (both directions)
        const outgoing = db.prepare(`
          SELECT n.name, n.type
          FROM edges e
          JOIN nodes n ON e.target_id = n.id
          WHERE e.source_id = ?
        `).all(node.id);

        const incoming = db.prepare(`
          SELECT n.name, n.type
          FROM edges e
          JOIN nodes n ON e.source_id = n.id
          WHERE e.target_id = ?
        `).all(node.id);

        results.neighbors = [...outgoing, ...incoming];
        console.log(formatOutput(runtimeMode, graphNode, results));

      } else if (mode === 'CONTEXT') {
        // Mode 4: Hook mode
        const hookPrompt = process.env.HOOK_PROMPT || '';

        // Recent episodes
        results.episodes = db.prepare(`
          SELECT * FROM episodes ORDER BY timestamp DESC LIMIT 5
        `).all();

        if (hookPrompt) {
          const keywords = hookPrompt
            .split(/\s+/)
            .filter(w => w.length >= 3)
            .slice(0, 5);

          // FTS5 search on nodes
          let ftsResults = [];
          if (keywords.length > 0) {
            const ftsQuery = keywords.join(' OR ');
            try {
              ftsResults = db.prepare(`
                SELECT DISTINCT n.* FROM nodes n
                JOIN nodes_fts fts ON n.rowid = fts.rowid
                WHERE nodes_fts MATCH ?
                LIMIT 20
              `).all(ftsQuery);
            } catch {
              // FTS syntax error — skip
            }
          }

          // Vector search (mode FULL only)
          let vecResults = [];
          if (runtimeMode === 'FULL') {
            const queryVec = await embed(hookPrompt, Math.min(timeoutMs, 3000));
            if (queryVec) {
              const allEmbeddings = db.prepare(`
                SELECT n.id, n.name, n.type, e.vector FROM nodes n
                LEFT JOIN embeddings e ON n.id = e.ref_id AND e.ref_type = 'node'
                WHERE e.vector IS NOT NULL
              `).all();

              vecResults = allEmbeddings.map(row => ({
                ...row,
                similarity: cosineSimilarity(queryVec, bufferToFloat32(row.vector)),
              })).sort((a, b) => b.similarity - a.similarity).slice(0, 20);
            }
          }

          // RRF fusion
          const rrfMap = new Map();
          ftsResults.forEach((node, rank) => {
            rrfMap.set(node.name, { ...node, rrf: 1 / (60 + rank) });
          });
          vecResults.forEach((node, rank) => {
            const prev = rrfMap.get(node.name) || { ...node, rrf: 0 };
            prev.rrf += 1 / (60 + rank);
            rrfMap.set(node.name, prev);
          });

          results.concepts = Array.from(rrfMap.values())
            .sort((a, b) => b.rrf - a.rrf)
            .slice(0, 10);
        }

        console.log(formatOutput(runtimeMode, hookPrompt, results));

      } else if (mode === 'FULL' && query) {
        // Mode 5: Full hybrid search
        // Extract keywords (min 3 chars)
        const keywords = query
          .split(/\s+/)
          .filter(w => w.length >= 3)
          .map(w => w.replace(/[^\w]/g, ''));

        // FTS5 lexical search
        let lexResults = [];
        if (keywords.length > 0) {
          const ftsQuery = keywords.join(' OR ');
          try {
            lexResults = db.prepare(`
              SELECT DISTINCT n.* FROM nodes n
              JOIN nodes_fts fts ON n.rowid = fts.rowid
              WHERE nodes_fts MATCH ?
              LIMIT 20
            `).all(ftsQuery);
          } catch {
            // FTS syntax error on hostile input — skip
          }
        }

        // Vector search (mode FULL only)
        let vecResults = [];
        if (runtimeMode === 'FULL' && timeoutController.signal.aborted === false) {
          const embedding = await embed(query, timeoutMs);
          if (embedding) {
            const allEmbeddings = db.prepare(`
              SELECT n.id, n.name, n.type, e.vector FROM nodes n
              LEFT JOIN embeddings e ON n.id = e.ref_id AND e.ref_type = 'node'
              WHERE e.vector IS NOT NULL
            `).all();

            const scores = allEmbeddings.map(row => {
              const vec = bufferToFloat32(row.vector);
              const similarity = cosineSimilarity(embedding, vec);
              return { ...row, similarity };
            }).sort((a, b) => b.similarity - a.similarity).slice(0, 20);

            vecResults = scores.map(s => ({
              id: s.id,
              name: s.name,
              type: s.type,
              similarity: s.similarity
            }));
          }
        }

        // RRF fusion
        const rrfMap = new Map();
        lexResults.forEach((node, rank) => {
          const score = 1 / (60 + rank);
          if (!rrfMap.has(node.name)) {
            rrfMap.set(node.name, { ...node, rrf: 0 });
          }
          rrfMap.get(node.name).rrf += score;
        });

        vecResults.forEach((node, rank) => {
          const score = 1 / (60 + rank);
          if (!rrfMap.has(node.name)) {
            rrfMap.set(node.name, { ...node, rrf: 0 });
          }
          rrfMap.get(node.name).rrf += score;
        });

        results.concepts = Array.from(rrfMap.values())
          .sort((a, b) => b.rrf - a.rrf)
          .slice(0, 10);

        // Graph expansion: 1-hop of top 5
        const top5 = results.concepts.slice(0, 5);
        const neighborSet = new Set();
        top5.forEach(concept => {
          const outgoing = db.prepare(`
            SELECT n.name FROM edges e
            JOIN nodes n ON e.target_id = n.id
            WHERE e.source_id = ?
          `).all(concept.id);

          const incoming = db.prepare(`
            SELECT n.name FROM edges e
            JOIN nodes n ON e.source_id = n.id
            WHERE e.target_id = ?
          `).all(concept.id);

          [...outgoing, ...incoming].forEach(n => neighborSet.add(n.name));
        });
        results.neighbors = Array.from(neighborSet).slice(0, 10).map(name => ({
          name,
          type: 'neighbor'
        }));

        // Episode FTS5 search
        if (keywords.length > 0) {
          const ftsQuery = keywords.join(' OR ');
          try {
            results.episodes = db.prepare(`
              SELECT DISTINCT e.* FROM episodes e
              JOIN episodes_fts fts ON e.rowid = fts.rowid
              WHERE episodes_fts MATCH ?
              ORDER BY e.timestamp DESC
              LIMIT 5
            `).all(ftsQuery);
          } catch {
            // FTS syntax error — skip
          }
        }

        console.log(formatOutput(runtimeMode, query, results));
      } else {
        console.log(formatOutput(runtimeMode, null, { concepts: [], neighbors: [], episodes: [] }));
      }

    } finally {
      closeDb(db);
    }

    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
