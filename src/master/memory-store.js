/**
 * src/master/memory-store.js — Mémoire persistante RAG via Ollama embeddings
 *
 * Pattern : embed chaque échange → stocker en JSONL → retrieval cosine top-K
 * Survit aux redémarrages daemon. Zéro token brûlé sur l'historique complet.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '../../sessions/memory');
const EMBED_MODEL = 'nomic-embed-text';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const TOP_K = 4;

function memoryPath(sessionKey) {
  mkdirSync(MEMORY_DIR, { recursive: true });
  return join(MEMORY_DIR, `${sessionKey.replace(/[^a-z0-9_-]/gi, '_')}.jsonl`);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function embed(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    const url = new URL(`${OLLAMA_HOST}/api/embeddings`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw).embedding || []); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('embed timeout')));
    req.write(body);
    req.end();
  });
}

export class MemoryStore {
  // Stocke un échange user+assistant avec son vecteur
  async store(sessionKey, userMsg, assistantReply) {
    try {
      const text = `${userMsg}\n${assistantReply}`;
      const vector = await embed(text);
      const entry = JSON.stringify({ ts: Date.now(), user: userMsg, assistant: assistantReply, vector });
      const path = memoryPath(sessionKey);
      const fd = writeFileSync(path, (existsSync(path) ? readFileSync(path, 'utf8') : '') + entry + '\n');
    } catch (e) {
      process.stderr.write(`[memory] store error: ${e.message}\n`);
    }
  }

  // Retourne les TOP_K échanges les plus pertinents pour la query
  async retrieve(sessionKey, query) {
    const path = memoryPath(sessionKey);
    if (!existsSync(path)) return '';
    try {
      const queryVec = await embed(query);
      const entries = readFileSync(path, 'utf8')
        .split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);

      if (!entries.length) return '';

      const scored = entries
        .map(e => ({ ...e, score: cosine(queryVec, e.vector || []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K);

      return scored
        .map(e => `Malik: ${e.user}\nMaster: ${e.assistant}`)
        .join('\n---\n');
    } catch (e) {
      process.stderr.write(`[memory] retrieve error: ${e.message}\n`);
      return '';
    }
  }
}
