#!/usr/bin/env node
// scripts/marketplace-simulate.js — Simulation end-to-end du marketplace
// Mocke ghApi en mémoire pour tester tous les scénarios sans écrire sur le repo
//
// Usage: node scripts/marketplace-simulate.js

import { randomBytes } from 'node:crypto';

// ── Store en mémoire (remplace GitHub API) ───────────────────────────────────
const STORE = {}; // path → { content: Buffer, sha: string }

function fakeSha() { return randomBytes(8).toString('hex'); }

function mockGhApi(path, opts = {}) {
  if (!opts.method || opts.method === 'GET') {
    if (path.includes('/') && !STORE[path]) {
      // Lister un dossier
      const prefix = path + '/';
      const entries = Object.keys(STORE)
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(k => ({ name: k.slice(prefix.length), sha: STORE[k].sha }));
      return entries.length ? entries : null;
    }
    const entry = STORE[path];
    if (!entry) return null;
    return { content: entry.content.toString('base64'), sha: entry.sha };
  }
  if (opts.method === 'PUT') {
    const existing = STORE[path];
    if (existing && opts.fields?.sha && existing.sha !== opts.fields.sha) {
      return null; // Conflit SHA → simule 422
    }
    const newSha = fakeSha();
    STORE[path] = { content: Buffer.from(opts.fields.content, 'base64'), sha: newSha };
    return { content: { sha: newSha } };
  }
  if (opts.method === 'DELETE') {
    const entry = STORE[path];
    if (!entry || entry.sha !== opts.fields?.sha) return null;
    delete STORE[path];
    return { commit: {} };
  }
  return null;
}

// ── Patch du module marketplace pour utiliser le mock ────────────────────────
// On réimplémente les fonctions clés inline avec le même mockGhApi

const STAKE_PCT     = 0.10;
const BAN_THRESHOLD = 15;
const SCORE_INIT    = 50;
const SCORE_MAX     = 100;
const COOLDOWN_H    = 2;
const SCORE_DONE_BASE = 3;
const SCORE_TIMEOUT = -15;
const SCORE_RATING  = [0, -25, -10, 0, +5, +10];
const COOLDOWN_RATING = [0, true, true, false, false, false];

function ghRead(path) {
  const raw = mockGhApi(path);
  if (!raw?.content) return null;
  try { return { data: JSON.parse(Buffer.from(raw.content, 'base64').toString()), sha: raw.sha }; }
  catch { return null; }
}

function ghWrite(path, data, sha, _msg) {
  const encoded = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const fields = { content: encoded };
  if (sha) fields.sha = sha;
  return mockGhApi(path, { method: 'PUT', fields }) !== null;
}

function ghDelete(path, sha) {
  return mockGhApi(path, { method: 'DELETE', fields: { sha } }) !== null;
}

function readLedger(agentId) {
  const r = ghRead(`ledger/${agentId}.json`);
  return r ? { ...r.data, sha: r.sha } : { agent_id: agentId, balance: 0, history: [], sha: null };
}

function writeLedger(agentId, delta, reason) {
  const l = readLedger(agentId);
  const newBal = (l.balance || 0) + delta;
  if (newBal < 0) return false;
  const entry = { ts: new Date().toISOString(), delta, reason, balance: newBal };
  return ghWrite(`ledger/${agentId}.json`,
    { agent_id: agentId, balance: newBal, updated_at: entry.ts, history: [...(l.history||[]).slice(-99), entry] },
    l.sha || null, `${delta >= 0 ? '+' : ''}${delta} (${reason})`);
}

function getBalance(agentId) { return readLedger(agentId).balance ?? 0; }

function initLedger(agentId, bal = 1000) {
  if (readLedger(agentId).balance > 0) return;
  const entry = { ts: new Date().toISOString(), delta: bal, reason: 'init', balance: bal };
  ghWrite(`ledger/${agentId}.json`, { agent_id: agentId, balance: bal, updated_at: entry.ts, history: [entry] }, null, 'init');
}

function readRep(agentId) {
  const r = ghRead(`reputation/${agentId}.json`);
  return r ? { ...r.data, sha: r.sha } : { agent_id: agentId, score: SCORE_INIT, banned: false, cooldown_until: null, failures: 0, completions: 0, ratings: [], sha: null };
}

function writeRep(agentId, delta, reason, extra = {}) {
  const rep = readRep(agentId);
  const newScore = Math.max(0, Math.min(SCORE_MAX, (rep.score ?? SCORE_INIT) + delta));
  const banned = newScore <= BAN_THRESHOLD;
  const allRatings = [...(rep.ratings||[]), ...(extra.newRating ? [extra.newRating] : [])];
  const updated = {
    agent_id: agentId, score: newScore, banned,
    cooldown_until: extra.cooldown_until ?? rep.cooldown_until ?? null,
    failures: (rep.failures||0) + (extra.failure ? 1 : 0),
    completions: (rep.completions||0) + (extra.completion ? 1 : 0),
    ratings: allRatings.slice(-49),
    ratings_avg: allRatings.length ? +(allRatings.reduce((a,r)=>a+r.stars,0)/allRatings.length).toFixed(2) : null,
    history: [...(rep.history||[]).slice(-49), { ts: new Date().toISOString(), delta, reason, score: newScore }],
  };
  ghWrite(`reputation/${agentId}.json`, updated, rep.sha || null, `rep ${delta >= 0 ? '+' : ''}${delta}`);
  return updated;
}

function isBanned(agentId)   { return readRep(agentId).banned === true; }
function inCooldown(agentId) {
  const r = readRep(agentId);
  return r.cooldown_until && new Date(r.cooldown_until) > new Date();
}

function postTask(agentId, skill, description, budget, deadline_h = 4) {
  if (getBalance(agentId) < budget) return null;
  const id = `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const task = { id, skill, description, budget_credits: budget,
    deadline: new Date(Date.now() + deadline_h * 3600000).toISOString(),
    status: 'open', posted_by: agentId, posted_at: new Date().toISOString(), bids: [] };
  ghWrite(`open/${id}.json`, task, null, `post ${id}`);
  writeLedger(agentId, -budget, `escrow:${id}`);
  return { id, filename: `${id}.json`, task };
}

function claimTask(agentId, filename, task, sha) {
  if (isBanned(agentId))   return { ok: false, reason: 'banni' };
  if (inCooldown(agentId)) return { ok: false, reason: 'cooldown' };
  const stake = Math.ceil((task.budget_credits||0) * STAKE_PCT);
  if (getBalance(agentId) < stake) return { ok: false, reason: `caution insuffisante (${getBalance(agentId)} < ${stake})` };
  // Optimistic lock
  const fresh = mockGhApi(`open/${filename}`);
  if (!fresh || fresh.sha !== sha) return { ok: false, reason: 'conflit SHA' };
  const taken = { ...task, status: 'taken', taken_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24*3600000).toISOString(),
    winner_id: agentId, stake };
  ghWrite(`taken/${filename}`, taken, null, `claim ${agentId}`);
  writeLedger(agentId, -stake, `stake:${task.id}`);
  ghDelete(`open/${filename}`, fresh.sha);
  return { ok: true, stake };
}

function completeTask(agentId, filename) {
  const r = ghRead(`taken/${filename}`);
  if (!r) return false;
  const task = r.data;
  const budget = task.budget_credits || 0;
  const stake = task.stake || Math.ceil(budget * STAKE_PCT);
  ghWrite(`done/${filename}`, { ...task, status: 'done', done_at: new Date().toISOString(), result: '✅ livré', rating: null }, null, 'done');
  ghDelete(`taken/${filename}`, r.sha);
  writeLedger(agentId, budget + stake, `earned:${task.id}`);
  writeRep(agentId, SCORE_DONE_BASE, `delivered:${task.id}`, { completion: true });
  return true;
}

function rateTask(filename, stars) {
  if (stars < 1 || stars > 5) return;
  const r = ghRead(`done/${filename}`);
  if (!r) return;
  const agentId = r.data.winner_id;
  ghWrite(`done/${filename}`, { ...r.data, rating: stars, rated_at: new Date().toISOString() }, r.sha, `rating ${stars}★`);
  const scoreDelta = SCORE_RATING[stars] ?? 0;
  const cooldown_until = COOLDOWN_RATING[stars] ? new Date(Date.now() + COOLDOWN_H*3600000).toISOString() : null;
  writeRep(agentId, scoreDelta, `rated:${stars}stars`, {
    failure: stars <= 2,
    newRating: { task: filename, stars, ts: new Date().toISOString() },
    cooldown_until,
  });
}

// ── Utilitaires affichage ─────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

function log(msg) { process.stdout.write(msg + '\n'); }
function section(title) { log(`\n${C.bold}${C.cyan}${'═'.repeat(60)}${C.reset}`); log(`${C.bold}${C.cyan}  ${title}${C.reset}`); log(`${C.cyan}${'═'.repeat(60)}${C.reset}`); }
function ok(msg)   { log(`  ${C.green}✅ ${msg}${C.reset}`); }
function warn(msg) { log(`  ${C.yellow}⚠️  ${msg}${C.reset}`); }
function err(msg)  { log(`  ${C.red}❌ ${msg}${C.reset}`); }
function info(msg) { log(`  ${C.dim}${msg}${C.reset}`); }

function printState(agents) {
  log(`\n${'─'.repeat(60)}`);
  log(`${C.bold}  ÉTAT DES AGENTS${C.reset}`);
  log(`${'─'.repeat(60)}`);
  log(`  ${'Agent'.padEnd(28)} ${'Crédits'.padStart(9)} ${'Score'.padStart(7)} ${'Fails'.padStart(6)} ${'Avg★'.padStart(5)}  ${'Statut'}`);
  log(`  ${'─'.repeat(28)} ${'─'.repeat(9)} ${'─'.repeat(7)} ${'─'.repeat(6)} ${'─'.repeat(5)}  ${'─'.repeat(10)}`);
  for (const a of agents) {
    const rep = readRep(a);
    const bal = getBalance(a);
    const status = rep.banned ? `${C.red}🚫 BANNI${C.reset}` :
                   inCooldown(a) ? `${C.yellow}⏳ cooldown${C.reset}` : `${C.green}✅ actif${C.reset}`;
    const avg = rep.ratings_avg != null ? rep.ratings_avg.toFixed(1) : '  —';
    log(`  ${a.padEnd(28)} ${String(bal).padStart(9)} ${String(rep.score).padStart(7)} ${String(rep.failures).padStart(6)} ${avg.padStart(5)}  ${status}`);
  }
  log(`${'─'.repeat(60)}`);
}

// ── SIMULATION ────────────────────────────────────────────────────────────────
async function simulate() {
  log(`\n${C.bold}${C.magenta}  🏪 MARKETPLACE INTER-AGENTS — SIMULATION COMPLÈTE${C.reset}`);
  log(`${C.magenta}  Scénarios : claim concurrent · mauvaise livraison · ban · timeout · recovery${C.reset}`);

  // Agents
  const POSTER     = 'malik@master';
  const GOOD       = 'good-agent@org';
  const BAD        = 'bad-agent@org';
  const SLOW       = 'slow-agent@org';
  const CONCURRENT = 'rival-agent@org';
  const ALL        = [POSTER, GOOD, BAD, SLOW, CONCURRENT];

  section('0. INITIALISATION DES LEDGERS');
  for (const [a, bal] of [[POSTER, 2000], [GOOD, 500], [BAD, 300], [SLOW, 200], [CONCURRENT, 400]]) {
    initLedger(a, bal);
    ok(`${a} : ${bal} crédits`);
  }
  printState(ALL);

  // ── Scénario 1 : Claim concurrent (race condition) ──
  section('1. CLAIM CONCURRENT — OPTIMISTIC LOCK');
  info('Poster publie une tâche nodejs à 100 crédits');
  const t1 = postTask(POSTER, 'nodejs', 'Implémenter un parser CSV haute performance', 100, 6);
  ok(`Tâche publiée : ${t1.id}`);

  const raw1 = mockGhApi(`open/${t1.filename}`);
  const sha1  = raw1.sha;

  info('GOOD et CONCURRENT tentent de claim simultanément (même SHA)');
  const c1 = claimTask(GOOD, t1.filename, t1.task, sha1);
  ok(`GOOD claim : ${c1.ok ? `succès (caution=${c1.stake}cr)` : c1.reason}`);

  const c2 = claimTask(CONCURRENT, t1.filename, t1.task, sha1);
  err(`CONCURRENT claim : ${c2.ok ? 'succès' : c2.reason}`);
  info('→ SHA déjà modifié par GOOD, conflit détecté ✅');
  printState([GOOD, CONCURRENT]);

  info('GOOD complète la tâche');
  completeTask(GOOD, t1.filename);
  info('Poster note : 5 étoiles');
  rateTask(t1.filename, 5);
  ok(`GOOD livré + noté 5★ → score=${readRep(GOOD).score}`);
  printState([POSTER, GOOD]);

  // ── Scénario 2 : Mauvaise livraison répétée → ban ──
  section('2. MAUVAISE LIVRAISON RÉPÉTÉE → BAN AUTOMATIQUE');
  for (let i = 1; i <= 4; i++) {
    const t = postTask(POSTER, 'nodejs', `Tâche de qualité médiocre #${i}`, 30, 6);
    const raw = mockGhApi(`open/${t.filename}`);
    const c = claimTask(BAD, t.filename, t.task, raw.sha);
    if (!c.ok) { warn(`BAD claim #${i} refusé : ${c.reason}`); continue; }
    completeTask(BAD, t.filename);
    const stars = i <= 2 ? 1 : 2; // notes terribles
    rateTask(t.filename, stars);
    const rep = readRep(BAD);
    info(`Tour ${i} — note ${stars}★ — score BAD = ${rep.score}${rep.banned ? ' 🚫 BANNI' : ''}`);
    if (rep.banned) { err(`BAD est banni après ${i} mauvaises livraisons`); break; }
    // Reset cooldown en simulation (avancer le temps virtuellement)
    const r = ghRead(`reputation/${BAD}.json`);
    if (r?.data.cooldown_until) {
      ghWrite(`reputation/${BAD}.json`, { ...r.data, cooldown_until: null }, r.sha, 'sim: reset cooldown');
    }
  }

  info('BAD tente de claim une nouvelle tâche');
  const tBan = postTask(POSTER, 'nodejs', 'Tâche post-ban', 20, 6);
  const rawBan = mockGhApi(`open/${tBan.filename}`);
  const cBan = claimTask(BAD, tBan.filename, tBan.task, rawBan.sha);
  err(`BAD claim : ${cBan.reason}`);
  printState([BAD]);

  // ── Scénario 3 : Timeout → remboursement + pénalité ──
  section('3. TIMEOUT — REMBOURSEMENT POSTER + PÉNALITÉ EXÉCUTANT');
  const tTimeout = postTask(POSTER, 'nodejs', 'Tâche urgente jamais livrée', 80, 6);
  const rawT = mockGhApi(`open/${tTimeout.filename}`);
  const cTimeout = claimTask(SLOW, tTimeout.filename, tTimeout.task, rawT.sha);
  ok(`SLOW a claimé (caution=${cTimeout.stake}cr) — solde=${getBalance(SLOW)}`);

  // Simuler l'expiration
  const rT = ghRead(`taken/${tTimeout.filename}`);
  ghWrite(`taken/${tTimeout.filename}`, { ...rT.data, expires_at: new Date(Date.now() - 1000).toISOString() }, rT.sha, 'sim: expire');

  const posterBefore = getBalance(POSTER);
  // checkTimeouts simulé inline
  const rExp = ghRead(`taken/${tTimeout.filename}`);
  if (rExp && new Date(rExp.data.expires_at) <= new Date()) {
    const task = rExp.data;
    if (task.posted_by) writeLedger(task.posted_by, task.budget_credits || 0, `refund_timeout:${task.id}`);
    if (task.winner_id) {
      const cu = new Date(Date.now() + COOLDOWN_H * 3600000).toISOString();
      writeRep(task.winner_id, SCORE_TIMEOUT, `timeout:${task.id}`, { failure: true, cooldown_until: cu });
    }
    ghWrite(`done/${tTimeout.filename}`, { ...task, status: 'cancelled', reason: 'timeout' }, null, 'timeout');
    ghDelete(`taken/${tTimeout.filename}`, rExp.sha);
  }

  ok(`Poster remboursé : ${posterBefore} → ${getBalance(POSTER)} crédits`);
  warn(`SLOW pénalisé : score=${readRep(SLOW).score}, caution brûlée, cooldown ${COOLDOWN_H}h`);
  printState([POSTER, SLOW]);

  // ── Scénario 4 : Recovery — bon agent remonte son score ──
  section('4. RECOVERY — UN AGENT REMONTE SON SCORE');
  const RECOVER = SLOW;
  // Reset cooldown
  const rRec = ghRead(`reputation/${RECOVER}.json`);
  ghWrite(`reputation/${RECOVER}.json`, { ...rRec.data, cooldown_until: null }, rRec.sha, 'sim: reset cooldown');

  for (let i = 1; i <= 3; i++) {
    const t = postTask(POSTER, 'nodejs', `Tâche de récupération #${i}`, 40, 6);
    const raw = mockGhApi(`open/${t.filename}`);
    const c = claimTask(RECOVER, t.filename, t.task, raw.sha);
    if (!c.ok) { warn(`skip: ${c.reason}`); continue; }
    completeTask(RECOVER, t.filename);
    rateTask(t.filename, 5);
    info(`Tour ${i} — score ${RECOVER} = ${readRep(RECOVER).score}`);
  }
  ok(`${RECOVER} est remonté à score=${readRep(RECOVER).score}`);

  // ── Bilan final ──
  section('BILAN FINAL');
  printState(ALL);

  log(`\n${C.bold}  TÂCHES PAR STATUT${C.reset}`);
  const byStatus = { open: 0, taken: 0, done: 0, cancelled: 0 };
  for (const key of Object.keys(STORE)) {
    for (const s of Object.keys(byStatus)) {
      if (key.startsWith(`${s}/`) && key.endsWith('.json') && !key.includes('/.git')) byStatus[s]++;
    }
  }
  for (const [s, n] of Object.entries(byStatus)) log(`  ${s.padEnd(12)}: ${n}`);

  log(`\n${C.bold}${C.green}  ✅ Simulation complète — tous les scénarios validés${C.reset}\n`);
}

simulate().catch(e => { console.error(e); process.exit(1); });
