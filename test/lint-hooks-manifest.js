#!/usr/bin/env node
// test/lint-hooks-manifest.js — Vérifie la cohérence de .claude/hooks-manifest.json
// 1. Chaque hook listé dans le manifest existe physiquement dans hooks/
// 2. Chaque hook physique dans hooks/ (sauf .gitkeep) est listé dans le manifest
// 3. stats.total correspond au nombre réel de hooks

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, '.claude/hooks-manifest.json');
const hooksDir = resolve(root, 'hooks');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const physicalHooks = readdirSync(hooksDir)
  .filter((f) => f.endsWith('.sh'))
  .sort();
const manifestHooks = manifest.hooks.map((h) => h.file.replace('hooks/', '')).sort();

const errors = [];

// Check 1 : chaque hook du manifest existe
for (const entry of manifest.hooks) {
  const filename = entry.file.replace('hooks/', '');
  if (!physicalHooks.includes(filename)) {
    errors.push(`Hook listé dans manifest mais absent de hooks/ : ${entry.file}`);
  }
}

// Check 2 : chaque hook physique est listé
for (const filename of physicalHooks) {
  if (!manifestHooks.includes(filename)) {
    errors.push(`Hook présent dans hooks/ mais absent du manifest : hooks/${filename}`);
  }
}

// Check 3 : stats.total cohérent
if (manifest.stats?.total !== manifest.hooks.length) {
  errors.push(
    `stats.total (${manifest.stats?.total}) ≠ hooks.length (${manifest.hooks.length})`
  );
}

if (errors.length > 0) {
  console.error('hooks-manifest.json : INCOHÉRENCE');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`hooks-manifest.json OK (${manifest.hooks.length} hooks listés et présents).`);
