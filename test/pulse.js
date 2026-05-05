#!/usr/bin/env node
/**
 * test/pulse.js — Tests unitaires système Pulse & Maestro
 * Usage: node test/pulse.js  (ou: npm run test:pulse)
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePoulsMd, parsePoulsMdContent, isExpired, ageSeconds } from '../src/pulse/parse.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { serialisePoulsMd, writePoulsMd } from '../src/pulse/write.js';
import { statusLabel, pulseIndicator, renderStatusTable, _clearCache } from '../src/pulse/format.js';
import { sanitizeHostname, buildAgentId, buildKnownAgentIds, legacySanitizeHostname } from '../src/pulse/identity.js';
import { computePulseSummary } from '../src/pulse/summary.js';
import { getMarketplaceStateFile, sweepMarketplaceOnce } from '../src/pulse/marketplace.js';
import { runMaestro } from '../scripts/pulse-maestro.js';

let pass = 0;
let fail = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    └ ${e.message}`);
    fail++;
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion échouée');
}

// ── parse.js ──────────────────────────────────────────────────────────────────
console.log('\n[parse.js]');

const VALID_MD = `---
schema: pouls/1.0
agent:
  id: claude-code/test
  name: Test Agent
  role: dev
  provider: claude

status: idle
lastPulse: "2020-01-01T00:00:00Z"
ttl: 300

phase: "Phase test"
intensity:
  current: 0.30
  ceiling: 0.80

lang: fr
---

## État
test
`;

test('parse frontmatter valide', () => {
  const p = parsePoulsMdContent(VALID_MD);
  ok(p.schema === 'pouls/1.0', 'schema');
  ok(p.agent.id === 'claude-code/test', 'agent.id');
  ok(p.agent.role === 'dev', 'agent.role');
  ok(p.agent.name === 'Test Agent', 'agent.name');
  ok(p.agent.provider === 'claude', 'agent.provider');
  ok(p.status === 'idle', 'status');
  ok(p.ttl === 300, 'ttl number');
  ok(p.intensity.current === 0.30, 'intensity.current');
  ok(p.intensity.ceiling === 0.80, 'intensity.ceiling');
  ok(p.lang === 'fr', 'lang');
  ok(p._body.includes('## État'), '_body');
});

test('erreur si frontmatter absent', () => {
  let threw = false;
  try { parsePoulsMdContent('# no frontmatter'); } catch { threw = true; }
  ok(threw, 'doit lever une erreur');
});

test('erreur si schema incorrect', () => {
  const bad = VALID_MD.replace('pouls/1.0', 'pouls/2.0');
  let threw = false;
  try { parsePoulsMdContent(bad); } catch { threw = true; }
  ok(threw, 'doit lever une erreur schema');
});

test('isExpired: lastPulse ancienne → expiré', () => {
  const p = parsePoulsMdContent(VALID_MD);
  ok(isExpired(p), 'doit être expiré (lastPulse 2020)');
});

test('isExpired: lastPulse récente → non expiré', () => {
  const fresh = VALID_MD.replace('"2020-01-01T00:00:00Z"', `"${new Date().toISOString()}"`);
  const p = parsePoulsMdContent(fresh);
  ok(!isExpired(p), 'ne doit pas être expiré');
});

test('ageSeconds: renvoie un nombre positif', () => {
  const p = parsePoulsMdContent(VALID_MD);
  const age = ageSeconds(p);
  ok(age > 0 && isFinite(age), `age=${age} doit être positif fini`);
});

// ── intensity.js ─────────────────────────────────────────────────────────────
console.log('\n[intensity.js]');

test('getProfile dev: ceiling 0.8', () => {
  const p = getProfile('dev');
  ok(p.ceiling === 0.8, `ceiling=${p.ceiling}`);
  ok(p.base === 0.3, `base=${p.base}`);
  ok(p.ttl === 300, `ttl=${p.ttl}`);
});

test('getProfile inconnu → profile par défaut', () => {
  const p = getProfile('unknown_role');
  ok(p.ceiling > 0, 'ceiling doit être positif');
  ok(p.ttl === 300, `ttl=${p.ttl} attendu 300`);
});

test('getProfile aligne les TTL des rôles avec les templates', () => {
  ok(getProfile('secretary').ttl === 600, 'secretary ttl=600');
  ok(getProfile('marketing').ttl === 900, 'marketing ttl=900');
  ok(getProfile('cyber').ttl === 120, 'cyber ttl=120');
  ok(getProfile('ops').ttl === 180, 'ops ttl=180');
});

test('computeIntensity dev + phase impl → boost', () => {
  const base = computeIntensity('dev', '');
  const boosted = computeIntensity('dev', 'Phase 2 — implémentation proxy');
  ok(boosted > base, `boosted(${boosted}) > base(${base})`);
});

test('computeIntensity dev + phase freeze → réduit', () => {
  const base = computeIntensity('dev', '');
  const frozen = computeIntensity('dev', 'freeze release');
  ok(frozen <= base, `frozen(${frozen}) <= base(${base})`);
});

test('computeIntensity ne dépasse jamais le ceiling', () => {
  const profile = getProfile('secretary');
  const val = computeIntensity('secretary', 'impl code fix feat deploy release');
  ok(val <= profile.ceiling, `val(${val}) <= ceiling(${profile.ceiling})`);
});

test('computeIntensity toujours >= 0', () => {
  const val = computeIntensity('ops', 'freeze pause repos');
  ok(val >= 0, `val(${val}) doit être >= 0`);
});

test('intensityToStatus: 0 → off', () => ok(intensityToStatus(0) === 'off', 'off'));
test('intensityToStatus: 0.15 → idle', () => ok(intensityToStatus(0.15) === 'idle', 'idle'));
test('intensityToStatus: 0.3 → low', () => ok(intensityToStatus(0.3) === 'low', 'low'));
test('intensityToStatus: 0.5 → medium', () => ok(intensityToStatus(0.5) === 'medium', 'medium'));
test('intensityToStatus: 0.7 → high', () => ok(intensityToStatus(0.7) === 'high', 'high'));
test('intensityToStatus: 0.9 → critical', () => ok(intensityToStatus(0.9) === 'critical', 'critical'));

test('intensityToStatus: 0.2 (exact) → idle', () => ok(intensityToStatus(0.2) === 'idle', 'idle at 0.2'));
test('intensityToStatus: 0.4 (exact) → low', () => ok(intensityToStatus(0.4) === 'low', 'low at 0.4'));
test('intensityToStatus: 0.6 (exact) → medium', () => ok(intensityToStatus(0.6) === 'medium', 'medium at 0.6'));
test('intensityToStatus: 0.8 (exact) → high', () => ok(intensityToStatus(0.8) === 'high', 'high at 0.8'));

test('computeIntensity: phase UPPERCASE → même résultat que lowercase', () => {
  const low = computeIntensity('dev', 'impl');
  const up  = computeIntensity('dev', 'IMPL');
  ok(low === up, `lowercase(${low}) === uppercase(${up})`);
});

// ── summary.js ───────────────────────────────────────────────────────────────
console.log('\n[summary.js]');

test('computePulseSummary compte tous les agents actifs, pas seulement le plus intense', () => {
  const fresh = new Date().toISOString();
  const agents = [
    { status: 'high', lastPulse: fresh, ttl: 300, intensity: { current: 0.7, ceiling: 0.8 } },
    { status: 'medium', lastPulse: fresh, ttl: 300, intensity: { current: 0.5, ceiling: 0.8 } },
    { status: 'idle', lastPulse: fresh, ttl: 300, intensity: { current: 0.1, ceiling: 0.8 } },
    { status: 'high', lastPulse: '2020-01-01T00:00:00Z', ttl: 300, intensity: { current: 0.9, ceiling: 0.9 } },
  ];

  const summary = computePulseSummary(agents);
  ok(summary.active === 3, `active=${summary.active} attendu 3`);
  ok(summary.topStatus === 'high', `topStatus=${summary.topStatus} attendu high`);
  ok(summary.topIntensity === 0.7, `topIntensity=${summary.topIntensity} attendu 0.7`);
});

// ── identity.js ──────────────────────────────────────────────────────────────
console.log('\n[identity.js]');

test('sanitizeHostname normalise le hostname pour le slug', () => {
  ok(sanitizeHostname('Malik\'s.MacBook Pro.local') === 'malik-s-macbook-pro-local', 'hostname sanitisé');
});

test('buildAgentId différencie deux hostnames qui convergent vers le même slug', () => {
  const left = buildAgentId('Dev.Box');
  const right = buildAgentId('Dev-Box');

  ok(left !== right, `${left} ne doit pas égaler ${right}`);
});

test('buildKnownAgentIds garde la compatibilité avec les anciens identifiants agent', () => {
  const ids = buildKnownAgentIds('Maliks-MacBook-Pro.local');

  ok(ids.includes(buildAgentId('Maliks-MacBook-Pro.local')), 'doit inclure le nouvel id');
  ok(ids.includes('claude-code/maliks-macbook-pro-local'), 'doit inclure le legacy sanitisé');
  ok(ids.includes('claude-code/Maliks-MacBook-Pro.local'), 'doit inclure le legacy brut');
});

test('buildKnownAgentIds inclut la variante legacy tronquée à 63 chars pour les hostnames longs', () => {
  const hostname = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-devbox.local';
  const ids = buildKnownAgentIds(hostname);
  const legacyTruncated = legacySanitizeHostname(hostname);

  ok(ids.includes(buildAgentId(hostname)), 'doit inclure le nouvel id pour hostname long');
  ok(ids.includes(`claude-code/${legacyTruncated}`), 'doit inclure le legacy sanitisé tronqué à 63 caractères');
  ok(ids.includes(`claude-code/${hostname}`), 'doit inclure le legacy brut complet');
});

// ── write.js ─────────────────────────────────────────────────────────────────
console.log('\n[write.js]');

const SAMPLE_DATA = {
  agent: { id: 'claude-code/test', name: 'Test', role: 'dev', provider: 'claude' },
  status: 'high',
  lastPulse: '2026-04-28T12:00:00Z',
  ttl: 300,
  phase: 'Phase test',
  intensity: { current: 0.70, ceiling: 0.80 },
  lang: 'fr',
};

test('serialisePoulsMd produit un frontmatter YAML parsable', () => {
  const content = serialisePoulsMd(SAMPLE_DATA, '## Corps\nTest.');
  const parsed = parsePoulsMdContent(content);
  ok(parsed.agent.id === 'claude-code/test', 'agent.id round-trip');
  ok(parsed.status === 'high', 'status round-trip');
  ok(parsed.ttl === 300, 'ttl round-trip');
  ok(parsed.intensity.current === 0.70, 'intensity.current round-trip');
  ok(parsed._body.includes('## Corps'), '_body round-trip');
});

test('serialisePoulsMd commence par ---', () => {
  const content = serialisePoulsMd(SAMPLE_DATA, '');
  ok(content.startsWith('---\n'), 'doit commencer par ---');
});

test('serialisePoulsMd: agent.name avec ":" ne casse pas le round-trip', () => {
  const data = { ...SAMPLE_DATA, agent: { ...SAMPLE_DATA.agent, name: 'Test: Code Review' } };
  const content = serialisePoulsMd(data, '');
  const parsed = parsePoulsMdContent(content);
  ok(parsed.agent.name === 'Test: Code Review', `name="${parsed.agent.name}"`);
});

test('writePoulsMd écrit sur disque sans laisser de fichier temporaire', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-atelier-pulse-'));
  const filePath = join(dir, 'agents', 'pouls.md');

  try {
    writePoulsMd(filePath, SAMPLE_DATA, '## Corps\nInitial.');
    writePoulsMd(filePath, { ...SAMPLE_DATA, status: 'low' }, '## Corps\nMis à jour.');

    ok(existsSync(filePath), 'pouls.md doit exister');

    const parsed = parsePoulsMd(filePath);
    ok(parsed.status === 'low', `status=${parsed.status} attendu low`);

    const files = readdirSync(join(dir, 'agents'));
    ok(files.length === 1 && files[0] === 'pouls.md', `fichiers inattendus: ${files.join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── format.js ────────────────────────────────────────────────────────────────
console.log('\n[format.js]');
_clearCache();

test('statusLabel FR: high → élevé', () => {
  ok(statusLabel('high', 'fr') === 'élevé', 'élevé');
});

test('statusLabel EN: high → high', () => {
  ok(statusLabel('high', 'en') === 'high', 'high');
});

test('statusLabel FR: idle → repos', () => {
  ok(statusLabel('idle', 'fr') === 'repos', 'repos');
});

test('pulseIndicator format correct FR', () => {
  const ind = pulseIndicator('high', 2, 3, 'fr');
  ok(ind === '💓élevé·2/3', `attendu 💓élevé·2/3, reçu: ${ind}`);
});

test('pulseIndicator format correct EN', () => {
  const ind = pulseIndicator('high', 2, 3, 'en');
  ok(ind === '💓high·2/3', `attendu 💓high·2/3, reçu: ${ind}`);
});

test('renderStatusTable contient la séparation et le récapitulatif', () => {
  const agents = [
    { agent: { id: 'a/b', role: 'dev' }, status: 'high', lastPulse: new Date().toISOString(), ttl: 300, phase: 'Phase test', intensity: { current: 0.7, ceiling: 0.8 } },
    { agent: { id: 'c/d', role: 'ops' }, status: 'idle', lastPulse: '2020-01-01T00:00:00Z', ttl: 300, phase: 'Phase test', intensity: { current: 0.1, ceiling: 0.5 } },
  ];
  const table = renderStatusTable(agents, 'fr');
  ok(table.includes('💓'), 'doit contenir 💓');
  ok(table.includes('agents'), 'doit contenir "agents"');
  ok(table.includes('EXPIRÉ'), 'doit contenir EXPIRÉ pour le 2e agent');
});

test('renderStatusTable utilise la phase fournie en priorité', () => {
  const agents = [
    { agent: { id: 'a/b', role: 'dev' }, status: 'idle', lastPulse: '2020-01-01T00:00:00Z', ttl: 300, phase: 'Ancienne phase', intensity: { current: 0.1, ceiling: 0.8 } },
    { agent: { id: 'c/d', role: 'ops' }, status: 'high', lastPulse: new Date().toISOString(), ttl: 300, phase: 'Phase active', intensity: { current: 0.7, ceiling: 0.7 } },
  ];
  const table = renderStatusTable(agents, 'fr', { phase: 'Phase workspace' });
  ok(table.startsWith('💓 Agents actifs — Phase workspace'), 'doit afficher la phase workspace');
});

// ── Maestro start hook ──────────────────────────────────────────────────────
console.log('\n[pulse-maestro.js]');

test('runMaestro rafraîchit seulement le pouls de l’agent courant', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-atelier-maestro-'));
  const currentOldPulse = '2020-01-01T00:00:00.000Z';
  const otherOldPulse = '2020-01-02T00:00:00.000Z';

  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'CLAUDE.md'), [
      '| Clé | Valeur |',
      '| --- | --- |',
      '| Phase | Phase test impl code |',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, '.claude', 'atelier-config.json'), JSON.stringify({ lang: 'fr' }), 'utf8');

    const currentPath = join(dir, '.claude', 'agents', 'current', 'pouls.md');
    const otherPath = join(dir, '.claude', 'agents', 'other', 'pouls.md');

    writePoulsMd(currentPath, {
      agent: { id: buildAgentId('current-host'), name: 'Current', role: 'dev', provider: 'claude' },
      status: 'idle',
      lastPulse: currentOldPulse,
      ttl: 300,
      phase: 'Ancienne phase courant',
      intensity: { current: 0.1, ceiling: 0.8 },
      lang: 'fr',
    }, '## Courant\n');

    writePoulsMd(otherPath, {
      agent: { id: buildAgentId('other-host'), name: 'Other', role: 'ops', provider: 'claude' },
      status: 'high',
      lastPulse: otherOldPulse,
      ttl: 300,
      phase: 'Ancienne phase autre',
      intensity: { current: 0.7, ceiling: 0.7 },
      lang: 'fr',
    }, '## Autre\n');

    let stdout = '';
    let stderr = '';
    const code = runMaestro({
      root: dir,
      cacheFile: join(dir, 'last-phase'),
      statusFile: join(dir, 'pulse-status'),
      rawHostname: 'current-host',
      stdout: { write: chunk => { stdout += chunk; } },
      stderr: { write: chunk => { stderr += chunk; } },
    });

    const current = parsePoulsMd(currentPath);
    const other = parsePoulsMd(otherPath);
    const indicator = readFileSync(join(dir, 'pulse-status'), 'utf8');

    ok(code === 0, `code=${code}`);
    ok(stdout.includes('[PULSE]'), 'doit écrire la ligne PULSE');
    ok(!stderr.includes('erreur'), `stderr inattendu: ${stderr}`);
    ok(current.lastPulse !== currentOldPulse, 'agent courant doit être rafraîchi');
    ok(current.phase === 'Phase test impl code', `phase courant=${current.phase}`);
    ok(other.lastPulse === otherOldPulse, 'agent non courant ne doit pas être rafraîchi');
    ok(other.phase === 'Ancienne phase autre', `phase autre=${other.phase}`);
    ok(indicator.includes('1/2'), `indicator=${indicator} attendu actif/total 1/2`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sweepMarketplaceOnce purge nos annonces stale et baisse la réputation spam', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-atelier-marketplace-'));
  const root = join(dir, 'workspace');
  const marketplace = join(dir, 'atelier-marketplace');
  const now = new Date('2026-05-02T12:00:00.000Z');

  try {
    mkdirSync(join(root, '.claude'), { recursive: true });
    mkdirSync(join(marketplace, 'open'), { recursive: true });
    mkdirSync(join(marketplace, 'skills'), { recursive: true });

    writeFileSync(join(root, '.claude', 'features.json'), JSON.stringify({
      marketplace_watch: true,
      params: {
        marketplace_agent_id: 'claude-atelier@malik',
        marketplace_repo_path: marketplace,
        marketplace_stale_open_sec: 120,
        marketplace_spam_penalty: 5,
        marketplace_spam_soft_limit: 3,
      },
    }, null, 2) + '\n', 'utf8');

    writeFileSync(join(marketplace, 'skills', 'registry.json'), JSON.stringify({
      _version: 1,
      agents: {
        'claude-atelier@malik': {
          joined: '2026-04-29',
          credits: 1000,
          skills: ['code-review'],
          available: true,
          accepts: { min_budget: 10, max_deadline_hours: 24 },
        },
      },
      skills_catalog: ['code-review'],
    }, null, 2) + '\n', 'utf8');

    writeFileSync(join(marketplace, 'ledger.json'), JSON.stringify({
      _version: 1,
      _updated: '2026-04-29T00:00:00Z',
      _description: 'Ledger de crédits par agent. Mis à jour automatiquement par GitHub Actions.',
      agents: {},
    }, null, 2) + '\n', 'utf8');

    const staleFile = join(marketplace, 'open', 'job-stale.json');
    writeFileSync(staleFile, JSON.stringify({
      id: 'job-stale-12345678',
      posted_at: '2026-05-02T11:56:00.000Z',
      posted_by: 'claude-atelier@malik',
      skill: 'code-review',
      description: 'Annonce irréaliste laissée ouverte',
      budget_credits: 5,
      deadline: '2026-05-03T12:00:00.000Z',
    }, null, 2) + '\n', 'utf8');

    const result = sweepMarketplaceOnce({
      root,
      now,
      currentPulse: { status: 'idle' },
      force: true,
      stderr: { write() {} },
    });

    ok(result.deletedOwnOffers.length === 1, 'une annonce stale doit être supprimée');
    ok(!existsSync(staleFile), 'le fichier open doit être supprimé');

    const registry = JSON.parse(readFileSync(join(marketplace, 'skills', 'registry.json'), 'utf8'));
    ok(registry.agents['claude-atelier@malik'].reputation === 95, 'réputation doit descendre à 95');
    ok(registry.agents['claude-atelier@malik'].spam.score === 1, 'spam.score doit être incrémenté');

    const ledger = JSON.parse(readFileSync(join(marketplace, 'ledger.json'), 'utf8'));
    ok(ledger.agents['claude-atelier@malik'].spam_score === 1, 'ledger spam_score doit être propagé');

    const state = JSON.parse(readFileSync(getMarketplaceStateFile(root), 'utf8'));
    ok(state.penaltiesApplied['job-stale-12345678'], 'la pénalité doit être mémorisée dans le state');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sweepMarketplaceOnce détecte les offres pertinentes quand l’agent est idle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-atelier-marketplace-'));
  const root = join(dir, 'workspace');
  const marketplace = join(dir, 'atelier-marketplace');
  const now = new Date('2026-05-02T12:00:00.000Z');

  try {
    mkdirSync(join(root, '.claude'), { recursive: true });
    mkdirSync(join(marketplace, 'open'), { recursive: true });
    mkdirSync(join(marketplace, 'skills'), { recursive: true });

    writeFileSync(join(root, '.claude', 'features.json'), JSON.stringify({
      marketplace_watch: true,
      params: {
        marketplace_agent_id: 'claude-atelier@malik',
        marketplace_repo_path: marketplace,
      },
    }, null, 2) + '\n', 'utf8');

    writeFileSync(join(marketplace, 'skills', 'registry.json'), JSON.stringify({
      _version: 1,
      agents: {
        'claude-atelier@malik': {
          joined: '2026-04-29',
          credits: 1000,
          skills: ['code-review', 'docs'],
          available: true,
          accepts: { min_budget: 10, max_deadline_hours: 24 },
        },
      },
      skills_catalog: ['code-review', 'docs'],
    }, null, 2) + '\n', 'utf8');

    writeFileSync(join(marketplace, 'ledger.json'), JSON.stringify({
      _version: 1,
      _updated: '2026-04-29T00:00:00Z',
      _description: 'Ledger de crédits par agent. Mis à jour automatiquement par GitHub Actions.',
      agents: {},
    }, null, 2) + '\n', 'utf8');

    writeFileSync(join(marketplace, 'open', 'job-relevant.json'), JSON.stringify({
      id: 'job-relevant-12345678',
      posted_at: '2026-05-02T11:59:30.000Z',
      posted_by: 'autre-agent@remote',
      skill: 'code-review',
      description: 'Review rapide d\'un handoff',
      budget_credits: 50,
      deadline: '2026-05-02T18:00:00.000Z',
    }, null, 2) + '\n', 'utf8');

    const result = sweepMarketplaceOnce({
      root,
      now,
      currentPulse: { status: 'idle' },
      force: true,
      stderr: { write() {} },
    });

    ok(result.relevantOffers.length === 1, 'une offre doit être remontée comme pertinente');
    ok(result.relevantOffers[0].id === 'job-relevant-12345678', 'id de l\'offre pertinente');

    const state = JSON.parse(readFileSync(getMarketplaceStateFile(root), 'utf8'));
    ok(state.lastRelevantOffers.length === 1, 'le state doit mémoriser la dernière shortlist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── résumé ────────────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed · ${fail} failed\n`);
if (fail > 0) process.exit(1);
