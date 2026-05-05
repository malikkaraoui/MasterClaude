#!/usr/bin/env node
/**
 * test/telegram.test.js — Smoke tests Telegram bridge
 *
 * Tests structuraux : fichiers présents, dépendances, aucun secret hardcodé.
 * Pas de test d'exécution du bot (nécessiterait un vrai token Telegram).
 *
 * Usage: node test/telegram.test.js
 */

import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0;
let fail = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    └ ${e.message}`);
    fail++;
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion échouée');
}

console.log('\n── Telegram Bridge Smoke Tests ──\n');

// ─────────────────────────────────────────────────────────────
// Vérifications de structure
// ─────────────────────────────────────────────────────────────
console.log('Structure:');

test('scripts/telegram-bridge.py existe', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  ok(existsSync(path), `fichier manquant: ${path}`);
});

test('src/templates/telegram.env.example existe', () => {
  const path = resolve(ROOT, 'src', 'templates', 'telegram.env.example');
  ok(existsSync(path), `fichier manquant: ${path}`);
});

test('.claude/autonomy/telegram.md existe', () => {
  const path = resolve(ROOT, '.claude', 'autonomy', 'telegram.md');
  ok(existsSync(path), `fichier manquant: ${path}`);
});

test('bin/telegram.js existe', () => {
  const path = resolve(ROOT, 'bin', 'telegram.js');
  ok(existsSync(path), `fichier manquant: ${path}`);
});

// ─────────────────────────────────────────────────────────────
// Vérifications de contenu
// ─────────────────────────────────────────────────────────────
console.log('\nContenu:');

test('bin/telegram.js est exécutable', () => {
  const path = resolve(ROOT, 'bin', 'telegram.js');
  const content = readFileSync(path, 'utf8');
  ok(content.startsWith('#!/usr/bin/env node'), 'shebang absent');
});

test('bin/telegram.js définit les commandes start/stop/status/test', () => {
  const path = resolve(ROOT, 'bin', 'telegram.js');
  const content = readFileSync(path, 'utf8');
  ok(content.includes("case 'start'"), 'commande start absente');
  ok(content.includes("case 'stop'"), 'commande stop absente');
  ok(content.includes("case 'status'"), 'commande status absente');
  ok(content.includes("case 'test'"), 'commande test absente');
});

test('bin/telegram.js gère le PID file', () => {
  const path = resolve(ROOT, 'bin', 'telegram.js');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('PID_FILE'), 'gestion PID absente');
  ok(content.includes('/tmp/claude-atelier-telegram.pid'), 'chemin PID attendu');
});

test('scripts/telegram-bridge.py commence par #!/usr/bin/env python3', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  ok(content.startsWith('#!/usr/bin/env python3'), 'shebang Python absent');
});

test('src/templates/telegram.env.example contient des placeholders, pas de secrets', () => {
  const path = resolve(ROOT, 'src', 'templates', 'telegram.env.example');
  const content = readFileSync(path, 'utf8');
  // Vérifier qu'il y a au moins une variable de config
  ok(content.includes('TELEGRAM_BOT_TOKEN'), 'TELEGRAM_BOT_TOKEN manquant du template');
  // Vérifier que ce n'est pas un token réel
  ok(!content.match(/TELEGRAM_BOT_TOKEN\s*=\s*\d+:[A-Za-z0-9_-]{24,}/), 'token réel détecté dans template');
});

// ─────────────────────────────────────────────────────────────
// Vérifications de sécurité
// ─────────────────────────────────────────────────────────────
console.log('\nSécurité:');

test('scripts/telegram-bridge.py ne contient pas de token hardcodé', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  // Pattern simple pour détecter un token Telegram hardcodé (nombre:alphanumérique)
  ok(!content.match(/["\']?\d{9,10}:[A-Za-z0-9_-]{20,}["\']?/), 'token hardcodé détecté');
});

test('bin/telegram.js ne contient pas d\'API key en dur', () => {
  const path = resolve(ROOT, 'bin', 'telegram.js');
  const content = readFileSync(path, 'utf8');
  // Vérifier qu'il n'y a pas de token réel assigné (TELEGRAM_BOT_TOKEN = "123:ABC...")
  ok(!content.match(/TELEGRAM_BOT_TOKEN\s*=\s*["\']?\d{9,10}:[A-Za-z0-9_-]/), 'token Telegram ne doit pas être assigné en dur');
  ok(!content.includes('sk_'), 'clé API ne doit pas être en dur');
});

test('.claude/autonomy/telegram.md ne contient pas de secrets', () => {
  const path = resolve(ROOT, '.claude', 'autonomy', 'telegram.md');
  const content = readFileSync(path, 'utf8');
  // Basique : check qu'il n'y a pas de patterns de tokens
  ok(!content.match(/\d{9,10}:[A-Za-z0-9_-]{20,}/), 'token détecté dans autonomy doc');
});

// ─────────────────────────────────────────────────────────────
// Phase B — voix (faster-whisper + Ollama polish)
// ─────────────────────────────────────────────────────────────
console.log('\nPhase B (voix):');

test('scripts/telegram-bridge.py contient VoiceTranscriber', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('class VoiceTranscriber'), 'classe VoiceTranscriber absente');
  ok(content.includes('faster_whisper'), 'import faster_whisper absent');
  ok(content.includes('asyncio.to_thread'), 'asyncio.to_thread absent');
});

test('scripts/telegram-bridge.py contient OllamaPolisher', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('class OllamaPolisher'), 'classe OllamaPolisher absente');
  ok(content.includes('httpx'), 'httpx absent');
  ok(content.includes('/api/generate'), 'endpoint Ollama absent');
});

test('scripts/telegram-bridge.py câble handle_voice + handler VOICE|AUDIO', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('async def handle_voice'), 'méthode handle_voice absente');
  ok(content.includes('filters.VOICE | filters.AUDIO'), 'handler VOICE|AUDIO absent');
});

test('src/templates/telegram.env.example contient les vars Phase B', () => {
  const path = resolve(ROOT, 'src', 'templates', 'telegram.env.example');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('WHISPER_MODEL'), 'WHISPER_MODEL absent du template');
  ok(content.includes('OLLAMA_POLISH_MODEL'), 'OLLAMA_POLISH_MODEL absent du template');
  ok(content.includes('OLLAMA_POLISH_ENABLED'), 'OLLAMA_POLISH_ENABLED absent du template');
});

test('src/templates/telegram.env.example contient OLLAMA_CHAT_MODEL (Phase A bidirectionnel)', () => {
  const path = resolve(ROOT, 'src', 'templates', 'telegram.env.example');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('OLLAMA_CHAT_MODEL'), 'OLLAMA_CHAT_MODEL absent du template Phase A');
});

test('scripts/telegram-bridge.py définit OLLAMA_CHAT_MODEL et _run_ollama', () => {
  const path = resolve(ROOT, 'scripts', 'telegram-bridge.py');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('OLLAMA_CHAT_MODEL'), 'OLLAMA_CHAT_MODEL absent du bridge');
  ok(content.includes('_run_ollama'), 'méthode _run_ollama absente');
  ok(content.includes('/api/generate'), 'endpoint /api/generate absent');
});

// ─────────────────────────────────────────────────────────────
// Phase C — FIFO hooks (telegram-notify.sh + settings)
// ─────────────────────────────────────────────────────────────
console.log('\nPhase C (FIFO hooks):');

test('hooks/telegram-notify.sh existe', () => {
  const path = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  ok(existsSync(path), `fichier manquant: ${path}`);
});

test('hooks/telegram-notify.sh vérifie le named pipe (-p)', () => {
  const path = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('-p "$FIFO_PATH"') || content.includes('-p "${FIFO_PATH}"'),
    'vérification named pipe (-p) absente — risque de deadlock si bridge éteint');
});

test('hooks/telegram-notify.sh écrit ✅ Commit sur git commit', () => {
  const path = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('git commit'), 'pattern git commit absent');
  ok(content.includes('✅ Commit'), 'message ✅ Commit absent');
});

test('hooks/telegram-notify.sh écrit 🚀 Push sur git push', () => {
  const path = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('git push'), 'pattern git push absent');
  ok(content.includes('🚀 Push'), 'message 🚀 Push absent');
});

test('.claude/settings.json déclare telegram-notify sur git commit + git push', () => {
  const path = resolve(ROOT, '.claude', 'settings.json');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('telegram-notify.sh'), 'hook telegram-notify.sh absent de settings.json');
  const occurrences = (content.match(/telegram-notify\.sh/g) || []).length;
  ok(occurrences >= 2, `attendu ≥ 2 références telegram-notify.sh, trouvé ${occurrences}`);
});

test('telegram-notify.sh utilise O_NONBLOCK pour éviter le blocage FIFO', () => {
  const path = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  const content = readFileSync(path, 'utf8');
  ok(content.includes('O_NONBLOCK'), 'O_NONBLOCK absent — risque de blocage si aucun lecteur sur le FIFO');
  ok(content.includes('FIFO_MSG'), 'FIFO_MSG absent — message non transmis au sous-processus python3');
  ok(!content.includes('\\$MSG'), 'littéral \\$MSG détecté — variable non transmise au sous-shell (bug escaping)');
});

// ─────────────────────────────────────────────────────────────
// Phase C — exécution réelle du hook (FIFO temporaire)
// ─────────────────────────────────────────────────────────────
console.log('\nPhase C (exécution hook):');

test('telegram-notify.sh exit 0 et silent quand bridge non actif (no FIFO)', () => {
  // Garantit que /tmp/claude-telegram-out n'est pas un pipe nommé actif
  const fifoExists = spawnSync('test', ['-p', '/tmp/claude-telegram-out']).status === 0;
  if (fifoExists) {
    console.log('    (⚠ bridge actif — test skippé pour éviter écriture réelle)');
    return;
  }
  const hookPath = resolve(ROOT, 'hooks', 'telegram-notify.sh');
  const stdin = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "test"' },
    tool_response: { exit_code: 0 }
  });
  const result = spawnSync('bash', [hookPath], {
    input: stdin,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
    timeout: 5000
  });
  ok(result.status === 0, `hook exit ${result.status}: ${result.stderr}`);
  ok(!result.stdout, `sortie inattendue: ${result.stdout}`);
});

// ─────────────────────────────────────────────────────────────
// Vérifications des dépendances Python (optionnel)
// ─────────────────────────────────────────────────────────────
console.log('\nDépendances Python:');

test('[optionnel] python3 -c "import telegram" disponible', () => {
  const result = spawnSync('python3', ['-c', 'import telegram'], {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  // Cette vérification est optionnelle (ne pas hard fail si python-telegram-bot n'est pas installé)
  if (result.status !== 0) {
    console.log('    (⚠ python-telegram-bot non installé, skippé)');
  } else {
    ok(true, 'python-telegram-bot disponible');
  }
});

// ─────────────────────────────────────────────────────────────
// Résumé
// ─────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n── Tests Telegram: ${pass}/${total} passés${fail > 0 ? ` · ${fail} ÉCHECS` : ''} ──\n`);

if (fail > 0) process.exit(1);
