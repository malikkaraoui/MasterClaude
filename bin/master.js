#!/usr/bin/env node
/**
 * bin/master.js — Claude Atelier Master Daemon (Phase E1-E4)
 *
 * Telegram long polling → session routing → claude --print → réponse
 * Modules : vault-loader (E3) · session-manager (E2) · context-monitor (E4)
 */

import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync as _rfs, writeFileSync as _wfs, existsSync as _exists, unlinkSync as _unlink, mkdirSync as _mkdir } from 'node:fs';
import { loadVaultBrief } from '../src/master/vault-loader.js';
import { SessionManager } from '../src/master/session-manager.js';
import { MemoryStore } from '../src/master/memory-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Lockfile : une seule instance ---
const LOCKFILE = '/tmp/masterclaude-master.lock';
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

// Claude Code utilise OAuth Max plan — la clé API ne doit JAMAIS être héritée par les enfants
delete process.env.ANTHROPIC_API_KEY;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '/Users/malik/Vault/Malik';

if (!TOKEN || !CHAT_ID) {
  process.stderr.write('[master] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant\n');
  process.exit(1);
}

const sessions = new SessionManager();
const memory = new MemoryStore();

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

// --- Système prompt ---
function buildSystemPrompt() {
  const vaultCtx = loadVaultBrief(VAULT_PATH);
  const projCtx = sessions.getProjectContext();
  const activeProject = sessions.active
    ? `Projet actif : ${sessions.active.name} (${sessions.active.path})`
    : 'Mode : Master global (aucun projet actif)';

  return [
    'Tu es MasterClaude — assistant IA personnel de Malik, chef d\'orchestre de tous ses projets.',
    'Tu réponds en français, de façon directe et concise.',
    'IMPORTANT : Malik t\'écrit via Telegram (interface chat, pas un terminal). Tu ne dois JAMAIS lui demander de lancer une commande ou un script. Si tu as besoin d\'exécuter quelque chose pour répondre, tu le fais toi-même via tes outils et tu lui donnes directement le résultat.',
    'Tu peux lancer des actions sur les projets si demandé (spawn claude session).',
    activeProject,
    vaultCtx ? `[Vault Obsidian — contexte global]\n${vaultCtx}` : '',
    projCtx ? `[Contexte projet actif]\n${projCtx}` : '',
  ].filter(Boolean).join('\n\n');
}

// Session globale = ROOT (CLAUDE.md + hooks actifs = vraie session projet)
// Sessions projet = répertoire du projet concerné
function getSessionDir(projectKey) {
  if (projectKey === 'global') return ROOT;
  const dir = join(ROOT, 'sessions', projectKey.replace(/[^a-z0-9_-]/gi, '_'));
  _mkdir(dir, { recursive: true });
  return dir;
}

// --- Git natif (zéro délégation à Claude) ---
function gitRun(...args) {
  const r = spawnSync(args[0], args.slice(1), { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  return ((r.stdout || '') + (r.stderr || '')).trim();
}

function handleGitCommand(text) {
  const t = text.trim();
  if (/^\/?(git\s+)?status$/i.test(t) || t === '/gs') {
    const out = gitRun('git', 'status', '--short') || '✅ Working tree propre';
    const branch = gitRun('git', 'branch', '--show-current');
    const log = gitRun('git', 'log', '--oneline', '-3');
    return `🌿 ${branch}\n${out}\n\n${log}`;
  }
  if (/^\/?(git\s+)?log$/i.test(t) || t === '/gl') {
    return gitRun('git', 'log', '--oneline', '-10');
  }
  if (/^\/?(git\s+)?diff$/i.test(t)) {
    return gitRun('git', 'diff', '--stat') || '✅ Pas de diff';
  }
  const commitMatch = t.match(/^\/?(git\s+)?commit\s+(.+)$/i);
  if (commitMatch) {
    gitRun('git', 'add', '-A');
    return gitRun('git', 'commit', '-m', commitMatch[2].trim());
  }
  if (/^\/?(git\s+)?push$/i.test(t)) {
    const r = spawnSync('bash', ['scripts/pre-push-gate.sh'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const gate = ((r.stdout || '') + (r.stderr || '')).trim();
    if (!gate.includes('GATE PASSEE')) return `🚫 Gate échouée :\n${gate.slice(0, 400)}`;
    return gitRun('git', 'push');
  }
  return null;
}

// --- Appel claude CLI — RAG memory (top-K échanges pertinents) + --continue ---
async function askClaude(userMsg, projectKey) {
  const sessionDir = getSessionDir(projectKey);
  const system = buildSystemPrompt();
  const relevant = await memory.retrieve(projectKey, userMsg);
  if (relevant) {
    process.stdout.write(`[memory] ${relevant.length} chars injectés (key=${projectKey})\n`);
  }
  const prompt = relevant
    ? `${system}\n\n[Mémoire pertinente]\n${relevant}\n\n${userMsg}`
    : `${system}\n\n${userMsg}`;
  const args = ['--print', '--output-format', 'text', '--dangerously-skip-permissions', '--continue', '-p', prompt];
  const childEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY; // Claude Code utilise OAuth Max plan, pas la clé API

  // Ack immédiat si la réponse tarde (> 8s)
  let ackSent = false;
  const ackTimer = setTimeout(async () => {
    ackSent = true;
    await send('⚙️ Je traite, ça prend un moment…').catch(() => {});
  }, 8000);

  // Heartbeat toutes les 30s — s'arrête à 280s pour éviter race avec timeout 300s
  let heartbeatCount = 0;
  const heartbeat = setInterval(async () => {
    heartbeatCount++;
    const elapsed = heartbeatCount * 30;
    if (elapsed >= 280) return;
    await send(`⏳ Toujours en cours… (${elapsed}s)`).catch(() => {});
  }, 30000);

  return new Promise((resolve) => {
    const proc = spawn('claude', args, { cwd: sessionDir, encoding: 'utf8', env: childEnv });
    let out = '';
    const cleanup = () => { clearTimeout(ackTimer); clearInterval(heartbeat); };
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => { cleanup(); resolve(out.trim()); });
    proc.on('error', e => { cleanup(); resolve(`❌ Erreur CLI : ${e.message}`); });
    setTimeout(() => { cleanup(); proc.kill(); resolve('⏱ Timeout (300s)'); }, 300000);
  });
}

// --- Spawn session Claude sur un projet — outils complets, zéro confirmation ---
function spawnProjectSession(projectPath, prompt) {
  return new Promise((resolve) => {
    const childEnv2 = { ...process.env };
    delete childEnv2.ANTHROPIC_API_KEY;
    const proc = spawn('claude', ['--print', '--output-format', 'text', '--dangerously-skip-permissions', '-p', prompt], {
      cwd: projectPath,
      encoding: 'utf8',
      env: childEnv2,
    });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => resolve(out.trim()));
    proc.on('error', e => resolve(`❌ Erreur session : ${e.message}`));
    setTimeout(() => { proc.kill(); resolve('⏱ Timeout session projet (180s)'); }, 180000);
  });
}

// --- Fire RemoteTrigger via subprocess Claude (OAuth géré par Claude Code) ---
const TRIGGER_ID = 'trig_01EqojHMK51LYBH47fxghF2s';
function fireTrigger(task, chatId, botToken) {
  const triggerPrompt = `Utilise l'outil RemoteTrigger pour mettre à jour puis lancer le trigger "${TRIGGER_ID}".
D'abord, update le trigger avec ce contenu de tâche :
TGTOKEN=${botToken} TGCHATID=${chatId} MESSAGE=${task}

Ensuite, run le trigger immédiatement. Ne génère aucune réponse conversationnelle — ton seul rôle est d'invoquer RemoteTrigger.`;

  const childEnv3 = { ...process.env };
  delete childEnv3.ANTHROPIC_API_KEY;
  // Micro-subprocess uniquement pour invoquer RemoteTrigger (pas de --continue, pas de contexte lourd)
  const proc = spawn('claude', ['--print', '--output-format', 'text', '--dangerously-skip-permissions', '-p', triggerPrompt], {
    cwd: ROOT,
    encoding: 'utf8',
    env: childEnv3,
  });
  proc.on('error', e => process.stderr.write(`[trigger] erreur: ${e.message}\n`));
  setTimeout(() => proc.kill(), 30000);
}

// --- Commandes système ---
const HELP = `Commandes Master :
/status — état du daemon
/projets — liste des projets
/projet <nom|chemin> — activer un projet
/projet off — revenir en mode global
/register <nom> <chemin> — enregistrer un projet
/reset — vider l'historique de la session
/run <tâche> — exécute une tâche (outils complets) sur le projet actif
/trigger <tâche> — lance RemoteTrigger cloud (Bash complet, répond ici directement)`;

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

// --- Offset persistant (évite double-traitement au redémarrage) ---
const OFFSET_FILE = '/tmp/masterclaude-tg-offset';
let offset = 0;
try { offset = parseInt(_rfs(OFFSET_FILE, 'utf8').trim(), 10) || 0; } catch {}
function saveOffset(v) { try { _wfs(OFFSET_FILE, `${v}\n`); } catch {} }

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
      saveOffset(offset);

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

      // Commandes git natives (résultats garantis, zéro hallucination)
      const gitReply = handleGitCommand(text);
      if (gitReply !== null) {
        await send(gitReply).catch(() => {});
        continue;
      }

      // Commandes projets
      const { handled, reply: projReply } = sessions.handleCommand(text);
      if (handled) {
        await send(projReply).catch(() => {});
        continue;
      }

      // /trigger <tâche> → RemoteTrigger cloud (Claude complet avec Bash, répond directement à Telegram)
      if (text.startsWith('/trigger ')) {
        const task = text.slice(9).trim();
        await send(`🚀 Lancement RemoteTrigger cloud… La réponse arrive directement ici.`);
        fireTrigger(task, CHAT_ID, TOKEN);
        continue;
      }

      // Commande projet direct : /run <prompt> → spawn claude sur projet actif (outils complets)
      if (text.startsWith('/run ')) {
        const prompt = text.slice(5).trim();
        const projectPath = sessions.active ? sessions.active.path : ROOT;
        const projectName = sessions.active ? sessions.active.name : 'MasterClaude';
        await send(`⚙️ Lancement sur ${projectName} (outils complets)…`);
        const result = await spawnProjectSession(projectPath, prompt);
        await send(result || '✅ Terminé (pas de sortie)').catch(() => {});
        continue;
      }

      // Message → Claude (session persistante via --continue)
      const projectKey = sessions.active?.name || 'global';
      try {
        const reply = await askClaude(text, projectKey);
        if (reply) {
          await send(reply).catch(e =>
            process.stderr.write(`[master] erreur send: ${e.message}\n`)
          );
          memory.store(projectKey, text, reply).catch(() => {});
          process.stdout.write('[master] répondu\n');
        }
      } catch (apiErr) {
        process.stderr.write(`[master] erreur API: ${apiErr.message}\n`);
        await send(`❌ Erreur : ${apiErr.message}`).catch(() => {});
      }
    }
  } catch (err) {
    process.stderr.write(`[master] erreur poll: ${err.message}\n`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
