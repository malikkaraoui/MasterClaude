# Vault Incremental Index (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter `claude-atelier vault update` — scan incrémental du repo avec SHA256, manifest.json, state.json, cache/, respect des fichiers ignore.

**Architecture:** Toute la logique est ajoutée dans `bin/vault.js` (pattern existant). Un nouveau fichier `test/vault-update.js` couvre les 15+ cas. Le scan utilise `node:crypto` (SHA256) et `node:fs` (déjà importé). L'incrémental compare mtime avant de recalculer le SHA — évite de re-hasher les fichiers inchangés.

**Tech Stack:** Node.js ESM · node:crypto · node:fs · node:path · Markdown-first

---

## File Structure

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `bin/vault.js` | Modify | Ajouter ignore parser, SHA256, scanner, manifest, state, updateVault(), staleVault amélioré |
| `test/vault-update.js` | Create | 15+ tests Phase B |
| `package.json` | Modify | Ajouter `test:vault-update` + l'inclure dans `test` |
| `src/features.json` | Modify | Ajouter flag `update` |

**Fichiers générés à runtime dans le projet cible :**
- `vault/index/manifest.json` — liste complète + SHA256
- `vault/.peter/state.json` — dernier run, health, needsUpdate
- `vault/.peter/cache/` — répertoire vide Phase B, peuplé Phase C

---

### Task 1: Ajouter imports crypto + constantes ignore

**Files:**
- Modify: `bin/vault.js:12` (imports)

- [ ] **Step 1: Ajouter import crypto et constantes**

```js
import { createHash } from 'node:crypto';

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.turbo', '.svelte-kit', 'out', '.output',
]);
const DEFAULT_IGNORE_PATTERNS = [
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '*.min.js', '*.min.css', '*.map', '.DS_Store', 'Thumbs.db',
];
const MANIFEST_VERSION = 1;
const STATE_VERSION = 1;
```

- [ ] **Step 2: Vérifier que le fichier compile (pas de syntaxe cassée)**

```bash
node --input-type=module < bin/vault.js 2>&1 | head -5 || echo "OK (exit 0 attendu)"
```

---

### Task 2: Implémenter parseIgnoreFile + buildMatcher

**Files:**
- Modify: `bin/vault.js` (après `daysSince`)

- [ ] **Step 1: Écrire parseIgnoreFile**

```js
function parseIgnoreFile(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function globToRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*'; i++;
      if (pattern[i + 1] === '/') i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function buildIgnoreMatcher(extraPatterns = []) {
  const patterns = [...DEFAULT_IGNORE_PATTERNS, ...extraPatterns]
    .filter(p => !p.startsWith('!'))
    .map(p => {
      const anchored = p.startsWith('/');
      const dirOnly = p.endsWith('/');
      const clean = p.replace(/^\//, '').replace(/\/$/, '');
      return { raw: clean, anchored, dirOnly, re: globToRegex(clean) };
    });

  return (relPath, isDir) => {
    const name = relPath.split('/').pop();
    for (const pat of patterns) {
      if (pat.dirOnly && !isDir) continue;
      const test = pat.anchored ? pat.re.test(relPath) : (pat.re.test(relPath) || pat.re.test(name));
      if (test) return true;
    }
    return false;
  };
}
```

- [ ] **Step 2: Vérifier syntaxe**

```bash
node -e "import('./bin/vault.js').then(() => console.log('OK')).catch(e => console.error(e.message))"
```

---

### Task 3: Implémenter computeFileSHA256 + walkDir

**Files:**
- Modify: `bin/vault.js`

- [ ] **Step 1: Écrire computeFileSHA256**

```js
function computeFileSHA256(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}
```

- [ ] **Step 2: Écrire walkDir (générateur récursif)**

```js
function* walkDir(dir, isIgnored, relPrefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      if (isIgnored(relPath, true)) continue;
      yield* walkDir(join(dir, entry.name), isIgnored, relPath);
    } else if (entry.isFile()) {
      if (isIgnored(relPath, false)) continue;
      yield relPath;
    }
  }
}
```

---

### Task 4: Implémenter loadManifest + saveManifest + loadState + saveState

**Files:**
- Modify: `bin/vault.js`

- [ ] **Step 1: Écrire les 4 fonctions**

```js
function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return null; }
}

function saveManifest(manifestPath, manifest) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function loadState(statePath) {
  if (!existsSync(statePath)) return null;
  try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return null; }
}

function saveState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
```

---

### Task 5: Implémenter updateVault()

**Files:**
- Modify: `bin/vault.js`

- [ ] **Step 1: Écrire updateVault**

```js
function updateVault(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }

  const manifestPath = join(vaultDir, 'index', 'manifest.json');
  const statePath = join(vaultDir, '.peter', 'state.json');
  const cachePath = join(vaultDir, '.peter', 'cache');

  // Créer les répertoires
  mkdirSync(join(vaultDir, 'index'), { recursive: true });
  mkdirSync(cachePath, { recursive: true });

  // Charger l'ancien manifest pour l'incrémental
  const oldManifest = loadManifest(manifestPath);
  const oldByPath = new Map((oldManifest?.files ?? []).map(f => [f.path, f]));

  // Construire le matcher ignore
  const ignorePatterns = [
    ...parseIgnoreFile(join(cwd, '.gitignore')),
    ...parseIgnoreFile(join(cwd, '.peterignore')),
    ...parseIgnoreFile(join(cwd, '.claudeignore')),
  ];
  // Toujours exclure vault/.peter/cache
  ignorePatterns.push('vault/.peter/cache');
  const isIgnored = buildIgnoreMatcher(ignorePatterns);

  const now = new Date().toISOString();
  const files = [];
  let newCount = 0;
  let modCount = 0;
  let unchanged = 0;

  for (const relPath of walkDir(cwd, isIgnored)) {
    const absPath = join(cwd, relPath);
    const stat = statSync(absPath);
    const mtime = stat.mtime.toISOString();
    const old = oldByPath.get(relPath);

    let sha256;
    if (old && old.mtime === mtime) {
      sha256 = old.sha256;
      unchanged++;
    } else {
      sha256 = computeFileSHA256(absPath);
      if (old) modCount++; else newCount++;
    }

    files.push({
      path: relPath,
      sha256,
      mtime,
      size: stat.size,
      ext: relPath.includes('.') ? '.' + relPath.split('.').pop() : '',
    });
  }

  const deletedCount = oldByPath.size - (files.length - newCount);

  const manifest = {
    version: MANIFEST_VERSION,
    generatedAt: now,
    root: cwd,
    fileCount: files.length,
    files,
  };
  saveManifest(manifestPath, manifest);

  const state = {
    version: STATE_VERSION,
    lastRun: now,
    lastCommand: 'update',
    needsUpdate: false,
    health: 'ok',
    fileCount: files.length,
    newFiles: newCount,
    modifiedFiles: modCount,
    unchangedFiles: unchanged,
    deletedFiles: Math.max(0, deletedCount),
  };
  saveState(statePath, state);

  return {
    ok: true,
    manifestPath,
    statePath,
    cachePath,
    fileCount: files.length,
    newCount,
    modCount,
    unchanged,
    deletedCount: Math.max(0, deletedCount),
    ignorePatternCount: ignorePatterns.length,
  };
}
```

- [ ] **Step 2: Ajouter printUpdate**

```js
function printUpdate(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault update${NC}`);
  console.log(`  Projet  : ${cwd}`);
  console.log(`  Ignorés : defaults + ${result.ignorePatternCount} patterns lus`);
  console.log('');
  if (result.newCount > 0)  console.log(`  ${GREEN}[NEW]${NC}      ${result.newCount} fichier(s) nouveaux`);
  if (result.modCount > 0)  console.log(`  ${YELLOW}[MOD]${NC}      ${result.modCount} fichier(s) modifiés`);
  if (result.deletedCount > 0) console.log(`  ${RED}[DEL]${NC}      ${result.deletedCount} fichier(s) supprimés`);
  if (result.unchanged > 0) console.log(`  ${GREEN}[SKIP]${NC}     ${result.unchanged} fichier(s) inchangés (cache mtime)`);
  console.log('');
  console.log(`  → ${relative(cwd, result.manifestPath)} mis à jour (${result.fileCount} fichiers)`);
  console.log(`  → ${relative(cwd, result.statePath)} mis à jour`);
  console.log(`\n${GREEN}✓${NC} Index incrémental Peter à jour.`);
}
```

- [ ] **Step 3: Ajouter le handler dans runVault()**

```js
if (sub === 'update') {
  const result = updateVault(cwd);
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else printUpdate(result, cwd);
  return result.ok ? 0 : 1;
}
```

---

### Task 6: Améliorer staleVault — vérifier manifest + state

**Files:**
- Modify: `bin/vault.js` (fonction staleVault)

- [ ] **Step 1: Ajouter checks manifest et state dans staleVault**

Après les checks existants (brief, roadmap, report, mailbox), ajouter :

```js
const manifestPath = join(vaultDir, 'index', 'manifest.json');
const statePath = join(vaultDir, '.peter', 'state.json');

if (!existsSync(manifestPath)) {
  add('vault/index/manifest.json', 'MANQUANT', 'Index absent — lancez : claude-atelier vault update');
} else {
  const d = daysSince(manifestPath);
  const state = loadState(statePath);
  const needsUpdate = state?.needsUpdate === true;
  add('vault/index/manifest.json',
    needsUpdate ? 'STALE' : d > 1 ? 'WARN' : 'OK',
    needsUpdate
      ? `Marqué comme dépassé — lancez : claude-atelier vault update`
      : `${state?.fileCount ?? '?'} fichiers indexés, mis à jour il y a ${Math.floor(d * 24)}h`);
}
```

---

### Task 7: Mettre à jour features.json + package.json

**Files:**
- Modify: `src/features.json`
- Modify: `package.json`

- [ ] **Step 1: Ajouter flag `update` dans features.json**

Trouver l'entrée vault et ajouter `"update"` dans le tableau `flags`.

- [ ] **Step 2: Ajouter test:vault-update dans package.json**

```json
"test:vault-update": "node test/vault-update.js",
"test": "npm run lint && npm run doctor && npm run test:hooks && npm run test:merge && npm run test:apply-profile && npm run test:pulse && npm run test:vault && npm run test:vault-update"
```

---

### Task 8: Écrire test/vault-update.js

**Files:**
- Create: `test/vault-update.js`
- Test: `test/vault-update.js`

- [ ] **Step 1: Écrire les 15 cas de test**

```js
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
  const dir = join(tmpdir(), `vault-test-b-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  // vault init
  await runVault(['node', 'vault', 'vault', 'init', '--cwd', dir, '--json']);
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// --- Test 1: vault update sans vault = exit 1 ---
{
  const dir = join(tmpdir(), `vault-noupdateb-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const code = await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json']);
  assert(code === 1, 'vault update sans vault retourne exit 1');
  cleanup(dir);
}

// --- Test 2: vault update crée vault/index/ ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', 'index')), 'vault update crée vault/index/');
  cleanup(dir);
}

// --- Test 3: vault update crée manifest.json ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', 'index', 'manifest.json')), 'vault update crée manifest.json');
  cleanup(dir);
}

// --- Test 4: manifest.json a la structure correcte ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  assert(m !== null, 'manifest.json est du JSON valide');
  assert(m?.version === 1, 'manifest.json.version === 1');
  assert(typeof m?.generatedAt === 'string', 'manifest.json.generatedAt est une string');
  assert(typeof m?.fileCount === 'number', 'manifest.json.fileCount est un number');
  assert(Array.isArray(m?.files), 'manifest.json.files est un tableau');
  cleanup(dir);
}

// --- Test 5: chaque entrée fichier a sha256 + mtime + size + ext ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const f = m?.files?.[0];
  assert(f && typeof f.sha256 === 'string' && f.sha256.length === 64, 'entrée fichier a sha256 hex 64 chars');
  assert(f && typeof f.mtime === 'string', 'entrée fichier a mtime ISO string');
  assert(f && typeof f.size === 'number', 'entrée fichier a size number');
  assert(f && typeof f.path === 'string', 'entrée fichier a path string');
  cleanup(dir);
}

// --- Test 6: vault/index/manifest.json exclut node_modules ---
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

// --- Test 7: manifest.json exclut vault/.peter/cache ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  // re-run pour avoir le cache
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasCache = m?.files?.some(f => f.path.includes('.peter/cache'));
  assert(!hasCache, 'manifest.json exclut vault/.peter/cache');
  cleanup(dir);
}

// --- Test 8: manifest.json inclut les fichiers .md du vault ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const m = readJSON(join(dir, 'vault', 'index', 'manifest.json'));
  const hasMd = m?.files?.some(f => f.path.endsWith('.md'));
  assert(hasMd, 'manifest.json inclut des fichiers .md');
  cleanup(dir);
}

// --- Test 9: vault update crée vault/.peter/state.json ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', '.peter', 'state.json')), 'vault update crée state.json');
  cleanup(dir);
}

// --- Test 10: state.json a la structure correcte ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const s = readJSON(join(dir, 'vault', '.peter', 'state.json'));
  assert(s?.needsUpdate === false, 'state.json.needsUpdate === false après update');
  assert(s?.health === 'ok', 'state.json.health === ok');
  assert(typeof s?.fileCount === 'number', 'state.json.fileCount est un number');
  assert(s?.lastCommand === 'update', 'state.json.lastCommand === update');
  cleanup(dir);
}

// --- Test 11: vault update crée vault/.peter/cache/ ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  assert(existsSync(join(dir, 'vault', '.peter', 'cache')), 'vault update crée vault/.peter/cache/');
  cleanup(dir);
}

// --- Test 12: vault update est incrémental (mtime skip) ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  // Second run — tout inchangé
  const result = {};
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json']);
  process.stdout.write = origWrite;
  const parsed = JSON.parse(captured);
  assert(parsed.unchanged > 0, 'second run vault update utilise le cache mtime (unchanged > 0)');
  assert(parsed.newCount === 0, 'second run vault update ne reporte pas de nouveaux fichiers');
  cleanup(dir);
}

// --- Test 13: vault update --json retourne JSON valide ---
{
  const dir = await setup();
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  const code = await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir, '--json']);
  process.stdout.write = origWrite;
  let parsed;
  try { parsed = JSON.parse(captured); } catch { parsed = null; }
  assert(code === 0, 'vault update --json retourne exit 0');
  assert(parsed?.ok === true, 'vault update --json retourne { ok: true }');
  assert(typeof parsed?.fileCount === 'number', 'vault update --json contient fileCount');
  cleanup(dir);
}

// --- Test 14: vault update respecte .peterignore ---
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

// --- Test 15: vault stale détecte manifest absent ---
{
  const dir = await setup();
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  await runVault(['node', 'vault', 'vault', 'stale', '--cwd', dir, '--json']);
  process.stdout.write = origWrite;
  const parsed = JSON.parse(captured);
  const manifestCheck = parsed?.checks?.find(c => c.file?.includes('manifest'));
  assert(manifestCheck?.status === 'MANQUANT', 'vault stale signale manifest.json absent');
  cleanup(dir);
}

// --- Test 16: vault stale OK après vault update ---
{
  const dir = await setup();
  await runVault(['node', 'vault', 'vault', 'update', '--cwd', dir]);
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  await runVault(['node', 'vault', 'vault', 'stale', '--cwd', dir, '--json']);
  process.stdout.write = origWrite;
  const parsed = JSON.parse(captured);
  const manifestCheck = parsed?.checks?.find(c => c.file?.includes('manifest'));
  assert(manifestCheck?.status === 'OK' || manifestCheck?.status === 'WARN', 'vault stale OK/WARN après vault update');
  cleanup(dir);
}

// --- Résumé ---
console.log('\nvault Phase B — tests\n');
results.forEach(r => console.log(r));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Lancer les tests**

```bash
npm run test:vault-update
```

Expected: `16 passed, 0 failed`

---

### Task 9: npm test complet

- [ ] **Step 1: Lancer npm test**

```bash
npm test
```

Expected: tous les suites passent, 0 failed.

- [ ] **Step 2: Commit intermédiaire**

```bash
git add bin/vault.js test/vault-update.js package.json src/features.json
git commit -m "feat: ajoute vault update — index incrémental Peter Phase B"
```

---

### Task 10: Handoff Copilot + PR

- [ ] Lancer `/review-copilot`
- [ ] Créer PR GitHub
- [ ] Intégrer review
- [ ] Merge main + bump 0.23.5
- [ ] `vault update` sur le vault claude-atelier
