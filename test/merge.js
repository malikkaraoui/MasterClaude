#!/usr/bin/env node
/**
 * test/merge.js — Tests unitaires du module src/merge.js
 * Couvre les 4 règles de fusion requises par l'intégration Paperclip.
 */

import { mergeSettings, mergeMcpServers, mergeFileDirectory, mergeSkills } from '../src/merge.js';

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

function eq(a, b) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`attendu ${sb}, obtenu ${sa}`);
}

// ── Règle 1 : settings.json deep merge ───────────────────────────────────────
console.log('\n[MERGE] Règle 1 — settings.json deep merge');

test('repo-wins: clé existante non écrasée', () => {
  const existing = { env: { FOO: 'existing' }, permissions: { defaultMode: 'default' } };
  const injected = { env: { FOO: 'injected', BAR: 'new' }, theme: 'dark' };
  const result = mergeSettings(existing, injected, 'existing');
  ok(result.env.FOO === 'existing', 'FOO doit rester existing');
  ok(result.env.BAR === 'new', 'BAR doit être ajouté');
  ok(result.theme === 'dark', 'theme doit être ajouté');
  ok(result.permissions.defaultMode === 'default', 'permissions préservées');
});

test('atelier-wins: clé injectée gagne sur collision', () => {
  const existing = { env: { FOO: 'existing' } };
  const injected = { env: { FOO: 'injected', BAR: 'new' } };
  const result = mergeSettings(existing, injected, 'injected');
  ok(result.env.FOO === 'injected', 'FOO doit être injected');
  ok(result.env.BAR === 'new', 'BAR doit être ajouté');
});

test('deep merge préserve clés non conflictuelles des deux côtés', () => {
  const existing = { env: { A: '1' }, preferences: { theme: 'dark' } };
  const injected = { env: { B: '2' }, model: 'claude-opus' };
  const result = mergeSettings(existing, injected, 'existing');
  ok(result.env.A === '1', 'A préservé depuis existing');
  ok(result.env.B === '2', 'B ajouté depuis injected');
  ok(result.preferences.theme === 'dark', 'preferences préservées');
  ok(result.model === 'claude-opus', 'model ajouté');
});

test('existing null → retourne injected intégralement', () => {
  const result = mergeSettings(null, { foo: 'bar' }, 'existing');
  ok(result.foo === 'bar', 'doit retourner injected si existing null');
});

// ── Règle 2 : hooks/* et agents/* par nom de fichier ─────────────────────────
console.log('\n[MERGE] Règle 2 — hooks/agents par nom de fichier');

test('repo-wins: collision sur hook → fichier existant conservé', () => {
  const { toWrite, toSkip, warnings } = mergeFileDirectory(
    ['guard-no-sign.sh', 'model-metrics.sh'],
    ['guard-no-sign.sh', 'new-hook.sh'],
    'existing'
  );
  ok(toSkip.includes('guard-no-sign.sh'), 'guard-no-sign.sh doit être skippé');
  ok(toWrite.includes('new-hook.sh'), 'new-hook.sh doit être écrit');
  ok(warnings.some(w => w.includes('guard-no-sign.sh')), 'warning attendu');
});

test('atelier-wins: collision sur hook → fichier injecté écrase', () => {
  const { toWrite, toSkip, warnings } = mergeFileDirectory(
    ['guard-no-sign.sh'],
    ['guard-no-sign.sh'],
    'injected'
  );
  ok(toWrite.includes('guard-no-sign.sh'), 'guard-no-sign.sh doit être écrit');
  ok(!toSkip.includes('guard-no-sign.sh'), 'ne doit pas être skippé');
  ok(warnings.length === 1, '1 warning attendu');
});

test('union sans collision → tous fichiers injectés sont écrits', () => {
  const { toWrite, warnings } = mergeFileDirectory(
    ['existing.sh'],
    ['new1.sh', 'new2.sh'],
    'existing'
  );
  eq(toWrite, ['new1.sh', 'new2.sh']);
  ok(warnings.length === 0, 'aucun warning sans collision');
});

// ── Règle 3 : .mcp.json mcpServers par clé ───────────────────────────────────
console.log('\n[MERGE] Règle 3 — mcpServers par clé');

test('repo-wins: collision sur mcpServer → existant conservé', () => {
  const { merged, warnings } = mergeMcpServers(
    { qmd: { command: 'existing-qmd' } },
    { qmd: { command: 'injected-qmd' }, github: { command: 'gh' } },
    'existing'
  );
  ok(merged.qmd.command === 'existing-qmd', 'qmd existant conservé');
  ok(merged.github.command === 'gh', 'github ajouté');
  ok(warnings.some(w => w.includes('qmd')), 'warning pour qmd');
});

test('atelier-wins: collision → injecté gagne', () => {
  const { merged } = mergeMcpServers(
    { qmd: { command: 'existing-qmd' } },
    { qmd: { command: 'injected-qmd' } },
    'injected'
  );
  ok(merged.qmd.command === 'injected-qmd', 'injected gagne');
});

test('pas de collision → union des deux serveurs', () => {
  const { merged, warnings } = mergeMcpServers(
    { server1: { command: 'a' } },
    { server2: { command: 'b' } },
    'existing'
  );
  ok(merged.server1.command === 'a');
  ok(merged.server2.command === 'b');
  ok(warnings.length === 0);
});

// ── Règle 4 : skills/ union stricte + préfixe atelier- ───────────────────────
console.log('\n[MERGE] Règle 4 — skills/ union + préfixe atelier-');

test('skill injecté reçoit le préfixe atelier-', () => {
  const { toInstall } = mergeSkills([], ['review-copilot', 'token-routing']);
  ok(toInstall.includes('atelier-review-copilot'), 'préfixe atelier- appliqué');
  ok(toInstall.includes('atelier-token-routing'), 'préfixe atelier- appliqué');
});

test('skill déjà présent avec préfixe → ignoré avec warning', () => {
  const { toInstall, warnings } = mergeSkills(
    ['atelier-review-copilot'],
    ['review-copilot']
  );
  ok(!toInstall.includes('atelier-review-copilot'), 'déjà présent → pas de doublon');
  ok(warnings.some(w => w.includes('atelier-review-copilot')), 'warning attendu');
});

test('skill sans préfixe non présent → installé avec préfixe', () => {
  const { toInstall } = mergeSkills(['atelier-existing'], ['new-skill']);
  ok(toInstall.includes('atelier-new-skill'));
  ok(!toInstall.includes('atelier-existing'));
});

test('skill déjà préfixé en entrée → pas de double préfixe', () => {
  const { toInstall } = mergeSkills([], ['atelier-already-prefixed']);
  ok(toInstall.includes('atelier-already-prefixed'));
  ok(!toInstall.includes('atelier-atelier-already-prefixed'));
});

// ── Bilan ─────────────────────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests — ${pass} ✓ ${fail} ✗\n`);
process.exit(fail > 0 ? 1 : 0);
