#!/usr/bin/env node
/**
 * scripts/version-gate.js — Bloque `npm version` si dette §25 dépassée
 *
 * À appeler depuis package.json "preversion" :
 *   "preversion": "node scripts/version-gate.js"
 *
 * Exit 0 = bump autorisé, 1 = bloqué.
 */

import { spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const debtScript = join(ROOT, 'scripts', 'handoff-debt.sh');
if (!existsSync(debtScript)) {
  console.error('version-gate: handoff-debt.sh absent — skippé (bootstrap)');
  process.exit(0);
}

const result = spawnSync('bash', [debtScript, '--check'], { stdio: 'pipe' });

if (result.status === 0) {
  console.log('version-gate: OK — dette §25 sous seuil');
  process.exit(0);
}

console.error('');
console.error('═══════════════════════════════════════════════════════════════');
console.error('  VERSION-GATE : BUMP BLOQUÉ — dette §25 dépassée');
console.error('═══════════════════════════════════════════════════════════════');
spawnSync('bash', [debtScript], { stdio: 'inherit' });
console.error('');
console.error('  Pas de bump de version tant que la dette n\'est pas resetée.');
console.error('  Reset = /integrate-review après réponse Copilot intégrée dans un handoff.');
console.error('');
process.exit(1);
