#!/usr/bin/env node
// test/marketplace.js — tests unitaires marketplace (claim concurrent, escrow, SHA conflict)

import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

// ── Store en mémoire (même mock que marketplace-simulate.js) ─────────────────
const STORE = {};
function fakeSha() { return randomBytes(8).toString('hex'); }

function mockGhApi(path, opts = {}) {
  if (!opts.method || opts.method === 'GET') {
    if (!STORE[path]) {
      const prefix = path + '/';
      const entries = Object.keys(STORE)
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(k => ({ name: k.slice(prefix.length), sha: STORE[k].sha }));
      return entries.length ? entries : null;
    }
    const e = STORE[path];
    return { content: e.content.toString('base64'), sha: e.sha };
  }
  if (opts.method === 'PUT') {
    const existing = STORE[path];
    if (existing && opts.fields?.sha && existing.sha !== opts.fields.sha) return null;
    const newSha = fakeSha();
    STORE[path] = { content: Buffer.from(opts.fields.content, 'base64'), sha: newSha };
    return { content: { sha: newSha } };
  }
  if (opts.method === 'DELETE') {
    const e = STORE[path];
    if (!e || e.sha !== opts.fields?.sha) return null;
    delete STORE[path];
    return { commit: {} };
  }
  return null;
}

function ghRead(p) {
  const r = mockGhApi(p);
  if (!r?.content) return null;
  try { return { data: JSON.parse(Buffer.from(r.content, 'base64').toString()), sha: r.sha }; }
  catch { return null; }
}
function ghWrite(p, data, sha) {
  const enc = Buffer.from(JSON.stringify(data)).toString('base64');
  const f = { content: enc };
  if (sha) f.sha = sha;
  return mockGhApi(p, { method: 'PUT', fields: f }) !== null;
}
function ghDelete(p, sha) {
  return mockGhApi(p, { method: 'DELETE', fields: { sha } }) !== null;
}

// ── Ledger minimal ────────────────────────────────────────────────────────────
const BALANCES = {};
function initBalance(agentId, bal = 1000) { BALANCES[agentId] = bal; }
function getBalance(agentId) { return BALANCES[agentId] ?? 0; }
function debit(agentId, amount) {
  if (getBalance(agentId) < amount) return false;
  BALANCES[agentId] -= amount;
  return true;
}
function credit(agentId, amount) { BALANCES[agentId] = (BALANCES[agentId] ?? 0) + amount; }

const STAKE_PCT = 0.10;

function postTask(posterId, skill, budget) {
  const id = `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const task = { id, skill, budget_credits: budget, status: 'open', posted_by: posterId };
  if (!debit(posterId, budget)) return null;
  if (!ghWrite(`open/${id}.json`, task, null)) { credit(posterId, budget); return null; }
  return { id, filename: `${id}.json`, task };
}

function claimTask(agentId, filename, task, sha) {
  const stake = Math.ceil((task.budget_credits || 0) * STAKE_PCT);
  if (getBalance(agentId) < stake) return { ok: false, reason: 'caution insuffisante' };
  // Optimistic locking
  const fresh = mockGhApi(`open/${filename}`);
  if (!fresh || fresh.sha !== sha) return { ok: false, reason: 'conflit SHA' };
  const taken = { ...task, status: 'taken', winner_id: agentId, stake };
  if (!ghWrite(`taken/${filename}`, taken, null)) return { ok: false, reason: 'write taken échoué' };
  if (!debit(agentId, stake)) {
    // Rollback taken
    const t = mockGhApi(`taken/${filename}`);
    if (t?.sha) ghDelete(`taken/${filename}`, t.sha);
    return { ok: false, reason: 'débit stake échoué' };
  }
  ghDelete(`open/${filename}`, fresh.sha);
  return { ok: true, stake };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅  ${name}`); pass++; }
  catch (e) { console.log(`  ❌  ${name}\n     ${e.message}`); fail++; }
}

console.log('\n[marketplace] tests unitaires\n');

test('postTask — escrow débité du poster', () => {
  initBalance('poster-a', 500);
  const r = postTask('poster-a', 'nodejs', 100);
  assert.ok(r, 'tâche créée');
  assert.equal(getBalance('poster-a'), 400, 'escrow débité');
  assert.ok(mockGhApi(`open/${r.filename}`), 'tâche dans open/');
});

test('listing dossier open/ sans slash', () => {
  initBalance('poster-b', 200);
  postTask('poster-b', 'python', 50);
  const listing = mockGhApi('open');
  assert.ok(Array.isArray(listing) && listing.length >= 1, 'listing open/ fonctionne');
});

test('claimTask — claim réussi, stake débité', () => {
  initBalance('poster-c', 500); initBalance('agent-c', 200);
  const r = postTask('poster-c', 'go', 80);
  const sha = mockGhApi(`open/${r.filename}`).sha;
  const res = claimTask('agent-c', r.filename, r.task, sha);
  assert.equal(res.ok, true, 'claim accepté');
  assert.equal(getBalance('agent-c'), 200 - Math.ceil(80 * STAKE_PCT), 'stake débité');
  assert.ok(mockGhApi(`taken/${r.filename}`), 'tâche dans taken/');
  assert.ok(!mockGhApi(`open/${r.filename}`), 'tâche absente de open/');
});

test('claimTask concurrent — second agent bloqué par conflit SHA', () => {
  initBalance('poster-d', 500); initBalance('agent-d1', 200); initBalance('agent-d2', 200);
  const r = postTask('poster-d', 'nodejs', 60);
  const sha = mockGhApi(`open/${r.filename}`).sha;
  const res1 = claimTask('agent-d1', r.filename, r.task, sha);
  const res2 = claimTask('agent-d2', r.filename, r.task, sha);
  assert.equal(res1.ok, true, 'premier claim réussi');
  assert.equal(res2.ok, false, 'second claim bloqué');
  assert.match(res2.reason, /conflit SHA/, 'raison: conflit SHA');
});

test('claimTask — caution insuffisante bloquée', () => {
  initBalance('poster-e', 500); initBalance('agent-poor', 0);
  const r = postTask('poster-e', 'rust', 100);
  const sha = mockGhApi(`open/${r.filename}`).sha;
  const res = claimTask('agent-poor', r.filename, r.task, sha);
  assert.equal(res.ok, false, 'claim refusé');
  assert.match(res.reason, /caution/, 'raison: caution');
});

test('postTask — rollback si balance insuffisante', () => {
  initBalance('poster-broke', 10);
  const r = postTask('poster-broke', 'go', 100);
  assert.equal(r, null, 'tâche non créée');
  assert.equal(getBalance('poster-broke'), 10, 'balance inchangée');
});

console.log(`\n  ${pass} réussis · ${fail} échoués\n`);
if (fail > 0) process.exit(1);
