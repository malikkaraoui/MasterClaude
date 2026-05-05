import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FEATURES_REGISTRY_FILE = join(PACKAGE_ROOT, 'src', 'features-registry.json');

const DEFAULT_STATE = {
  _version: 1,
  lastSweepAt: null,
  penaltiesApplied: {},
  lastRelevantOffers: [],
  lastSummary: null,
};

const DEFAULT_LEDGER = {
  _version: 1,
  _updated: null,
  _description: 'Ledger de crédits par agent. Mis à jour automatiquement par GitHub Actions.',
  agents: {},
};

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function getFeatureDefault(registry, id, type) {
  if (type === 'feature') return registry.features?.[id]?.default ?? false;
  return registry.params?.[id]?.default;
}

function getFeatureValue(features, registry, id) {
  if (id in features) return features[id];
  return getFeatureDefault(registry, id, 'feature');
}

function getParamValue(features, registry, id) {
  if (features.params && id in features.params) return features.params[id];
  return getFeatureDefault(registry, id, 'param');
}

function clampPositiveInt(value, fallback, min = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.round(parsed));
}

function resolveRepoPath(root, configuredPath) {
  if (typeof configuredPath === 'string' && configuredPath.trim()) {
    return resolve(root, configuredPath.trim());
  }

  const sibling = resolve(root, '..', 'atelier-marketplace');
  if (existsSync(sibling)) return sibling;

  return '';
}

function hoursUntil(deadline, now) {
  const ts = Date.parse(deadline);
  if (!Number.isFinite(ts)) return Infinity;
  return (ts - now.getTime()) / (1000 * 60 * 60);
}

function ageSeconds(isoDate, now) {
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return Infinity;
  return (now.getTime() - ts) / 1000;
}

function shortenJobId(jobId) {
  return String(jobId ?? '').slice(0, 8) || 'unknown';
}

function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_STATE);
  return {
    _version: 1,
    lastSweepAt: typeof raw.lastSweepAt === 'string' ? raw.lastSweepAt : null,
    penaltiesApplied: raw.penaltiesApplied && typeof raw.penaltiesApplied === 'object' ? raw.penaltiesApplied : {},
    lastRelevantOffers: Array.isArray(raw.lastRelevantOffers) ? raw.lastRelevantOffers : [],
    lastSummary: raw.lastSummary && typeof raw.lastSummary === 'object' ? raw.lastSummary : null,
  };
}

function ensureAgentRecord(registry, agentId, nowIso) {
  if (!registry.agents || typeof registry.agents !== 'object') registry.agents = {};
  if (!registry.agents[agentId]) {
    registry.agents[agentId] = {
      joined: nowIso.slice(0, 10),
      credits: 0,
      skills: [],
      available: false,
      accepts: {
        min_budget: 0,
        max_deadline_hours: 0,
      },
    };
  }
  return registry.agents[agentId];
}

function refreshAgentPenalty(agent, nowIso, config, offerId) {
  const next = { ...agent };
  next.reputation = clampPositiveInt(next.reputation ?? 100, 100, -1000000) - config.spamPenalty;

  const spam = next.spam && typeof next.spam === 'object' ? { ...next.spam } : {};
  spam.score = clampPositiveInt(spam.score ?? 0, 0, 0) + 1;
  spam.soft_limit = config.spamSoftLimit;
  spam.last_penalty_at = nowIso;
  spam.last_reason = 'stale-open-offer';
  spam.last_offer_id = offerId;
  next.spam = spam;

  if (spam.score >= config.spamSoftLimit) {
    next.available = false;
  }

  return next;
}

function syncLedgerPenalty(ledger, agentId, agent, nowIso) {
  if (!ledger.agents || typeof ledger.agents !== 'object') ledger.agents = {};
  const current = ledger.agents[agentId] && typeof ledger.agents[agentId] === 'object'
    ? { ...ledger.agents[agentId] }
    : {};

  current.reputation = agent.reputation;
  current.spam_score = agent.spam?.score ?? 0;
  current.available = agent.available;
  current.stale_open_deleted = clampPositiveInt(current.stale_open_deleted ?? 0, 0, 0) + 1;
  current.last_penalty_at = nowIso;
  current.last_penalty_reason = 'stale-open-offer';

  ledger._updated = nowIso;
  ledger.agents[agentId] = current;
}

function listOpenAnnouncementFiles(repoPath) {
  const openDir = join(repoPath, 'open');
  if (!existsSync(openDir)) return [];

  return readdirSync(openDir)
    .filter(name => name.endsWith('.json'))
    .map(name => join(openDir, name))
    .sort();
}

function isOpportunityRelevant(offer, currentPulse, localAgent, now = new Date()) {
  if (!offer || typeof offer !== 'object') return false;
  if (!localAgent || typeof localAgent !== 'object') return false;

  const status = currentPulse?.status;
  if (status && !['off', 'idle', 'low'].includes(status)) return false;
  if (localAgent.available === false) return false;
  if (!Array.isArray(localAgent.skills) || !localAgent.skills.includes(offer.skill)) return false;

  const accepts = localAgent.accepts && typeof localAgent.accepts === 'object' ? localAgent.accepts : {};
  const minBudget = clampPositiveInt(accepts.min_budget ?? 0, 0, 0);
  const maxDeadlineHours = clampPositiveInt(accepts.max_deadline_hours ?? 0, 0, 0);

  if (!Number.isFinite(Number(offer.budget_credits)) || Number(offer.budget_credits) < minBudget) return false;
  if (maxDeadlineHours > 0 && hoursUntil(offer.deadline, now) > maxDeadlineHours) return false;
  if (hoursUntil(offer.deadline, now) <= 0) return false;

  return true;
}

function buildRelevantOffer(offer, filePath, now) {
  return {
    id: offer.id,
    file: filePath,
    posted_by: offer.posted_by,
    skill: offer.skill,
    budget_credits: offer.budget_credits,
    deadline: offer.deadline,
    age_sec: Math.max(0, Math.round(ageSeconds(offer.posted_at, now))),
  };
}

function runGit(repoPath, args) {
  return spawnSync('git', ['-C', repoPath, ...args], { stdio: 'pipe', encoding: 'utf8' });
}

function refreshGitCheckout(repoPath, stderr) {
  if (!existsSync(join(repoPath, '.git'))) return;

  const status = runGit(repoPath, ['status', '--porcelain']);
  if (status.status !== 0) return;
  if (status.stdout.trim()) {
    stderr?.write?.('[MARKETPLACE] checkout marketplace sale, pull auto ignoré\n');
    return;
  }

  const pull = runGit(repoPath, ['pull', '--ff-only']);
  if (pull.status !== 0) {
    const message = pull.stderr.trim() || pull.stdout.trim();
    stderr?.write?.(`[MARKETPLACE] pull marketplace ignoré: ${message}\n`);
  }
}

function commitMarketplaceCleanup(repoPath, changedFiles, message, stderr) {
  if (!existsSync(join(repoPath, '.git'))) return { committed: false, pushed: false };

  const add = runGit(repoPath, ['add', '-A', '--', ...changedFiles]);
  if (add.status !== 0) {
    stderr?.write?.(`[MARKETPLACE] add git échoué: ${(add.stderr || add.stdout).trim()}\n`);
    return { committed: false, pushed: false };
  }

  const staged = runGit(repoPath, ['diff', '--cached', '--quiet', '--']);
  if (staged.status === 0) return { committed: false, pushed: false };

  const commit = runGit(repoPath, ['commit', '--no-gpg-sign', '-m', message]);
  if (commit.status !== 0) {
    stderr?.write?.(`[MARKETPLACE] commit git échoué: ${(commit.stderr || commit.stdout).trim()}\n`);
    return { committed: false, pushed: false };
  }

  const push = runGit(repoPath, ['push']);
  if (push.status !== 0) {
    stderr?.write?.(`[MARKETPLACE] push git échoué: ${(push.stderr || push.stdout).trim()}\n`);
    return { committed: true, pushed: false };
  }

  return { committed: true, pushed: true };
}

export function loadMarketplaceWatcherConfig(root) {
  const features = readJson(join(root, '.claude', 'features.json'), {});
  const registry = readJson(FEATURES_REGISTRY_FILE, { features: {}, params: {} });

  return {
    enabled: !!getFeatureValue(features, registry, 'marketplace_watch'),
    agentId: String(getParamValue(features, registry, 'marketplace_agent_id') ?? '').trim(),
    repoPath: resolveRepoPath(root, String(getParamValue(features, registry, 'marketplace_repo_path') ?? '')),
    pollSec: clampPositiveInt(getParamValue(features, registry, 'marketplace_watch_poll_sec'), 15, 5),
    staleOpenSec: clampPositiveInt(getParamValue(features, registry, 'marketplace_stale_open_sec'), 120, 30),
    spamPenalty: clampPositiveInt(getParamValue(features, registry, 'marketplace_spam_penalty'), 5, 1),
    spamSoftLimit: clampPositiveInt(getParamValue(features, registry, 'marketplace_spam_soft_limit'), 3, 1),
  };
}

export function getMarketplaceStateFile(root) {
  return join(root, '.claude', 'marketplace', 'watch-state.json');
}

export function getMarketplaceWatcherPidFile(root) {
  const digest = createHash('sha1').update(resolve(root)).digest('hex').slice(0, 12);
  return `/tmp/claude-atelier-marketplace-watch-${digest}.pid`;
}

export function sweepMarketplaceOnce(options = {}) {
  const root = options.root ?? PACKAGE_ROOT;
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const stderr = options.stderr ?? process.stderr;
  const force = !!options.force;
  const config = options.config ?? loadMarketplaceWatcherConfig(root);

  if (!config.enabled) {
    return { enabled: false, skipped: true, reason: 'disabled' };
  }

  if (!config.repoPath || !existsSync(config.repoPath)) {
    return { enabled: true, skipped: true, reason: 'missing-marketplace-repo' };
  }

  const stateFile = options.stateFile ?? getMarketplaceStateFile(root);
  const state = cleanState(readJson(stateFile, DEFAULT_STATE));
  if (!force && state.lastSweepAt) {
    const elapsed = ageSeconds(state.lastSweepAt, now);
    if (elapsed < config.pollSec) {
      return {
        enabled: true,
        skipped: true,
        reason: 'throttled',
        nextSweepInSec: Math.max(0, Math.ceil(config.pollSec - elapsed)),
      };
    }
  }

  refreshGitCheckout(config.repoPath, stderr);

  const registryPath = join(config.repoPath, 'skills', 'registry.json');
  const ledgerPath = join(config.repoPath, 'ledger.json');
  const registry = readJson(registryPath, { _version: 1, agents: {}, skills_catalog: [] });
  const ledger = readJson(ledgerPath, DEFAULT_LEDGER);

  let agentId = options.currentAgentId ?? config.agentId;
  const agentIds = Object.keys(registry.agents ?? {});
  if (!agentId && agentIds.length === 1) {
    agentId = agentIds[0];
  }
  if (!agentId) {
    return { enabled: true, skipped: true, reason: 'missing-agent-id' };
  }

  const currentPulse = options.currentPulse ?? {};
  const relevantOffers = [];
  const deletedOwnOffers = [];
  const changedFiles = new Set();
  let registryChanged = false;
  let ledgerChanged = false;

  for (const filePath of listOpenAnnouncementFiles(config.repoPath)) {
    const offer = readJson(filePath, null);
    if (!offer || typeof offer !== 'object') continue;

    const isOwnOffer = offer.posted_by === agentId;
    const isStaleOpen = ageSeconds(offer.posted_at, now) >= config.staleOpenSec || hoursUntil(offer.deadline, now) <= 0;

    if (isOwnOffer && isStaleOpen) {
      const alreadyPenalized = !!state.penaltiesApplied[offer.id];
      rmSync(filePath, { force: true });
      changedFiles.add('open/' + filePath.split('/open/').pop());

      if (!alreadyPenalized) {
        const agent = ensureAgentRecord(registry, agentId, nowIso);
        registry.agents[agentId] = refreshAgentPenalty(agent, nowIso, config, offer.id);
        syncLedgerPenalty(ledger, agentId, registry.agents[agentId], nowIso);
        registryChanged = true;
        ledgerChanged = true;
        state.penaltiesApplied[offer.id] = {
          appliedAt: nowIso,
          reason: 'stale-open-offer',
          file: filePath,
        };
      }

      deletedOwnOffers.push({
        id: offer.id,
        file: filePath,
        posted_by: offer.posted_by,
        age_sec: Math.max(0, Math.round(ageSeconds(offer.posted_at, now))),
      });
      continue;
    }

    const localAgent = registry.agents?.[agentId];
    if (!isOwnOffer && isOpportunityRelevant(offer, currentPulse, localAgent, now)) {
      relevantOffers.push(buildRelevantOffer(offer, filePath, now));
    }
  }

  if (registryChanged) writeJson(registryPath, registry);
  if (ledgerChanged) writeJson(ledgerPath, ledger);

  let gitResult = { committed: false, pushed: false };
  if (deletedOwnOffers.length > 0) {
    const changedList = [...changedFiles];
    if (registryChanged) changedList.push('skills/registry.json');
    if (ledgerChanged) changedList.push('ledger.json');
    const message = `bot(marketplace): purge offres stale ${deletedOwnOffers.map(offer => shortenJobId(offer.id)).join(', ')}`;
    gitResult = commitMarketplaceCleanup(config.repoPath, changedList, message, stderr);
  }

  state.lastSweepAt = nowIso;
  state.lastRelevantOffers = relevantOffers;
  state.lastSummary = {
    scannedAt: nowIso,
    agentId,
    relevantCount: relevantOffers.length,
    deletedOwnCount: deletedOwnOffers.length,
    throttled: false,
    git: gitResult,
  };
  writeJson(stateFile, state);

  if (deletedOwnOffers.length > 0) {
    stderr?.write?.(`[MARKETPLACE] ${deletedOwnOffers.length} annonce(s) stale supprimée(s) pour ${agentId}\n`);
  }
  if (relevantOffers.length > 0) {
    stderr?.write?.(`[MARKETPLACE] ${relevantOffers.length} offre(s) pertinente(s) détectée(s) pour ${agentId}\n`);
  }

  return {
    enabled: true,
    skipped: false,
    agentId,
    relevantOffers,
    deletedOwnOffers,
    git: gitResult,
    stateFile,
    repoPath: config.repoPath,
  };
}

export function ensureMarketplaceWatch(options = {}) {
  const root = options.root ?? PACKAGE_ROOT;
  const config = options.config ?? loadMarketplaceWatcherConfig(root);
  if (!config.enabled) return { started: false, reason: 'disabled' };
  if (!config.repoPath || !existsSync(config.repoPath)) return { started: false, reason: 'missing-marketplace-repo' };

  const pidFile = getMarketplaceWatcherPidFile(root);
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return { started: false, reason: 'already-running', pid };
      } catch {
        unlinkSync(pidFile);
      }
    } else {
      unlinkSync(pidFile);
    }
  }

  const scriptPath = join(PACKAGE_ROOT, 'scripts', 'pulse-marketplace-watch.js');
  const child = spawn(process.execPath, [scriptPath, '--root', root], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { started: true, pid: child.pid };
}

export function stopMarketplaceWatch(options = {}) {
  const root = options.root ?? PACKAGE_ROOT;
  const pidFile = getMarketplaceWatcherPidFile(root);
  if (!existsSync(pidFile)) return { stopped: false, reason: 'not-running' };

  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  try {
    if (Number.isFinite(pid) && pid > 0) {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // noop
  }

  try { unlinkSync(pidFile); } catch {}
  return { stopped: true, pid };
}

export function runMarketplaceWatchLoop(options = {}) {
  const root = options.root ?? PACKAGE_ROOT;
  const pidFile = getMarketplaceWatcherPidFile(root);
  writeFileSync(pidFile, String(process.pid), 'utf8');

  let timer = null;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    try { unlinkSync(pidFile); } catch {}
  };

  const loop = () => {
    const config = loadMarketplaceWatcherConfig(root);
    if (!config.enabled) {
      cleanup();
      process.exit(0);
      return;
    }

    sweepMarketplaceOnce({
      root,
      force: true,
      currentPulse: options.currentPulseProvider ? options.currentPulseProvider() : {},
      stderr: options.stderr ?? process.stderr,
      config,
    });

    timer = setTimeout(loop, config.pollSec * 1000);
  };

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);

  loop();
}