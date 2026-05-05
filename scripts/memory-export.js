#!/usr/bin/env node
/**
 * scripts/memory-export.js — Export SQLite memory database back to .md files
 *
 * Reads nodes from the memory database and creates markdown files with YAML frontmatter.
 *
 * Usage:
 *   memory-export.js <out-dir> [--db <path>]
 *
 * Generated markdown format:
 *   ---
 *   type: <node-type>
 *   description: <optional-description>
 *   ---
 *
 *   # <Node Name>
 *
 *   Auto-generated from memory database.
 */

import { openDb, closeDb, DB_PATH } from './memory-lib.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

function usage() {
  return `Usage: memory-export.js <out-dir> [--db <path>]
    or: memory-export.js --out <out-dir> [--db <path>]

Arguments:
  <out-dir>                Directory to write markdown files to

Options:
  --out <path>             Output directory (named option alternative)
  --db <path>              Custom database path (default: .claude/memory.db)
  --help                   Show this help message

Example:
  memory-export.js ./docs --db ./memory.db
  memory-export.js --out ./docs --db ./memory.db
`;
}

function escapeYamlValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains special chars, quote it
  if (str.includes(':') || str.includes('#') || str.includes('|')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

function generateMarkdown(node) {
  const lines = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`type: ${node.type}`);
  if (node.description) {
    lines.push(`description: ${escapeYamlValue(node.description)}`);
  }
  lines.push('---');
  lines.push('');

  // Title (capitalize first letter of node name)
  const title = node.name.charAt(0).toUpperCase() + node.name.slice(1);
  lines.push(`# ${title}`);
  lines.push('');

  // Body
  if (node.description) {
    lines.push(node.description);
  } else {
    lines.push('Auto-generated from memory database.');
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  let outDir = null;
  let dbPath = DB_PATH;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--out') {
      outDir = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('--')) {
      outDir = args[i];
    }
  }

  if (!outDir) {
    console.error('Error: <out-dir> argument required');
    process.exit(1);
  }

  try {
    // Create output directory if needed
    mkdirSync(outDir, { recursive: true });

    const db = openDb(dbPath);
    let exported = 0;

    try {
      // Get all nodes
      const nodes = db.prepare(`SELECT * FROM nodes ORDER BY name`).all();

      for (const node of nodes) {
        try {
          const markdown = generateMarkdown(node);
          const filePath = resolve(outDir, `${node.name}.md`);

          writeFileSync(filePath, markdown, 'utf8');
          console.log(`✓ exported "${node.name}" → ${filePath}`);
          exported++;
        } catch (err) {
          console.error(`✗ Error exporting node "${node.name}": ${err.message}`);
        }
      }
    } finally {
      closeDb(db);
    }

    console.log(`\nExported ${exported} nodes to ${outDir}`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
