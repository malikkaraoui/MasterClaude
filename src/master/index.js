/**
 * src/master/index.js — Contrôle du Master daemon (start/stop/status)
 * Utilisé par `claude-atelier master <sub>` via bin/cli.js
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const PID_FILE = '/tmp/claude-atelier-master.pid';
const DAEMON = join(ROOT, 'bin', 'master.js');
const LOG_DIR = `${process.env.HOME}/Library/Logs/claude-atelier`;

function log(msg) { process.stdout.write(`[master] ${msg}\n`); }
function err(msg) { process.stderr.write(`[master] error: ${msg}\n`); }

function readPid() {
  try { return parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10); }
  catch { return null; }
}

function isRunning(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    // Vérifier que c'est bien un process node (pas un PID recyclé)
    const r = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
    return r.stdout.trim().includes('node');
  } catch { return false; }
}

export async function runMaster(argv) {
  const sub = argv[3]; // claude-atelier master <sub>

  if (sub === 'start') {
    const pid = readPid();
    if (pid && isRunning(pid)) {
      err(`déjà actif (PID ${pid})`);
      return 1;
    }

    const child = spawn(process.execPath, [DAEMON], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });

    // Détecter un crash immédiat (lockfile persistant, erreur boot)
    let exited = false;
    child.on('exit', () => { exited = true; });
    child.on('error', e => { err(`spawn échoué: ${e.message}`); exited = true; });

    await new Promise(r => setTimeout(r, 250));

    if (exited) {
      err('daemon a quitté immédiatement — vérifier lockfile ou logs');
      return 1;
    }

    writeFileSync(PID_FILE, `${child.pid}\n`);
    child.unref();
    log(`démarré (PID ${child.pid})`);
    log(`logs: ${LOG_DIR}/master.log`);
    return 0;
  }

  if (sub === 'stop') {
    const pid = readPid();
    if (!pid || !isRunning(pid)) {
      err('master non actif');
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
      return 1;
    }
    process.kill(pid, 'SIGTERM');
    unlinkSync(PID_FILE);
    log(`arrêté (PID ${pid})`);
    return 0;
  }

  if (sub === 'restart') {
    runMaster([...argv.slice(0, 3), 'stop']);
    return runMaster([...argv.slice(0, 3), 'start']);
  }

  if (!sub || sub === 'status') {
    const pid = readPid();
    if (pid && isRunning(pid)) {
      log(`actif (PID ${pid})`);
    } else {
      log('arrêté');
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    }
    return 0;
  }

  err(`sous-commande inconnue: "${sub}". Usage: master <start|stop|restart|status>`);
  return 1;
}
