#!/usr/bin/env node
/**
 * bin/telegram.js — Telegram bridge CLI
 *
 * Gère le service Telegram bridge (démarrage, arrêt, status, tests).
 *
 * Usage:
 *   npx claude-atelier telegram start   → démarre scripts/telegram-bridge.py en background
 *   npx claude-atelier telegram stop    → stoppe le processus via PID file
 *   npx claude-atelier telegram status  → vérifie si le bridge tourne
 *   npx claude-atelier telegram test    → valide prérequis (env vars, fichiers, python3)
 */

import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PID_FILE = '/tmp/claude-atelier-telegram.pid';

function logError(msg) {
  process.stderr.write(`[telegram] error: ${msg}\n`);
}

function logInfo(msg) {
  process.stdout.write(`[telegram] ${msg}\n`);
}

function readPidFile() {
  try {
    const content = readFileSync(PID_FILE, 'utf8').trim();
    return parseInt(content, 10);
  } catch {
    return null;
  }
}

function writePidFile(pid) {
  writeFileSync(PID_FILE, `${pid}\n`, 'utf8');
}

function removePidFile() {
  try {
    unlinkSync(PID_FILE);
  } catch {}
}

function processIsRunning(pid) {
  try {
    // kill(pid, 0) vérifie si le processus existe sans le signaler
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runStart() {
  // Vérifier d'abord les prérequis
  const testExit = runTest();
  if (testExit !== 0) {
    logError('prérequis non satisfaits. Exécutez "claude-atelier telegram test" pour diagnostiquer.');
    return 1;
  }

  // Vérifier si déjà running
  const existingPid = readPidFile();
  if (existingPid && processIsRunning(existingPid)) {
    logError(`bridge déjà en cours d'exécution (PID: ${existingPid})`);
    return 1;
  }

  // Démarrer le processus en background
  const bridgeScript = join(ROOT, 'scripts', 'telegram-bridge.py');
  const child = spawn('python3', [bridgeScript], {
    detached: true,
    stdio: 'ignore',
    cwd: ROOT
  });

  writePidFile(child.pid);
  logInfo(`Bridge démarré (PID: ${child.pid})`);

  // Détacher le processus du parent
  child.unref();
  return 0;
}

function runStop() {
  const pid = readPidFile();

  if (!pid) {
    logError('aucun PID file trouvé — bridge n\'est pas en cours d\'exécution');
    return 1;
  }

  if (!processIsRunning(pid)) {
    logError(`processus PID ${pid} n\'existe pas. Suppression du fichier PID.`);
    removePidFile();
    return 1;
  }

  try {
    process.kill(pid, 'SIGTERM');
    removePidFile();
    logInfo(`Bridge arrêté (PID: ${pid})`);
    return 0;
  } catch (err) {
    logError(`impossible d'arrêter le processus : ${err.message}`);
    return 1;
  }
}

function runStatus() {
  const pid = readPidFile();

  if (!pid) {
    logInfo('Bridge: arrêté (aucun PID file)');
    return 0;
  }

  if (processIsRunning(pid)) {
    logInfo(`Bridge: en cours d'exécution (PID: ${pid})`);
    return 0;
  } else {
    logInfo(`Bridge: arrêté (PID ${pid} n'existe plus)`);
    removePidFile();
    return 0;
  }
}

function runTest() {
  let errors = [];

  // Vérifier TELEGRAM_BOT_TOKEN
  const token = process.env.TELEGRAM_BOT_TOKEN ||
    (existsSync(join(ROOT, '.env')) ? tryReadEnvVar('.env', 'TELEGRAM_BOT_TOKEN') : null) ||
    (existsSync(join(ROOT, '.env.local')) ? tryReadEnvVar('.env.local', 'TELEGRAM_BOT_TOKEN') : null);

  if (!token) {
    errors.push('TELEGRAM_BOT_TOKEN non défini (vérifier .env, .env.local ou env var)');
  }

  // Vérifier que python3 est disponible
  const pythonCheck = spawnSync('python3', ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (pythonCheck.status !== 0) {
    errors.push('python3 non disponible');
  }

  // Vérifier que le script bridge existe
  const bridgeScript = join(ROOT, 'scripts', 'telegram-bridge.py');
  if (!existsSync(bridgeScript)) {
    errors.push(`scripts/telegram-bridge.py manquant à ${bridgeScript}`);
  }

  if (errors.length > 0) {
    logError('test échoué:');
    errors.forEach(e => logError(`  • ${e}`));
    return 1;
  }

  logInfo('test passé — tous prérequis OK');
  return 0;
}

function tryReadEnvVar(envFile, varName) {
  try {
    const content = readFileSync(join(ROOT, envFile), 'utf8');
    const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
  } catch {
    return null;
  }
}

async function main(argv) {
  const args = argv.slice(2);

  if (args.length === 0) {
    process.stderr.write(`usage: claude-atelier telegram <command>\n`);
    process.stderr.write(`commands: start, stop, status, test\n`);
    return 1;
  }

  const command = args[0];

  switch (command) {
    case 'start':
      return runStart();
    case 'stop':
      return runStop();
    case 'status':
      return runStatus();
    case 'test':
      return runTest();
    default:
      logError(`commande inconnue: ${command}`);
      return 1;
  }
}

main(process.argv).then(code => process.exit(code));
