# Pulse & Maestro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le système de présence multi-agents (pouls.md) avec Maestro §0 watcher, pastille 💓 dans l'entête §1, et CLI `claude-atelier pulse`.

**Architecture:** Bibliothèque Node.js `src/pulse/` (parse, intensity, write, format) appelée par deux hooks bash (Start=Maestro, Stop=pulse-update) et la CLI `bin/pulse.js`. Tout est fichier-local, sans infra, bilingue FR/EN via `src/{fr,en}/pulse/strings.json`.

**Tech Stack:** Node.js ESM, bash hooks, YAML minimal sans dépendance externe, `node:readline` pour l'init interactif.

---

## Structure des fichiers

### Créer
| Fichier | Responsabilité |
|---------|----------------|
| `src/pulse/parse.js` | Parser frontmatter YAML minimal + check TTL |
| `src/pulse/intensity.js` | Calcul intensité par rôle + phase |
| `src/pulse/write.js` | Sérialisation + écriture `pouls.md` |
| `src/pulse/format.js` | Formatage affichage CLI (FR/EN) |
| `src/fr/pulse/strings.json` | Strings FR (niveaux, rôles, messages) |
| `src/en/pulse/strings.json` | Strings EN |
| `src/profiles/roles/dev.yaml` | Template rôle dev |
| `src/profiles/roles/secretary.yaml` | Template rôle secrétaire |
| `src/profiles/roles/marketing.yaml` | Template rôle marketing |
| `src/profiles/roles/cyber.yaml` | Template rôle cyber |
| `src/profiles/roles/ops.yaml` | Template rôle ops |
| `scripts/pulse-update.js` | Script Node appelé par stop hook |
| `scripts/pulse-maestro.js` | Script Node appelé par start hook (Maestro) |
| `hooks/stop-pulse.sh` | Stop hook : appel pulse-update.js |
| `hooks/start-maestro.sh` | Start hook : appel pulse-maestro.js |
| `bin/pulse.js` | CLI `claude-atelier pulse` |
| `test/pulse.js` | Tous les tests unitaires pulse |

### Modifier
| Fichier | Changement |
|---------|-----------|
| `bin/cli.js` | Ajouter `pulse` dans `knownCommands` + routing |
| `src/features.json` | Ajouter commande `pulse` + highlight |
| `src/features-registry.json` | Feature flag `pulse` + groupe `orchestration` |
| `bin/init.js` | Ajouter prompt interactif langue si absent |
| `hooks/session-model.sh` | Lire `/tmp/claude-atelier-pulse-status` et appendre `[PULSE]` |
| `.claude/CLAUDE.md` §1 | Documenter extraction `[PULSE]` dans entête |
| `package.json` | Ajouter `test:pulse` + l'intégrer dans `test` |

---

## Task 1: Branche git

**Files:**
- (aucun fichier modifié)

- [ ] **Step 1: Créer la branche feature**

```bash
git checkout -b feat/pulse-maestro
```

Expected: `Switched to a new branch 'feat/pulse-maestro'`

- [ ] **Step 2: Vérifier la version Node**

```bash
node --version
```

Expected: `v18.x.x` ou supérieur (requis pour `fs.readdirSync` recursive).

---

## Task 2: Templates de rôles YAML

**Files:**
- Create: `src/profiles/roles/dev.yaml`
- Create: `src/profiles/roles/secretary.yaml`
- Create: `src/profiles/roles/marketing.yaml`
- Create: `src/profiles/roles/cyber.yaml`
- Create: `src/profiles/roles/ops.yaml`

- [ ] **Step 1: Créer `src/profiles/roles/dev.yaml`**

```yaml
role: dev
ttl: 300
ceiling: 0.8
base: 0.3
description: "Développeur — bursts intenses, repos entre sprints"
```

- [ ] **Step 2: Créer `src/profiles/roles/secretary.yaml`**

```yaml
role: secretary
ttl: 600
ceiling: 0.3
base: 0.2
description: "Secrétaire — toujours actif, faible intensité"
```

- [ ] **Step 3: Créer `src/profiles/roles/marketing.yaml`**

```yaml
role: marketing
ttl: 900
ceiling: 0.6
base: 0.3
description: "Marketing — heures ouvrées, intensité modérée"
```

- [ ] **Step 4: Créer `src/profiles/roles/cyber.yaml`**

```yaml
role: cyber
ttl: 120
ceiling: 1.0
base: 0.4
description: "Cyber — on-call, peut monter jusqu'à critique"
```

- [ ] **Step 5: Créer `src/profiles/roles/ops.yaml`**

```yaml
role: ops
ttl: 180
ceiling: 0.7
base: 0.4
description: "Ops — continu, intensité modérée à élevée"
```

- [ ] **Step 6: Commit**

```bash
git add src/profiles/roles/
git commit -m "feat(pulse): templates de rôles YAML (dev, secretary, marketing, cyber, ops)"
```

---

## Task 3: `src/pulse/parse.js` (TDD)

**Files:**
- Create: `src/pulse/parse.js`
- Create: `test/pulse.js`

- [ ] **Step 1: Écrire les tests dans `test/pulse.js`**

```js
#!/usr/bin/env node
/**
 * test/pulse.js — Tests unitaires système Pulse & Maestro
 * Usage: node test/pulse.js  (ou: npm run test:pulse)
 */

import { parsePoulsMdContent, isExpired, ageSeconds } from '../src/pulse/parse.js';

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

// ── parse.js ──────────────────────────────────────────────────────────────────
console.log('\n[parse.js]');

const VALID_MD = `---
schema: pouls/1.0
agent:
  id: claude-code/test
  name: Test Agent
  role: dev
  provider: claude

status: idle
lastPulse: "2020-01-01T00:00:00Z"
ttl: 300

phase: "Phase test"
intensity:
  current: 0.30
  ceiling: 0.80

lang: fr
---

## État
test
`;

test('parse frontmatter valide', () => {
  const p = parsePoulsMdContent(VALID_MD);
  ok(p.schema === 'pouls/1.0', 'schema');
  ok(p.agent.id === 'claude-code/test', 'agent.id');
  ok(p.agent.role === 'dev', 'agent.role');
  ok(p.status === 'idle', 'status');
  ok(p.ttl === 300, 'ttl number');
  ok(p.intensity.current === 0.30, 'intensity.current');
  ok(p.intensity.ceiling === 0.80, 'intensity.ceiling');
  ok(p.lang === 'fr', 'lang');
  ok(p._body.includes('## État'), '_body');
});

test('erreur si frontmatter absent', () => {
  let threw = false;
  try { parsePoulsMdContent('# no frontmatter'); } catch { threw = true; }
  ok(threw, 'doit lever une erreur');
});

test('erreur si schema incorrect', () => {
  const bad = VALID_MD.replace('pouls/1.0', 'pouls/2.0');
  let threw = false;
  try { parsePoulsMdContent(bad); } catch { threw = true; }
  ok(threw, 'doit lever une erreur schema');
});

test('isExpired: lastPulse ancienne → expiré', () => {
  const p = parsePoulsMdContent(VALID_MD);
  ok(isExpired(p), 'doit être expiré (lastPulse 2020)');
});

test('isExpired: lastPulse récente → non expiré', () => {
  const fresh = VALID_MD.replace('"2020-01-01T00:00:00Z"', `"${new Date().toISOString()}"`);
  const p = parsePoulsMdContent(fresh);
  ok(!isExpired(p), 'ne doit pas être expiré');
});

test('ageSeconds: renvoie un nombre positif', () => {
  const p = parsePoulsMdContent(VALID_MD);
  const age = ageSeconds(p);
  ok(age > 0 && isFinite(age), `age=${age} doit être positif fini`);
});

// ── résumé ────────────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed · ${fail} failed\n`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
node test/pulse.js
```

Expected: `Cannot find module '../src/pulse/parse.js'`

- [ ] **Step 3: Créer `src/pulse/parse.js`**

```js
// src/pulse/parse.js
import { readFileSync, existsSync } from 'node:fs';

export const SCHEMA_VERSION = 'pouls/1.0';

export function parsePoulsMd(filePath) {
  if (!existsSync(filePath)) return null;
  return parsePoulsMdContent(readFileSync(filePath, 'utf8'));
}

export function parsePoulsMdContent(content) {
  const m = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (!m) throw new Error('pouls.md: frontmatter YAML manquant');

  const fm = _parseYaml(m[1]);
  if (fm.schema !== SCHEMA_VERSION) {
    throw new Error(`pouls.md: schema "${fm.schema}" non supporté (attendu: ${SCHEMA_VERSION})`);
  }

  return { ...fm, _body: content.slice(m[0].length).trim() };
}

export function isExpired(pouls) {
  if (!pouls.lastPulse || typeof pouls.ttl !== 'number') return true;
  return ageSeconds(pouls) > pouls.ttl;
}

export function ageSeconds(pouls) {
  if (!pouls.lastPulse) return Infinity;
  return (Date.now() - new Date(pouls.lastPulse).getTime()) / 1000;
}

function _parseYaml(yaml) {
  const result = {};
  let parent = null;

  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const nested = line.match(/^  (\w[\w-]*):\s*(.*)$/);
    const top    = line.match(/^(\w[\w-]*):\s*(.*)$/);

    if (nested && parent) {
      result[parent][nested[1]] = _coerce(nested[2]);
    } else if (top) {
      if (top[2] === '') {
        parent = top[1];
        result[parent] = {};
      } else {
        parent = null;
        result[top[1]] = _coerce(top[2]);
      }
    }
  }

  return result;
}

function _coerce(v) {
  const s = v.replace(/^["']|["']$/g, '').trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === '') return s;
  const n = Number(s);
  return isNaN(n) ? s : n;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
node test/pulse.js
```

Expected: `6 passed · 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src/pulse/parse.js test/pulse.js
git commit -m "feat(pulse): src/pulse/parse.js + tests TDD"
```

---

## Task 4: `src/pulse/intensity.js` (TDD)

**Files:**
- Modify: `test/pulse.js`
- Create: `src/pulse/intensity.js`

- [ ] **Step 1: Ajouter les tests intensity dans `test/pulse.js`**

Ajouter à la fin de `test/pulse.js`, avant le bloc `// ── résumé` :

```js
// ── intensity.js ─────────────────────────────────────────────────────────────
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';

console.log('\n[intensity.js]');

test('getProfile dev: ceiling 0.8', () => {
  const p = getProfile('dev');
  ok(p.ceiling === 0.8, `ceiling=${p.ceiling}`);
  ok(p.base === 0.3, `base=${p.base}`);
});

test('getProfile inconnu → profile par défaut', () => {
  const p = getProfile('unknown_role');
  ok(p.ceiling > 0, 'ceiling doit être positif');
});

test('computeIntensity dev + phase impl → boost', () => {
  const base = computeIntensity('dev', '');
  const boosted = computeIntensity('dev', 'Phase 2 — implémentation proxy');
  ok(boosted > base, `boosted(${boosted}) > base(${base})`);
});

test('computeIntensity dev + phase freeze → réduit', () => {
  const base = computeIntensity('dev', '');
  const frozen = computeIntensity('dev', 'freeze release');
  ok(frozen <= base, `frozen(${frozen}) <= base(${base})`);
});

test('computeIntensity ne dépasse jamais le ceiling', () => {
  const profile = getProfile('secretary');
  const val = computeIntensity('secretary', 'impl code fix feat deploy release');
  ok(val <= profile.ceiling, `val(${val}) <= ceiling(${profile.ceiling})`);
});

test('computeIntensity toujours >= 0', () => {
  const val = computeIntensity('ops', 'freeze pause repos');
  ok(val >= 0, `val(${val}) doit être >= 0`);
});

test('intensityToStatus: 0 → off', () => ok(intensityToStatus(0) === 'off', 'off'));
test('intensityToStatus: 0.15 → idle', () => ok(intensityToStatus(0.15) === 'idle', 'idle'));
test('intensityToStatus: 0.3 → low', () => ok(intensityToStatus(0.3) === 'low', 'low'));
test('intensityToStatus: 0.5 → medium', () => ok(intensityToStatus(0.5) === 'medium', 'medium'));
test('intensityToStatus: 0.7 → high', () => ok(intensityToStatus(0.7) === 'high', 'high'));
test('intensityToStatus: 0.9 → critical', () => ok(intensityToStatus(0.9) === 'critical', 'critical'));
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
node test/pulse.js
```

Expected: `Cannot find module '../src/pulse/intensity.js'`

- [ ] **Step 3: Créer `src/pulse/intensity.js`**

```js
// src/pulse/intensity.js

const ROLE_PROFILES = {
  secretary: { ceiling: 0.3, base: 0.2 },
  dev:       { ceiling: 0.8, base: 0.3 },
  marketing: { ceiling: 0.6, base: 0.3 },
  cyber:     { ceiling: 1.0, base: 0.4 },
  ops:       { ceiling: 0.7, base: 0.4 },
};

const DEFAULT_PROFILE = { ceiling: 0.5, base: 0.2 };

const PHASE_BOOSTS = [
  { keywords: ['archi', 'conception', 'design', 'spec'],        boosts: { dev: 0.3, ops: 0.2 } },
  { keywords: ['impl', 'code', 'feat', 'fix', 'dev'],           boosts: { dev: 0.4 } },
  { keywords: ['review', 'qa', 'test'],                         boosts: { secretary: 0.1, dev: 0.2 } },
  { keywords: ['deploy', 'release', 'publish', 'bump', 'prod'], boosts: { ops: 0.3, cyber: 0.2 } },
  { keywords: ['freeze', 'pause', 'repos'],                     boosts: { dev: -0.2, ops: -0.2, marketing: -0.2 } },
];

export function getProfile(role) {
  return ROLE_PROFILES[role] ?? DEFAULT_PROFILE;
}

export function computeIntensity(role, phase) {
  const profile = getProfile(role);
  const phaseLow = (phase ?? '').toLowerCase();
  let boost = 0;

  for (const { keywords, boosts } of PHASE_BOOSTS) {
    if (keywords.some(k => phaseLow.includes(k))) {
      boost += boosts[role] ?? 0;
    }
  }

  return Math.min(Math.max(profile.base + boost, 0), profile.ceiling);
}

export function intensityToStatus(intensity) {
  if (intensity === 0) return 'off';
  if (intensity <= 0.2) return 'idle';
  if (intensity <= 0.4) return 'low';
  if (intensity <= 0.6) return 'medium';
  if (intensity <= 0.8) return 'high';
  return 'critical';
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
node test/pulse.js
```

Expected: `17 passed · 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src/pulse/intensity.js test/pulse.js
git commit -m "feat(pulse): src/pulse/intensity.js + tests TDD"
```

---

## Task 5: `src/pulse/write.js` (TDD)

**Files:**
- Modify: `test/pulse.js`
- Create: `src/pulse/write.js`

- [ ] **Step 1: Ajouter les tests write dans `test/pulse.js`**

Ajouter avant le bloc `// ── résumé` :

```js
// ── write.js ─────────────────────────────────────────────────────────────────
import { serialisePoulsMd } from '../src/pulse/write.js';
import { parsePoulsMdContent } from '../src/pulse/parse.js';

console.log('\n[write.js]');

const SAMPLE_DATA = {
  agent: { id: 'claude-code/test', name: 'Test', role: 'dev', provider: 'claude' },
  status: 'high',
  lastPulse: '2026-04-28T12:00:00Z',
  ttl: 300,
  phase: 'Phase test',
  intensity: { current: 0.70, ceiling: 0.80 },
  lang: 'fr',
};

test('serialisePoulsMd produit un frontmatter YAML parsable', () => {
  const content = serialisePoulsMd(SAMPLE_DATA, '## Corps\nTest.');
  const parsed = parsePoulsMdContent(content);
  ok(parsed.agent.id === 'claude-code/test', 'agent.id round-trip');
  ok(parsed.status === 'high', 'status round-trip');
  ok(parsed.ttl === 300, 'ttl round-trip');
  ok(parsed.intensity.current === 0.70, 'intensity.current round-trip');
  ok(parsed._body.includes('## Corps'), '_body round-trip');
});

test('serialisePoulsMd commence par ---', () => {
  const content = serialisePoulsMd(SAMPLE_DATA, '');
  ok(content.startsWith('---\n'), 'doit commencer par ---');
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
node test/pulse.js
```

Expected: `Cannot find module '../src/pulse/write.js'`

- [ ] **Step 3: Créer `src/pulse/write.js`**

```js
// src/pulse/write.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_VERSION } from './parse.js';

export function serialisePoulsMd(data, body) {
  const yaml = [
    `schema: ${SCHEMA_VERSION}`,
    `agent:`,
    `  id: ${data.agent.id}`,
    `  name: ${data.agent.name}`,
    `  role: ${data.agent.role}`,
    `  provider: ${data.agent.provider}`,
    ``,
    `status: ${data.status}`,
    `lastPulse: "${data.lastPulse}"`,
    `ttl: ${data.ttl}`,
    ``,
    `phase: "${data.phase}"`,
    `intensity:`,
    `  current: ${Number(data.intensity.current).toFixed(2)}`,
    `  ceiling: ${Number(data.intensity.ceiling).toFixed(2)}`,
    ``,
    `lang: ${data.lang}`,
  ].join('\n');

  return `---\n${yaml}\n---\n\n${body ?? ''}\n`;
}

export function writePoulsMd(filePath, data, body) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, serialisePoulsMd(data, body), 'utf8');
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
node test/pulse.js
```

Expected: `19 passed · 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src/pulse/write.js test/pulse.js
git commit -m "feat(pulse): src/pulse/write.js + tests TDD"
```

---

## Task 6: Strings i18n + `src/pulse/format.js` (TDD)

**Files:**
- Create: `src/fr/pulse/strings.json`
- Create: `src/en/pulse/strings.json`
- Create: `src/pulse/format.js`
- Modify: `test/pulse.js`

- [ ] **Step 1: Créer `src/fr/pulse/strings.json`**

```json
{
  "header": "Agents actifs",
  "expired": "EXPIRÉ",
  "levels": {
    "off": "éteint",
    "idle": "repos",
    "low": "faible",
    "medium": "modéré",
    "high": "élevé",
    "critical": "critique"
  },
  "roles": {
    "secretary": "secrétaire",
    "dev": "dev",
    "marketing": "marketing",
    "cyber": "cyber",
    "ops": "ops"
  }
}
```

- [ ] **Step 2: Créer `src/en/pulse/strings.json`**

```json
{
  "header": "Active agents",
  "expired": "EXPIRED",
  "levels": {
    "off": "off",
    "idle": "idle",
    "low": "low",
    "medium": "moderate",
    "high": "high",
    "critical": "critical"
  },
  "roles": {
    "secretary": "secretary",
    "dev": "dev",
    "marketing": "marketing",
    "cyber": "cyber",
    "ops": "ops"
  }
}
```

- [ ] **Step 3: Ajouter les tests format dans `test/pulse.js`**

Ajouter avant `// ── résumé` :

```js
// ── format.js ────────────────────────────────────────────────────────────────
import { statusLabel, pulseIndicator, renderStatusTable } from '../src/pulse/format.js';

console.log('\n[format.js]');

test('statusLabel FR: high → élevé', () => {
  ok(statusLabel('high', 'fr') === 'élevé', 'élevé');
});

test('statusLabel EN: high → high', () => {
  ok(statusLabel('high', 'en') === 'high', 'high');
});

test('statusLabel FR: idle → repos', () => {
  ok(statusLabel('idle', 'fr') === 'repos', 'repos');
});

test('pulseIndicator format correct FR', () => {
  const ind = pulseIndicator('high', 2, 3, 'fr');
  ok(ind === '💓élevé·2/3', `attendu 💓élevé·2/3, reçu: ${ind}`);
});

test('pulseIndicator format correct EN', () => {
  const ind = pulseIndicator('high', 2, 3, 'en');
  ok(ind === '💓high·2/3', `attendu 💓high·2/3, reçu: ${ind}`);
});

test('renderStatusTable contient la séparation et le récapitulatif', () => {
  const agents = [
    { agent: { id: 'a/b', role: 'dev' }, status: 'high', lastPulse: new Date().toISOString(), ttl: 300, phase: 'Phase test', intensity: { current: 0.7, ceiling: 0.8 } },
    { agent: { id: 'c/d', role: 'ops' }, status: 'idle', lastPulse: '2020-01-01T00:00:00Z', ttl: 300, phase: 'Phase test', intensity: { current: 0.1, ceiling: 0.5 } },
  ];
  const table = renderStatusTable(agents, 'fr');
  ok(table.includes('💓'), 'doit contenir 💓');
  ok(table.includes('agents'), 'doit contenir "agents"');
  ok(table.includes('EXPIRÉ'), 'doit contenir EXPIRÉ pour le 2e agent');
});
```

- [ ] **Step 4: Vérifier que les tests échouent**

```bash
node test/pulse.js
```

Expected: `Cannot find module '../src/pulse/format.js'`

- [ ] **Step 5: Créer `src/pulse/format.js`**

```js
// src/pulse/format.js
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExpired, ageSeconds } from './parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const _cache = {};

function _loadStrings(lang) {
  if (_cache[lang]) return _cache[lang];
  const p = join(__dirname, '..', lang, 'pulse', 'strings.json');
  const fallback = join(__dirname, '..', 'fr', 'pulse', 'strings.json');
  _cache[lang] = JSON.parse(readFileSync(existsSync(p) ? p : fallback, 'utf8'));
  return _cache[lang];
}

export function statusLabel(status, lang = 'fr') {
  return _loadStrings(lang).levels[status] ?? status;
}

export function pulseIndicator(status, active, total, lang = 'fr') {
  return `💓${statusLabel(status, lang)}·${active}/${total}`;
}

export function formatAge(seconds, lang = 'fr') {
  if (!isFinite(seconds)) return '—';
  const prefix = lang === 'en' ? '' : 'il y a ';
  const suffix = lang === 'en' ? ' ago' : '';
  if (seconds < 60)   return `${prefix}${Math.round(seconds)}s${suffix}`;
  if (seconds < 3600) return `${prefix}${Math.round(seconds / 60)}min${suffix}`;
  return `${prefix}${Math.round(seconds / 3600)}h${suffix}`;
}

export function renderStatusTable(agents, lang = 'fr') {
  const s = _loadStrings(lang);
  const phase = agents[0]?.phase ?? '—';
  const active = agents.filter(a => !isExpired(a)).length;
  const expired = agents.filter(a => isExpired(a)).length;
  const sep = '─'.repeat(70);

  const lines = [`💓 ${s.header} — ${phase}`, sep];

  for (const a of agents) {
    const exp = isExpired(a);
    const level = statusLabel(a.status, lang);
    const role = s.roles?.[a.agent?.role] ?? a.agent?.role ?? '—';
    const cur = Number(a.intensity?.current ?? 0).toFixed(1);
    const ceil = Number(a.intensity?.ceiling ?? 0).toFixed(1);
    const ageStr = exp ? s.expired : formatAge(ageSeconds(a), lang);
    lines.push(
      `  ${(a.agent?.id ?? '—').padEnd(28)} ${role.padEnd(10)} 💓${level.padEnd(8)} ` +
      `${cur}/${ceil}  ${exp ? '✗' : '✓'} ${ageStr}`
    );
  }

  lines.push(sep);
  lines.push(`  ${agents.length} agents · ${active} actifs · ${expired} expirés`);
  return lines.join('\n');
}
```

- [ ] **Step 6: Vérifier que les tests passent**

```bash
node test/pulse.js
```

Expected: `26 passed · 0 failed`

- [ ] **Step 7: Commit**

```bash
git add src/fr/pulse/ src/en/pulse/ src/pulse/format.js test/pulse.js
git commit -m "feat(pulse): i18n strings FR/EN + src/pulse/format.js + tests TDD"
```

---

## Task 7: Feature flags

**Files:**
- Modify: `src/features-registry.json`
- Modify: `src/features.json`

- [ ] **Step 1: Ajouter le groupe `orchestration` et la feature `pulse` dans `src/features-registry.json`**

Dans la clé `"groups"`, ajouter après le groupe `"copilot_loop"` :

```json
    "orchestration": {
      "label": "Orchestration",
      "features": ["pulse", "pulse_header"]
    },
```

Dans la clé `"features"`, ajouter :

```json
    "pulse": {
      "label": "Pulse multi-agents",
      "description": "Système de présence multi-agents (pouls.md) avec Maestro §0 watcher",
      "default": true
    },
    "pulse_header": {
      "label": "Entête: pastille pouls",
      "description": "Afficher 💓{niveau}·{n}/{total} dans l'entête §1",
      "default": true
    },
```

Et dans la clé `"entete"` > `"features"`, ajouter `"pulse_header"` à la fin :

```json
      "features": ["header_show_date", "header_show_time", "header_show_model", "header_show_pastille", "header_show_mode", "header_show_ollama", "header_show_proxy", "pulse_header"]
```

- [ ] **Step 2: Ajouter la commande `pulse` dans `src/features.json`**

Dans le tableau `"commands"`, ajouter avant `"apply"` :

```json
    {
      "name": "pulse",
      "description": "Gestion du pouls multi-agents (statut, init, mise à jour)",
      "flags": [
        "--role <secretary|dev|marketing|cyber|ops>",
        "--json",
        "--expired",
        "--lang <fr|en>",
        "--global"
      ]
    },
```

Dans `"highlights"`, ajouter :

```json
    "Système de présence multi-agents (pouls.md) avec Maestro §0 watcher",
```

- [ ] **Step 3: Vérifier que le JSON est valide**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/features-registry.json','utf8')); console.log('OK features-registry')"
node -e "JSON.parse(require('fs').readFileSync('src/features.json','utf8')); console.log('OK features')"
```

Expected: `OK features-registry` et `OK features`

- [ ] **Step 4: Commit**

```bash
git add src/features-registry.json src/features.json
git commit -m "feat(pulse): feature flags pulse + pulse_header dans features-registry"
```

---

## Task 8: Hook Stop — `stop-pulse.sh` + `scripts/pulse-update.js`

**Files:**
- Create: `scripts/pulse-update.js`
- Create: `hooks/stop-pulse.sh`

- [ ] **Step 1: Créer `scripts/pulse-update.js`**

```js
#!/usr/bin/env node
/**
 * scripts/pulse-update.js — appelé par hooks/stop-pulse.sh (Stop hook)
 * Met à jour pouls.md pour l'agent Claude Code courant.
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ID = `claude-code/${hostname()}`;

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

function readPhaseFromClaude(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  const content = require('node:fs').readFileSync(claudeMd, 'utf8');
  const m = content.match(/\|\s*Phase\s*\|([^|]+)\|/);
  return m ? m[1].trim() : '';
}

// Use dynamic import for readFileSync
import { readFileSync } from 'node:fs';

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const phase = readPhase(ROOT);
const files = findPoulsMdFiles(ROOT);

let updated = 0;
for (const f of files) {
  try {
    const existing = parsePoulsMd(f);
    if (!existing || existing.agent?.id !== AGENT_ID) continue;

    const role = existing.agent.role ?? 'dev';
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);
    const status = intensityToStatus(intensity);

    writePoulsMd(f, {
      ...existing,
      status,
      lastPulse: new Date().toISOString(),
      phase: phase || existing.phase,
      intensity: { current: intensity, ceiling: profile.ceiling },
    }, existing._body);

    updated++;
    process.stderr.write(`[PULSE] mise à jour: ${f}\n`);
  } catch (e) {
    process.stderr.write(`[PULSE] erreur ${f}: ${e.message}\n`);
  }
}

if (updated === 0) {
  process.stderr.write(`[PULSE] aucun pouls.md trouvé pour ${AGENT_ID}\n`);
}
```

- [ ] **Step 2: Corriger le require/import mixte dans `scripts/pulse-update.js`**

Le fichier ci-dessus a un mélange `require`/`import`. Remplacer la fonction `readPhaseFromClaude` (qui utilise `require`) — elle est déjà doublée par `readPhase` qui utilise l'import en tête. Supprimer les lignes `function readPhaseFromClaude` et le second `import { readFileSync }`. Le fichier final correct :

```js
#!/usr/bin/env node
/**
 * scripts/pulse-update.js — appelé par hooks/stop-pulse.sh (Stop hook)
 * Met à jour pouls.md pour l'agent Claude Code courant.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ID = `claude-code/${hostname()}`;

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const phase = readPhase(ROOT);
const files = findPoulsMdFiles(ROOT);

let updated = 0;
for (const f of files) {
  try {
    const existing = parsePoulsMd(f);
    if (!existing || existing.agent?.id !== AGENT_ID) continue;

    const role = existing.agent.role ?? 'dev';
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);
    const status = intensityToStatus(intensity);

    writePoulsMd(f, {
      ...existing,
      status,
      lastPulse: new Date().toISOString(),
      phase: phase || existing.phase,
      intensity: { current: intensity, ceiling: profile.ceiling },
    }, existing._body);

    updated++;
    process.stderr.write(`[PULSE] mise à jour: ${f}\n`);
  } catch (e) {
    process.stderr.write(`[PULSE] erreur ${f}: ${e.message}\n`);
  }
}

if (updated === 0) {
  process.stderr.write(`[PULSE] aucun pouls.md trouvé pour ${AGENT_ID}\n`);
}
```

- [ ] **Step 3: Créer `hooks/stop-pulse.sh`**

```bash
#!/usr/bin/env bash
# Stop hook — met à jour pouls.md pour l'agent courant
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-update.js" "$@"
```

- [ ] **Step 4: Rendre le hook exécutable**

```bash
chmod +x hooks/stop-pulse.sh
```

- [ ] **Step 5: Tester le script en mode dry-run (aucun pouls.md présent)**

```bash
node scripts/pulse-update.js
```

Expected: `[PULSE] aucun pouls.md trouvé pour claude-code/<hostname>`

- [ ] **Step 6: Commit**

```bash
git add scripts/pulse-update.js hooks/stop-pulse.sh
git commit -m "feat(pulse): hooks/stop-pulse.sh + scripts/pulse-update.js"
```

---

## Task 9: Hook Start — Maestro (`start-maestro.sh` + `scripts/pulse-maestro.js`)

**Files:**
- Create: `scripts/pulse-maestro.js`
- Create: `hooks/start-maestro.sh`

- [ ] **Step 1: Créer `scripts/pulse-maestro.js`**

```js
#!/usr/bin/env node
/**
 * scripts/pulse-maestro.js — Start hook Maestro
 * Lit §0.Phase, détecte les changements, calcule l'intensité de tous les agents,
 * écrit /tmp/claude-atelier-pulse-status pour injection dans l'entête §1.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { statusLabel } from '../src/pulse/format.js';
import { isExpired } from '../src/pulse/parse.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = '/tmp/claude-atelier-last-phase';
const STATUS_FILE = '/tmp/claude-atelier-pulse-status';

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

function readLang(root) {
  const cfg = join(root, '.claude', 'atelier-config.json');
  if (!existsSync(cfg)) return 'fr';
  try { return JSON.parse(readFileSync(cfg, 'utf8')).lang ?? 'fr'; } catch { return 'fr'; }
}

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

const phase = readPhase(ROOT);
const lang = readLang(ROOT);

// ── Détection changement de phase ──
let phaseChanged = false;
let lastPhase = '';
if (existsSync(CACHE_FILE)) {
  lastPhase = readFileSync(CACHE_FILE, 'utf8').trim();
}
if (phase && phase !== lastPhase) {
  phaseChanged = true;
  try { writeFileSync(CACHE_FILE, phase, 'utf8'); } catch (_) {}
}

if (phaseChanged && lastPhase) {
  process.stderr.write(`[MAESTRO] ⚡ Phase changée : "${lastPhase}" → "${phase}"\n`);
  process.stderr.write(`[MAESTRO] 💡 Nouvelle phase détectée → /compact recommandé + nouvelle session\n`);
}

// ── Mise à jour de tous les pouls.md ──
const files = findPoulsMdFiles(ROOT);
let active = 0;
let totalStatus = 'idle';

for (const f of files) {
  try {
    const existing = parsePoulsMd(f);
    if (!existing) continue;

    const role = existing.agent?.role ?? 'dev';
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);
    const status = intensityToStatus(intensity);

    writePoulsMd(f, {
      ...existing,
      status,
      phase: phase || existing.phase,
      intensity: { current: intensity, ceiling: profile.ceiling },
    }, existing._body);

    if (!isExpired(existing)) {
      active++;
      if (intensity > computeIntensity('dev', '') ) totalStatus = status;
    }
  } catch (e) {
    process.stderr.write(`[MAESTRO] erreur ${f}: ${e.message}\n`);
  }
}

// ── Écriture du statut pour session-model.sh ──
const total = files.length;
const label = statusLabel(totalStatus, lang);
const indicator = `💓${label}·${active}/${total}`;

try {
  writeFileSync(STATUS_FILE, indicator, 'utf8');
} catch (_) {}

// Ligne lue par session-model.sh
process.stdout.write(`[PULSE] ${indicator}\n`);
```

- [ ] **Step 2: Créer `hooks/start-maestro.sh`**

```bash
#!/usr/bin/env bash
# Start hook — Maestro §0 watcher
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/../scripts/pulse-maestro.js" "$@"
```

- [ ] **Step 3: Rendre le hook exécutable**

```bash
chmod +x hooks/start-maestro.sh
```

- [ ] **Step 4: Tester en mode dry-run**

```bash
node scripts/pulse-maestro.js
```

Expected: `[PULSE] 💓repos·0/0` (ou similaire si aucun pouls.md)

- [ ] **Step 5: Modifier `hooks/session-model.sh` pour lire `/tmp/claude-atelier-pulse-status`**

À la fin de `hooks/session-model.sh`, juste avant le dernier `echo` qui émet `[HORODATAGE]`, ajouter :

```bash
# Pastille pouls (écrite par start-maestro.sh si pulse activé)
PULSE_STATUS_FILE="/tmp/claude-atelier-pulse-status"
PULSE_INDICATOR=""
if [ -f "$PULSE_STATUS_FILE" ]; then
  PULSE_INDICATOR=" | $(cat "$PULSE_STATUS_FILE")"
fi
```

Et modifier la ligne d'entête §1 pour inclure `$PULSE_INDICATOR` à la fin.

> **Note :** Lire `hooks/session-model.sh` entier avant de modifier pour trouver la ligne exacte à éditer.

- [ ] **Step 6: Commit**

```bash
git add scripts/pulse-maestro.js hooks/start-maestro.sh hooks/session-model.sh
git commit -m "feat(pulse): Maestro start hook + injection pastille §1 dans session-model.sh"
```

---

## Task 10: CLI `bin/pulse.js`

**Files:**
- Create: `bin/pulse.js`

- [ ] **Step 1: Créer `bin/pulse.js`**

```js
#!/usr/bin/env node
/**
 * bin/pulse.js — Commande `claude-atelier pulse`
 *
 * Sous-commandes :
 *   status          Affiche le pouls de tous les agents détectés
 *   init            Crée pouls.md pour l'agent courant
 *   update          Met à jour manuellement (agents non-Claude Code)
 *   list            Alias de status (avec filtres)
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { parsePoulsMd } from '../src/pulse/parse.js';
import { writePoulsMd } from '../src/pulse/write.js';
import { computeIntensity, intensityToStatus, getProfile } from '../src/pulse/intensity.js';
import { renderStatusTable, statusLabel } from '../src/pulse/format.js';
import { isExpired } from '../src/pulse/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = argv.slice(3); // claude-atelier pulse <subcmd> ...
  const sub = args[0] ?? 'status';
  const flags = {
    json:    args.includes('--json'),
    expired: args.includes('--expired'),
    global:  args.includes('--global'),
    lang:    args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null,
    role:    args.includes('--role') ? args[args.indexOf('--role') + 1] : null,
    status:  args.includes('--status') ? args[args.indexOf('--status') + 1] : null,
    phase:   args.includes('--phase') ? args[args.indexOf('--phase') + 1] : null,
  };
  return { sub, flags };
}

function readLang(root) {
  const cfg = join(root, '.claude', 'atelier-config.json');
  if (!existsSync(cfg)) return 'fr';
  try { return JSON.parse(readFileSync(cfg, 'utf8')).lang ?? 'fr'; } catch { return 'fr'; }
}

function readPhase(root) {
  const claudeMd = join(root, '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMd)) return '';
  try {
    const content = readFileSync(claudeMd, 'utf8');
    const m = content.match(/\|\s*Phase\s*\|([^|\n]+)\|/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

function findPoulsMdFiles(dir, depth = 0) {
  if (depth > 4) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === 'pouls.md') results.push(full);
    else if (e.isDirectory()) results.push(...findPoulsMdFiles(full, depth + 1));
  }
  return results;
}

export async function runPulse(argv) {
  const { sub, flags } = parseArgs(argv);
  const lang = flags.lang ?? readLang(ROOT);

  if (sub === 'status' || sub === 'list') {
    const files = findPoulsMdFiles(ROOT);
    let agents = files.map(f => parsePoulsMd(f)).filter(Boolean);

    if (flags.role) agents = agents.filter(a => a.agent?.role === flags.role);
    if (flags.expired) agents = agents.filter(a => isExpired(a));

    if (agents.length === 0) {
      process.stdout.write('Aucun pouls.md trouvé. Lancez : claude-atelier pulse init\n');
      return 0;
    }

    if (flags.json) {
      process.stdout.write(JSON.stringify(agents, null, 2) + '\n');
    } else {
      process.stdout.write(renderStatusTable(agents, lang) + '\n');
    }
    return 0;
  }

  if (sub === 'init') {
    const role = flags.role ?? 'dev';
    const agentId = `claude-code/${hostname()}`;
    const outPath = join(ROOT, '.claude', 'agents', agentId.replace('/', '-'), 'pouls.md');
    const phase = readPhase(ROOT);
    const profile = getProfile(role);
    const intensity = computeIntensity(role, phase);

    writePoulsMd(outPath, {
      agent: { id: agentId, name: `Claude Code — ${hostname()}`, role, provider: 'claude' },
      status: intensityToStatus(intensity),
      lastPulse: new Date().toISOString(),
      ttl: profile.ceiling <= 0.3 ? 600 : profile.ceiling <= 0.6 ? 900 : 300,
      phase: phase || '—',
      intensity: { current: intensity, ceiling: profile.ceiling },
      lang,
    }, `## État courant\n\nInitialisé via \`claude-atelier pulse init\`.\n`);

    process.stdout.write(`✓ pouls.md créé : ${outPath}\n`);
    process.stdout.write(`  Rôle: ${role} · Intensité: ${intensity.toFixed(2)} · Statut: ${intensityToStatus(intensity)}\n`);
    return 0;
  }

  if (sub === 'update') {
    const files = findPoulsMdFiles(ROOT);
    const agentId = `claude-code/${hostname()}`;
    let updated = 0;

    for (const f of files) {
      const existing = parsePoulsMd(f);
      if (!existing || existing.agent?.id !== agentId) continue;

      const role = existing.agent.role ?? 'dev';
      const phase = flags.phase ?? readPhase(ROOT) ?? existing.phase;
      const intensity = computeIntensity(role, phase);
      const status = flags.status ?? intensityToStatus(intensity);

      writePoulsMd(f, {
        ...existing,
        status,
        lastPulse: new Date().toISOString(),
        phase,
        intensity: { current: intensity, ceiling: getProfile(role).ceiling },
      }, existing._body);

      process.stdout.write(`✓ mis à jour: ${f}\n`);
      updated++;
    }

    if (updated === 0) {
      process.stdout.write(`Aucun pouls.md pour ${agentId}. Lancez : claude-atelier pulse init\n`);
    }
    return 0;
  }

  process.stderr.write(`Sous-commande inconnue: "${sub}"\nUsage: claude-atelier pulse [status|init|update|list]\n`);
  return 1;
}
```

- [ ] **Step 2: Tester la commande init**

```bash
node bin/cli.js pulse init --role dev
```

Expected: `error: unknown command "pulse"` (normal — Task 11 ajoute le routing)

- [ ] **Step 3: Tester directement `bin/pulse.js`**

```bash
node -e "import('./bin/pulse.js').then(m => m.runPulse(['node','claude-atelier','pulse','status']))"
```

Expected: `Aucun pouls.md trouvé. Lancez : claude-atelier pulse init`

- [ ] **Step 4: Commit**

```bash
git add bin/pulse.js
git commit -m "feat(pulse): bin/pulse.js — CLI status/init/update/list"
```

---

## Task 11: Routing CLI dans `bin/cli.js`

**Files:**
- Modify: `bin/cli.js`

- [ ] **Step 1: Ajouter `pulse` dans `knownCommands`**

Ligne 102 de `bin/cli.js` — modifier :
```js
const knownCommands = ['init', 'update', 'doctor', 'lint', 'features', 'review-local', 'apply'];
```
en :
```js
const knownCommands = ['init', 'update', 'doctor', 'lint', 'features', 'review-local', 'apply', 'pulse'];
```

- [ ] **Step 2: Ajouter le bloc de routing**

Après le bloc `if (command === 'apply')`, ajouter :

```js
  if (command === 'pulse') {
    const { runPulse } = await import('./pulse.js');
    return runPulse(process.argv);
  }
```

- [ ] **Step 3: Régénérer le bloc HELP**

```bash
node scripts/gen-help.js 2>/dev/null || echo "gen-help à mettre à jour si besoin"
```

- [ ] **Step 4: Tester la commande end-to-end**

```bash
node bin/cli.js pulse status
```

Expected: `Aucun pouls.md trouvé. Lancez : claude-atelier pulse init`

```bash
node bin/cli.js pulse init --role dev
```

Expected: `✓ pouls.md créé : .claude/agents/...`

```bash
node bin/cli.js pulse status
```

Expected: tableau avec le pouls.md créé.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js
git commit -m "feat(pulse): routing CLI pulse dans bin/cli.js"
```

---

## Task 12: Init — Prompt langue interactif

**Files:**
- Modify: `bin/init.js`

- [ ] **Step 1: Ajouter la fonction de prompt langue dans `bin/init.js`**

Après la fonction `promptYesNo` existante (ligne ~130), ajouter :

```js
async function promptLang() {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write('\n? Langue préférée / Preferred language:\n  1) Français (fr)\n  2) English (en)\n');
    rl.question('  Choix / Choice [1]: ', answer => {
      rl.close();
      const choice = answer.trim();
      resolve(choice === '2' || choice === 'en' ? 'en' : 'fr');
    });
  });
}
```

- [ ] **Step 2: Appeler `promptLang()` dans `runInit` si lang non fourni et stdin est un TTY**

Dans la fonction `runInit`, après `const { global: isGlobal, dryRun, lang: langArg } = parseArgs(argv);`, ajouter :

```js
  let lang = langArg;
  if (!lang && process.stdin.isTTY) {
    // Vérifier si atelier-config.json a déjà une lang
    const cfgPath = isGlobal
      ? join(homedir(), '.claude', 'atelier-config.json')
      : join(process.cwd(), '.claude', 'atelier-config.json');
    if (!existsSync(cfgPath)) {
      lang = await promptLang();
    }
  }
  lang = lang ?? 'fr';
```

- [ ] **Step 3: S'assurer que `atelier-config.json` est créé/mis à jour avec `lang`**

Chercher dans `runInit` l'endroit où `atelier-config.json` est écrit (ou créé). Si absent, ajouter après la copie des fichiers :

```js
  const cfgPath = join(targetDir, 'atelier-config.json');
  const existingCfg = existsSync(cfgPath)
    ? JSON.parse(readFileSync(cfgPath, 'utf8'))
    : {};
  if (!existingCfg.lang) {
    writeFileSync(cfgPath, JSON.stringify({ ...existingCfg, lang }, null, 2) + '\n', 'utf8');
    if (!dryRun) console.log(`${GREEN}[CONFIG]${NC} lang=${lang} → ${cfgPath}`);
  }
```

- [ ] **Step 4: Tester en mode dry-run**

```bash
node bin/cli.js init --dry-run --lang en
```

Expected: pas d'erreur, affiche `Language: en`

- [ ] **Step 5: Commit**

```bash
git add bin/init.js
git commit -m "feat(pulse): prompt langue interactif dans claude-atelier init"
```

---

## Task 13: `src/features.json` gen-help + package.json

**Files:**
- Modify: `src/features.json` (déjà fait en Task 7 — vérifier que le HELP est régénéré)
- Modify: `package.json`

- [ ] **Step 1: Ajouter `test:pulse` dans `package.json`**

Dans `"scripts"`, ajouter :

```json
"test:pulse": "node test/pulse.js",
```

Et modifier la commande `"test"` pour inclure `npm run test:pulse` à la fin :

```json
"test": "npm run lint && npm run doctor && npm run test:hooks && npm run test:merge && npm run test:apply-profile && npm run test:pulse",
```

- [ ] **Step 2: Régénérer le bloc HELP**

```bash
node scripts/gen-help.js
```

Expected: mise à jour du bloc `HELP` dans `bin/cli.js` avec la commande `pulse`.

- [ ] **Step 3: Vérifier que `pulse` apparaît dans l'aide**

```bash
node bin/cli.js --help | grep pulse
```

Expected: `  pulse             Gestion du pouls multi-agents (statut, init, mise à jour)`

- [ ] **Step 4: Commit**

```bash
git add package.json bin/cli.js
git commit -m "feat(pulse): test:pulse dans package.json + HELP régénéré"
```

---

## Task 14: Gate finale + README

**Files:**
- Modify: `.claude/CLAUDE.md` §1
- Modify: `README.md` (section Features)

- [ ] **Step 1: Mettre à jour §1 dans `.claude/CLAUDE.md`**

Dans le paragraphe §1, après la ligne qui décrit le format de l'entête, ajouter :

```
Pastille pouls : extraire `[PULSE] 💓niveau·n/total` du hook Maestro (Start hook) et l'appendre à l'entête : `[...] | 💓élevé·3/5`.
```

- [ ] **Step 2: Ajouter pulse dans la table Features du README**

Trouver la section Features/Highlights dans `README.md` et ajouter une ligne (sans toucher au bloc ASCII art en tête) :

```markdown
| `pulse` | Présence multi-agents · `pouls.md` par agent · Maestro §0 watcher · FR/EN |
```

- [ ] **Step 3: Lancer la gate complète**

```bash
npm test
```

Expected: tous les tests passent, dont `test:pulse`.

- [ ] **Step 4: Lancer la pre-push gate**

```bash
bash scripts/pre-push-gate.sh
```

Expected: gate verte (5 étapes OK).

- [ ] **Step 5: Commit final**

```bash
git add .claude/CLAUDE.md README.md
git commit -m "docs(pulse): §1 entête + README Features — pulse v0.23.0"
```

- [ ] **Step 6: /review-copilot (§25)**

Générer le handoff Copilot avant le push (§25 obligatoire).

- [ ] **Step 7: Push + bump**

```bash
git push origin feat/pulse-maestro
# PR → merge main → npm version minor → push → publish CI
```

---

## Récapitulatif des commits attendus

| # | Message | Tâche |
|---|---------|-------|
| 1 | `feat(pulse): templates de rôles YAML` | T2 |
| 2 | `feat(pulse): src/pulse/parse.js + tests TDD` | T3 |
| 3 | `feat(pulse): src/pulse/intensity.js + tests TDD` | T4 |
| 4 | `feat(pulse): src/pulse/write.js + tests TDD` | T5 |
| 5 | `feat(pulse): i18n strings FR/EN + format.js + tests TDD` | T6 |
| 6 | `feat(pulse): feature flags dans features-registry` | T7 |
| 7 | `feat(pulse): stop hook + scripts/pulse-update.js` | T8 |
| 8 | `feat(pulse): Maestro start hook + pastille §1` | T9 |
| 9 | `feat(pulse): bin/pulse.js CLI` | T10 |
| 10 | `feat(pulse): routing CLI pulse` | T11 |
| 11 | `feat(pulse): prompt langue init` | T12 |
| 12 | `feat(pulse): test:pulse + HELP régénéré` | T13 |
| 13 | `docs(pulse): §1 entête + README` | T14 |
