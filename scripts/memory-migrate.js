#!/usr/bin/env node
/**
 * scripts/memory-migrate.js — Import legacy .md files into SQLite
 *
 * Reads .md files from a directory, extracts YAML frontmatter (type, description),
 * and creates node records in the memory database.
 *
 * Usage:
 *   memory-migrate.js <md-dir> [--db <path>]
 *
 * Expects YAML frontmatter:
 *   ---
 *   type: concept|script|config|skill|project|person
 *   description: Optional description
 *   ---
 */

import { openDb, closeDb, DB_PATH } from './memory-lib.js';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, basename, extname } from 'path';

const VALID_TYPES = ['script', 'config', 'concept', 'skill', 'project', 'person'];

function usage() {
  return `Usage: memory-migrate.js <md-dir> [--db <path>]

Arguments:
  <md-dir>                 Directory containing markdown files to import

Options:
  --db <path>              Custom database path (default: .claude/memory.db)
  --help                   Show this help message

Example:
  memory-migrate.js ./docs --db ./memory.db
`;
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const data = {};

  // Simple YAML parsing (just key: value pairs)
  const lines = yaml.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      // Remove quotes if present
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

function findMarkdownFiles(dir) {
  const files = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        files.push(...findMarkdownFiles(fullPath));
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}: ${err.message}`);
  }

  return files;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(usage());
    process.exit(0);
  }

  let mdDir = null;
  let dbPath = DB_PATH;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') {
      dbPath = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('--')) {
      mdDir = args[i];
    }
  }

  if (!mdDir) {
    console.error('Error: <md-dir> argument required');
    process.exit(1);
  }

  try {
    const db = openDb(dbPath);
    let imported = 0;
    let skipped = 0;

    try {
      const files = findMarkdownFiles(mdDir);
      const now = new Date().toISOString();

      for (const filePath of files) {
        try {
          const content = readFileSync(filePath, 'utf8');
          const frontmatter = parseYamlFrontmatter(content);

          if (!frontmatter || !frontmatter.type) {
            skipped++;
            continue;
          }

          const type = frontmatter.type;
          if (!VALID_TYPES.includes(type)) {
            console.warn(`⚠ Skipping ${basename(filePath)}: invalid type '${type}'`);
            skipped++;
            continue;
          }

          // Extract node name from filename (without .md extension)
          const nodeName = basename(filePath, '.md');
          const description = frontmatter.description || null;

          // Upsert node
          db.prepare(`
            INSERT INTO nodes (name, type, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
              description = COALESCE(?, description),
              updated_at = ?
          `).run(nodeName, type, description, now, now, description, now);

          imported++;
          console.log(`✓ imported node "${nodeName}" (${type})`);
        } catch (err) {
          console.error(`✗ Error processing ${filePath}: ${err.message}`);
          skipped++;
        }
      }
    } finally {
      closeDb(db);
    }

    console.log(`\nImported ${imported} nodes, skipped ${skipped} files`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
