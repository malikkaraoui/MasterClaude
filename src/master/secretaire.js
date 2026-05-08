/**
 * secretaire.js — Secrétaire Ollama pour master.js
 *
 * Quand Claude est hors ligne, la secrétaire prend le relais :
 * - triage du message (simple / complexe / réveil-claude)
 * - répond via qwen3.5 (API REST /api/chat — contexte en mémoire, non persistant)
 * - réveille Claude via wakeClaudeFunc si trigger détecté
 */

import http from 'node:http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const _rawPort = parseInt(process.env.OLLAMA_PORT || '11434', 10);
const OLLAMA_PORT = Number.isFinite(_rawPort) && _rawPort >= 1 && _rawPort <= 65535
  ? _rawPort
  : (process.stderr.write('[secretaire] OLLAMA_PORT invalide — fallback 11434\n'), 11434);
const SECRETAIRE_MODEL = process.env.SECRETAIRE_MODEL || 'qwen3.5';
const MAX_HISTORY = 10;
const MAX_PROJECTS = 50; // éviction LRU cap global

// Contexte conversationnel par project key (en mémoire uniquement — perdu au restart)
const convHistory = new Map();

// Règles de triage
const WAKE_TRIGGERS = [
  /@claude/i,
  /réveille.?(claude|toi)/i,
  /appelle.?claude/i,
  /urgent/i,
  /critique/i,
  /bloqué?/i,
  /help!$/i,
  /sos/i,
];

const COMPLEX_TRIGGERS = [
  /implémente/i,
  /développe/i,
  /code/i,
  /script/i,
  /debug/i,
  /architecture/i,
  /refactor/i,
  /pr\b/i,
  /commit/i,
  /déploie/i,
];

function classify(msg) {
  if (WAKE_TRIGGERS.some(r => r.test(msg))) return 'wake';
  if (COMPLEX_TRIGGERS.some(r => r.test(msg))) return 'complex';
  return 'simple';
}

function ollamaChat(messages, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; clearTimeout(timer); fn(val); } };

    const body = JSON.stringify({
      model: SECRETAIRE_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.7, num_predict: 400 },
    });

    const req = http.request(
      { host: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/chat', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            settle(resolve, json?.message?.content?.trim() || '');
          } catch {
            settle(reject, new Error('Réponse Ollama non-JSON'));
          }
        });
      }
    );
    req.on('error', err => settle(reject, err));
    const timer = setTimeout(() => { req.destroy(); settle(reject, new Error('timeout Ollama')); }, timeout);
    req.write(body);
    req.end();
  });
}

const SYSTEM_PROMPT = `Tu es la secrétaire de MasterClaude, un assistant IA autonome.
Claude (le LLM principal) est hors ligne en ce moment.
Tu réponds aux questions simples directement. Pour les demandes complexes de développement ou si l'utilisateur veut parler à Claude, dis-le clairement et propose de le réveiller en répondant "@claude".
Sois concise (≤ 5 phrases). En français.`;

/**
 * Gère un message Telegram quand Claude est hors ligne.
 * @param {string} msg - message utilisateur
 * @param {string} projectKey - clé projet pour le contexte conv
 * @param {Function} send - fn pour envoyer un message Telegram
 * @param {Function} wakeClaudeFunc - fn pour réveiller Claude (async → bool)
 * @returns {Promise<string>} réponse envoyée
 */
export async function handleOffline(msg, projectKey, send, wakeClaudeFunc) {
  const kind = classify(msg);

  if (kind === 'wake') {
    await send('⏳ Réveil de Claude en cours…').catch(() => {});
    const ok = await wakeClaudeFunc().catch(() => false);
    if (ok) {
      return '✅ Claude est réveillé — envoie ton message à nouveau, il répond directement.';
    }
    return '❌ Réveil échoué. Vérifie que Terminal.app a accès à Automation dans les Réglages Confidentialité.';
  }

  // Éviction LRU : si trop de projets, supprimer le plus ancien
  if (!convHistory.has(projectKey) && convHistory.size >= MAX_PROJECTS) {
    convHistory.delete(convHistory.keys().next().value);
  }

  const history = convHistory.get(projectKey) || [];
  history.push({ role: 'user', content: msg });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY),
  ];

  let reply;
  try {
    reply = await ollamaChat(messages);
    if (!reply) throw new Error('réponse vide');
  } catch (err) {
    reply = `⚠️ Secrétaire indisponible (${err.message}). Claude est hors ligne — réessaie plus tard ou envoie "@claude" pour le réveiller.`;
  }

  if (reply) {
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    convHistory.set(projectKey, history);
  }

  const suffix = kind === 'complex'
    ? '\n\n_(Question technique détectée — envoie "@claude" si tu veux que je réveille Claude.)_'
    : '';

  const fullReply = reply + suffix;
  await send(fullReply).catch(() => {});
  return fullReply;
}

export function clearHistory(projectKey) {
  convHistory.delete(projectKey);
}
