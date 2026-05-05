#!/usr/bin/env node
// test/manifest-validator.js — Admission control fail-closed du hooks-manifest.
// 1. Schema : chaque entrée hook a tous les champs requis avec les bons types.
// 2. Drift : sha256 stocké === sha256 calculé du fichier physique.
// 3. Couverture : hook bloquant (exit code 2) DOIT avoir un test déclaré.
//
// Inspiré de ruvnet/ruflo ADR-G012 Manifest Validator — adapté minimal.
// Exit 1 = incohérence, utilisateur doit corriger avant push.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, '.claude/hooks-manifest.json');
const hooksDir = resolve(root, 'hooks');

const REQUIRED_FIELDS = ['name', 'file', 'type', 'purpose', 'exitCodes'];
const REQUIRED_WITH_SHA = ['helper', 'SessionStart', 'Stop', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PreToolUse + PostToolUse'];

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const errors = [];

// Check 0 : parité manifest ↔ filesystem
const physicalHooks = readdirSync(hooksDir).filter((f) => f.endsWith('.sh')).sort();
const manifestHooks = manifest.hooks.map((h) => h.file.replace('hooks/', '')).sort();
for (const filename of physicalHooks) {
  if (!manifestHooks.includes(filename)) errors.push(`[parité] hook physique absent du manifest : hooks/${filename}`);
}
for (const entry of manifest.hooks) {
  const f = entry.file.replace('hooks/', '');
  if (!physicalHooks.includes(f)) errors.push(`[parité] hook manifest absent du filesystem : ${entry.file}`);
}

// Check 1 : schema par hook
for (const hook of manifest.hooks) {
  for (const field of REQUIRED_FIELDS) {
    if (hook[field] === undefined || hook[field] === null || hook[field] === '') {
      errors.push(`[schema] ${hook.name || '(sans nom)'} : champ requis manquant → ${field}`);
    }
  }
  if (hook.type && !REQUIRED_WITH_SHA.includes(hook.type)) {
    errors.push(`[schema] ${hook.name} : type inconnu → "${hook.type}" (attendu : ${REQUIRED_WITH_SHA.join(', ')})`);
  }
  if (hook.exitCodes && typeof hook.exitCodes !== 'object') {
    errors.push(`[schema] ${hook.name} : exitCodes doit être un objet`);
  }
}

// Check 2 : drift sha256
for (const hook of manifest.hooks) {
  const abs = resolve(root, hook.file);
  if (!existsSync(abs)) continue;
  const actual = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
  if (!hook.sha256) {
    errors.push(`[drift] ${hook.name} : sha256 absent du manifest → run \`npm run manifest:sync\``);
  } else if (hook.sha256 !== actual) {
    errors.push(`[drift] ${hook.name} : fichier modifié (${hook.sha256} ≠ ${actual}) → relire le hook, MAJ purpose/exitCodes si besoin, puis \`npm run manifest:sync\``);
  }
}

// Check 3 : hooks bloquants (exit 2) doivent avoir un test
for (const hook of manifest.hooks) {
  const hasBlocking = hook.exitCodes && Object.keys(hook.exitCodes).some((code) => code === '2');
  if (hasBlocking && !hook.test) {
    errors.push(`[coverage] ${hook.name} : hook bloquant (exit 2) sans test déclaré — ajouter test/hooks.js`);
  }
}

// Check 4 : scan shell pour `exit 2`/`return 2` — ferme la faille de sous-déclaration
// (Copilot 2026-04-15 : un hook peut devenir bloquant via exit 2 dans le shell
// sans déclarer "2" dans manifest.exitCodes — validator restait vert. Plus maintenant.)
const EXIT2_PATTERN = /^[^#]*\b(exit|return)\s+2\b/m;
for (const hook of manifest.hooks) {
  const abs = resolve(root, hook.file);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, 'utf8');
  // Strip line comments to éviter faux positifs sur "exit 2" cité dans un commentaire
  const codeOnly = src.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
  const shellHasExit2 = EXIT2_PATTERN.test(codeOnly);
  const manifestDeclaresExit2 = hook.exitCodes && Object.keys(hook.exitCodes).includes('2');
  if (shellHasExit2 && !manifestDeclaresExit2) {
    errors.push(`[shell-drift] ${hook.name} : le shell contient \`exit 2\`/\`return 2\` mais le manifest n'a pas \`exitCodes["2"]\` — sous-déclaration sémantique`);
  }
}

if (errors.length > 0) {
  console.error('hooks-manifest.json : ADMISSION REFUSÉE');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`hooks-manifest.json OK — admission validée (${manifest.hooks.length} hooks, schema + drift + coverage).`);
