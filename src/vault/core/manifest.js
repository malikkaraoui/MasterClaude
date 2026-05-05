// src/vault/core/manifest.js — vault manifest and state updates

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJsonIfExists, listChangedFilesSince, isProductChangePath, isWebsiteDocsPath, addMinutes, nowIso, shortSha, parseIgnoreFile, buildIgnoreMatcher, computeFileSHA256, walkDir, DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_PATTERNS } from './utils.js';
import { appendEvent } from './events.js';
import { loadState, saveState, saveCronConfig, loadCronConfig } from './state.js';

const MANIFEST_VERSION = 1;
const STATE_VERSION = 1;

function loadManifest(manifestPath) {

  if (!existsSync(manifestPath)) return null;

  try { return JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return null; }

}


function saveManifest(manifestPath, manifest) {

  mkdirSync(dirname(manifestPath), { recursive: true });

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

}


const MAILBOX_TEMPLATE = `# Mailbox projet\n\n> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.\n\n## Courrier entrant\n\nNotes, vocaux, captures, liens ou idées routés vers ce projet.\n\nFormat recommandé :\n\n### YYYY-MM-DD — Titre court\n\n- Source : note | vocal | capture | URL | YouTube | autre\n- Statut : nouveau | à challenger | à planifier | intégré | rejeté\n- Résumé :\n- Pourquoi ici :\n- Action proposée :\n`;

function ensureMailboxFile(vaultDir) {

  const mailboxPath = join(vaultDir, '10-mailbox.md');

  if (!existsSync(mailboxPath)) {

    writeFileSync(mailboxPath, MAILBOX_TEMPLATE, 'utf8');

  }

  return mailboxPath;

}


function appendMailboxAlerts(vaultDir, alerts, headSha) {

  if (!alerts.length) return { written: 0, mailboxPath: join(vaultDir, '10-mailbox.md') };

  const mailboxPath = ensureMailboxFile(vaultDir);

  let content = readFileSync(mailboxPath, 'utf8').trimEnd();

  const stamp = nowIso().slice(0, 16).replace('T', ' ');

  for (const alert of alerts) {

    const detailLine = alert.details?.length ? `\n- Détail : ${alert.details.join(', ')}` : '';

    const refLine = headSha ? `\n- Réf : ${alert.type}:${shortSha(headSha)}` : '';

    content += `\n\n### ${stamp} — Peter auto-maintenance\n\n- Source : Peter auto-maintenance\n- Statut : ${alert.status}\n- Résumé : ${alert.summary}\n- Pourquoi ici : ${alert.reason}\n- Action proposée : ${alert.action}${detailLine}${refLine}`;

  }

  writeFileSync(mailboxPath, content + '\n', 'utf8');

  return { written: alerts.length, mailboxPath };

}


function collectMaintenanceAlerts(cwd, previousHead, currentHead) {

  if (!previousHead) return { alerts: [], changedFiles: [], mode: 'baseline' };

  const changedFiles = listChangedFilesSince(cwd, previousHead, currentHead);

  if (!changedFiles.length) return { alerts: [], changedFiles, mode: 'no-change' };



  const productFiles = changedFiles.filter(isProductChangePath);

  const docsFiles = changedFiles.filter(isWebsiteDocsPath);

  const alerts = [];



  if (productFiles.length > 0 && docsFiles.length === 0) {

    alerts.push({

      type: 'stale-docs',

      status: 'à challenger',

      summary: `${productFiles.length} fichier(s) produit ont changé depuis ${shortSha(previousHead)} sans mise à jour de website/docs.`,

      reason: 'website/docs/ fait partie du périmètre Peter et doit refléter l’état réel du package public.',

      action: 'Mettre à jour website/docs puis relancer la boucle handoff/review.',

      details: productFiles.slice(0, 5),

    });

  }



  return { alerts, changedFiles, mode: 'diff' };

}


function updateCronHeartbeat(cwd, runAt) {

  const cronPath = join(cwd, 'vault', '.peter', 'cron.json');

  const cron = loadCronConfig(cronPath);

  if (!cron?.enabled || !Number.isFinite(cron.intervalMinutes)) return null;

  const updated = {

    ...cron,

    lastHeartbeat: runAt,

    lastRunAt: runAt,

    nextRunAt: addMinutes(runAt, cron.intervalMinutes),

    updatedAt: runAt,

  };

  saveCronConfig(cronPath, updated);

  return updated;

}


function updateVault(cwd) {

  const vaultDir = join(cwd, 'vault');

  if (!existsSync(vaultDir)) {

    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };

  }



  const manifestPath = join(vaultDir, 'index', 'manifest.json');

  const statePath = join(vaultDir, '.peter', 'state.json');

  const cachePath = join(vaultDir, '.peter', 'cache');



  mkdirSync(join(vaultDir, 'index'), { recursive: true });

  mkdirSync(cachePath, { recursive: true });



  const oldManifest = loadManifest(manifestPath);

  const oldByPath = new Map((oldManifest?.files ?? []).map(f => [f.path, f]));



  const ignorePatterns = [

    ...parseIgnoreFile(join(cwd, '.gitignore')),

    ...parseIgnoreFile(join(cwd, '.peterignore')),

    ...parseIgnoreFile(join(cwd, '.claudeignore')),

  ];

  // Exclure les répertoires internes de Peter (état, cache, sorties générées)

  const peterInternalDirs = ['vault/.peter', 'vault/index'];

  const isIgnored = buildIgnoreMatcher(ignorePatterns, peterInternalDirs);



  const now = new Date().toISOString();

  const files = [];

  let newCount = 0;

  let modCount = 0;

  let unchanged = 0;



  for (const relPath of walkDir(cwd, isIgnored)) {

    const absPath = join(cwd, relPath);

    let stat;

    try { stat = statSync(absPath); } catch { continue; }

    const mtime = stat.mtime.toISOString();

    const old = oldByPath.get(relPath);



    let sha256;

    if (old && old.mtime === mtime) {

      sha256 = old.sha256;

      unchanged++;

    } else {

      try { sha256 = computeFileSHA256(absPath); } catch { continue; }

      if (old) modCount++; else newCount++;

    }



    files.push({

      path: relPath,

      sha256,

      mtime,

      size: stat.size,

      ext: relPath.includes('.') ? '.' + relPath.split('.').pop() : '',

    });

  }



  const deletedCount = Math.max(0, (oldManifest?.fileCount ?? 0) - (files.length - newCount));



  const manifest = {

    version: MANIFEST_VERSION,

    generatedAt: now,

    root: cwd,

    fileCount: files.length,

    files,

  };

  saveManifest(manifestPath, manifest);



  const state = {

    version: STATE_VERSION,

    lastRun: now,

    lastCommand: 'update',

    needsUpdate: false,

    health: 'ok',

    fileCount: files.length,

    newFiles: newCount,

    modifiedFiles: modCount,

    unchangedFiles: unchanged,

    deletedFiles: deletedCount,

  };

  saveState(statePath, state);



  return {

    ok: true,

    manifestPath,

    statePath,

    cachePath,

    fileCount: files.length,

    newCount,

    modCount,

    unchanged,

    deletedCount,

    ignorePatternCount: ignorePatterns.length,

  };

}


export { loadManifest, saveManifest, ensureMailboxFile, appendMailboxAlerts, collectMaintenanceAlerts, updateCronHeartbeat, updateVault };
