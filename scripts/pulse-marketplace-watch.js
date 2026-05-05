#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildKnownAgentIds } from '../src/pulse/identity.js';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { runMarketplaceWatchLoop } from '../src/pulse/marketplace.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'pouls.md') results.push(full);
    else if (entry.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

function readCurrentPulse(root, rawHostname) {
  const knownIds = new Set(buildKnownAgentIds(rawHostname));
  for (const filePath of findPoulsMdFiles(root)) {
    try {
      const parsed = parsePoulsMd(filePath);
      if (parsed && knownIds.has(parsed.agent?.id)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return {};
}

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

const root = parseArg('--root') || ROOT;
const rawHostname = parseArg('--raw-hostname') || hostname();

runMarketplaceWatchLoop({
  root,
  currentPulseProvider: () => readCurrentPulse(root, rawHostname),
  stderr: process.stderr,
});