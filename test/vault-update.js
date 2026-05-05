/**
 * Tests Phase B — vault update incrémental Peter
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runVault } from '../bin/vault.js';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name) {
  if (condition) {
    passed++;
    results.push(`  ✓ ${name}`);
  } else {
    failed++;
    results.push(`  ✗ ${name}`);
  }
}

async function setup() {
  const dir = join(tmpdir(), `vault-test-b-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  await runVault(['node', 'vault', 'vault', 'init', '--cwd', dir]);
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

async function captureJSON(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (s) => { out += s; return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  try { return JSON.parse(out); } catch { return null; }
}

// ─── Test 1: vault update sans vault = exit 1 ─────────────────────────────────
{
  const dir = join(tmpdir(), `vault-noupdateb-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const code = await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(code === 1, 'vault update sans vault retourne exit 1');
  cleanup(dir);
}

// ─── Test 2: vault update crée vault/index/ ───────────────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', 'index')), 'vault update crée vault/index/');
  cleanup(dir);
}

// ─── Test 3: vault update crée manifest.json ──────────────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', 'index', 'manifest.json')), 'vault update crée manifest.json');
  cleanup(dir);
}

// ─── Test 4: manifest.json structure correcte ─────────────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  assert(m !== null, 'manifest.json est du JSON valide');
  assert(m?.version === 1, 'manifest.json.version === 1');
  assert(typeof m?.generatedAt === 'string', 'manifest.json.generatedAt est une string ISO');
  assert(typeof m?.fileCount === 'number', 'manifest.json.fileCount est un number');
  assert(Array.isArray(m?.files), 'manifest.json.files est un tableau');
  assert(m?.fileCount === m?.files?.length, 'manifest.json.fileCount === files.length');
  cleanup(dir);
}

// ─── Test 5: chaque entrée fichier a les champs requis ────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const f = m?.files?.find(x => x.path.endsWith('.md'));
  assert(f !== undefined, 'manifest.json contient au moins un fichier .md');
  assert(f && typeof f.sha256 === 'string' && f.sha256.length === 64, 'entrée fichier a sha256 hex 64 chars');
  assert(f && typeof f.mtime === 'string', 'entrée fichier a mtime ISO string');
  assert(f && typeof f.size === 'number', 'entrée fichier a size number');
  assert(f && typeof f.path === 'string', 'entrée fichier a path string');
  assert(f && typeof f.ext === 'string', 'entrée fichier a ext string');
  cleanup(dir);
}

// ─── Test 6: manifest.json exclut node_modules ────────────────────────────────
{
  const dir = await setup();
  mkdirSync(join(dir, 'node_modules', 'fake'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'fake', 'index.js'), 'module.exports = {}');
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasNodeModules = m?.files?.some(f => f.path.startsWith('node_modules'));
  assert(!hasNodeModules, 'manifest.json exclut node_modules');
  cleanup(dir);
}

// ─── Test 7: manifest.json exclut vault/.peter/cache ─────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasCache = m?.files?.some(f => f.path.includes('.peter/cache') || f.path.includes('.peter\\cache'));
  assert(!hasCache, 'manifest.json exclut vault/.peter/cache');
  cleanup(dir);
}

// ─── Test 8: manifest.json inclut les fichiers .md du vault ───────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasMd = m?.files?.some(f => f.path.endsWith('.md'));
  assert(hasMd, 'manifest.json inclut des fichiers .md');
  cleanup(dir);
}

// ─── Test 9: vault update crée vault/.peter/state.json ────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', '.peter', 'state.json')), 'vault update crée state.json');
  cleanup(dir);
}

// ─── Test 10: state.json structure correcte ───────────────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const s = readJSON(join(dir, 'vault', '.peter', 'state.json'));
  assert(s?.needsUpdate === false, 'state.json.needsUpdate === false après update');
  assert(s?.health === 'ok', 'state.json.health === ok');
  assert(typeof s?.fileCount === 'number', 'state.json.fileCount est un number');
  assert(s?.lastCommand === 'update', 'state.json.lastCommand === update');
  assert(typeof s?.lastRun === 'string', 'state.json.lastRun est une string ISO');
  cleanup(dir);
}

// ─── Test 11: vault update crée vault/.peter/cache/ ──────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', '.peter', 'cache')), 'vault update crée vault/.peter/cache/');
  cleanup(dir);
}

// ─── Test 12: vault update est incrémental (mtime skip) ──────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json'])
  );
  assert(result?.unchanged > 0, 'second run vault update utilise le cache mtime (unchanged > 0)');
  assert(result?.newCount === 0, 'second run vault update ne reporte pas de nouveaux fichiers');
  cleanup(dir);
}

// ─── Test 13: vault update --json retourne JSON valide ────────────────────────
{
  const dir = await setup();
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json'])
  );
  assert(result?.ok === true, 'vault update --json retourne { ok: true }');
  assert(typeof result?.fileCount === 'number', 'vault update --json contient fileCount');
  assert(typeof result?.newCount === 'number', 'vault update --json contient newCount');
  assert(typeof result?.unchanged === 'number', 'vault update --json contient unchanged');
  cleanup(dir);
}

// ─── Test 14: vault update respecte .peterignore ─────────────────────────────
{
  const dir = await setup();
  writeFileSync(join(dir, 'secret.log'), 'secret data');
  writeFileSync(join(dir, '.peterignore'), '*.log\n');
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasLog = m?.files?.some(f => f.path.endsWith('.log'));
  assert(!hasLog, 'vault update respecte .peterignore (exclut *.log)');
  cleanup(dir);
}

// ─── Test 15: vault stale informe sur manifest absent (INFO, non bloquant) ────
{
  const dir = await setup();
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'stale', '--cwd', dir, '--json'])
  );
  const manifestCheck = result?.checks?.find(c => c.file?.includes('manifest'));
  assert(manifestCheck?.status === 'INFO', 'vault stale informe sur manifest.json absent (status INFO, Phase B optionnel)');
  cleanup(dir);
}

// ─── Test 16: vault stale OK/WARN après vault update ─────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'stale', '--cwd', dir, '--json'])
  );
  const manifestCheck = result?.checks?.find(c => c.file?.includes('manifest'));
  assert(
    manifestCheck?.status === 'OK' || manifestCheck?.status === 'WARN',
    'vault stale OK/WARN après vault update (manifest présent)'
  );
  cleanup(dir);
}

// ─── Test 17: manifest.json détecte fichier nouveau ──────────────────────────
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  writeFileSync(join(dir, 'vault', 'NEW_FILE.md'), '# Nouveau fichier\n');
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json'])
  );
  assert(result?.newCount >= 1, 'vault update détecte un fichier nouveau après ajout');
  cleanup(dir);
}

// ─── Test 18: vault update détecte fichier supprimé (deletedCount) ───────────
{
  const dir = await setup();
  // Run 1 : index initial
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  // Ajouter un fichier extra
  writeFileSync(join(dir, 'vault', 'EXTRA.md'), '# Extra\n');
  // Run 2 : le fichier extra est indexé (newCount = 1)
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  // Supprimer le fichier extra
  rmSync(join(dir, 'vault', 'EXTRA.md'));
  // Run 3 : doit détecter la suppression
  const result = await captureJSON(() =>
    runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json'])
  );
  assert(result?.deletedCount >= 1, 'vault update détecte un fichier supprimé (deletedCount >= 1)');
  const s = readJSON(join(dir, 'vault', '.peter', 'state.json'));
  assert(s?.deletedFiles >= 1, 'state.json.deletedFiles >= 1 après suppression');
  cleanup(dir);
}

// ─── Résumé ───────────────────────────────────────────────────────────────────
console.log('\nvault Phase B — tests\n');
results.forEach(r => console.log(r));
console.log(`\n${passed + failed} tests : ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
