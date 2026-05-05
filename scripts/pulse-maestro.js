#!/usr/bin/env node
/**
 * scripts/pulse-maestro.js — Start hook Maestro
 * Lit §0.Phase, détecte les changements, rafraîchit seulement l'agent courant,
 * puis écrit /tmp/claude-atelier-pulse-status pour injection dans l'entête §1.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { statusLabel } from '../src/pulse/format.js';
import { computePulseSummary } from '../src/pulse/summary.js';
import { buildAgentId, buildKnownAgentIds } from '../src/pulse/identity.js';
import { ensureMarketplaceWatch, sweepMarketplaceOnce } from '../src/pulse/marketplace.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = '/tmp/claude-atelier-last-phase';
const STATUS_FILE = '/tmp/claude-atelier-pulse-status';

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

function readLang(root) {
  const cfg = join(root, '.claude', 'atelier-config.json');
  if (!existsSync(cfg)) return 'fr';
  try { return JSON.parse(readFileSync(cfg, 'utf8')).lang ?? 'fr'; } catch { return 'fr'; }
}

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

export function runMaestro(options = {}) {
  const root = options.root ?? ROOT;
  const cacheFile = options.cacheFile ?? CACHE_FILE;
  const statusFile = options.statusFile ?? STATUS_FILE;
  const rawHostname = options.rawHostname ?? hostname();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  const phase = readPhase(root);
  const lang = readLang(root);
  const currentAgentIds = new Set(buildKnownAgentIds(rawHostname));
  const canonicalAgentId = buildAgentId(rawHostname);

  // ── Détection changement de phase ──
  let phaseChanged = false;
  let lastPhase = '';
  if (existsSync(cacheFile)) {
    lastPhase = readFileSync(cacheFile, 'utf8').trim();
  }
  if (phase !== lastPhase) {
    phaseChanged = true;
    try { writeFileSync(cacheFile, phase, 'utf8'); } catch (_) {}
  }

  if (phaseChanged && lastPhase) {
    stderr.write(`[MAESTRO] ⚡ Phase changée : "${lastPhase}" → "${phase}"\n`);
    stderr.write(`[MAESTRO] 💡 Nouvelle phase détectée → /compact recommandé + nouvelle session\n`);
  } else if (phase !== lastPhase && lastPhase === '') {
    try { writeFileSync(cacheFile, phase, 'utf8'); } catch (_) {}
  }

  // ── Présence réelle : seul l'agent courant reçoit un nouveau lastPulse ──
  const files = findPoulsMdFiles(root);
  const agents = [];
  let refreshedCurrent = 0;

  for (const f of files) {
    try {
      const existing = parsePoulsMd(f);
      if (!existing) continue;

      if (!currentAgentIds.has(existing.agent?.id)) {
        agents.push(existing);
        continue;
      }

      const role = existing.agent?.role ?? 'dev';
      const profile = getProfile(role);
      const effectivePhase = phase || existing.phase;
      const intensity = computeIntensity(role, effectivePhase);
      const status = intensityToStatus(intensity);
      const updated = {
        ...existing,
        status,
        lastPulse: new Date().toISOString(),
        phase: effectivePhase,
        intensity: { current: intensity, ceiling: profile.ceiling },
      };

      writePoulsMd(f, updated, existing._body);
      agents.push(updated);
      refreshedCurrent++;
    } catch (e) {
      stderr.write(`[MAESTRO] erreur ${f}: ${e.message}\n`);
    }
  }

  if (refreshedCurrent === 0 && files.length > 0) {
    stderr.write(`[MAESTRO] aucun pouls.md trouvé pour ${canonicalAgentId}\n`);
  }

  const currentPulse = agents.find(agent => currentAgentIds.has(agent.agent?.id)) ?? null;
  sweepMarketplaceOnce({
    root,
    currentPulse,
    force: false,
    stderr,
  });
  ensureMarketplaceWatch({ root });

  // ── Écriture du statut pour model-metrics.sh ──
  const total = agents.length;
  const { active, topStatus } = computePulseSummary(agents);
  const label = statusLabel(topStatus, lang);
  const indicator = `💓${label}·${active}/${total}`;

  try {
    writeFileSync(statusFile, indicator, 'utf8');
  } catch (_) {}

  stdout.write(`[PULSE] ${indicator}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runMaestro());
}
