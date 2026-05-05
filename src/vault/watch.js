/**
 * src/vault/watch.js — Module watcher incrémental vault
 * Polling: détecte changements dans vault/ et déclenche update/graph partiel
 * Exports: watchOnce(), watchStatus()
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';;
import { createHash } from 'node:crypto';;

const WATCH_CONFIG_FILE = '.peter/watch.json';
const EVENTS_FILE = '.peter/events.jsonl';

function nowIso() {
  return new Date().toISOString();
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function appendEvent(path, event) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(event) + '\n', { flag: 'a', encoding: 'utf8' });
}

function hashFilesInDir(dirPath, recursively = true, depth = 0) {
  if (!existsSync(dirPath)) return null;
  if (depth > 5) return null; // limit depth to avoid huge dirs
  const fileHashes = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      // skip .peter subdirectory
      if (entry.isDirectory() && entry.name === '.peter') continue;
      if (entry.isFile()) {
        try {
          const content = readFileSync(full, 'utf8');
          const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
          fileHashes.push(`${entry.name}:${hash}`);
        } catch {
          // unreadable file, skip
        }
      } else if (entry.isDirectory() && recursively) {
        const subHash = hashFilesInDir(full, true, depth + 1);
        if (subHash) fileHashes.push(`${entry.name}/*:${subHash}`);
      }
    }
  } catch {
    return null;
  }
  const combined = fileHashes.sort().join('|');
  return createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

function buildManifest(vaultPath) {
  return {
    ts: nowIso(),
    filesHash: hashFilesInDir(vaultPath),
  };
}

function detectChanges(oldManifest, newManifest) {
  if (!oldManifest || !newManifest) return { changed: true, reason: 'no-manifest' };
  if (oldManifest.filesHash !== newManifest.filesHash) {
    return { changed: true, reason: 'files-modified' };
  }
  return { changed: false, reason: 'no-changes' };
}

function collectChangedFiles(vaultPath, oldManifest, newManifest) {
  const changed = [];
  if (!existsSync(vaultPath)) return changed;

  // Simple: rescan all files in vault/ and compare timestamps
  // For a more sophisticated approach, would need persistent file records
  try {
    const entries = readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.peter') continue;
      const full = join(vaultPath, entry.name);
      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const stat = statSync(full);
          const mtime = Math.floor(stat.mtimeMs);
          changed.push({ path: entry.name, mtime, type: 'file' });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return changed;
}

/**
 * Synchrone : exécute un seul cycle de watch
 * Retourne { ok, elapsed, changedFiles, graph, update } ou { ok: false, error }
 */
export function watchOnce(vaultPath, updateFn, graphFn) {
  const start = Date.now();

  if (!existsSync(vaultPath)) {
    return { ok: false, error: 'vault absent', elapsed: 0 };
  }

  const statePath = join(vaultPath, '.peter', 'state.json');
  const state = readJson(statePath, {});
  const oldManifest = state.lastWatchManifest;
  const newManifest = buildManifest(vaultPath);
  const detection = detectChanges(oldManifest, newManifest);

  if (!detection.changed) {
    return {
      ok: true,
      elapsed: Date.now() - start,
      changedFiles: [],
      detection: detection.reason,
    };
  }

  // Fichiers changés
  const changedFiles = collectChangedFiles(vaultPath, oldManifest, newManifest);

  // Exécute update (si fourni)
  let updateResult = null;
  if (updateFn && typeof updateFn === 'function') {
    try {
      updateResult = updateFn();
      if (!updateResult?.ok) {
        return {
          ok: false,
          error: 'update échouée',
          elapsed: Date.now() - start,
          update: updateResult,
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `update exception: ${err.message}`,
        elapsed: Date.now() - start,
      };
    }
  }

  // Exécute graph rebuild partiel (si fourni)
  let graphResult = null;
  if (graphFn && typeof graphFn === 'function') {
    try {
      graphResult = graphFn();
      if (!graphResult?.ok) {
        return {
          ok: true,
          elapsed: Date.now() - start,
          changedFiles,
          update: updateResult,
          graph: { ok: false, error: 'graph échouée' },
        };
      }
    } catch (err) {
      return {
        ok: true,
        elapsed: Date.now() - start,
        changedFiles,
        update: updateResult,
        graph: { ok: false, error: `graph exception: ${err.message}` },
      };
    }
  }

  // Sauvegarde manifest pour le prochain cycle
  state.lastWatchManifest = newManifest;
  state.lastWatchCycle = {
    ts: nowIso(),
    elapsed: Date.now() - start,
    changedCount: changedFiles.length,
    updateOk: !!updateResult?.ok,
    graphOk: !!graphResult?.ok,
  };
  writeJson(statePath, state);

  // Append event
  const eventsPath = join(vaultPath, EVENTS_FILE);
  appendEvent(eventsPath, {
    event: 'watch_cycle',
    ts: nowIso(),
    elapsed: Date.now() - start,
    changedFiles: changedFiles.map(f => f.path),
    changedCount: changedFiles.length,
    updateOk: !!updateResult?.ok,
    graphOk: !!graphResult?.ok,
    detection: detection.reason,
  });

  return {
    ok: true,
    elapsed: Date.now() - start,
    changedFiles,
    update: updateResult,
    graph: graphResult,
  };
}

/**
 * Daemon: polling loop — ne terminer que sur SIGTERM
 */
export function watchLoop(vaultPath, intervalSec, updateFn, graphFn) {
  const watchJson = join(vaultPath, WATCH_CONFIG_FILE);
  const eventsPath = join(vaultPath, EVENTS_FILE);

  // Enregistre son PID
  const config = {
    pid: process.pid,
    startedAt: nowIso(),
    interval: intervalSec,
    version: 1,
  };
  writeJson(watchJson, config);

  let timer = null;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    try {
      if (existsSync(watchJson)) writeFileSync(watchJson, JSON.stringify({ ...config, stoppedAt: nowIso() }) + '\n', 'utf8');
    } catch {}
  };

  const tick = () => {
    const result = watchOnce(vaultPath, updateFn, graphFn);
    if (result.ok && result.changedFiles?.length > 0) {
      process.stderr.write(`[VAULT-WATCH] ${result.changedFiles.length} fichier(s) changé(s), elapsed: ${result.elapsed}ms\n`);
    }
    timer = setTimeout(tick, intervalSec * 1000);
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

  tick();
}

/**
 * Retourne status du watch actuellement actif
 */
export function watchStatus(vaultPath) {
  const watchJson = join(vaultPath, WATCH_CONFIG_FILE);
  if (!existsSync(watchJson)) {
    return { active: false, pid: null, startedAt: null, interval: null, stoppedAt: null };
  }

  const config = readJson(watchJson, {});
  let pidActive = false;
  if (config.pid && typeof config.pid === 'number') {
    try {
      process.kill(config.pid, 0); // check only, don't kill
      pidActive = true;
    } catch {
      pidActive = false;
    }
  }

  return {
    active: pidActive,
    pid: config.pid ?? null,
    startedAt: config.startedAt ?? null,
    interval: config.interval ?? null,
    stoppedAt: config.stoppedAt ?? null,
  };
}
