/**
 * window-registry.js — Registre des fenêtres Terminal gérées par MasterClaude
 *
 * Cycle : register → send → checkDone → readWindow → markIdle
 * Persisté dans /tmp/masterclaude-windows.json (perdu au reboot, intentionnel)
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTRY_PATH = join(tmpdir(), 'masterclaude-windows.json');

function load() {
  if (!existsSync(REGISTRY_PATH)) return { windows: [] };
  try { return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return { windows: [] }; }
}

function save(db) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(db, null, 2));
}

/** Exécute un script AppleScript depuis un fichier tmp (évite injection shell) */
function runAppleScript(script) {
  const tmpFile = join(tmpdir(), `mc-osa-${Date.now()}.scpt`);
  writeFileSync(tmpFile, script);
  const r = spawnSync('osascript', [tmpFile], { encoding: 'utf8' });
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
  return r;
}

/** Enregistre ou met à jour une fenêtre Terminal */
export function registerWindow({ windowId, project, path: projPath, task }) {
  const db = load();
  const existing = db.windows.findIndex(w => w.windowId === windowId);
  const entry = {
    windowId,
    project,
    path: projPath,
    task: task ?? '',
    status: 'idle',
    lastCheck: new Date().toISOString(),
    lastOutput: '',
  };
  if (existing >= 0) db.windows[existing] = { ...db.windows[existing], ...entry };
  else db.windows.push(entry);
  save(db);
  return entry;
}

/**
 * Envoie un texte dans une fenêtre Terminal + appuie sur Return.
 * Le texte transite par un fichier tmp lu par AppleScript (pas d'injection shell).
 */
export function sendToWindow(windowId, text) {
  const textFile = join(tmpdir(), `mc-input-${Date.now()}.txt`);
  writeFileSync(textFile, text, 'utf8');

  const script = `
set inputText to read POSIX file "${textFile}"
tell application "Terminal"
  activate
  set index of window id ${windowId} to 1
  delay 0.3
end tell
tell application "System Events"
  tell process "Terminal"
    keystroke inputText
    delay 0.1
    keystroke return
  end tell
end tell
  `;
  runAppleScript(script);
  try { unlinkSync(textFile); } catch { /* ignore */ }

  const db = load();
  const w = db.windows.find(w => w.windowId === windowId);
  if (w) {
    w.status = 'running';
    w.task = text.slice(0, 80);
    w.lastCheck = new Date().toISOString();
    save(db);
  }
}

/** Lit le contenu brut d'une fenêtre Terminal via AppleScript */
export function readWindow(windowId) {
  const script = `tell application "Terminal" to get contents of tab 1 of window id ${windowId}`;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  return r.stdout ?? '';
}

/**
 * Vérifie si le prompt Claude Code est revenu (prompt "ù " en fin de contenu).
 * Met à jour le statut dans le registre et retourne true si terminé.
 */
export function checkDone(windowId) {
  const output = readWindow(windowId);
  const done = /❯\s*$/.test(output.trimEnd());

  const db = load();
  const w = db.windows.find(w => w.windowId === windowId);
  if (w) {
    w.lastCheck = new Date().toISOString();
    w.lastOutput = output.slice(-2000);
    if (done && w.status === 'running') w.status = 'done';
    save(db);
  }
  return done;
}

/** Retourne l'état complet du registre */
export function listWindows() {
  return load().windows;
}

/** Marque une fenêtre comme idle (prête pour une nouvelle tâche) */
export function markIdle(windowId) {
  const db = load();
  const w = db.windows.find(w => w.windowId === windowId);
  if (w) {
    w.status = 'idle';
    save(db);
  }
}
