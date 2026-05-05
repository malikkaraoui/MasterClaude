#!/usr/bin/env node
/**
 * test/hooks.js — Amine 🧪
 *
 * Tests unitaires des hooks bash.
 * Chaque hook = JSON stdin → stdout + exit code attendus.
 * Zéro dépendance externe : Node.js + bash suffisent.
 *
 * Usage : node test/hooks.js   (ou : npm run test:hooks)
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEST_TMP = mkdtempSync(resolve(tmpdir(), 'claude-atelier-hooks-'));
const ROUTING_LEGACY_MODEL = resolve(TEST_TMP, 'claude-atelier-current-model');
const ROUTING_CACHE_DIR = resolve(TEST_TMP, 'claude-atelier-model-cache');
const ROUTING_DIAGNOSTIC_LAST = resolve(TEST_TMP, 'claude-atelier-diagnostic-last');

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

function hook(name, stdinObj = {}, env = {}) {
  return spawnSync('bash', [`hooks/${name}`], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, CLAUDE_ATELIER_TMPDIR: TEST_TMP, ...env }
  });
}

function resetRoutingEnv() {
  try {
    rmSync(ROUTING_LEGACY_MODEL);
  } catch {}
  try {
    rmSync(ROUTING_CACHE_DIR, { recursive: true, force: true });
  } catch {}
  writeFileSync(ROUTING_DIAGNOSTIC_LAST, `${Math.floor(Date.now() / 1000)}`);
}

// ─────────────────────────────────────────────────────────────
// guard-qmd-first.sh
// Règle : fire sur .md projet, silencieux sur exceptions
// ─────────────────────────────────────────────────────────────
console.log('\n── guard-qmd-first.sh ──');

test('fire sur un .md projet générique', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/docs/spec.md' } });
  ok(r.stdout.includes('QMD-FIRST'), 'doit contenir [QMD-FIRST]');
  ok(r.status === 0, 'non-bloquant (exit 0)');
});

test('contient les 3 commandes QMD dans sa sortie', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/feature.md' } });
  ok(r.stdout.includes('mcp__qmd__get'), 'commande get présente');
  ok(r.stdout.includes('mcp__qmd__query'), 'commande query présente');
  ok(r.stdout.includes('mcp__qmd__multi_get'), 'commande multi_get présente');
});

test('silencieux sur fichier non-.md', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/src/app.js' } });
  ok(r.stdout.trim() === '', 'aucune sortie attendue');
});

test('silencieux sur CLAUDE.md', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/CLAUDE.md' } });
  ok(r.stdout.trim() === '', 'CLAUDE.md exclu');
});

test('silencieux sur README.md', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/README.md' } });
  ok(r.stdout.trim() === '', 'README.md exclu');
});

test('silencieux sur MEMORY.md', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/home/.claude/projects/proj/memory/user.md' } });
  ok(r.stdout.trim() === '', 'memory exclu');
});

test('silencieux sur docs/handoffs/*.md', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/docs/handoffs/2026-04-13-review.md' } });
  ok(r.stdout.trim() === '', 'handoffs exclu');
});

test('silencieux sur fichier dans /hooks/', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/hooks/routing-check.sh' } });
  ok(r.stdout.trim() === '', '/hooks/ exclu');
});

test('silencieux sur fichier dans /runtime/', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/src/fr/runtime/theatre.md' } });
  ok(r.stdout.trim() === '', '/runtime/ exclu');
});

test('silencieux sur fichier dans /templates/', () => {
  const r = hook('guard-qmd-first.sh', { tool_input: { file_path: '/project/src/templates/settings.md' } });
  ok(r.stdout.trim() === '', '/templates/ exclu');
});

// ─────────────────────────────────────────────────────────────
// guard-no-sign.sh
// Règle §13 : bloque Co-Authored-By, Signed-off-by, --signoff
// ─────────────────────────────────────────────────────────────
console.log('\n── guard-no-sign.sh ──');

test('bloque Co-Authored-By dans la commande', () => {
  const cmd = 'git commit -m "feat: ajout Co-Authored-By: Claude <n@a.com>"';
  const r = hook('guard-no-sign.sh', { tool_input: { command: cmd } });
  ok(r.status === 2, 'exit 2 bloquant');
  ok(r.stdout.includes('jamais signer') || r.stdout.includes('BLOCKED'), 'message de blocage présent');
});

test('bloque Signed-off-by dans la commande', () => {
  const cmd = 'git commit -m "feat: ajout Signed-off-by: Malik"';
  const r = hook('guard-no-sign.sh', { tool_input: { command: cmd } });
  ok(r.status === 2, 'exit 2 bloquant');
});

test('bloque --signoff dans la commande', () => {
  const cmd = 'git commit --signoff -m "feat: ajout"';
  const r = hook('guard-no-sign.sh', { tool_input: { command: cmd } });
  ok(r.status === 2, 'exit 2 bloquant');
});

test('laisse passer un commit propre', () => {
  const cmd = 'git commit -m "feat: ajout fonctionnalité QMD-first"';
  const r = hook('guard-no-sign.sh', { tool_input: { command: cmd } });
  ok(r.status === 0, 'exit 0 autorisé');
  ok(r.stdout.trim() === '', 'aucun output');
});

test('silencieux sur commande non-commit', () => {
  const r = hook('guard-no-sign.sh', { tool_input: { command: 'git status' } });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.trim() === '', 'aucun output');
});

// ─────────────────────────────────────────────────────────────
// guard-commit-french.sh
// Règle §13 : messages de commit en français
// ─────────────────────────────────────────────────────────────
console.log('\n── guard-commit-french.sh ──');

test('bloque message purement anglais (≥ 2 mots EN, 0 FR)', () => {
  // "fix" est dans les deux listes (préfixe conventionnel) → utiliser add+update
  const cmd = `git commit -m "add new feature and update changelog"`;
  const r = hook('guard-commit-french.sh', { tool_input: { command: cmd } });
  ok(r.status === 2, 'exit 2 bloquant');
});

test('laisse passer un message en français', () => {
  const cmd = `git commit -m "feat: ajout de la fonctionnalité QMD-first"`;
  const r = hook('guard-commit-french.sh', { tool_input: { command: cmd } });
  ok(r.status === 0, 'exit 0 autorisé');
});

test('laisse passer les préfixes conventionnels (fix, feat, docs)', () => {
  const cmd = `git commit -m "fix: correction du hook routing-check"`;
  const r = hook('guard-commit-french.sh', { tool_input: { command: cmd } });
  ok(r.status === 0, 'exit 0 — fix est dans le lexique FR');
});

test('laisse passer un message court sans mots détectés', () => {
  const cmd = `git commit -m "0.3.11"`;
  const r = hook('guard-commit-french.sh', { tool_input: { command: cmd } });
  ok(r.status === 0, 'exit 0 — version sans mots clés');
});

test('silencieux sur commande non-commit', () => {
  const r = hook('guard-commit-french.sh', { tool_input: { command: 'git push origin main' } });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.trim() === '', 'aucun output');
});

// ─────────────────────────────────────────────────────────────
// session-model.sh + routing-check.sh
// Règle §1 : modèle live > cache > transcript (post bug-fix compaction)
// ─────────────────────────────────────────────────────────────
console.log('\n── session-model.sh + routing-check.sh ──');

test('session-model capture le modèle depuis le JSON du hook', () => {
  resetRoutingEnv();
  const r = hook('session-model.sh', { model: 'claude-sonnet-4-6' });
  ok(r.status === 0, 'exit 0');
  ok(readFileSync(ROUTING_LEGACY_MODEL, 'utf8').trim() === 'claude-sonnet-4-6', 'modèle capturé');
});

test('routing-check préfère le modèle live au cache stale', () => {
  resetRoutingEnv();
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-sonnet-4-6\n');
  const r = hook('routing-check.sh', { prompt: 'audit rapide', model: 'claude-opus-4-6[1m]' });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[ROUTING] modèle actif: claude-opus-4-6 (Opus (archi))'), 'le modèle live doit gagner');
  ok(r.stdout.includes('[ROUTING] source modèle: live'), 'la source doit être live');
  ok(readFileSync(ROUTING_LEGACY_MODEL, 'utf8').trim() === 'claude-opus-4-6', 'cache mis à jour');
});

test("routing-check bascule sur le transcript si le modèle live est absent", () => {
  resetRoutingEnv();
  const dir = mkdtempSync(resolve(tmpdir(), 'claude-routing-'));
  const transcript = resolve(dir, 'session.jsonl');
  writeFileSync(transcript, JSON.stringify({type:"assistant",message:{role:"assistant",model:"claude-haiku-4-5",content:[{type:"text",text:"ok"}]}}) + "\n");
  const r = hook('routing-check.sh', { prompt: 'liste les fichiers', transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[ROUTING] modèle actif: claude-haiku-4-5 (Haiku (exploration))'), 'fallback transcript attendu');
  ok(r.stdout.includes('[ROUTING] source modèle: transcript'), 'source transcript attendue');
  rmSync(dir, { recursive: true, force: true });
});

test("routing-check accepte aussi le schéma assistant.message/data.message", () => {
  resetRoutingEnv();
  const dir = mkdtempSync(resolve(tmpdir(), 'claude-routing-'));
  const transcript = resolve(dir, 'session.jsonl');
  writeFileSync(transcript, JSON.stringify({type:"assistant.message",data:{message:{role:"assistant",model:"claude-opus-4-6"}}}) + "\n");
  const r = hook('routing-check.sh', { prompt: 'audit', transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[ROUTING] modèle actif: claude-opus-4-6 (Opus (archi))'), 'fallback transcript multi-schéma attendu');
  ok(r.stdout.includes('[ROUTING] source modèle: transcript'), 'source transcript attendue');
  rmSync(dir, { recursive: true, force: true });
});

test("routing-check accepte le format date claude-haiku-20240307 depuis le transcript", () => {
  resetRoutingEnv();
  const dir = mkdtempSync(resolve(tmpdir(), 'claude-routing-'));
  const transcript = resolve(dir, 'session.jsonl');
  writeFileSync(transcript, JSON.stringify({type:"assistant",message:{role:"assistant",model:"claude-haiku-20240307",content:[{type:"text",text:"ok"}]}}) + "\n");
  const r = hook('routing-check.sh', { prompt: 'bonjour', transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[ROUTING] modèle actif: claude-haiku-20240307 (Haiku (exploration))'), 'format date accepté');
  ok(r.stdout.includes('[ROUTING] source modèle: transcript'), 'source transcript attendue');
  rmSync(dir, { recursive: true, force: true });
});

test('routing-check signale quand il ne lui reste que le cache', () => {
  resetRoutingEnv();
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-sonnet-4-6\n');
  const r = hook('routing-check.sh', { prompt: 'bonjour' });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[ROUTING] source modèle: cache'), 'source cache attendue');
  ok(r.stdout.includes('modèle issu du cache legacy global'), 'warning cache attendu');
});

test('routing-check alerte fort si aucun modèle n’est disponible', () => {
  resetRoutingEnv();
  const r = hook('routing-check.sh', { prompt: 'bonjour' });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[HORODATAGE]'), 'horodatage toujours présent');
  ok(r.stdout.includes('| inconnu'), 'modèle inconnu attendu');
  ok(r.stdout.includes('🚨 [ROUTING] MODÈLE INCONNU'), 'alerte forte attendue');
});

test('garde-fou #1 : session-model à compact sans model invalide le cache', () => {
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-opus-4-6\n');
  const r = hook('session-model.sh', { source: 'compact', hook_event_name: 'SessionStart' });
  ok(r.status === 0, 'exit 0');
  let cacheExists = true;
  try { readFileSync(ROUTING_LEGACY_MODEL, 'utf8'); } catch { cacheExists = false; }
  ok(!cacheExists, 'cache supprimé post-compact sans model live');
});

test('session-model scope le cache par session et évite la contamination croisée', () => {
  resetRoutingEnv();
  hook('session-model.sh', { model: 'claude-opus-4-6', session_id: 'session-a' });
  const sameSession = hook('routing-check.sh', { prompt: 'bonjour', session_id: 'session-a' });
  const otherSession = hook('routing-check.sh', { prompt: 'bonjour', session_id: 'session-b' });
  ok(sameSession.stdout.includes('[ROUTING] modèle actif: claude-opus-4-6 (Opus (archi))'), 'session A doit relire son cache');
  ok(sameSession.stdout.includes('[ROUTING] source modèle: cache'), 'session A utilise son cache');
  ok(otherSession.stdout.includes('🚨 [ROUTING] MODÈLE INCONNU'), 'session B ne doit pas hériter du cache de A');
});

test('compact sur une session n’invalide pas le cache d’une autre session', () => {
  resetRoutingEnv();
  hook('session-model.sh', { model: 'claude-opus-4-6', session_id: 'session-a' });
  hook('session-model.sh', { model: 'claude-sonnet-4-6', session_id: 'session-b' });
  hook('session-model.sh', { source: 'compact', session_id: 'session-a' });
  const sessionA = hook('routing-check.sh', { prompt: 'bonjour', session_id: 'session-a' });
  const sessionB = hook('routing-check.sh', { prompt: 'bonjour', session_id: 'session-b' });
  ok(sessionA.stdout.includes('🚨 [ROUTING] MODÈLE INCONNU'), 'session A doit perdre son cache après compact');
  ok(sessionB.stdout.includes('[ROUTING] modèle actif: claude-sonnet-4-6 (Sonnet (dev))'), 'session B garde son cache');
});

test("garde-fou #2 : routing-check transcript lit message.model (fix /model)", () => {
  resetRoutingEnv();
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-opus-4-6\n');
  const dir = mkdtempSync(resolve(tmpdir(), 'claude-routing-'));
  const transcript = resolve(dir, 'session.jsonl');
  // JSONL avec une réponse assistant dont message.model = haiku
  writeFileSync(transcript, JSON.stringify({type:"assistant",message:{role:"assistant",model:"claude-haiku-4-5",content:[{type:"text",text:"ok"}]}}) + "\n");
  const r = hook('routing-check.sh', { prompt: 'audit', transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  // transcript message.model (haiku) > cache (opus)
  ok(r.stdout.includes('[ROUTING] source mod\xe8le: transcript'), 'transcript doit primer sur cache');
  ok(readFileSync(ROUTING_LEGACY_MODEL, 'utf8').trim() === 'claude-haiku-4-5', 'cache mis a jour');
  rmSync(dir, { recursive: true, force: true });
});

test('routing-check remonte Ollama dans l’entête quand le proxy répond', () => {
  resetRoutingEnv();
  const dir = mkdtempSync(resolve(tmpdir(), 'claude-ollama-'));
  const binDir = resolve(dir, 'bin');
  const ollamaBin = resolve(binDir, 'ollama');
  const curlBin = resolve(binDir, 'curl');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(ollamaBin, '#!/bin/sh\nexit 0\n');
  writeFileSync(curlBin, `#!/bin/sh
case "$*" in
  *11434/api/tags*) printf '%s' '{"models":[{"name":"qwen3.5:4b"},{"name":"nomic-embed-text:latest"}]}' ;;
  *4000/health*) printf '%s' '{"status":"ok","proxy":"ollama"}' ;;
  *) exit 1 ;;
esac
`);
  chmodSync(ollamaBin, 0o755);
  chmodSync(curlBin, 0o755);
  const r = hook('routing-check.sh', { prompt: 'bonjour', model: 'claude-sonnet-4-6' }, { PATH: `${binDir}:${process.env.PATH}` });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[OLLAMA] 🦙✅ proxy:4000 → qwen3.5:4b (v0.3.0 streaming+tool_use)'), "ligne OLLAMA attendue dans l’entête");
  ok(r.stdout.indexOf('[OLLAMA]') < r.stdout.indexOf('[ROUTING] modèle actif'), "OLLAMA doit être dans l’entête, avant le routing");
  rmSync(dir, { recursive: true, force: true });
});

test('routing-check mode M quand proxy off (pas de dépendance ANTHROPIC_BASE_URL)', () => {
  resetRoutingEnv();
  // proxy ne répond pas → SWITCH_MODE doit être M, quelle que soit ANTHROPIC_BASE_URL
  const r = hook('routing-check.sh', { prompt: 'bonjour', model: 'claude-sonnet-4-6' }, {
    ANTHROPIC_BASE_URL: 'http://localhost:4000'  // config pointant sur proxy éteint
  });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[SWITCH-MODE] M'), 'proxy off → mode M même si ANTHROPIC_BASE_URL pointe sur :4000');
});

test('routing-check rappelle la commande de retour full Anthropic sur demande explicite', () => {
  resetRoutingEnv();
  const r = hook('routing-check.sh', {
    prompt: 'je veux repasser en full anthropic et désactiver le proxy',
    model: 'claude-sonnet-4-6'
  });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('unset ANTHROPIC_BASE_URL && rm -f .env.local && claude'), 'commande full Anthropic attendue');
  ok(r.stdout.includes('Quitter la session Claude en cours'), 'marche à suivre attendue');
  ok(r.stdout.includes('Vérifier ensuite : [SWITCH-MODE] M'), 'vérification mode M attendue');
});

// ─────────────────────────────────────────────────────────────
// guard-tests-before-push.sh — §11/§24 : tests avant push
// ─────────────────────────────────────────────────────────────
console.log('\n── guard-tests-before-push.sh ──');

test('marque qu\'un test runner a tourné (npm test)', () => {
  try { rmSync('/tmp/claude-atelier-tests-ran', { force: true }); } catch {}
  const r = hook('guard-tests-before-push.sh', { tool_input: { command: 'npm test' } });
  ok(r.status === 0, 'exit 0 (marquage silencieux)');
  ok(readFileSync('/tmp/claude-atelier-tests-ran', 'utf8').trim().length > 0, 'fichier marqueur créé');
});

test('laisse passer git push si des tests ont tourné récemment', () => {
  writeFileSync('/tmp/claude-atelier-tests-ran', `${Math.floor(Date.now() / 1000)}\n`);
  const r = hook('guard-tests-before-push.sh', { tool_input: { command: 'git push origin main' } });
  ok(r.status === 0, 'exit 0 — tests détectés');
});

test('silencieux sur commande non liée (ls, cd)', () => {
  const r = hook('guard-tests-before-push.sh', { tool_input: { command: 'ls -la' } });
  ok(r.status === 0, 'exit 0 — no-op');
  ok(r.stdout.trim() === '', 'aucune sortie');
});

// ─────────────────────────────────────────────────────────────
// model-metrics.sh — §1 pastille + §15 auto-métriques
// ─────────────────────────────────────────────────────────────
console.log('\n── model-metrics.sh ──');

function makeTranscript(dir, turns) {
  const transcript = resolve(dir, 'session.jsonl');
  const lines = turns.map(tools =>
    JSON.stringify({ type: 'assistant', message: { content: tools.map((name, i) => ({ type: 'tool_use', id: `t${i}`, name, input: {} })) } })
  );
  writeFileSync(transcript, lines.join('\n'));
  return transcript;
}

test('opus + 5 tours Read/Glob/Grep → surdimensionné ⬇️', () => {
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-opus-4-6\n');
  const dir = mkdtempSync(resolve(tmpdir(), 'metrics-'));
  const transcript = makeTranscript(dir, [
    ['Read'], ['Glob'], ['Grep'], ['Read', 'Glob'], ['Grep', 'Read'],
  ]);
  const r = hook('model-metrics.sh', { transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[METRICS]'), '[METRICS] présent');
  ok(r.stdout.includes('⬇️'), 'flèche ⬇️ attendue (descendre)');
  ok(r.stdout.includes('surdimensionné') || r.stdout.includes('/model sonnet'), 'verdict surdimensionné');
  rmSync(dir, { recursive: true, force: true });
});

test('haiku + 5 tours Agent/WebSearch → insuffisant ⬆️', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'metrics-'));
  const transcript = makeTranscript(dir, [
    ['Agent'], ['WebSearch'], ['Agent', 'WebFetch'], ['Agent'], ['WebSearch'],
  ]);
  const r = hook('model-metrics.sh', { transcript_path: transcript, model: 'claude-haiku-4-5' });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[METRICS]'), '[METRICS] présent');
  ok(r.stdout.includes('⬆️'), 'flèche ⬆️ pour insuffisant (monter)');
  ok(r.stdout.includes('insuffisant') || r.stdout.includes('/model opus'), 'verdict insuffisant');
  rmSync(dir, { recursive: true, force: true });
});

test('sonnet + 5 tours Edit/Write → optimal 🟢', () => {
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-sonnet-4-6\n');
  const dir = mkdtempSync(resolve(tmpdir(), 'metrics-'));
  const transcript = makeTranscript(dir, [
    ['Edit', 'Write'], ['Edit'], ['Bash', 'Write'], ['Edit', 'Edit'], ['Write'],
  ]);
  const r = hook('model-metrics.sh', { transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[METRICS]'), '[METRICS] présent');
  ok(r.stdout.includes('🟢'), 'pastille 🟢 pour optimal');
  rmSync(dir, { recursive: true, force: true });
});

test('silencieux si pas de transcript', () => {
  const r = hook('model-metrics.sh', { prompt: 'bonjour' });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.trim() === '', 'aucune sortie sans transcript');
});

test('format role/content (fallback) — sonnet + 5 tours Read → léger surplus ⬇️', () => {
  writeFileSync(ROUTING_LEGACY_MODEL, 'claude-sonnet-4-6\n');
  const dir = mkdtempSync(resolve(tmpdir(), 'metrics-'));
  const transcript = resolve(dir, 'session.jsonl');
  // Format alternatif : {"role":"assistant","content":[...]}
  const lines = [['Read'], ['Glob'], ['Grep'], ['Read'], ['Read']].map(tools =>
    JSON.stringify({ role: 'assistant', content: tools.map((name, i) => ({ type: 'tool_use', id: `t${i}`, name, input: {} })) })
  );
  writeFileSync(transcript, lines.join('\n'));
  const r = hook('model-metrics.sh', { transcript_path: transcript });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('[METRICS]'), '[METRICS] présent (format role/content)');
  ok(r.stdout.includes('⬇️'), 'flèche ⬇️ pour léger surplus sonnet/low');
  rmSync(dir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────
// detect-design-need.sh — Séréna auto-proposition
// ─────────────────────────────────────────────────────────────
console.log('\n── detect-design-need.sh ──');

function resetSerenaFlag() {
  for (const name of readdirSync('/tmp')) {
    if (name.startsWith('claude-atelier-serena-proposed-')) {
      try { rmSync(`/tmp/${name}`, { force: true }); } catch {}
    }
  }
}

test('détecte "landing page" et propose Séréna', () => {
  resetSerenaFlag();
  const r = hook('detect-design-need.sh', {
    prompt: 'je veux créer une landing page pour mon SaaS',
    session_id: 'serena-session-1'
  });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('SÉRÉNA'), 'proposition Séréna présente');
  ok(r.stdout.includes('/design-senior'), 'slash command mentionné');
});

test('détecte "charte graphique" et propose Séréna', () => {
  resetSerenaFlag();
  const r = hook('detect-design-need.sh', {
    prompt: 'on doit refaire la charte graphique du projet',
    session_id: 'serena-session-2'
  });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.includes('SÉRÉNA'), 'proposition Séréna présente');
});

test('throttle : pas de double proposition dans la même session', () => {
  resetSerenaFlag();
  hook('detect-design-need.sh', {
    prompt: 'créer un dashboard ui',
    session_id: 'serena-same-session'
  });
  const r2 = hook('detect-design-need.sh', {
    prompt: 'ajoute un sidebar au design',
    session_id: 'serena-same-session'
  });
  ok(r2.stdout.trim() === '', 'deuxième appel silencieux (throttle)');
});

test('sessions distinctes : la proposition repart une fois par session', () => {
  resetSerenaFlag();
  hook('detect-design-need.sh', {
    prompt: 'créer un dashboard ui',
    session_id: 'serena-session-a'
  });
  const r2 = hook('detect-design-need.sh', {
    prompt: 'ajoute un sidebar au design',
    session_id: 'serena-session-b'
  });
  ok(r2.stdout.includes('SÉRÉNA'), 'la nouvelle session doit reproposer Séréna');
});

test('fallback transcript_path : throttle isolé par transcript si session_id absent', () => {
  resetSerenaFlag();
  hook('detect-design-need.sh', {
    prompt: 'je veux une hero section',
    transcript_path: '/tmp/serena-transcript-a.jsonl'
  });
  const r2 = hook('detect-design-need.sh', {
    prompt: 'je veux une hero section',
    transcript_path: '/tmp/serena-transcript-b.jsonl'
  });
  ok(r2.stdout.includes('SÉRÉNA'), 'un transcript distinct ne doit pas être throttlé');
});

test('silencieux sur prompt sans rapport avec le design', () => {
  resetSerenaFlag();
  const r = hook('detect-design-need.sh', {
    prompt: 'corrige le bug dans le hook routing-check',
    session_id: 'serena-session-3'
  });
  ok(r.status === 0, 'exit 0');
  ok(r.stdout.trim() === '', 'aucune sortie');
});

// ─────────────────────────────────────────────────────────────
// vault-context.sh — Peter injecte le vault projet au SessionStart
// ─────────────────────────────────────────────────────────────
console.log('\n── vault-context.sh ──');

test('silencieux si aucun vault projet', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'vault-hook-'));
  try {
    const r = spawnSync('bash', [resolve(ROOT, 'hooks', 'vault-context.sh')], {
      cwd: dir,
      input: JSON.stringify({ hook_event_name: 'SessionStart' }),
      encoding: 'utf8',
    });
    ok(r.status === 0, 'exit 0');
    ok(r.stdout.trim() === '', 'aucune sortie sans vault/');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('injecte brief et mailbox si vault projet présent', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'vault-hook-'));
  try {
    mkdirSync(resolve(dir, 'vault'), { recursive: true });
    writeFileSync(resolve(dir, 'vault', '00-brief.md'), '# Brief projet\n\nObjectif courant : livrer le MVP.\n');
    writeFileSync(resolve(dir, 'vault', '10-mailbox.md'), `# Mailbox projet\n\nIdée vendredi soir : challenger Peter.\n${'x'.repeat(900)}\n`);
    const r = spawnSync('bash', [resolve(ROOT, 'hooks', 'vault-context.sh')], {
      cwd: dir,
      input: JSON.stringify({ hook_event_name: 'SessionStart' }),
      encoding: 'utf8',
    });
    ok(r.status === 0, 'exit 0');
    ok(r.stdout.includes('[VAULT-PETER]'), 'marqueur Peter attendu');
    ok(r.stdout.includes('Objectif courant'), 'brief injecté');
    ok(r.stdout.includes('Idée vendredi soir'), 'mailbox injectée');
    ok(r.stdout.includes('Dernière modification :'), 'mtime attendu pour éviter la mémoire stale');
    ok(r.stdout.includes('[ligne tronquée]'), 'ligne longue tronquée attendue');
    ok(!r.stdout.includes('x'.repeat(700)), 'une ligne longue ne doit pas passer entière');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// src/master — ContextMonitor, SessionManager, vault-loader
// ─────────────────────────────────────────────────────────────
console.log('\n── Tests Master daemon ──');

const { ContextMonitor } = await import('../src/master/context-monitor.js');
const { SessionManager } = await import('../src/master/session-manager.js');
const { loadVaultBrief, loadProjectContext } = await import('../src/master/vault-loader.js');

test('ContextMonitor: push et getContext', () => {
  const cm = new ContextMonitor();
  cm.push('proj', 'bonjour', 'salut');
  ok(cm.getContext('proj').includes('Malik: bonjour'), 'message user stocké');
  ok(cm.getContext('proj').includes('Master: salut'), 'message assistant stocké');
});

test('ContextMonitor: rotation glissante — seuil exact MAX_TURNS=10', () => {
  const cm = new ContextMonitor();
  // Pousser exactement 10 tours : le 10e doit être présent
  for (let i = 0; i < 10; i++) cm.push('proj', `msg${i}`, `rep${i}`);
  ok(cm.getContext('proj').includes('msg0'), 'msg0 encore présent à 10 tours');
  ok(cm.getContext('proj').includes('msg9'), 'msg9 présent à 10 tours');
  // 11e tour : msg0 doit être expulsé
  cm.push('proj', 'msg10', 'rep10');
  ok(!cm.getContext('proj').includes('msg0'), 'msg0 expulsé au 11e tour (off-by-one vérifié)');
  ok(cm.getContext('proj').includes('msg10'), 'msg10 présent après rotation');
});

test('ContextMonitor: reset vide l historique', () => {
  const cm = new ContextMonitor();
  cm.push('proj', 'x', 'y');
  cm.reset('proj');
  ok(cm.getContext('proj') === '', 'reset → contexte vide');
});

test('SessionManager: état initial et getCwd fallback', () => {
  const sm = new SessionManager();
  ok(sm.active === null, 'actif = null par défaut');
  ok(sm.getCwd('/fallback') === '/fallback', 'getCwd retourne fallback');
});

test('SessionManager: activate et off', () => {
  const sm = new SessionManager();
  const result = sm.activate('/tmp');
  ok(result !== null, 'activate chemin existant');
  ok(sm.active?.path === '/tmp', 'active.path correct');
  sm.activate('off');
  ok(sm.active === null, 'off remet à null');
});

test('SessionManager: handleCommand /projets', () => {
  const sm = new SessionManager();
  const { handled, reply } = sm.handleCommand('/projets');
  ok(handled === true, '/projets handled');
  ok(typeof reply === 'string', '/projets reply string');
});

test('SessionManager: HOME absent → os.homedir() utilisé (sous-process)', () => {
  const script = `
    import os from 'node:os';
    delete process.env.HOME;
    const { SessionManager } = await import(${JSON.stringify(resolve(ROOT, 'src/master/session-manager.js'))});
    const sm = new SessionManager();
    // getCwd doit retourner le fallback sans crash même si HOME absent
    const cwd = sm.getCwd('/safe-fallback');
    process.stdout.write(cwd === '/safe-fallback' ? 'OK' : 'FAIL');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module'], {
    input: script,
    encoding: 'utf8',
    env: { ...process.env, HOME: '' },
  });
  ok(r.stdout.trim() === 'OK', 'SessionManager sans HOME → pas de crash');
});

test('vault-loader: chemin inexistant retourne ""', () => {
  ok(loadVaultBrief('/chemin/inexistant') === '', 'vault inexistant → ""');
  ok(loadProjectContext('/chemin/inexistant') === '', 'projet inexistant → ""');
});

test('vault-loader: fichier illisible (EACCES) retourne ""', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'vault-acl-'));
  try {
    const claudeMd = resolve(dir, 'CLAUDE.md');
    writeFileSync(claudeMd, 'contenu secret');
    chmodSync(claudeMd, 0o000);
    ok(loadVaultBrief(dir) === '', 'vault EACCES → ""');
    // loadProjectContext cherche .claude/CLAUDE.md puis CLAUDE.md
    const projDir = mkdtempSync(resolve(tmpdir(), 'proj-acl-'));
    writeFileSync(resolve(projDir, 'CLAUDE.md'), 'contenu projet');
    chmodSync(resolve(projDir, 'CLAUDE.md'), 0o000);
    ok(loadProjectContext(projDir) === '', 'projet EACCES → ""');
    chmodSync(resolve(projDir, 'CLAUDE.md'), 0o644);
    rmSync(projDir, { recursive: true, force: true });
  } finally {
    try { chmodSync(resolve(dir, 'CLAUDE.md'), 0o644); } catch { /* ignore */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────
// ollama-proxy — tests Go (go test)
// ─────────────────────────────────────────────────────────────
console.log('\n── ollama-proxy (Go) ──');

{
  const goCheck = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (goCheck.status !== 0) {
    console.log('  ⚠ go non disponible — tests proxy ignorés');
  } else {
    const goTest = spawnSync('go', ['test', '-v', '.'], {
      encoding: 'utf8',
      cwd: resolve(ROOT, 'scripts/ollama-proxy'),
    });
    const lines = (goTest.stdout + goTest.stderr).split('\n');
    for (const line of lines) {
      if (line.startsWith('--- PASS')) {
        console.log(`  ✓ ${line.replace('--- PASS: ', '')}`);
        pass++;
      } else if (line.startsWith('--- FAIL')) {
        console.error(`  ✗ ${line.replace('--- FAIL: ', '')}`);
        fail++;
      } else if (line.startsWith('FAIL') && !line.startsWith('--- FAIL')) {
        console.error(`  ✗ go test échoué : ${line}`);
        fail++;
      }
    }
    if (goTest.status !== 0 && !lines.some(l => l.startsWith('--- FAIL'))) {
      console.error('  ✗ go test: exit non-zéro');
      console.error(goTest.stderr);
      fail++;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Bilan
// ─────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n── Amine 🧪 : ${pass}/${total} tests passés${fail > 0 ? ` · ${fail} ÉCHECS` : ''} ──\n`);
if (fail > 0) process.exit(1);
