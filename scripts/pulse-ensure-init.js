#!/usr/bin/env node
// SessionStart hook — crée pouls.md pour l'agent courant si absent
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { readdirSync } from 'node:fs';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { buildAgentId, buildAgentName, buildKnownAgentIds } from '../src/pulse/identity.js';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_HOSTNAME = hostname();
const AGENT_ID = buildAgentId(RAW_HOSTNAME);
const AGENT_IDS = new Set(buildKnownAgentIds(RAW_HOSTNAME));

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

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const m = readFileSync(claudeMd, 'utf8').match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

// Vérifie si un pouls.md existe déjà pour cet agent
const existing = findPoulsMdFiles(ROOT).find(f => {
  try { const p = parsePoulsMd(f); return p && AGENT_IDS.has(p.agent?.id); }
  catch { return false; }
});

if (existing) process.exit(0); // Déjà initialisé

const phase = readPhase(ROOT);
const role = 'dev';
const profile = getProfile(role);
const intensity = computeIntensity(role, phase);
const outPath = join(ROOT, '.claude', 'agents', AGENT_ID.replace(/\//g, '-'), 'pouls.md');

writePoulsMd(outPath, {
  agent: { id: AGENT_ID, name: buildAgentName(RAW_HOSTNAME), role, provider: 'claude' },
  status: intensityToStatus(intensity),
  lastPulse: new Date().toISOString(),
  ttl: profile.ttl,
  phase: phase || '—',
  intensity: { current: intensity, ceiling: profile.ceiling },
  lang: 'fr',
}, '## État courant\n\nInitialisé via SessionStart hook.\n');

process.stdout.write(`[PULSE-INIT] pouls.md créé : ${outPath}\n`);
