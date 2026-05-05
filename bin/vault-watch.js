#!/usr/bin/env node
/**
 * bin/vault-watch.js — Daemon background pour vault watch
 * Spawné par `vault watch start` avec detached: true
 * Tourne indéfiniment jusqu'à SIGTERM
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchLoop } from '../src/vault/watch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

const vaultPath = parseArg('--vault-path') || join(process.cwd(), 'vault');
const intervalStr = parseArg('--interval') || '30';
const intervalSec = Math.max(5, Math.floor(Number(intervalStr) || 30));

// Stubs: updateFn et graphFn seront appelés directement depuis bin/vault.js
// Pour le daemon, on ne fait rien — juste monitoring
// (Les vrais appels update/graph se font via `vault watch once`)

watchLoop(vaultPath, intervalSec, null, null);
