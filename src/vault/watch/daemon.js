// src/vault/watch/daemon.js — vault watch daemon management

import { watchOnce, watchStatus } from '../watch.js';
import { updateVault } from '../core/manifest.js';
import { graphVault } from '../graph/build.js';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = dirname(dirname(dirname(__dirname)));

function startVaultWatch(cwd, intervalSec = 30) {
  const vaultPath = join(cwd, 'vault');
  if (!existsSync(vaultPath)) {
    return { ok: false, error: 'vault n\'existe pas — `vault init` d\'abord' };
  }

  const watchJson = join(vaultPath, '.peter', 'watch.json');
  const status = watchStatus(vaultPath);
  if (status.active) {
    return { ok: false, error: `daemon déjà actif (PID ${status.pid})` };
  }

  // Spawn daemon detached
  const child = spawn(process.execPath, [join(PKG_ROOT, 'bin', 'vault-watch.js'), '--vault-path', vaultPath, '--interval', String(intervalSec)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Small delay to let daemon write watch.json
  let watchExists = false;
  for (let i = 0; i < 50; i++) {
    if (existsSync(watchJson)) {
      watchExists = true;
      break;
    }
    const start = Date.now();
    while (Date.now() - start < 20) {}
  }

  if (!watchExists) {
    return { ok: false, error: 'daemon lancé mais watch.json non écrit' };
  }

  const config = JSON.parse(readFileSync(watchJson, 'utf8'));
  return {
    ok: true,
    pid: config.pid,
    vaultPath,
    interval: config.interval,
    startedAt: config.startedAt,
  };
}

function stopVaultWatch(cwd) {
  const vaultPath = join(cwd, 'vault');
  const status = watchStatus(vaultPath);
  if (!status.active) {
    return { ok: false, error: 'aucun daemon watch actif' };
  }

  try {
    process.kill(status.pid, 'SIGTERM');
    const watchJson = join(vaultPath, '.peter', 'watch.json');
    if (existsSync(watchJson)) {
      unlinkSync(watchJson);
    }
    return { ok: true, pid: status.pid };
  } catch (err) {
    return { ok: false, error: `erreur lors de l'arrêt du daemon: ${err.message}` };
  }
}

function onceVaultWatch(cwd) {
  const vaultPath = join(cwd, 'vault');
  if (!existsSync(vaultPath)) {
    return { ok: false, error: 'vault n\'existe pas' };
  }

  const result = watchOnce(
    vaultPath,
    () => updateVault(cwd),
    () => graphVault(cwd),
  );
  return result;
}

export { startVaultWatch, stopVaultWatch, onceVaultWatch };
