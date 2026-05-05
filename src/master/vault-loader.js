/**
 * src/master/vault-loader.js — Chargeur de contexte vault Obsidian (E3)
 * Retourne un brief textuel pour le system prompt du Master
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_CHARS = 1500;

export function loadVaultBrief(vaultPath) {
  const candidates = [
    join(vaultPath, 'CLAUDE.md'),
    join(vaultPath, 'index.md'),
    join(vaultPath, 'Bienvenue.md'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8').slice(0, MAX_CHARS); } catch { return ''; }
    }
  }
  return '';
}

export function loadProjectContext(projectPath) {
  const claudeMd = join(projectPath, '.claude', 'CLAUDE.md');
  const fallback = join(projectPath, 'CLAUDE.md');
  for (const p of [claudeMd, fallback]) {
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8').slice(0, 1000); } catch { return ''; }
    }
  }
  return '';
}
