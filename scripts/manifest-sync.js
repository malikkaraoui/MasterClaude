#!/usr/bin/env node
// scripts/manifest-sync.js — Recalcule sha256 de chaque hook et MAJ le manifest.
// Utilisation : après toute édition d'un hook, exécuter `npm run manifest:sync`.
// Le validator fail-closed (test/manifest-validator.js) refusera le push sinon.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, '.claude/hooks-manifest.json');

const raw = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

let changed = 0;
for (const hook of manifest.hooks) {
  const abs = resolve(root, hook.file);
  if (!existsSync(abs)) {
    console.error(`[sync] FAIL — fichier introuvable : ${hook.file}`);
    process.exit(1);
  }
  const sha = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
  if (hook.sha256 !== sha) {
    console.log(`[sync] ${hook.name} : ${hook.sha256 || '(absent)'} → ${sha}`);
    hook.sha256 = sha;
    changed += 1;
  }
}

manifest.lastUpdated = new Date().toISOString().slice(0, 10);

const out = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(manifestPath, out);

if (changed === 0) {
  console.log('[sync] Aucun changement — manifest déjà aligné.');
} else {
  console.log(`[sync] ${changed} hook(s) mis à jour dans .claude/hooks-manifest.json`);
}
