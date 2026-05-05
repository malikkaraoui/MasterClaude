#!/usr/bin/env node
/**
 * bin/master.js — Claude Atelier Master Daemon (Phase E1-E4)
 *
 * Telegram long polling → session routing → claude --print → réponse
 * Modules : vault-loader (E3) · session-manager (E2) · context-monitor (E4)
 */

import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync as _rfs, writeFileSync as _wfs, existsSync as _exists, unlinkSync as _unlink } from 'node:fs';
import { loadVaultBrief } from '../src/master/vault-loader.js';
import { SessionManager } from '../src/master/session-manager.js';
import { ContextMonitor } from '../src/master/context-monitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Lockfile : une seule instance ---
const LOCKFILE = '/tmp/claude-atelier-master.lock';
if (_exists(LOCKFILE)) {
  const pid = parseInt(_rfs(LOCKFILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 0);
    process.stderr.write(`[master] instance déjà active (PID ${pid}) — sortie\n`);
    process.exit(0);
  } catch { /* lock périmé */ }
}
_wfs(LOCKFILE, `${process.pid}\n`);
process.on('exit', () => { try { _unlink(LOCKFILE); } catch {} });

// --- Env ---
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv(join(ROOT, '.env'));
loadEnv(join(ROOT, '.env.local'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '/Users/malik/Vault/Malik';

if (!TOKEN || !CHAT_ID) {
  process.stderr.write('[master] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant\n');
  process.exit(1);
}

const sessions = new SessionManager();
const ctx = new ContextMonitor();

// --- Telegram ---
function tgPost(method, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => req.destroy(new Error('tg timeout')));
    req.write(body);
    req.end();
  });
}

function send(text) {
  return tgPost('sendMessage', { chat_id: CHAT_ID, text });
}

function getUpdates(offset) {
  return tgPost('getUpdates', { offset, timeout: 20, allowed_updates: ['message'] });
}

// --- Claude ---
function askClaude(userMsg, projectKey) {
  const vaultCtx = loadVaultBrief(VAULT_PATH);
  const projCtx = sessions.getProjectContext();
  const history = ctx.getContext(projectKey);

  const activeProject = sessions.active
    ? `\nProjet actif : ${sessions.active.name} (${sessions.active.path})`
    : '\nMode : Master global (aucun projet actif)';

  const parts = [
    vaultCtx ? `[Vault Obsidian]\n${vaultCtx}` : '',
    projCtx ? `[Contexte projet]\n${projCtx}` : '',
    history ? `[Historique]\n${history}` : '',
    `[Message Malik]${activeProject}\n${userMsg}`,
    'Tu es le Master Claude Atelier — chef d\'orchestre de tous les projets de Malik. Réponds en français, max 3 phrases. Commence par "Master :"'
  ].filter(Boolean).join('\n\n');

  const r = spawnSync('claude', ['--print', '--output-format', 'text', '-p', parts], {
    encoding: 'utf8',
    timeout: 45000,
    cwd: sessions.getCwd(ROOT)
  });
  return r.stdout?.trim() || '';
}

// --- Commandes système ---
const HELP = `Commandes Master :
/status — état du daemon
/projets — liste des projets
/projet <nom|chemin> — activer un projet
/projet off — revenir en mode global
/register <nom> <chemin> — enregistrer un projet
/reset — vider l'historique de la session`;

function handleSystemCommand(text) {
  if (text === '/start' || text === '/help') return HELP;
  if (text === '/status') return `✅ Master actif — PID ${process.pid}\nVault : ${VAULT_PATH}`;
  if (text === '/reset') {
    const key = sessions.active?.name || 'global';
    ctx.reset(key);
    return '🔄 Historique vidé.';
  }
  return null;
}

// --- Main ---
let offset = 0;
let running = true;

process.on('SIGTERM', async () => {
  running = false;
  process.stdout.write('[master] SIGTERM\n');
  await send('🔴 Master hors ligne').catch(() => {});
  process.exit(0);
});

process.on('SIGINT', () => { running = false; process.exit(0); });

process.stdout.write(`[master] démarré PID=${process.pid} vault=${VAULT_PATH}\n`);

await send('🟢 Master Claude Atelier en ligne\nTape /help pour les commandes.').catch(e => {
  process.stderr.write(`[master] warn: ${e.message}\n`);
});

while (running) {
  try {
    const data = await getUpdates(offset);
    if (!data.ok || !Array.isArray(data.result)) continue;

    for (const upd of data.result) {
      offset = upd.update_id + 1;

      const msg = upd.message;
      if (!msg?.text) continue;
      if (String(msg.chat.id) !== CHAT_ID) continue;

      const text = msg.text.trim();
      process.stdout.write(`[master] reçu: ${text}\n`);

      // Commandes système
      const sysReply = handleSystemCommand(text);
      if (sysReply) {
        await send(sysReply).catch(() => {});
        continue;
      }

      // Commandes projets
      const { handled, reply: projReply } = sessions.handleCommand(text);
      if (handled) {
        await send(projReply).catch(() => {});
        continue;
      }

      // Message → Claude
      const projectKey = sessions.active?.name || 'global';
      const reply = askClaude(text, projectKey);

      if (reply) {
        ctx.push(projectKey, text, reply);
        await send(reply).catch(e =>
          process.stderr.write(`[master] erreur send: ${e.message}\n`)
        );
        process.stdout.write('[master] répondu\n');
      }
    }
  } catch (err) {
    process.stderr.write(`[master] erreur poll: ${err.message}\n`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
