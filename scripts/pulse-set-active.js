#!/usr/bin/env node
// UserPromptSubmit hook — marque l'agent courant comme actif
import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_IDS = new Set(
  (await import('../src/pulse/identity.js')).buildKnownAgentIds(hostname())
);

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

for (const f of findPoulsMdFiles(ROOT)) {
  let p;
  try { p = parsePoulsMd(f); } catch { continue; }
  if (!p || !AGENT_IDS.has(p.agent?.id)) continue;

  // Monter vers high si déjà medium+, sinon medium
  const next = (p.intensity?.current ?? 0) >= 0.6 ? 'high' : 'medium';
  writePoulsMd(f, { ...p, status: next, lastPulse: new Date().toISOString() }, p._body);
  // Silencieux — pas de stdout pour ne pas polluer le hook
  break;
}
