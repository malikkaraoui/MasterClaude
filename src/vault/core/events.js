// src/vault/core/events.js — append event log

import { appendFileSync, mkdirSync } from 'node:fs';;
import { dirname, join } from 'node:path';;
import { nowIso } from './utils.js';

function appendEvent(eventsPath, event) {
  mkdirSync(dirname(eventsPath), { recursive: true });
  appendFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf8');
}

export { appendEvent };
