// src/marketplace/index.js — Marketplace inter-agents : polling + auto-bid + spawn session
//
// Flux : open/ → (skill match + idle) → taken/ → spawn Claude → done/ + ledger
// Transport : GitHub API via `gh` CLI (pas de clone local)
// Activation : MARKETPLACE_ENABLED=1 dans l'env du daemon

import { spawnSync } from 'node:child_process';

export const REPO       = process.env.MARKETPLACE_REPO     || 'malikkaraoui/atelier-marketplace';
export const AGENT_ID   = process.env.MARKETPLACE_AGENT_ID || 'masterclaude@malik';
export const POLL_SEC   = parseInt(process.env.MARKETPLACE_POLL_SEC   || '300', 10);
export const MIN_BUDGET = parseInt(process.env.MARKETPLACE_MIN_BUDGET || '10',  10);
export const MAX_HOURS  = parseInt(process.env.MARKETPLACE_MAX_HOURS  || '24',  10);

// Cache pour éviter de re-bidder un fichier déjà pris dans la même session
const _taken = new Set();

// ─── Ledger (offre/demande) ─────────────────────────────────────────────────

function getLedger(agentId) {
  const data = ghApi(`ledger/${agentId}.json`);
  if (!data?.content) return { balance: 0, history: [], sha: null };
  try {
    const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString());
    return { ...parsed, sha: data.sha };
  } catch { return { balance: 0, history: [], sha: null }; }
}

function updateBalance(agentId, delta, reason) {
  const ledger = getLedger(agentId);
  const newBalance = (ledger.balance || 0) + delta;
  if (newBalance < 0) {
    process.stdout.write(`[marketplace] solde insuffisant pour ${agentId} (${ledger.balance} < ${-delta})\n`);
    return false;
  }
  const entry = { ts: new Date().toISOString(), delta, reason, balance: newBalance };
  const updated = {
    agent_id: agentId,
    balance: newBalance,
    updated_at: entry.ts,
    history: [...(ledger.history || []).slice(-49), entry],
  };
  const encoded = Buffer.from(JSON.stringify(updated, null, 2)).toString('base64');
  const fields = {
    message: `ledger: ${delta >= 0 ? '+' : ''}${delta} crédits (${reason}) → ${newBalance}`,
    content: encoded,
  };
  if (ledger.sha) fields.sha = ledger.sha;
  const r = ghApi(`ledger/${agentId}.json`, { method: 'PUT', fields });
  if (!r) {
    process.stdout.write(`[marketplace] échec mise à jour ledger ${agentId}\n`);
    return false;
  }
  process.stdout.write(`[marketplace] ledger ${agentId} : ${delta >= 0 ? '+' : ''}${delta} (${reason}) → ${newBalance}\n`);
  return true;
}

export function getBalance(agentId = AGENT_ID) {
  const ledger = getLedger(agentId);
  return ledger.balance ?? 0;
}

export function initLedger(agentId = AGENT_ID, initialBalance = 1000) {
  const existing = ghApi(`ledger/${agentId}.json`);
  if (existing?.content) return false; // déjà initialisé
  const data = {
    agent_id: agentId,
    balance: initialBalance,
    updated_at: new Date().toISOString(),
    history: [{ ts: new Date().toISOString(), delta: initialBalance, reason: 'init', balance: initialBalance }],
  };
  const encoded = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  ghApi(`ledger/${agentId}.json`, {
    method: 'PUT',
    fields: { message: `ledger: init ${agentId} (${initialBalance} crédits)`, content: encoded },
  });
  return true;
}

function ghApi(path, opts = {}) {
  const args = ['api', `repos/${REPO}/contents/${path}`];
  if (opts.method) args.push('-X', opts.method);
  if (opts.fields) for (const [k, v] of Object.entries(opts.fields)) args.push('-f', `${k}=${v}`);
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function fetchAgentSkills() {
  const data = ghApi('skills/registry.json');
  if (!data?.content) return [];
  try {
    const registry = JSON.parse(Buffer.from(data.content, 'base64').toString());
    const agent = registry.agents?.[AGENT_ID];
    if (!agent?.available) return [];
    return agent.skills || [];
  } catch { return []; }
}

function fetchOpenAnnouncements() {
  const files = ghApi('open');
  if (!Array.isArray(files)) return [];
  return files.filter(f => f.name.endsWith('.json') && !f.name.startsWith('.'));
}

function fetchFileContent(filePath) {
  const data = ghApi(filePath);
  if (!data?.content) return null;
  try { return { content: JSON.parse(Buffer.from(data.content, 'base64').toString()), sha: data.sha }; }
  catch { return null; }
}

function claimAnnouncement(filename, announcement, sha) {
  // Optimistic locking : vérifier que personne n'a pris la tâche entre le GET et le claim
  const fresh = ghApi(`open/${filename}`);
  if (!fresh || fresh.sha !== sha) {
    process.stdout.write(`[marketplace] conflit SHA ${filename} — déjà pris par un autre agent\n`);
    return false;
  }

  const updated = {
    ...announcement,
    status: 'taken',
    taken_at: new Date().toISOString(),
    bids: [...(announcement.bids || []), {
      agent_id: AGENT_ID,
      bid_at: new Date().toISOString(),
      confidence: 90,
      accepted: true,
    }],
    winner_id: AGENT_ID,
    assigned_at: new Date().toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(updated, null, 2)).toString('base64');

  const create = ghApi(`taken/${filename}`, {
    method: 'PUT',
    fields: {
      message: `feat: bid task ${filename} (${AGENT_ID})`,
      content: encoded,
    },
  });
  if (!create) return false;

  // Bloquer les crédits du poster (débit escrow)
  const poster = announcement.posted_by;
  if (poster) updateBalance(poster, -(announcement.budget_credits || 0), `escrow:${filename}`);

  // DELETE avec le SHA frais — si 422, un autre agent a déjà supprimé (on ignore)
  ghApi(`open/${filename}`, {
    method: 'DELETE',
    fields: {
      message: `feat: remove from open — taken by ${AGENT_ID}`,
      sha: fresh.sha,
    },
  });
  return true;
}

export function completeAnnouncement(filename, takenContent, _tSha, result) {
  const done = {
    ...takenContent,
    status: 'done',
    done_at: new Date().toISOString(),
    result: result || '(aucun résultat)',
  };
  const encoded = Buffer.from(JSON.stringify(done, null, 2)).toString('base64');

  const existing = ghApi(`taken/${filename}`);
  const tSha = existing?.sha || _tSha;

  ghApi(`done/${filename}`, {
    method: 'PUT',
    fields: {
      message: `feat: task done ${filename} (${AGENT_ID})`,
      content: encoded,
    },
  });
  if (tSha) {
    ghApi(`taken/${filename}`, {
      method: 'DELETE',
      fields: { message: `feat: remove from taken — done`, sha: tSha },
    });
  }

  // Créditer l'exécutant
  const budget = takenContent.budget_credits || 0;
  if (budget > 0) updateBalance(AGENT_ID, budget, `task_done:${filename}`);
}

function isMatch(announcement, agentSkills) {
  const skill = announcement.skill;
  if (!skill || !agentSkills.includes(skill)) return false;
  if ((announcement.budget_credits ?? 0) < MIN_BUDGET) return false;
  if (announcement.deadline) {
    const hoursLeft = (new Date(announcement.deadline) - Date.now()) / 3600000;
    if (hoursLeft < 1 || hoursLeft > MAX_HOURS) return false;
  }
  return true;
}

// Appelé par master.js quand session idle.
// readSessionSignal : fonction de master.js passée en paramètre (évite couplage).
export async function poll(readSessionSignal) {
  if (readSessionSignal?.().valid) {
    process.stdout.write('[marketplace] session active — skip poll\n');
    return null;
  }

  const agentSkills = fetchAgentSkills();
  if (!agentSkills.length) {
    process.stdout.write('[marketplace] agent indisponible ou skills vides\n');
    return null;
  }

  const openFiles = fetchOpenAnnouncements();
  if (!openFiles.length) {
    process.stdout.write('[marketplace] aucune annonce dans open/\n');
    return null;
  }

  for (const file of openFiles) {
    if (_taken.has(file.name)) continue;

    const fetched = fetchFileContent(`open/${file.name}`);
    if (!fetched) continue;

    const { content: announcement, sha } = fetched;
    if (!isMatch(announcement, agentSkills)) {
      process.stdout.write(`[marketplace] skip ${file.name} skill=${announcement.skill}\n`);
      continue;
    }

    process.stdout.write(`[marketplace] match: ${file.name} skill=${announcement.skill} budget=${announcement.budget_credits}\n`);
    if (!claimAnnouncement(file.name, announcement, sha)) {
      process.stdout.write(`[marketplace] échec claim ${file.name}\n`);
      continue;
    }

    _taken.add(file.name);
    process.stdout.write(`[marketplace] tâche prise : ${file.name}\n`);
    return { claimed: true, filename: file.name, task: announcement };
  }

  return null;
}

export function buildTaskPrompt(task) {
  return `## Tâche Marketplace reçue automatiquement

**ID** : ${task.id || '(inconnu)'}
**Skill requis** : ${task.skill}
**Description** : ${task.description}
**Budget** : ${task.budget_credits} crédits
**Deadline** : ${task.deadline || 'non définie'}
${task.context ? `**Contexte additionnel** :\n${task.context}` : ''}

Accomplis cette tâche, puis écris ton résultat dans :
  /tmp/marketplace-result-${task.id || 'unknown'}.txt

Quand terminé, écris "TÂCHE TERMINÉE" + résumé dans ce fichier.
`;
}
