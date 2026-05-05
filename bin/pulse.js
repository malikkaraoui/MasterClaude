#!/usr/bin/env node
/**
 * bin/pulse.js — Commande `claude-atelier pulse`
 *
 * Sous-commandes :
 *   status          Affiche le pouls de tous les agents détectés
 *   init            Crée pouls.md pour l'agent courant
 *   update          Met à jour manuellement (agents non-Claude Code)
 *   list            Alias de status (avec filtres)
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd, isExpired } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { renderStatusTable } from '../src/pulse/format.js';
import { buildAgentId, buildAgentName, buildKnownAgentIds } from '../src/pulse/identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function _flag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function parseArgs(argv) {
  const args = argv.slice(3);
  const sub = args[0] ?? 'status';
  const flags = {
    json:    args.includes('--json'),
    expired: args.includes('--expired'),
    global:  args.includes('--global'),
    lang:    _flag(args, '--lang'),
    role:    _flag(args, '--role'),
    status:  _flag(args, '--status'),
    phase:   _flag(args, '--phase'),
  };
  return { sub, flags };
}

function readLang(root) {
  const cfg = join(root, '.claude', 'atelier-config.json');
  if (!existsSync(cfg)) return 'fr';
  try { return JSON.parse(readFileSync(cfg, 'utf8')).lang ?? 'fr'; } catch { return 'fr'; }
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

function findCurrentAgentPouls(root, rawHostname) {
  const knownIds = new Set(buildKnownAgentIds(rawHostname));

  for (const filePath of findPoulsMdFiles(root)) {
    try {
      const parsed = parsePoulsMd(filePath);
      if (parsed && knownIds.has(parsed.agent?.id)) {
        return { filePath, parsed };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function runPulse(argv) {
  const { sub, flags } = parseArgs(argv);
  const lang = flags.lang ?? readLang(ROOT);
  const currentPhase = readPhase(ROOT);

  if (sub === 'status' || sub === 'list') {
    const files = findPoulsMdFiles(ROOT);
    let agents = files
      .map(f => { try { return parsePoulsMd(f); } catch (e) { process.stderr.write(`⚠️  ${f}: ${e.message}\n`); return null; } })
      .filter(Boolean);

    if (flags.role) agents = agents.filter(a => a.agent?.role === flags.role);
    if (flags.status) agents = agents.filter(a => a.status === flags.status);
    if (flags.phase) agents = agents.filter(a => a.phase === flags.phase);
    if (flags.expired) agents = agents.filter(a => isExpired(a));

    if (agents.length === 0) {
      process.stdout.write('Aucun pouls.md trouvé. Lancez : claude-atelier pulse init\n');
      return 0;
    }

    if (flags.json) {
      process.stdout.write(JSON.stringify(agents, null, 2) + '\n');
    } else {
      process.stdout.write(renderStatusTable(agents, lang, { phase: currentPhase || undefined }) + '\n');
    }
    return 0;
  }

  if (sub === 'init') {
    const rawHostname = hostname();
    const existingAgent = findCurrentAgentPouls(ROOT, rawHostname);
    const agentId = existingAgent?.parsed.agent?.id ?? buildAgentId(rawHostname);
    const role = flags.role ?? existingAgent?.parsed.agent?.role ?? 'dev';
    const outPath = existingAgent?.filePath ?? join(ROOT, '.claude', 'agents', agentId.replace('/', '-'), 'pouls.md');
    const phase = readPhase(ROOT);
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);

    writePoulsMd(outPath, {
      agent: {
        id: agentId,
        name: existingAgent?.parsed.agent?.name ?? buildAgentName(rawHostname),
        role,
        provider: existingAgent?.parsed.agent?.provider ?? 'claude',
      },
      status: intensityToStatus(intensity),
      lastPulse: new Date().toISOString(),
      ttl: profile.ttl,
      phase: currentPhase || '—',
      intensity: { current: intensity, ceiling: profile.ceiling },
      lang,
    }, existingAgent?.parsed._body ?? '## État courant\n\nInitialisé via `claude-atelier pulse init`.\n');

    process.stdout.write(`✓ pouls.md créé : ${outPath}\n`);
    process.stdout.write(`  Rôle: ${role} · Intensité: ${intensity.toFixed(2)} · Statut: ${intensityToStatus(intensity)}\n`);
    return 0;
  }

  if (sub === 'update') {
    const files = findPoulsMdFiles(ROOT);
    const rawHostname = hostname();
    const knownIds = new Set(buildKnownAgentIds(rawHostname));
    const agentId = buildAgentId(rawHostname);
    let updated = 0;

    for (const f of files) {
      let existing;
      try {
        existing = parsePoulsMd(f);
      } catch (e) {
        process.stderr.write(`⚠️  ${f}: ${e.message}\n`);
        continue;
      }

      if (!existing || !knownIds.has(existing.agent?.id)) continue;

      const role = existing.agent.role ?? 'dev';
      const phase = flags.phase ?? (currentPhase || existing.phase);
      const intensity = computeIntensity(role, phase);
      const status = flags.status ?? intensityToStatus(intensity);

      writePoulsMd(f, {
        ...existing,
        status,
        lastPulse: new Date().toISOString(),
        phase,
        intensity: { current: intensity, ceiling: getProfile(role).ceiling },
      }, existing._body);

      process.stdout.write(`✓ mis à jour: ${f}\n`);
      updated++;
    }

    if (updated === 0) {
      process.stdout.write(`Aucun pouls.md pour ${agentId}. Lancez : claude-atelier pulse init\n`);
    }
    return 0;
  }

  process.stderr.write(`Sous-commande inconnue: "${sub}"\nUsage: claude-atelier pulse [status|init|update|list]\n`);
  return 1;
}
