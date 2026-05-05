// src/vault/core/state.js — state and cron config persistence

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readJsonIfExists } from './utils.js';

const STATE_VERSION = 1;
const CRON_VERSION = 1;

function loadState(statePath) {
  if (!existsSync(statePath)) return null;
  try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return null; }
}

function saveState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  state.version = STATE_VERSION;
  state.lastRun = new Date().toISOString();
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function loadCronConfig(cronPath) {
  return readJsonIfExists(cronPath, { version: CRON_VERSION, enabled: false, nextRun: null });
}

function saveCronConfig(cronPath, config) {
  mkdirSync(dirname(cronPath), { recursive: true });
  config.version = CRON_VERSION;
  writeFileSync(cronPath, JSON.stringify(config, null, 2), 'utf8');
}

export { loadState, saveState, loadCronConfig, saveCronConfig };
