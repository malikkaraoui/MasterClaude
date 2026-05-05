#!/usr/bin/env node
/**
 * scripts/memory-lib.js — Shared library for 3-level memory system
 *
 * Exports:
 * - DB_PATH: default path to memory database
 * - openDb(path): open SQLite database with WAL + foreign_keys
 * - closeDb(db): close database
 * - detectMode(dbPath): async, returns 'FULL' | 'LEXICAL' | 'MINIMAL'
 * - cosineSimilarity(a, b): Float32Array dot product / norms
 * - embed(text, timeoutMs): async, POST to ollama embed endpoint
 * - float32ToBuffer(f32): Float32Array to Buffer (LE bytes)
 * - bufferToFloat32(buf): Buffer back to Float32Array
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Default path to memory database
 */
export const DB_PATH = resolve(PROJECT_ROOT, '.claude', 'memory.db');

/**
 * Open SQLite database with WAL + foreign_keys pragmas
 * @param {string} path - Path to database file
 * @returns {Database.Database} - database instance
 */
export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Close database if open
 * @param {Database.Database} db - database instance
 */
export function closeDb(db) {
  if (db && typeof db.close === 'function') {
    try {
      db.close();
    } catch {
      // ignore if already closed
    }
  }
}

/**
 * Detect memory system mode based on database availability and ollama
 * @param {string} dbPath - Path to database file
 * @returns {Promise<'FULL' | 'LEXICAL' | 'MINIMAL'>}
 *
 * MINIMAL: db file doesn't exist or is corrupt
 * FULL: db exists AND ollama embed endpoint works with nomic-embed-text
 * LEXICAL: otherwise
 */
export async function detectMode(dbPath) {
  // Check if DB file exists
  if (!existsSync(dbPath)) {
    return 'MINIMAL';
  }

  // Check if DB is readable
  let db = null;
  try {
    db = openDb(dbPath);
    // Quick sanity check: can we query?
    db.prepare('SELECT 1').get();
  } catch {
    return 'MINIMAL';
  } finally {
    closeDb(db);
  }

  // DB exists, check if ollama embed works
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return 'LEXICAL';

    const data = await response.json();
    const hasNomicEmbed = data.models?.some(m =>
      m.name?.includes('nomic-embed-text') || m.model?.includes('nomic-embed-text')
    );

    return hasNomicEmbed ? 'FULL' : 'LEXICAL';
  } catch {
    return 'LEXICAL';
  }
}

/**
 * Cosine similarity between two Float32Arrays
 * @param {Float32Array} a - Vector A
 * @param {Float32Array} b - Vector B
 * @returns {number} - Similarity [-1, 1]
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Get embedding from ollama
 * @param {string} text - Text to embed
 * @param {number} timeoutMs - Timeout in milliseconds (default 5000)
 * @returns {Promise<Float32Array|null>} - Embedding vector or null on failure
 */
export async function embed(text, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.embedding || !Array.isArray(data.embedding)) return null;

    return new Float32Array(data.embedding);
  } catch {
    return null;
  }
}

/**
 * Convert Float32Array to Buffer (little-endian bytes)
 * @param {Float32Array} f32 - Float32Array to convert
 * @returns {Buffer} - Buffer representation
 */
export function float32ToBuffer(f32) {
  const buf = Buffer.alloc(f32.length * 4);
  for (let i = 0; i < f32.length; i++) {
    buf.writeFloatLE(f32[i], i * 4);
  }
  return buf;
}

/**
 * Convert Buffer back to Float32Array
 * @param {Buffer} buf - Buffer to convert
 * @returns {Float32Array} - Float32Array representation
 */
export function bufferToFloat32(buf) {
  const f32 = new Float32Array(buf.length / 4);
  for (let i = 0; i < f32.length; i++) {
    f32[i] = buf.readFloatLE(i * 4);
  }
  return f32;
}
