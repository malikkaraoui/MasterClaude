#!/usr/bin/env node
/**
 * scripts/pulse-update.js — appelé par hooks/stop-pulse.sh (Stop hook)
 * Met à jour pouls.md pour l'agent Claude Code courant.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { buildAgentId, buildKnownAgentIds } from '../src/pulse/identity.js';
import { stopMarketplaceWatch } from '../src/pulse/marketplace.js';

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
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const phase = readPhase(ROOT);
const files = findPoulsMdFiles(ROOT);

let updated = 0;
for (const f of files) {
  try {
    const existing = parsePoulsMd(f);
    if (!existing || !AGENT_IDS.has(existing.agent?.id)) continue;

    const role = existing.agent.role ?? 'dev';
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);
    const status = intensityToStatus(intensity);

    writePoulsMd(f, {
      ...existing,
      status,
      lastPulse: new Date().toISOString(),
      phase: phase || existing.phase,
      intensity: { current: intensity, ceiling: profile.ceiling },
    }, existing._body);

    updated++;
    process.stderr.write(`[PULSE] mise à jour: ${f}\n`);
  } catch (e) {
    process.stderr.write(`[PULSE] erreur ${f}: ${e.message}\n`);
  }
}

if (updated === 0) {
  process.stderr.write(`[PULSE] aucun pouls.md trouvé pour ${AGENT_ID}\n`);
}

stopMarketplaceWatch({ root: ROOT });
process.exit(0);
