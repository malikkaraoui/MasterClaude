#!/usr/bin/env node
// Test architecture IPC Telegram simplifiée (master.js seul, sans bridge Python)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strictEqual, ok as nodeOk } from 'node:assert';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const HOME = process.env.HOME;

let passed = 0, failed = 0;

function ok(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.log(`  ✗ ${label}: ${e.message}`); failed++; }
}

console.log('test:ipc — architecture Telegram simplifiée');

ok('telegram-bridge.py supprimé', () =>
  nodeOk(!existsSync(join(ROOT, 'scripts/telegram-bridge.py')), 'bridge python encore présent'));

ok('start-telegram-bridge.sh supprimé', () =>
  nodeOk(!existsSync(join(ROOT, 'scripts/start-telegram-bridge.sh')), 'start script encore présent'));

ok('bin/telegram.js supprimé', () =>
  nodeOk(!existsSync(join(ROOT, 'bin/telegram.js')), 'bin/telegram.js encore présent'));

ok('bin/master.js présent', () =>
  nodeOk(existsSync(join(ROOT, 'bin/master.js')), 'master.js absent'));

ok('away message dans master.js', () => {
  const src = readFileSync(join(ROOT, 'bin/master.js'), 'utf8');
  nodeOk(src.includes('Claude est en veille'), 'away message absent');
});

ok('master.js sans référence telegram-bridge.py', () => {
  const src = readFileSync(join(ROOT, 'bin/master.js'), 'utf8');
  nodeOk(!src.includes('telegram-bridge.py'), 'référence bridge encore présente');
});

ok('plist bridge LaunchAgent supprimé', () => {
  const plist = join(HOME, 'Library/LaunchAgents/com.masterclaude.telegram-bridge.plist');
  nodeOk(!existsSync(plist), 'plist bridge encore présent');
});

ok('/tmp/tg-responses créable', () =>
  mkdirSync('/tmp/tg-responses', { recursive: true }));

ok('.env sans OLLAMA_CHAT_MODEL actif', () => {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const match = env.match(/^OLLAMA_CHAT_MODEL=(.+)$/m);
  nodeOk(!match, `OLLAMA_CHAT_MODEL encore défini: ${match ? match[1] : ''}`);
});

ok('.env sans OLLAMA_POLISH_MODEL', () => {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  nodeOk(!env.includes('OLLAMA_POLISH_MODEL='), 'OLLAMA_POLISH_MODEL encore dans .env');
});

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
