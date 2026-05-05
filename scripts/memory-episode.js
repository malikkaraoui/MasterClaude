#!/usr/bin/env node
/**
 * scripts/memory-episode.js — Episode write CLI for 3-level memory system
 *
 * Usage:
 *   memory-episode.js --session-id <id> --summary "..." [OPTIONS]
 *
 * Options:
 *   --help                   Show this help message
 *   --session-id <id>        Unique session identifier (required)
 *   --summary <text>         Episode summary (required)
 *   --topics <json>          Optional JSON array of topics
 *   --files <json>           Optional JSON array of file paths
 *   --model <id>             Optional model identifier
 *   --project <name>         Optional project name
 *   --duration <min>         Optional duration in minutes (number)
 *   --db <path>              Custom database path
 *
 * Deduplication: if session_id exists, UPDATE; else INSERT
 */

import { openDb, closeDb, DB_PATH } from './memory-lib.js';

function usage() {
  return `Usage: memory-episode.js [OPTIONS]

Required:
  --session-id <id>        Unique session identifier
  --summary <text>         Episode summary

Optional:
  --topics <json>          JSON array of topics (e.g. '["topic1","topic2"]')
  --files <json>           JSON array of file paths
  --model <id>             Model identifier (e.g. 'haiku-4.5')
  --project <name>         Project name
  --duration <min>         Duration in minutes (integer)
  --db <path>              Custom database path
  --help                   Show this help message

Examples:
  memory-episode.js --session-id sess1 --summary "Implemented feature X"
  memory-episode.js --session-id sess2 --summary "Bug fix" --duration 45 --topics '["bug","fix"]'
`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  let sessionId = null;
  let summary = null;
  let topics = null;
  let files = null;
  let model = null;
  let project = null;
  let duration = null;
  let dbPath = DB_PATH;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session-id') {
      sessionId = args[i + 1];
      i += 1;
    } else if (args[i] === '--summary') {
      summary = args[i + 1];
      i += 1;
    } else if (args[i] === '--topics') {
      try {
        topics = JSON.stringify(JSON.parse(args[i + 1]));
      } catch {
        console.error(`Error: invalid JSON for --topics: ${args[i + 1]}`);
        process.exit(1);
      }
      i += 1;
    } else if (args[i] === '--files') {
      try {
        files = JSON.stringify(JSON.parse(args[i + 1]));
      } catch {
        console.error(`Error: invalid JSON for --files: ${args[i + 1]}`);
        process.exit(1);
      }
      i += 1;
    } else if (args[i] === '--model') {
      model = args[i + 1];
      i += 1;
    } else if (args[i] === '--project') {
      project = args[i + 1];
      i += 1;
    } else if (args[i] === '--duration') {
      duration = parseInt(args[i + 1], 10);
      if (isNaN(duration)) {
        console.error(`Error: --duration must be a number, got '${args[i + 1]}'`);
        process.exit(1);
      }
      i += 1;
    } else if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    }
  }

  // Validate required fields
  if (!sessionId || !summary) {
    console.error('Error: --session-id and --summary are required');
    process.exit(1);
  }

  try {
    const db = openDb(dbPath);
    const now = new Date().toISOString();

    try {
      // Check if episode exists
      const existing = db.prepare(`SELECT * FROM episodes WHERE session_id = ?`).get(sessionId);

      if (existing) {
        // UPDATE
        db.prepare(`
          UPDATE episodes
          SET summary = ?, topics = ?, files_touched = ?, model_used = ?, project = ?, duration_min = ?, timestamp = ?
          WHERE session_id = ?
        `).run(summary, topics, files, model, project, duration, now, sessionId);

        console.log(`✓ episode "${sessionId}" updated`);
      } else {
        // INSERT
        db.prepare(`
          INSERT INTO episodes (session_id, summary, topics, files_touched, model_used, project, duration_min, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, summary, topics, files, model, project, duration, now);

        console.log(`✓ episode "${sessionId}" inserted`);
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
