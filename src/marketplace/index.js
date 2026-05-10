// src/marketplace/index.js — Marketplace inter-agents v2
// Anti-abus · Réputation · Escrow · Rating · Timeout · Ban automatique

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// ── Config env ───────────────────────────────────────────────────────────────
export const REPO       = process.env.MARKETPLACE_REPO     || 'malikkaraoui/atelier-marketplace';
export const AGENT_ID   = process.env.MARKETPLACE_AGENT_ID || 'masterclaude@malik';
export const POLL_SEC   = parseInt(process.env.MARKETPLACE_POLL_SEC   || '300', 10);
export const MIN_BUDGET = parseInt(process.env.MARKETPLACE_MIN_BUDGET || '10',  10);
export const MAX_HOURS  = parseInt(process.env.MARKETPLACE_MAX_HOURS  || '24',  10);

// ── Constantes système ───────────────────────────────────────────────────────
const STAKE_PCT       = 0.10;  // Caution : 10% du budget bloqués à la prise
const BAN_THRESHOLD   = 15;    // Score ≤ 15 → banni définitivement
const SCORE_INIT      = 50;    // Score de départ tout nouvel agent
const SCORE_MAX       = 100;
const COOLDOWN_H      = 2;     // Cooldown après mauvaise note ou échec
const MAX_CLAIMS_H    = 5;     // Anti-spam : max 5 claims/heure/agent
const TIMEOUT_H       = 24;    // Expiration auto si taken non livré
const SCORE_DONE_BASE = +3;    // Bonus juste pour avoir livré
const SCORE_TIMEOUT   = -15;   // Pénalité timeout
// Index = nb d'étoiles (1-5)
const SCORE_RATING    = [0, -25, -10, 0, +5, +10];
const COOLDOWN_RATING = [0, true, true, false, false, false]; // cooldown si 1 ou 2★

// ── Cache session ────────────────────────────────────────────────────────────
const _claimedThisSession = new Set();
const _rateWindowMap      = new Map(); // agentId → timestamps[] pour rate-limiting

// ── Transport GitHub ─────────────────────────────────────────────────────────
function ghApi(path, opts = {}) {
  const args = ['api', `repos/${REPO}/contents/${path}`];
  if (opts.method) args.push('-X', opts.method);
  if (opts.fields) for (const [k, v] of Object.entries(opts.fields)) args.push('-f', `${k}=${v}`);
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function ghRead(path) {
  const raw = ghApi(path);
  if (!raw?.content) return null;
  try {
    return { data: JSON.parse(Buffer.from(raw.content, 'base64').toString()), sha: raw.sha };
  } catch { return null; }
}

function ghWrite(path, data, sha, message) {
  const encoded = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const fields = { message, content: encoded };
  if (sha) fields.sha = sha;
  return ghApi(path, { method: 'PUT', fields }) !== null;
}

function ghDelete(path, sha, message) {
  return ghApi(path, { method: 'DELETE', fields: { message, sha } }) !== null;
}

// ── IDs uniques ───────────────────────────────────────────────────────────────
export function generateTaskId() {
  return `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

// ── Ledger (crédits) ──────────────────────────────────────────────────────────
function _readLedger(agentId) {
  const r = ghRead(`ledger/${agentId}.json`);
  if (!r) return { agent_id: agentId, balance: 0, history: [], sha: null };
  return { ...r.data, sha: r.sha };
}

function _writeLedger(agentId, delta, reason) {
  const ledger = _readLedger(agentId);
  const newBalance = (ledger.balance || 0) + delta;
  if (newBalance < 0) {
    process.stdout.write(`[ledger] ❌ solde insuffisant ${agentId} (${ledger.balance} < ${-delta})\n`);
    return false;
  }
  const entry = { ts: new Date().toISOString(), delta, reason, balance: newBalance };
  const updated = {
    agent_id: agentId,
    balance: newBalance,
    updated_at: entry.ts,
    history: [...(ledger.history || []).slice(-99), entry],
  };
  const ok = ghWrite(`ledger/${agentId}.json`, updated, ledger.sha || null,
    `ledger: ${delta >= 0 ? '+' : ''}${delta} (${reason}) → ${newBalance}`);
  if (ok) process.stdout.write(`[ledger] ${agentId}: ${delta >= 0 ? '+' : ''}${delta} (${reason}) → ${newBalance} crédits\n`);
  return ok;
}

export function getBalance(agentId = AGENT_ID) {
  return _readLedger(agentId).balance ?? 0;
}

export function initLedger(agentId = AGENT_ID, initialBalance = 1000) {
  if (ghApi(`ledger/${agentId}.json`)?.content) return false;
  const data = {
    agent_id: agentId,
    balance: initialBalance,
    updated_at: new Date().toISOString(),
    history: [{ ts: new Date().toISOString(), delta: initialBalance, reason: 'init', balance: initialBalance }],
  };
  const ok = ghWrite(`ledger/${agentId}.json`, data, null, `ledger: init ${agentId} (${initialBalance} crédits)`);
  if (ok) process.stdout.write(`[ledger] ✅ ${agentId} initialisé — ${initialBalance} crédits\n`);
  return ok;
}

// ── Réputation ────────────────────────────────────────────────────────────────
function _readRep(agentId) {
  const r = ghRead(`reputation/${agentId}.json`);
  if (!r) return {
    agent_id: agentId, score: SCORE_INIT, banned: false,
    cooldown_until: null, failures: 0, completions: 0, ratings_avg: null,
    ratings: [], history: [], sha: null,
  };
  return { ...r.data, sha: r.sha };
}

function _writeRep(agentId, delta, reason, extra = {}) {
  const rep = _readRep(agentId);
  const newScore = Math.max(0, Math.min(SCORE_MAX, (rep.score ?? SCORE_INIT) + delta));
  const banned = newScore <= BAN_THRESHOLD;

  const allRatings = [...(rep.ratings || []), ...(extra.newRating ? [extra.newRating] : [])];
  const ratingsAvg = allRatings.length
    ? +(allRatings.reduce((a, r) => a + r.stars, 0) / allRatings.length).toFixed(2)
    : null;

  const updated = {
    agent_id: agentId,
    score: newScore,
    banned,
    cooldown_until: extra.cooldown_until ?? rep.cooldown_until ?? null,
    failures: (rep.failures || 0) + (extra.failure ? 1 : 0),
    completions: (rep.completions || 0) + (extra.completion ? 1 : 0),
    ratings_avg: ratingsAvg,
    ratings: allRatings.slice(-49),
    updated_at: new Date().toISOString(),
    history: [...(rep.history || []).slice(-49), { ts: new Date().toISOString(), delta, reason, score: newScore }],
  };

  ghWrite(`reputation/${agentId}.json`, updated, rep.sha || null,
    `rep: ${agentId} ${delta >= 0 ? '+' : ''}${delta} (${reason}) → ${newScore}${banned ? ' 🚫BAN' : ''}`);

  if (banned && !rep.banned) {
    process.stdout.write(`[marketplace] 🚫 BAN : ${agentId} (score=${newScore}, failures=${updated.failures})\n`);
  }
  return updated;
}

export function getReputation(agentId = AGENT_ID) {
  const r = _readRep(agentId);
  return { score: r.score, banned: r.banned, cooldown_until: r.cooldown_until,
           failures: r.failures, completions: r.completions, ratings_avg: r.ratings_avg };
}

export function isAgentBanned(agentId = AGENT_ID) {
  return _readRep(agentId).banned === true;
}

function _isInCooldown(agentId) {
  const rep = _readRep(agentId);
  if (!rep.cooldown_until) return false;
  return new Date(rep.cooldown_until) > new Date();
}

function _checkRateLimit(agentId) {
  const now = Date.now();
  const times = (_rateWindowMap.get(agentId) || []).filter(t => now - t < 3600000);
  if (times.length >= MAX_CLAIMS_H) return false;
  _rateWindowMap.set(agentId, [...times, now]);
  return true;
}

// ── Publier une tâche ─────────────────────────────────────────────────────────
export function postTask({ skill, description, budget_credits, deadline_hours = 4, context = '', posted_by = AGENT_ID }) {
  // Vérif que le poster a les crédits
  if (getBalance(posted_by) < budget_credits) {
    process.stdout.write(`[marketplace] ❌ solde insuffisant pour poster (${getBalance(posted_by)} < ${budget_credits})\n`);
    return null;
  }
  const id = generateTaskId();
  const task = {
    id,
    skill,
    description,
    budget_credits,
    deadline: new Date(Date.now() + deadline_hours * 3600000).toISOString(),
    status: 'open',
    posted_by,
    posted_at: new Date().toISOString(),
    context: context || null,
    bids: [],
    _v: 2,
  };
  if (!ghWrite(`open/${id}.json`, task, null, `post: ${id} (${skill}, ${budget_credits}cr)`)) return null;
  if (!_writeLedger(posted_by, -budget_credits, `escrow:${id}`)) {
    // Compensation : supprimer la tâche publiée si l'escrow échoue
    const pub = ghApi(`open/${id}.json`);
    if (pub?.sha) ghDelete(`open/${id}.json`, pub.sha, `rollback escrow:${id}`);
    return null;
  }
  process.stdout.write(`[marketplace] 📋 tâche publiée : ${id} (${skill}, ${budget_credits} crédits)\n`);
  return { id, filename: `${id}.json`, task };
}

// ── Claim ─────────────────────────────────────────────────────────────────────
function _claim(filename, announcement, sha) {
  const agentId = AGENT_ID;

  if (isAgentBanned(agentId))    { process.stdout.write(`[marketplace] 🚫 banni — claim refusé\n`); return false; }
  if (_isInCooldown(agentId))    { process.stdout.write(`[marketplace] ⏳ cooldown actif — skip\n`); return false; }
  if (!_checkRateLimit(agentId)) { process.stdout.write(`[marketplace] 🚦 rate limit ${MAX_CLAIMS_H}/h atteint\n`); return false; }

  const stake = Math.ceil((announcement.budget_credits || 0) * STAKE_PCT);
  if (getBalance(agentId) < stake) {
    process.stdout.write(`[marketplace] ❌ caution insuffisante : ${getBalance(agentId)} < ${stake}\n`);
    return false;
  }

  // Optimistic locking : vérifier SHA avant tout
  const fresh = ghApi(`open/${filename}`);
  if (!fresh || fresh.sha !== sha) {
    process.stdout.write(`[marketplace] ⚡ conflit SHA ${filename} — déjà pris par un concurrent\n`);
    return false;
  }

  const taken = {
    ...announcement,
    status: 'taken',
    taken_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + TIMEOUT_H * 3600000).toISOString(),
    winner_id: agentId,
    stake,
    bids: [...(announcement.bids || []), { agent_id: agentId, bid_at: new Date().toISOString(), stake, accepted: true }],
    _v: 2,
  };

  if (!ghWrite(`taken/${filename}`, taken, null, `claim: ${filename} by ${agentId}`)) return false;
  if (!_writeLedger(agentId, -stake, `stake:${announcement.id}`)) {
    // Rollback : supprimer taken/ si le débit de caution échoue
    const t = ghApi(`taken/${filename}`);
    if (t?.sha) ghDelete(`taken/${filename}`, t.sha, `rollback stake:${filename}`);
    return false;
  }
  if (!ghDelete(`open/${filename}`, fresh.sha, `open→taken: ${filename}`)) {
    // open/ non supprimé : les agents verront conflit SHA sur le prochain claim (taken/ existe déjà)
    process.stdout.write(`[marketplace] ⚠️  open/${filename} non supprimé — conflit SHA protège l'exclusivité\n`);
  }
  return { stake };
}

// ── Complétion ────────────────────────────────────────────────────────────────
export function completeAnnouncement(filename, takenContent, _tSha, result) {
  const existing = ghRead(`taken/${filename}`);
  const tSha = existing?.sha || _tSha;
  const agentId = takenContent.winner_id || AGENT_ID;
  const budget = takenContent.budget_credits || 0;
  const stake = takenContent.stake || Math.ceil(budget * STAKE_PCT);

  const done = { ...takenContent, status: 'done', done_at: new Date().toISOString(), result: result || '(aucun résultat)', rating: null, _v: 2 };
  ghWrite(`done/${filename}`, done, null, `done: ${filename} by ${agentId}`);
  if (tSha) ghDelete(`taken/${filename}`, tSha, `taken→done: ${filename}`);

  // Rembourser caution + créditer budget
  _writeLedger(agentId, budget + stake, `earned:${takenContent.id}`);
  // Score de base pour toute livraison
  _writeRep(agentId, SCORE_DONE_BASE, `delivered:${takenContent.id}`, { completion: true });

  process.stdout.write(`[marketplace] ✅ livraison ${filename} — ${agentId} +${budget + stake} crédits\n`);
}

// ── Rating (poster note l'exécutant après done/) ──────────────────────────────
export function rateTask(filename, stars, ratedBy = 'poster') {
  if (stars < 1 || stars > 5) { process.stdout.write(`[marketplace] ❌ note invalide (1-5 requis)\n`); return false; }

  const r = ghRead(`done/${filename}`);
  if (!r) { process.stdout.write(`[marketplace] ❌ done/${filename} introuvable\n`); return false; }
  if (r.data.rating !== null && r.data.rating !== undefined) {
    process.stdout.write(`[marketplace] ⚠️ tâche déjà notée (${r.data.rating}★)\n`); return false;
  }

  const agentId = r.data.winner_id;
  const scoreDelta = SCORE_RATING[stars] ?? 0;
  const needCooldown = COOLDOWN_RATING[stars] === true;
  const cooldown_until = needCooldown ? new Date(Date.now() + COOLDOWN_H * 3600000).toISOString() : null;

  ghWrite(`done/${filename}`, { ...r.data, rating: stars, rated_by: ratedBy, rated_at: new Date().toISOString() },
    r.sha, `rating: ${stars}★ pour ${agentId} sur ${filename}`);

  _writeRep(agentId, scoreDelta, `rated:${stars}stars`, {
    failure: stars <= 2,
    newRating: { task: filename, stars, ts: new Date().toISOString() },
    cooldown_until,
  });

  const icon = stars >= 4 ? '⭐' : stars === 3 ? '🆗' : '⚠️';
  process.stdout.write(`[marketplace] ${icon} ${stars}★ pour ${agentId}${needCooldown ? ` → cooldown ${COOLDOWN_H}h` : ''}\n`);
  return true;
}

// ── Timeout : scanner taken/ pour tâches expirées ─────────────────────────────
export function checkTimeouts() {
  const files = ghApi('taken');
  if (!Array.isArray(files)) return 0;
  const now = new Date();
  let count = 0;

  for (const f of files) {
    if (!f.name.endsWith('.json') || f.name.startsWith('.')) continue;
    const r = ghRead(`taken/${f.name}`);
    if (!r?.data?.expires_at) continue;
    if (new Date(r.data.expires_at) > now) continue;

    const task = r.data;
    process.stdout.write(`[marketplace] ⏰ timeout : ${f.name} (winner=${task.winner_id})\n`);

    // Rembourser l'escrow au poster
    if (task.posted_by) _writeLedger(task.posted_by, task.budget_credits || 0, `refund_timeout:${task.id}`);

    // Brûler la caution de l'exécutant + pénalité réputation + cooldown
    if (task.winner_id) {
      const cooldown_until = new Date(Date.now() + COOLDOWN_H * 3600000).toISOString();
      _writeRep(task.winner_id, SCORE_TIMEOUT, `timeout:${task.id}`, { failure: true, cooldown_until });
    }

    const cancelled = { ...task, status: 'cancelled', cancelled_at: now.toISOString(), reason: 'timeout', _v: 2 };
    ghWrite(`done/${f.name}`, cancelled, null, `timeout→cancelled: ${f.name}`);
    ghDelete(`taken/${f.name}`, r.sha, `timeout: remove taken/${f.name}`);
    _claimedThisSession.delete(f.name);
    count++;
  }
  return count;
}

// ── Skills + open/ ────────────────────────────────────────────────────────────
function _fetchAgentSkills() {
  const raw = ghApi('skills/registry.json');
  if (!raw?.content) return [];
  try {
    const reg = JSON.parse(Buffer.from(raw.content, 'base64').toString());
    const agent = reg.agents?.[AGENT_ID];
    if (!agent?.available) return [];
    return agent.skills || [];
  } catch { return []; }
}

function _isMatch(ann, skills) {
  if (!ann.skill || !skills.includes(ann.skill)) return false;
  if ((ann.budget_credits ?? 0) < MIN_BUDGET) return false;
  if (ann.deadline) {
    const h = (new Date(ann.deadline) - Date.now()) / 3600000;
    if (h < 1 || h > MAX_HOURS) return false;
  }
  return true;
}

// ── Poll principal ────────────────────────────────────────────────────────────
export async function poll(readSessionSignal) {
  if (readSessionSignal?.().valid) {
    process.stdout.write('[marketplace] session active — skip poll\n');
    return null;
  }

  // Timeouts à chaque poll
  const expired = checkTimeouts();
  if (expired > 0) process.stdout.write(`[marketplace] ⏰ ${expired} tâche(s) expirée(s)\n`);

  if (isAgentBanned()) { process.stdout.write(`[marketplace] 🚫 agent banni — poll arrêté\n`); return null; }
  if (_isInCooldown(AGENT_ID)) { process.stdout.write(`[marketplace] ⏳ cooldown actif — skip\n`); return null; }

  const skills = _fetchAgentSkills();
  if (!skills.length) { process.stdout.write('[marketplace] skills vides ou agent inactif\n'); return null; }

  const openFiles = ghApi('open');
  if (!Array.isArray(openFiles) || !openFiles.length) {
    process.stdout.write('[marketplace] aucune annonce\n'); return null;
  }

  for (const f of openFiles) {
    if (!f.name.endsWith('.json') || f.name.startsWith('.')) continue;
    if (_claimedThisSession.has(f.name)) continue;

    const r = ghRead(`open/${f.name}`);
    if (!r) continue;
    const { data: ann, sha } = r;

    if (!_isMatch(ann, skills)) {
      process.stdout.write(`[marketplace] skip ${f.name} (skill=${ann.skill})\n`);
      continue;
    }

    process.stdout.write(`[marketplace] 🎯 match ${f.name} skill=${ann.skill} budget=${ann.budget_credits}\n`);
    const claimed = _claim(f.name, ann, sha);
    if (!claimed) continue;

    _claimedThisSession.add(f.name);
    return { claimed: true, filename: f.name, task: ann, stake: claimed.stake };
  }
  return null;
}

// ── Prompt pour session Claude ────────────────────────────────────────────────
export function buildTaskPrompt(task) {
  return `## Tâche Marketplace — ${task.id}

**Skill** : ${task.skill}
**Description** : ${task.description}
**Budget** : ${task.budget_credits} crédits
**Deadline** : ${task.deadline}
${task.context ? `**Contexte** :\n${task.context}\n` : ''}
Écris ton résultat dans : /tmp/marketplace-result-${task.id}.txt
Format : commence par "TÂCHE TERMINÉE" + résumé structuré.

⚠️ Ta réputation est en jeu : mauvaise livraison → note basse → cooldown → ban.
`;
}
