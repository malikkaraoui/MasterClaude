#!/usr/bin/env node
// Requis : Node.js >= 18 en mode ESM (package.json "type":"module")
/**
 * test/apply-profile.js — Tests unitaires de applyProfile()
 * Couvre : validation, settings.json, hooks/, skills/, .mcp.json, dryRun, mergeStrategy, concurrence.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProfile } from '../src/apply-profile.js';

let pass = 0;
let fail = 0;

async function test(label, fn) {
  try {
    await fn();
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

function tmp() {
  return mkdtempSync(join(tmpdir(), 'atelier-test-'));
}

function rm(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── Validation ────────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] Validation des paramètres');

await test('opts manquant → throw opts', async () => {
  try { await applyProfile(); ok(false, 'doit throw'); }
  catch (e) { ok(e.message.includes('opts'), e.message); }
});

await test('cwd manquant → throw cwd', async () => {
  try { await applyProfile({ profile: 'lean' }); ok(false, 'doit throw'); }
  catch (e) { ok(e.message.includes('cwd'), e.message); }
});

await test('cwd inexistant → throw', async () => {
  try {
    await applyProfile({ cwd: '/tmp/inexistant-atelier-' + Date.now(), profile: 'lean' });
    ok(false, 'doit throw');
  } catch (e) { ok(e.message.includes('cwd'), e.message); }
});

await test('profil inconnu → throw avec liste des valides', async () => {
  const dir = tmp();
  try {
    await applyProfile({ cwd: dir, profile: 'nope' });
    ok(false, 'doit throw');
  } catch (e) {
    ok(e.message.includes('inconnu') || e.message.includes('nope'), e.message);
  } finally { rm(dir); }
});

// ── InjectionResult shape ─────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] Structure InjectionResult');

await test('retourne applied/skipped/warnings tableaux', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean' });
    ok(Array.isArray(r.applied), 'applied tableau');
    ok(Array.isArray(r.skipped), 'skipped tableau');
    ok(Array.isArray(r.warnings), 'warnings tableau');
  } finally { rm(dir); }
});

// ── settings.json ─────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] settings.json');

await test('lean: settings.json créé dans .claude/', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean' });
    ok(existsSync(join(dir, '.claude', 'settings.json')), 'fichier créé');
    ok(r.applied.some(p => p.endsWith('settings.json')), 'dans applied');
  } finally { rm(dir); }
});

await test('settings.json existant repo-wins → clé repo conservée', async () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ env: { MY_KEY: 'kept' } }));
    await applyProfile({ cwd: dir, profile: 'lean', mergeStrategy: 'repo-wins' });
    const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
    ok(s.env?.MY_KEY === 'kept', 'MY_KEY préservée');
  } finally { rm(dir); }
});

await test('settings.json existant atelier-wins → clé atelier gagne sur collision', async () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    // MAX_THINKING_TOKENS aussi dans le template atelier → collision intentionnelle
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ env: { MAX_THINKING_TOKENS: '999' } }));
    await applyProfile({ cwd: dir, profile: 'lean', mergeStrategy: 'atelier-wins' });
    const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
    ok(s.env?.MAX_THINKING_TOKENS !== '999', 'atelier écrase la valeur repo');
  } finally { rm(dir); }
});

// ── hooks/ ────────────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] hooks/');

await test('lean: hooks du profil copiés sur disque', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean' });
    ok(existsSync(join(dir, '.claude', 'hooks', 'guard-no-sign.sh')), 'guard-no-sign.sh copié');
    ok(r.applied.some(p => p.includes('guard-no-sign.sh')), 'dans applied');
  } finally { rm(dir); }
});

await test('repo-wins: hook existant → skipped, contenu inchangé', async () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'hooks', 'guard-no-sign.sh'), '# repo version');
    const r = await applyProfile({ cwd: dir, profile: 'lean', mergeStrategy: 'repo-wins' });
    ok(r.skipped.some(p => p.includes('guard-no-sign.sh')), 'dans skipped');
    ok(readFileSync(join(dir, '.claude', 'hooks', 'guard-no-sign.sh'), 'utf8') === '# repo version', 'contenu inchangé');
  } finally { rm(dir); }
});

await test('atelier-wins: hook existant → réécrit', async () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'hooks', 'guard-no-sign.sh'), '# old');
    const r = await applyProfile({ cwd: dir, profile: 'lean', mergeStrategy: 'atelier-wins' });
    ok(r.applied.some(p => p.includes('guard-no-sign.sh')), 'dans applied');
    ok(readFileSync(join(dir, '.claude', 'hooks', 'guard-no-sign.sh'), 'utf8') !== '# old', 'contenu remplacé');
  } finally { rm(dir); }
});

await test('review-only: aucun hook copié (liste vide)', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'review-only' });
    ok(!r.applied.some(p => p.includes('/hooks/')), 'aucun hook dans applied');
    ok(r.skipped.length === 0, 'aucun hook skippé');
  } finally { rm(dir); }
});

// ── skills/ ───────────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] skills/');

await test('lean: skill token-routing copié sous .claude/skills/atelier-token-routing/', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean' });
    ok(existsSync(join(dir, '.claude', 'skills', 'atelier-token-routing', 'SKILL.md')), 'SKILL.md copié');
    ok(r.applied.some(p => p.includes('atelier-token-routing')), 'dans applied');
  } finally { rm(dir); }
});

await test('lean: skill review-copilot copié sous .claude/skills/atelier-review-copilot/', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean' });
    ok(existsSync(join(dir, '.claude', 'skills', 'atelier-review-copilot', 'SKILL.md')), 'SKILL.md copié');
    ok(r.applied.some(p => p.includes('atelier-review-copilot')), 'dans applied');
  } finally { rm(dir); }
});

// ── .mcp.json ─────────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] .mcp.json');

await test('opts.mcp → .mcp.json créé avec le serveur', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({
      cwd: dir, profile: 'lean',
      mcp: { mcpServers: { github: { command: 'gh' } } },
    });
    ok(r.applied.some(p => p.endsWith('.mcp.json')), 'dans applied');
    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    ok(mcp.mcpServers?.github?.command === 'gh', 'serveur injecté');
  } finally { rm(dir); }
});

await test('repo-wins: collision mcp → existant conservé + warning', async () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'existing-gh' } } }));
    const r = await applyProfile({
      cwd: dir, profile: 'lean',
      mcp: { mcpServers: { github: { command: 'new-gh' } } },
      mergeStrategy: 'repo-wins',
    });
    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    ok(mcp.mcpServers.github.command === 'existing-gh', 'repo conservé');
    ok(r.warnings.some(w => w.includes('github')), 'warning collision');
  } finally { rm(dir); }
});

await test('mcp sans mcpServers → .mcp.json non créé', async () => {
  const dir = tmp();
  try {
    await applyProfile({ cwd: dir, profile: 'lean', mcp: {} });
    ok(!existsSync(join(dir, '.mcp.json')), '.mcp.json non créé si mcpServers vide');
  } finally { rm(dir); }
});

// ── dryRun ────────────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] Mode dryRun');

await test('dryRun: aucun fichier écrit sur disque', async () => {
  const dir = tmp();
  try {
    const r = await applyProfile({ cwd: dir, profile: 'lean', dryRun: true });
    ok(!existsSync(join(dir, '.claude', 'settings.json')), 'settings.json absent');
    ok(!existsSync(join(dir, '.claude', 'hooks')), 'hooks/ absent');
    ok(r.applied.length > 0, 'applied non vide (dry-run entries)');
    ok(r.applied.every(p => p.includes('(dry-run)')), 'tous marqués (dry-run)');
  } finally { rm(dir); }
});

// ── Concurrence ───────────────────────────────────────────────────────────────
console.log('\n[APPLY-PROFILE] Concurrence');

await test('deux applyProfile() en parallèle sur le même cwd → état final cohérent ou erreur explicite', async () => {
  const dir = tmp();
  try {
    const results = await Promise.allSettled([
      applyProfile({ cwd: dir, profile: 'lean' }),
      applyProfile({ cwd: dir, profile: 'lean' }),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    ok(fulfilled.length + rejected.length === 2, 'deux appels terminés');
    if (rejected.length === 0) {
      ok(existsSync(join(dir, '.claude', 'settings.json')), 'settings.json présent');
      const raw = readFileSync(join(dir, '.claude', 'settings.json'), 'utf8');
      ok(typeof JSON.parse(raw) === 'object', 'settings.json parsable');
    } else {
      for (const r of rejected) {
        ok(r.reason instanceof Error && r.reason.message.length > 0, 'erreur explicite');
      }
    }
  } finally { rm(dir); }
});

// ── Bilan ─────────────────────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests — ${pass} ✓ ${fail} ✗\n`);
process.exit(fail > 0 ? 1 : 0);
