#!/usr/bin/env node
/**
 * scripts/memory-write.js — Node and edge write CLI for 3-level memory system
 *
 * Usage:
 *   memory-write.js --node "name" --type <type> [--description "..."] [--db <path>]
 *   memory-write.js --edge "source" "relation" "target" [--db <path>]
 *
 * Valid types: script, config, concept, skill, project, person
 * Valid relations: depends_on, relates_to, part_of, uses
 */

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

const VALID_TYPES = ['script', 'config', 'concept', 'skill', 'project', 'person'];
const VALID_RELATIONS = ['depends_on', 'relates_to', 'part_of', 'uses'];

function usage() {
  return `Usage: memory-write.js [OPTIONS]

Options:
  --help                                Show this help message
  --node <name> --type <type> [--description "..."]  Upsert a node
  --edge <source> <relation> <target>   Upsert an edge
  --db <path>                           Custom database path

Valid types: ${VALID_TYPES.join(', ')}
Valid relations: ${VALID_RELATIONS.join(', ')}

Examples:
  memory-write.js --node "mynode" --type script --description "My script"
  memory-write.js --edge "node-a" "depends_on" "node-b"
`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  let mode = null;
  let nodeName = null;
  let nodeType = null;
  let description = null;
  let edgeSource = null;
  let edgeRelation = null;
  let edgeTarget = null;
  let dbPath = DB_PATH;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--node') {
      mode = 'node';
      nodeName = args[i + 1];
      i += 1;
    } else if (args[i] === '--type') {
      nodeType = args[i + 1];
      i += 1;
    } else if (args[i] === '--description') {
      description = args[i + 1];
      i += 1;
    } else if (args[i] === '--edge') {
      mode = 'edge';
      edgeSource = args[i + 1];
      edgeRelation = args[i + 2];
      edgeTarget = args[i + 3];
      i += 3;
    } else if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    }
  }

  try {
    const db = openDb(dbPath);
    const now = new Date().toISOString();

    try {
      if (mode === 'node') {
        if (!nodeName || !nodeType) {
          console.error('Error: --node and --type are required');
          process.exit(1);
        }
        if (!VALID_TYPES.includes(nodeType)) {
          console.error(`Error: invalid type '${nodeType}', must be one of: ${VALID_TYPES.join(', ')}`);
          process.exit(1);
        }

        db.prepare(`
          INSERT INTO nodes (name, type, description, created_at, updated_at, access_count)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(name) DO UPDATE SET
            description = COALESCE(?, description),
            updated_at = ?,
            access_count = access_count + 1
        `).run(nodeName, nodeType, description ?? null, now, now, description ?? null, now);

        console.log(`✓ node "${nodeName}" upserted`);
      } else if (mode === 'edge') {
        if (!edgeSource || !edgeRelation || !edgeTarget) {
          console.error('Error: --edge requires <source> <relation> <target>');
          process.exit(1);
        }
        if (!VALID_RELATIONS.includes(edgeRelation)) {
          console.error(`Error: invalid relation '${edgeRelation}', must be one of: ${VALID_RELATIONS.join(', ')}`);
          process.exit(1);
        }

        // Verify both nodes exist and get their IDs
        const sourceNode = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get(edgeSource);
        const targetNode = db.prepare(`SELECT id FROM nodes WHERE name = ?`).get(edgeTarget);

        if (!sourceNode) {
          console.error(`Error: source node '${edgeSource}' not found`);
          process.exit(1);
        }
        if (!targetNode) {
          console.error(`Error: target node '${edgeTarget}' not found`);
          process.exit(1);
        }

        db.prepare(`
          INSERT INTO edges (source_id, target_id, relation, weight, created_at)
          VALUES (?, ?, ?, 1.0, ?)
          ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
            weight = weight + 1.0
        `).run(sourceNode.id, targetNode.id, edgeRelation, now);

        console.log(`✓ edge "${edgeSource}" --[${edgeRelation}]--> "${edgeTarget}" upserted`);
      } else {
        console.error('Error: must specify --node or --edge');
        process.exit(1);
      }
    } finally {
      closeDb(db);
    }

    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
