#!/usr/bin/env node
// UserPromptSubmit hook — marque l'agent courant comme actif
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { buildAgentId } from '../src/pulse/identity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const agentId = buildAgentId(hostname());
const filePath = join(ROOT, '.claude', 'agents', agentId.replace(/\//g, '-'), 'pouls.md');

// Re-lire immédiatement avant écriture pour minimiser la fenêtre de race condition
let p;
try { p = parsePoulsMd(filePath); } catch { process.exit(0); }
if (!p) process.exit(0);

const next = (p.intensity?.current ?? 0) >= 0.6 ? 'high' : 'medium';

let fresh;
try { fresh = parsePoulsMd(filePath); } catch { fresh = p; }
writePoulsMd(filePath, { ...fresh, status: next, lastPulse: new Date().toISOString() }, fresh._body);
