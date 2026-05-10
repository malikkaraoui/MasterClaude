#!/usr/bin/env node
/**
 * scripts/pulse-watchdog.js — Superviseur d'agents
 *
 * Toutes les 2 min (LaunchAgent) :
 *   1. Scan tous les pouls.md
 *   2. CRASH = TTL expiré ET status != idle/off
 *   3. STALE = TTL * 10 expiré ET status == idle (nettoyage optionnel)
 *   4. Actions : Telegram alert + injection terminal via osascript
 *   5. Écrit un marqueur pour éviter les alertes répétées
 */

import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parsePoulsMd, ageSeconds, isExpired } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALERT_CACHE = '/tmp/masterclaude-pulse-watchdog-alerted.json';

// ---------- Helpers ----------

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

function loadAlertCache() {
  try { return JSON.parse(readFileSync(ALERT_CACHE, 'utf8')); }
  catch { return {}; }
}

function saveAlertCache(cache) {
  const tmp = ALERT_CACHE + '.tmp.' + process.pid;
  try {
    writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    renameSync(tmp, ALERT_CACHE);
  } catch { /* non bloquant */ }
}

// Envoie un message Telegram via l'API directement (FIFO peut être absent)
function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  spawnSync('curl', [
    '-s', '-X', 'POST',
    `https://api.telegram.org/bot${token}/sendMessage`,
    '-d', `chat_id=${chatId}&parse_mode=Markdown&text=${encodeURIComponent(text)}`,
  ], { timeout: 8000 });
}

// Cherche une fenêtre Terminal dont le répertoire courant contient cwd
// Retourne le numéro de tab/fenêtre ou null
function findTerminalTab(cwd) {
  if (!cwd) return null;

  const script = `
    set targetCwd to "${cwd}"
    set found to {}
    tell application "Terminal"
      repeat with w in windows
        repeat with t in tabs of w
          set tPwd to do shell script "lsof -p " & (id of processes of t as string) & " 2>/dev/null | awk '/cwd/{print $NF}' | head -1" with administrator privileges
          if tPwd contains targetCwd then
            set end of found to {windowIdx:index of w, tabIdx:index of t}
          end if
        end repeat
      end repeat
    end tell
    return found
  `;

  // Approche plus simple et fiable : chercher par titre de fenêtre
  const simplScript = `
    set results to ""
    tell application "Terminal"
      repeat with i from 1 to count of windows
        set w to window i
        repeat with j from 1 to count of tabs of w
          set t to tab j of w
          set tTitle to custom title of t
          set tBusy to busy of t
          set results to results & i & ":" & j & ":" & (tBusy as string) & ":" & tTitle & "\\n"
        end repeat
      end repeat
    end tell
    return results
  `;

  const r = spawnSync('osascript', ['-e', simplScript], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0 || !r.stdout) return null;

  // Cherche une ligne dont le titre contient le nom du projet (dernier segment du cwd)
  const projectName = cwd.split('/').pop();
  for (const line of r.stdout.trim().split('\n')) {
    const parts = line.split(':');
    if (parts.length >= 4 && parts[3].includes(projectName)) {
      return { window: parseInt(parts[0]), tab: parseInt(parts[1]) };
    }
  }
  return null;
}

// Injecte une commande dans un tab Terminal
function injectTerminal(tabInfo, command) {
  if (!tabInfo) return false;
  const script = `
    tell application "Terminal"
      set target to tab ${tabInfo.tab} of window ${tabInfo.window}
      do script "${command.replace(/"/g, '\\"')}" in target
    end tell
  `;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0;
}

// ---------- Analyse ----------

const files = findPoulsMdFiles(ROOT);
const cache = loadAlertCache();
const now = Date.now();

// Purge cache entrées > 1h
for (const key of Object.keys(cache)) {
  if (now - cache[key].ts > 3600000) delete cache[key];
}

for (const filePath of files) {
  let pouls;
  try { pouls = parsePoulsMd(filePath); }
  catch { continue; }
  if (!pouls) continue;

  const agentId = pouls.agent?.id ?? 'unknown';
  const status = pouls.status ?? 'off';
  const age = ageSeconds(pouls);
  const ttl = pouls.ttl ?? 300;
  const cwd = pouls.cwd ?? '';
  const name = pouls.agent?.name ?? agentId;

  const isCrashed = isExpired(pouls) && status !== 'idle' && status !== 'off';
  const isLongIdle = age > ttl * 10 && (status === 'idle' || status === 'off');

  // --- Crash détecté ---
  if (isCrashed) {
    const cacheKey = `crash:${agentId}`;

    // Déjà alerté dans les 10 dernières minutes → skip
    if (cache[cacheKey] && now - cache[cacheKey].ts < 600000) continue;

    const ageMin = Math.round(age / 60);
    const msg = `⚠️ *Agent planté détecté*\n\n` +
      `• Agent : \`${agentId}\`\n` +
      `• Dernier pouls : ${ageMin}min · statut bloqué : *${status}*\n` +
      `• TTL : ${ttl}s (dépassé de ${Math.round(age - ttl)}s)\n` +
      `• Projet : \`${cwd || '—'}\`\n\n` +
      `🔍 Tentative de récupération en cours…`;

    console.log(`[WATCHDOG] CRASH ${agentId} — age=${ageMin}min status=${status}`);
    sendTelegram(msg);

    cache[cacheKey] = { ts: now, status, age };

    // Marquer le pouls comme crashed pour éviter faux-positifs
    try {
      writePoulsMd(filePath, { ...pouls, status: 'idle' }, pouls._body);
    } catch { /* non bloquant */ }

    // Chercher et réinjecter dans le terminal
    if (cwd) {
      const tabInfo = findTerminalTab(cwd);
      if (tabInfo) {
        // Injection douce : entrée vide pour débloquer un prompt en attente
        const injected = injectTerminal(tabInfo, '');
        const injMsg = injected
          ? `✅ Terminal récupéré (fenêtre ${tabInfo.window}, tab ${tabInfo.tab})`
          : `❌ Terminal trouvé mais injection échouée`;
        console.log(`[WATCHDOG] ${injMsg}`);
        sendTelegram(injMsg);
      } else {
        sendTelegram(`❌ Aucun terminal Terminal.app trouvé pour \`${cwd}\`\nVérification manuelle requise.`);
      }
    }
    continue;
  }

  // --- Agent idle trop longtemps (stale) ---
  if (isLongIdle) {
    const cacheKey = `stale:${agentId}`;
    if (cache[cacheKey] && now - cache[cacheKey].ts < 3600000) continue;

    const ageH = Math.round(age / 360) / 10;
    console.log(`[WATCHDOG] STALE ${agentId} — idle depuis ${ageH}h`);
    sendTelegram(
      `💤 *Agent inactif depuis ${ageH}h*\n\`${agentId}\`\nPouls expiré — la session est probablement fermée.`
    );
    cache[cacheKey] = { ts: now };
    continue;
  }

  console.log(`[WATCHDOG] OK ${agentId} — status=${status} age=${Math.round(age)}s`);
}

saveAlertCache(cache);
