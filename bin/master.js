#!/usr/bin/env node
/**
 * bin/master.js — Claude Atelier Master Daemon (Phase E1-E4)
 *
 * Telegram long polling → session routing → claude --print → réponse
 * Modules : vault-loader (E3) · session-manager (E2) · context-monitor (E4)
 */

import https from 'node:https';
import net from 'node:net';
import { readFileSync, existsSync, createWriteStream, unlinkSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync as _rfs, writeFileSync as _wfs, existsSync as _exists, unlinkSync as _unlink, mkdirSync as _mkdir, statSync as _stat } from 'node:fs';
import { loadVaultBrief } from '../src/master/vault-loader.js';

// Transcription daemon (TRANSCRIBE_SCRIPT défini après __dirname, ligne ~27)
const TRANSCRIBE_SOCK = '/tmp/tg-transcribe.sock';

function ensureTranscribeDaemon() {
  if (_exists(TRANSCRIBE_SOCK)) return;
  const proc = spawn('python3', [TRANSCRIBE_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  proc.unref();
  process.stdout.write(`[transcribe] daemon lancé PID=${proc.pid}\n`);
}

function httpsDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', e => { try { unlinkSync(destPath); } catch {} reject(e); });
  });
}

async function downloadVoice(fileId) {
  const info = await tgPost('getFile', { file_id: fileId });
  if (!info.ok) throw new Error(`getFile échoué: ${JSON.stringify(info)}`);
  const filePath = info.result.file_path;
  const url = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
  const ext = filePath.split('.').pop() || 'oga';
  const dest = `/tmp/tg-voice-${fileId}.${ext}`;
  await httpsDownload(url, dest);
  return dest;
}

function transcribeAudio(audioPath, language = 'fr') {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(TRANSCRIBE_SOCK);
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('transcription timeout')); }, 60000);
    sock.on('connect', () => {
      sock.write(JSON.stringify({ audio_path: audioPath, language }) + '\n');
    });
    sock.on('data', d => { buf += d.toString(); });
    sock.on('end', () => {
      clearTimeout(timer);
      try {
        const resp = JSON.parse(buf.trim());
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.transcript || '(vide)');
      } catch (e) { reject(e); }
    });
    sock.on('error', reject);
  });
}

// IPC bridge — THIS session répond directement (fichier signaux)
const INBOX_FILE = '/tmp/tg-inbox.jsonl';
const RESPONSE_DIR = '/tmp/tg-responses';
const REAL_CLAUDE_ACTIVE_FILE = '/tmp/masterclaude-real-claude-active';
_mkdir(RESPONSE_DIR, { recursive: true });
import { SessionManager } from '../src/master/session-manager.js';
import { MemoryStore } from '../src/master/memory-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRANSCRIBE_SCRIPT = join(ROOT, 'scripts', 'transcribe-daemon.py');

// --- Lockfile : une seule instance ---
// Singleton strict : tuer TOUS les bin/master.js existants sauf soi
{
  const { spawnSync: _ss } = await import('node:child_process');
  const r = _ss('pgrep', ['-f', 'bin/master.js']);
  const pids = (r.stdout?.toString() || '').trim().split('\n')
    .map(p => parseInt(p, 10)).filter(p => p && p !== process.pid);
  if (pids.length) {
    for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch {} }
    process.stderr.write(`[master] instances précédentes tuées : ${pids.join(',')} — démarrage PID=${process.pid}\n`);
    await new Promise(r => setTimeout(r, 300));
  }
}
const LOCKFILE = '/tmp/masterclaude-master.lock';
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

// --- GitHub Poller — notifications push/PR/commit vers Telegram ---
const GH_EVENT_FILE = '/tmp/masterclaude-gh-last-event';
let ghLastEventId = '';
try { ghLastEventId = _rfs(GH_EVENT_FILE, 'utf8').trim(); } catch {}

const GH_EVENT_ICONS = {
  PushEvent: '📦',
  PullRequestEvent: '🔀',
  CreateEvent: '🌿',
  IssuesEvent: '🐛',
  IssueCommentEvent: '💬',
  ReleaseEvent: '🚀',
};

async function pollGitHub() {
  try {
    const r = spawnSync('gh', ['api', '/users/malikkaraoui/events', '--jq', '.[0:30]'], {
      encoding: 'utf8', timeout: 15000
    });
    if (r.status !== 0 || !r.stdout) return;
    // Prendre uniquement la première ligne JSON valide (--paginate concatène plusieurs blocs)
    const firstLine = r.stdout.trim().split('\n').find(l => l.trim().startsWith('['));
    if (!firstLine) return;
    const events = JSON.parse(firstLine);
    if (!Array.isArray(events) || events.length === 0) return;

    // Trouver les nouveaux events depuis le dernier ID connu
    const newEvents = ghLastEventId
      ? events.filter(e => BigInt(e.id) > BigInt(ghLastEventId))
      : [];

    // Sauvegarder le dernier ID (toujours, même au premier démarrage)
    const latestId = events[0]?.id;
    if (latestId && latestId !== ghLastEventId) {
      ghLastEventId = latestId;
      try { _wfs(GH_EVENT_FILE, `${latestId}\n`); } catch {}
    }

    // Pas de premier démarrage (pas de nouveaux events à notifier)
    if (!newEvents.length) return;

    // Envoyer les nouvelles notifs (plus récent en dernier = ordre chronologique)
    for (const ev of newEvents.reverse()) {
      const icon = GH_EVENT_ICONS[ev.type] || '📋';
      const repo = ev.repo?.name || '?';
      let detail = '';

      if (ev.type === 'PushEvent') {
        const commits = ev.payload?.commits || [];
        const branch = ev.payload?.ref?.replace('refs/heads/', '') || '';
        const msgs = commits.slice(0, 3).map(c => `  • ${c.message.split('\n')[0].slice(0, 60)}`).join('\n');
        detail = `push → ${branch} (${commits.length} commit${commits.length > 1 ? 's' : ''})\n${msgs}`;
      } else if (ev.type === 'PullRequestEvent') {
        const pr = ev.payload?.pull_request;
        detail = `PR #${pr?.number} [${ev.payload?.action}] ${pr?.title?.slice(0, 80)}`;
      } else if (ev.type === 'CreateEvent') {
        detail = `${ev.payload?.ref_type} ${ev.payload?.ref} créé`;
      } else if (ev.type === 'IssuesEvent') {
        detail = `Issue #${ev.payload?.issue?.number} [${ev.payload?.action}] ${ev.payload?.issue?.title?.slice(0, 60)}`;
      } else {
        detail = ev.type;
      }

      await send(`${icon} GitHub — ${repo}\n${detail}`).catch(() => {});
    }
  } catch (e) {
    process.stderr.write(`[gh-poll] erreur: ${e.message}\n`);
  }
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
  const args = ['--print', '--output-format', 'text', '--dangerously-skip-permissions', '-p', prompt];
  const childEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY; // Claude Code utilise OAuth Max plan, pas la clé API

  // Ack immédiat si la réponse tarde (> 8s)
  let ackSent = false;
  const ackTimer = setTimeout(async () => {
    ackSent = true;
    await send('⚙️ Je traite, ça prend un moment…').catch(() => {});
  }, 8000);

  // Heartbeat toutes les 60s — sans limite de durée
  let heartbeatCount = 0;
  const heartbeat = setInterval(async () => {
    heartbeatCount++;
    await send(`⏳ Toujours en cours… (${heartbeatCount * 60}s)`).catch(() => {});
  }, 60000);

  return new Promise((resolve) => {
    const proc = spawn('claude', args, { cwd: sessionDir, encoding: 'utf8', env: childEnv });
    let out = '';
    const cleanup = () => { clearTimeout(ackTimer); clearInterval(heartbeat); clearTimeout(hardKill); };
    // Timeout hard 90s — tue le subprocess et répond avec erreur
    const hardKill = setTimeout(() => {
      proc.kill('SIGTERM');
      cleanup();
      process.stdout.write('[askClaude] timeout 90s — subprocess tué\n');
      resolve('⏱ Délai dépassé (90s). Réessaie ou envoie `/run` pour une tâche longue.');
    }, 90000);
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => { cleanup(); resolve(out.trim() || '(vide)'); });
    proc.on('error', e => { cleanup(); resolve(`❌ Erreur CLI : ${e.message}`); });
  });
}

// --- IPC bridge — route vers THIS session si active, fallback subprocess sinon ---
async function askRealClaude(userMsg, projectKey) {
  if (!_exists(REAL_CLAUDE_ACTIVE_FILE)) {
    return askClaude(userMsg, projectKey);
  }
  // Valider TTL : signal file = "timestamp:PID" → périmé si > 2h
  try {
    const sig = _rfs(REAL_CLAUDE_ACTIVE_FILE, 'utf8').trim();
    const ts = parseInt(sig.split(':')[0], 10);
    if (!ts || (Date.now() / 1000 - ts) > 7200) {
      process.stdout.write(`[ipc] signal périmé (${Math.round(Date.now() / 1000 - ts)}s > 7200s) — fallback\n`);
      return askClaude(userMsg, projectKey);
    }
  } catch {
    process.stdout.write('[ipc] signal illisible — fallback\n');
    return askClaude(userMsg, projectKey);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const responseFile = join(RESPONSE_DIR, `${id}.txt`);
  const entry = JSON.stringify({ id, ts: Date.now(), user: userMsg, project: projectKey });

  try {
    _wfs(INBOX_FILE, entry + '\n', { flag: 'a' });
  } catch (e) {
    process.stderr.write(`[ipc] erreur write inbox: ${e.message}\n`);
    return askClaude(userMsg, projectKey);
  }

  process.stdout.write(`[ipc] msg→THIS session (id=${id})\n`);

  const ackTimer = setTimeout(async () => {
    await send('⚙️ Je traite…').catch(() => {});
  }, 8000);
  let heartbeatCount = 0;
  const heartbeat = setInterval(async () => {
    heartbeatCount++;
    await send(`⏳ Toujours en cours… (${heartbeatCount * 60}s)`).catch(() => {});
  }, 60000);

  return new Promise((resolve) => {
    const start = Date.now();
    const poll = setInterval(() => {
      if (_exists(responseFile)) {
        clearTimeout(ackTimer); clearInterval(heartbeat); clearInterval(poll);
        const response = _rfs(responseFile, 'utf8').trim();
        try { _unlink(responseFile); } catch {}
        resolve(response || '(vide)');
      } else if (Date.now() - start > 3000) {
        // 3s sans réponse → fallback subprocess (IPC fail-fast)
        clearTimeout(ackTimer); clearInterval(heartbeat); clearInterval(poll);
        process.stdout.write(`[ipc] timeout 3s — fallback (msg=${userMsg.length}chars)\n`);
        askClaude(userMsg, projectKey).then(resolve);
      }
    }, 500);
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
/health — diagnostic complet (IPC, transcribe, signal TTL)
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
  if (text === '/health') {
    const lines = [`🩺 Health — PID ${process.pid}`, `Uptime : ${Math.round(process.uptime())}s`];
    // Signal file IPC
    if (_exists(REAL_CLAUDE_ACTIVE_FILE)) {
      try {
        const sig = _rfs(REAL_CLAUDE_ACTIVE_FILE, 'utf8').trim();
        const ts = parseInt(sig.split(':')[0], 10);
        const pid = sig.split(':')[1] || '?';
        const age = Math.round(Date.now() / 1000 - ts);
        const stale = age > 600;
        lines.push(`IPC session : ${stale ? '⚠️ périmée' : '🟢 active'} (PID=${pid}, ${age}s)`);
      } catch { lines.push('IPC signal : ⚠️ illisible'); }
    } else {
      lines.push('IPC session : ⬛ absente → fallback subprocess');
    }
    // Transcribe socket
    lines.push(`Transcribe : ${_exists(TRANSCRIBE_SOCK) ? '🟢 socket ok' : '⬛ inactif'}`);
    // Inbox
    try {
      const stat = _stat(INBOX_FILE);
      lines.push(`Inbox : ${stat.size} octets`);
    } catch { lines.push('Inbox : absente'); }
    lines.push(`Projet actif : ${sessions.active?.name || 'global'}`);
    return lines.join('\n');
  }
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

function cleanupSignalFile() {
  try { _unlink(REAL_CLAUDE_ACTIVE_FILE); } catch {}
}

process.on('SIGTERM', async () => {
  running = false;
  cleanupSignalFile();
  process.stdout.write('[master] SIGTERM\n');
  await send('🔴 Master hors ligne').catch(() => {});
  process.exit(0);
});

process.on('SIGINT', () => { running = false; cleanupSignalFile(); process.exit(0); });

process.stdout.write(`[master] démarré PID=${process.pid} vault=${VAULT_PATH}\n`);
ensureTranscribeDaemon();

await send('🟢 Master Claude Atelier en ligne\nTape /help pour les commandes.').catch(e => {
  process.stderr.write(`[master] warn: ${e.message}\n`);
});

// GitHub poller — toutes les 2 minutes (premier tick après 5s pour laisser le daemon démarrer)
setTimeout(async () => {
  await pollGitHub();
  setInterval(pollGitHub, 120000);
}, 5000);

while (running) {
  try {
    const data = await getUpdates(offset);
    if (!data.ok || !Array.isArray(data.result)) continue;

    for (const upd of data.result) {
      offset = upd.update_id + 1;
      saveOffset(offset);

      const msg = upd.message;
      if (!msg) continue;
      if (String(msg.chat.id) !== CHAT_ID) continue;

      // Message vocal → transcription via daemon Whisper
      if (msg.voice || msg.audio) {
        const fileId = (msg.voice || msg.audio).file_id;
        let audioPath;
        try {
          await send('🎙️ Transcription en cours…').catch(() => {});
          audioPath = await downloadVoice(fileId);
          ensureTranscribeDaemon();
          // Attendre que le socket soit prêt (max 5s)
          for (let i = 0; i < 10; i++) {
            if (_exists(TRANSCRIBE_SOCK)) break;
            await new Promise(r => setTimeout(r, 500));
          }
          const transcript = await transcribeAudio(audioPath);
          try { unlinkSync(audioPath); } catch {}
          // Réinjecter comme texte dans le flux normal
          msg.text = transcript;
          process.stdout.write(`[voice] transcrit: ${transcript.slice(0, 80)}\n`);
        } catch (e) {
          process.stderr.write(`[voice] erreur: ${e.message}\n`);
          await send(`❌ Transcription échouée : ${e.message}`).catch(() => {});
          if (audioPath) try { unlinkSync(audioPath); } catch {}
          continue;
        }
      }

      if (!msg?.text) continue;

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
        const reply = await askRealClaude(text, projectKey);
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
