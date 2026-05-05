#!/usr/bin/env node
/**
 * claude-atelier vault — Initialise et inspecte le vault dynamique projet.
 *
 * Usage:
 *   claude-atelier vault init    [--cwd <path>] [--dry-run]
 *   claude-atelier vault status  [--cwd <path>]
 *   claude-atelier vault report  [--cwd <path>] [--json]
 *   claude-atelier vault stale   [--cwd <path>] [--json]
 *   claude-atelier vault update  [--cwd <path>] [--json]
 *   claude-atelier vault graph   [--cwd <path>] [--json]
 *   claude-atelier vault query   "<texte>" [--cwd <path>] [--json]
 *   claude-atelier vault path    <nodeA> <nodeB> [--cwd <path>] [--json]
 *   claude-atelier vault explain <node> [--cwd <path>] [--json]
 *   claude-atelier vault export  --html|--obsidian|--wiki|--svg|--graphml|--neo4j [--cwd <path>] [--json]
 *   claude-atelier vault watch   once|start|stop|status [--cwd <path>] [--interval <sec>] [--json]
 *   claude-atelier vault maintain [--cwd <path>] [--json]
 *   claude-atelier vault cron    start|stop|status [--cwd <path>] [--interval <15m|6h|1d>] [--json]
 *   claude-atelier vault mcp     [--cwd <path>] [--dry-run]
 */

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { watchOnce, watchStatus } from '../src/vault/watch.js';
import {
  slugify, nowIso, shortSha, addMinutes, parseIntervalToMinutes, daysSince,
  readJsonIfExists, extractBulletItems, extractSubsectionItems, extractMailboxPending,
  extractDecisions, getStateLine, generateReport, parseIgnoreFile, globToRegex,
  buildIgnoreMatcher, computeFileSHA256, gitChildEnv, getGitHead, listChangedFilesSince,
  isProductChangePath, isWebsiteDocsPath, extractConcepts,
  DEFAULT_CRON_INTERVAL, DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_PATTERNS, STALE_DAYS
} from '../src/vault/core/utils.js';
import { appendEvent } from '../src/vault/core/events.js';
import { loadState, saveState, loadCronConfig, saveCronConfig } from '../src/vault/core/state.js';
import { loadManifest, saveManifest, ensureMailboxFile, appendMailboxAlerts, collectMaintenanceAlerts, updateCronHeartbeat, updateVault } from '../src/vault/core/manifest.js';
import { readFirstHeading, isBmadPath, readExcerpt, getFileMtime, extractH1, extractBmadSignals, scanDocs } from '../src/vault/docs/scan.js';
import { classifyMarkdownKind, calculateVaultRelevance, suggestDestination, classifyDocs, organizeDocs } from '../src/vault/docs/classify.js';
import { sanitizeFilename, getNodeColor, exportHtmlGraph, exportObsidianVault, exportWikiVault, exportSvgGraph, exportGraphML, exportNeo4jCypher, exportVault } from '../src/vault/graph/export.js';
import { explainVaultNode, computeCommunities } from '../src/vault/graph/explain.js';
import { findNodeByIdOrLabel, bfsPath } from '../src/vault/graph/path.js';
import { scoreNode, queryGraph } from '../src/vault/graph/query.js';
import { buildGraph, graphVault } from '../src/vault/graph/build.js';
import { startVaultWatch, stopVaultWatch, onceVaultWatch } from '../src/vault/watch/daemon.js';
import { extractJsSymbols } from '../src/vault/extractors/js.js';
import { extractJsonSymbols } from '../src/vault/extractors/json.js';
import { extractShellSymbols } from '../src/vault/extractors/shell.js';
import { extractGoSymbols } from '../src/vault/extractors/go.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const CYAN = '\x1b[0;36m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const RED = '\x1b[0;31m';
const NC = '\x1b[0m';

const VAULT_FILES = [
  {
    name: 'PETER.md',
    title: 'Peter — Agent mainteneur du vault',
    body: `## Mission

Peter maintient le vault dynamique du projet.

Il ne fige pas la mémoire. Il trie, résume, date, relie et prépare le contexte utile pour Claude.

## Responsabilités

- maintenir un brief court et exploitable ;
- transformer les notes entrantes en courrier projet ;
- éviter la pollution du contexte ;
- conserver les sources et décisions importantes ;
- signaler les idées à challenger ;
- préparer la reprise de session sans brûler les tokens.

## Règles

- Ne jamais transformer une hypothèse en fait.
- Ne jamais supprimer une source sans trace.
- Garder le brief court.
- Préférer une action proposée à une archive passive.
- Si une note concerne plusieurs projets, le signaler explicitement.
`,
  },
  {
    name: '00-brief.md',
    title: 'Brief projet',
    body: `## État court

- Projet : à compléter.
- Phase : à compléter.
- Objectif courant : à compléter.
- Prochaine action utile : à compléter.

## À lire en priorité

-

## Décisions actives

-

## Risques / angles morts

-
`,
  },
  {
    name: '10-mailbox.md',
    title: 'Mailbox projet',
    body: `## Courrier entrant

Notes, vocaux, captures, liens ou idées routés vers ce projet.

Format recommandé :

### YYYY-MM-DD — Titre court

- Source : note | vocal | capture | URL | YouTube | autre
- Statut : nouveau | à challenger | à planifier | intégré | rejeté
- Résumé :
- Pourquoi ici :
- Action proposée :
`,
  },
  {
    name: '20-decisions.md',
    title: 'Décisions projet',
    body: `## Décisions durables

### YYYY-MM-DD — Décision

- Contexte :
- Décision :
- Conséquence :
- À revalider si :
`,
  },
  {
    name: '30-discoveries.md',
    title: 'Découvertes projet',
    body: `## Découvertes

Ce que Claude ou Peter apprend sur le projet et qui mérite de survivre à la session.

### YYYY-MM-DD — Découverte

- Observation :
- Impact :
- Source :
- Remontée globale candidate : non
`,
  },
  {
    name: '40-roadmap.md',
    title: 'Roadmap vivante',
    body: `## Roadmap vivante

### Sur le feu

-

### Ensuite

-

### Idées à challenger

-

### Parking

-
`,
  },
  {
    name: '90-sources.md',
    title: 'Sources',
    body: `## Sources liées au projet

### YYYY-MM-DD — Source

- Type : note | vocal | capture | URL | YouTube | PDF | autre
- Emplacement :
- Résumé :
- Lié à :
`,
  },
];

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

function parseArgs(argv) {
  let args = argv.slice(2);
  if (args[0] === 'vault') args = args.slice(1);
  const sub = args[0] ?? 'status';
  const flagsWithValues = new Set(['--cwd', '--interval']);
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('-')) { if (flagsWithValues.has(args[i])) i++; continue; }
    positional.push(args[i]);
  }
  return {
    sub,
    positional,
    queryText: positional.join(' '),
    cwd: resolve(getFlag(args, '--cwd') ?? process.cwd()),
    dryRun: args.includes('--dry-run'),
    json: args.includes('--json'),
    withSymbols: args.includes('--with-symbols'),
    intervalText: getFlag(args, '--interval'),
  };
}

function renderFile({ title, body }) {
  return `# ${title}\n\n> Géré par Peter via claude-atelier vault. Markdown vivant, pas document gravé.\n\n${body.trim()}\n`;
}

function initVault(cwd, dryRun = false) {
  const vaultDir = join(cwd, 'vault');
  const created = [];
  const skipped = [];

  if (!dryRun && !existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true });
  }

  for (const file of VAULT_FILES) {
    const target = join(vaultDir, file.name);
    if (existsSync(target)) {
      skipped.push(target);
      continue;
    }
    created.push(target);
    if (!dryRun) {
      writeFileSync(target, renderFile(file), 'utf8');
    }
  }

  return { vaultDir, created, skipped };
}

function entryContainsVaultHook(entry) {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(hook => hook && typeof hook.command === 'string' && hook.command.includes('vault-context.sh'));
}

function installPeterHook(cwd, dryRun = false) {
  const projectHookDir = join(cwd, 'hooks');
  const projectHook = join(projectHookDir, 'vault-context.sh');
  const packageHook = join(PKG_ROOT, 'hooks', 'vault-context.sh');
  const settingsPath = join(cwd, '.claude', 'settings.json');
  const copied = [];
  const changed = [];

  if (!existsSync(projectHook)) {
    copied.push(projectHook);
    if (!dryRun) {
      mkdirSync(projectHookDir, { recursive: true });
      copyFileSync(packageHook, projectHook);
    }
  }

  const settings = readJsonIfExists(settingsPath, {});
  const hooks = settings.hooks ?? {};
  const sessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  // Chemin relatif à la racine du projet — portable entre machines
  const relHookPath = relative(cwd, projectHook);
  const shellCommand = `bash "${relHookPath}"`;
  const alreadyInstalled = sessionStart.some(entryContainsVaultHook);

  if (!alreadyInstalled) {
    const targetEntry = sessionStart.find(entry => entry && entry.matcher === '');
    if (targetEntry) {
      targetEntry.hooks = Array.isArray(targetEntry.hooks) ? targetEntry.hooks : [];
      targetEntry.hooks.push({ type: 'command', command: shellCommand });
    } else {
      sessionStart.push({ matcher: '', hooks: [{ type: 'command', command: shellCommand }] });
    }
    hooks.SessionStart = sessionStart;
    settings.hooks = hooks;
    changed.push(settingsPath);
    if (!dryRun) {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    }
  }

  return { copied, changed, alreadyInstalled };
}

function statusVault(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { exists: false, vaultDir, files: [] };
  }
  const files = readdirSync(vaultDir)
    .filter(name => name.endsWith('.md'))
    .sort()
    .map(name => {
      const filePath = join(vaultDir, name);
      const stat = statSync(filePath);
      return {
        name,
        title: readFirstHeading(filePath),
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    });
  return { exists: true, vaultDir, files };
}

// ─── Seuils de fraîcheur (jours) ──────────────────────────────────────────────
function reportVault(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }
  const content = generateReport(vaultDir);
  const reportPath = join(vaultDir, 'PETER_REPORT.md');
  writeFileSync(reportPath, content, 'utf8');
  const freshness = /- Fraîcheur : (\w+)/.exec(content)?.[1] ?? 'OK';
  return { ok: true, reportPath, freshness };
}

function staleVault(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet.' };
  }

  const checks = [];
  const add = (file, status, msg) => checks.push({ file, status, msg });

  const briefPath = join(vaultDir, '00-brief.md');
  if (!existsSync(briefPath)) {
    add('00-brief.md', 'MANQUANT', 'Fichier absent');
  } else {
    const d = daysSince(briefPath);
    add('00-brief.md',
      d > STALE_DAYS.brief ? 'STALE' : 'OK',
      d > STALE_DAYS.brief
        ? `Non mis à jour depuis ${Math.floor(d)} jours (seuil : ${STALE_DAYS.brief}j)`
        : `Mis à jour il y a ${Math.floor(d)} jour(s)`);
  }

  const roadmapPath = join(vaultDir, '40-roadmap.md');
  if (!existsSync(roadmapPath)) {
    add('40-roadmap.md', 'MANQUANT', 'Fichier absent');
  } else {
    const d = daysSince(roadmapPath);
    add('40-roadmap.md',
      d > STALE_DAYS.roadmap ? 'STALE' : 'OK',
      d > STALE_DAYS.roadmap
        ? `Non mis à jour depuis ${Math.floor(d)} jours (seuil : ${STALE_DAYS.roadmap}j)`
        : `Mis à jour il y a ${Math.floor(d)} jour(s)`);
  }

  const reportPath = join(vaultDir, 'PETER_REPORT.md');
  if (!existsSync(reportPath)) {
    add('PETER_REPORT.md', 'MANQUANT', 'Pas encore généré — lancez : claude-atelier vault report');
  } else {
    const d = daysSince(reportPath);
    add('PETER_REPORT.md',
      d > STALE_DAYS.report ? 'STALE' : 'OK',
      d > STALE_DAYS.report
        ? `Généré il y a ${Math.floor(d)} jour(s) — relancer vault report`
        : `Généré il y a ${Math.floor(d * 24)} heure(s)`);
  }

  const mailboxPath = join(vaultDir, '10-mailbox.md');
  if (existsSync(mailboxPath)) {
    const pending = extractMailboxPending(readFileSync(mailboxPath, 'utf8'));
    const count = pending.length;
    add('10-mailbox.md',
      count > STALE_DAYS.mailbox_warn ? 'STALE' : count > 0 ? 'WARN' : 'OK',
      count > 0 ? `${count} entrée(s) en attente (nouveau|à challenger)` : 'Mailbox à jour');
  }

  const manifestPath = join(vaultDir, 'index', 'manifest.json');
  const statePath = join(vaultDir, '.peter', 'state.json');
  if (!existsSync(manifestPath)) {
    // Phase B optionnelle : INFO ne bloque pas "Vault à jour"
    add('vault/index/manifest.json', 'INFO', 'Index absent — lancez : claude-atelier vault update (Phase B)');
  } else {
    const d = daysSince(manifestPath);
    const state = loadState(statePath);
    const needsUpdate = state?.needsUpdate === true;
    add('vault/index/manifest.json',
      needsUpdate ? 'STALE' : d > 1 ? 'WARN' : 'OK',
      needsUpdate
        ? 'Marqué comme dépassé — lancez : claude-atelier vault update'
        : `${state?.fileCount ?? '?'} fichiers indexés, mis à jour il y a ${Math.floor(d * 24)}h`);
  }

  const graphFilePath = join(vaultDir, 'index', 'graph.json');
  if (!existsSync(graphFilePath)) {
    // Phase C optionnelle : INFO ne bloque pas "Vault à jour"
    add('vault/index/graph.json', 'INFO', 'Graphe absent — lancez : claude-atelier vault graph (Phase C)');
  } else {
    const dg = daysSince(graphFilePath);
    add('vault/index/graph.json',
      dg > 1 ? 'WARN' : 'OK',
      dg > 1
        ? `Graphe généré il y a ${Math.floor(dg)} jour(s) — relancer vault graph`
        : `Graphe à jour (${Math.floor(dg * 24)}h)`);
  }

  const cronPath = join(vaultDir, '.peter', 'cron.json');
  const cron = loadCronConfig(cronPath);
  if (!cron) {
    add('vault/.peter/cron.json', 'INFO', 'Autonomie désactivée — lancez : claude-atelier vault cron start');
  } else if (!cron.enabled) {
    add('vault/.peter/cron.json', 'INFO', 'Cron Peter désactivé — relancez : claude-atelier vault cron start');
  } else {
    const nextRunAt = cron.nextRunAt ? new Date(cron.nextRunAt).getTime() : 0;
    const overdue = nextRunAt > 0 && nextRunAt < Date.now();
    add('vault/.peter/cron.json', overdue ? 'WARN' : 'OK', overdue
      ? `Réveil Peter dépassé (${cron.intervalLabel ?? `${cron.intervalMinutes}m`}) — relancer vault maintain`
      : `Réveil autonome armé (${cron.intervalLabel ?? `${cron.intervalMinutes}m`})`);
  }

  return { ok: true, checks };
}

function printInit(result, cwd, dryRun) {
  console.log(`\n${CYAN}claude-atelier vault init${NC}`);
  console.log(`  Projet : ${cwd}`);
  console.log(`  Vault  : ${result.vaultDir}`);
  if (dryRun) console.log(`  ${YELLOW}DRY RUN${NC} — rien ne sera écrit`);
  console.log('');

  for (const file of result.created) {
    console.log(`  ${GREEN}[CREATE]${NC} ${relative(cwd, file)}`);
  }
  for (const file of result.skipped) {
    console.log(`  ${YELLOW}[SKIP]${NC}   ${relative(cwd, file)} existe déjà`);
  }
  for (const file of result.hook.copied) {
    console.log(`  ${GREEN}[HOOK]${NC}   ${relative(cwd, file)} installé`);
  }
  for (const file of result.hook.changed) {
    console.log(`  ${GREEN}[HOOK]${NC}   ${relative(cwd, file)} mis à jour`);
  }
  if (result.hook.alreadyInstalled) {
    console.log(`  ${YELLOW}[SKIP]${NC}   hook Peter déjà installé`);
  }
  console.log(`\n${GREEN}✓${NC} Peter peut maintenir ce vault projet.`);
}

function printStatus(status, cwd) {
  console.log(`\n${CYAN}claude-atelier vault status${NC}`);
  console.log(`  Projet : ${cwd}`);
  console.log(`  Vault  : ${status.vaultDir}`);
  if (!status.exists) {
    console.log(`\n${YELLOW}Aucun vault projet.${NC} Lancez : claude-atelier vault init`);
    return;
  }
  console.log('');
  for (const file of status.files) {
    console.log(`  ${GREEN}•${NC} ${file.name.padEnd(18)} ${file.title || '—'} (${file.bytes} o)`);
  }
}

function printReport(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault report${NC}`);
  console.log(`  Rapport : ${relative(cwd, result.reportPath)}`);
  console.log(`  Fraîcheur : ${result.freshness === 'OK' ? GREEN : YELLOW}${result.freshness}${NC}`);
  console.log(`\n${GREEN}✓${NC} PETER_REPORT.md généré.`);
}

function printStale(result) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  const COLORS = { OK: GREEN, WARN: YELLOW, STALE: RED, MANQUANT: RED, INFO: CYAN };
  console.log(`\n${CYAN}[PETER] vault stale${NC}`);
  for (const c of result.checks) {
    const col = COLORS[c.status] ?? NC;
    console.log(`  ${col}[${c.status}]${NC} ${c.file.padEnd(30)} ${c.msg}`);
  }
  // INFO n'est pas un problème — ne bloque pas "Vault à jour"
  const hasIssue = result.checks.some(c => c.status !== 'OK' && c.status !== 'INFO');
  console.log(`\n${hasIssue ? YELLOW : GREEN}${hasIssue ? '⚠' : '✓'}${NC} ${hasIssue ? 'Certains éléments nécessitent attention.' : 'Vault à jour.'}`);
}

// ─── Phase B — Index incrémental ──────────────────────────────────────────────

const MANIFEST_VERSION = 1;
const STATE_VERSION = 1;
const CRON_VERSION = 1;

function printUpdate(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault update${NC}`);
  console.log(`  Projet  : ${cwd}`);
  console.log(`  Ignorés : defaults + ${result.ignorePatternCount} patterns lus`);
  console.log('');
  if (result.newCount > 0) console.log(`  ${GREEN}[NEW]${NC}      ${result.newCount} fichier(s) nouveaux`);
  if (result.modCount > 0) console.log(`  ${YELLOW}[MOD]${NC}      ${result.modCount} fichier(s) modifiés`);
  if (result.deletedCount > 0) console.log(`  ${RED}[DEL]${NC}      ${result.deletedCount} fichier(s) supprimés`);
  if (result.unchanged > 0) console.log(`  ${GREEN}[SKIP]${NC}     ${result.unchanged} fichier(s) inchangés (cache mtime)`);
  console.log('');
  console.log(`  → ${relative(cwd, result.manifestPath)} mis à jour (${result.fileCount} fichiers)`);
  console.log(`  → ${relative(cwd, result.statePath)} mis à jour`);
  console.log(`\n${GREEN}✓${NC} Index incrémental Peter à jour.`);
}

// ─── Phase C — Graphe minimal ─────────────────────────────────────────────────

const GRAPH_VERSION = 1;

const BMAD_MARKERS = ['.bmad-method', '.bmad', 'bmad-core'];

const GENERIC_CONCEPTS_EXTRACT = new Set([
  'avec', 'pour', 'dans', 'vers', 'plus', 'cette', 'comme', 'sans',
  'aussi', 'meme', 'sont', 'sera', 'etre', 'avoir', 'faire', 'tout',
  'quoi', 'dont', 'mais', 'donc', 'bien', 'tres', 'entre', 'tous',
  'lors', 'apres', 'avant', 'depuis', 'selon', 'ainsi', 'alors',
  'enfin', 'cela', 'ceci', 'celui', 'celle', 'type', 'null', 'vrai',
]);

const EXCLUDED_FROM_CENTRAL = new Set([
  'concept:projet', 'concept:todo', 'concept:update', 'concept:readme',
  'concept:document', 'project:root',
]);

const ROADMAP_SECTION_TAGS = {
  'Sur le feu': 'sur_le_feu',
  'Ensuite': 'ensuite',
  'Parking': 'parking',
  'Idées à challenger': 'idee_a_challenger',
};

// ── Lot 1+2: docs scan, classify, organize + graph v2 enrichi ──


function countCodeSymbols(cwd) {
  let count = 0;
  const IGNORE_DIRS = new Set(['node_modules', '.git', 'vault', 'dist', 'build', '.next']);
  const EXT_EXTRACTORS = {
    '.js': extractJsSymbols, '.ts': extractJsSymbols, '.mjs': extractJsSymbols, '.cjs': extractJsSymbols,
    '.json': extractJsonSymbols,
    '.sh': extractShellSymbols, '.bash': extractShellSymbols, '.zsh': extractShellSymbols,
    '.go': extractGoSymbols,
  };

  function walkDir(dir) {
    if (count >= 100) return;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (count >= 100 || IGNORE_DIRS.has(entry) || entry.startsWith('.')) continue;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (stat.isFile()) {
          const ext = fullPath.includes('.') ? '.' + fullPath.split('.').pop() : '';
          const extractor = EXT_EXTRACTORS[ext];
          if (extractor) {
            try {
              const content = readFileSync(fullPath, 'utf8');
              count += Math.min(extractor(content), 100 - count);
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  walkDir(cwd);
  return count;
}

function printGraph(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault graph${NC}`);
  console.log(`  Nœuds     : ${result.nodeCount}`);
  console.log(`  Relations : ${result.edgeCount}`);
  console.log(`  → ${relative(cwd, result.graphPath)} mis à jour`);
  if (result.centralNodes.length) {
    console.log(`\n${CYAN}[PETER]${NC} Nœuds centraux : ${result.centralNodes.join(', ')}`);
  }
  console.log(`\n${GREEN}✓${NC} Graphe minimal Peter prêt.`);
}

function queryVaultGraph(cwd, queryText) {
  const graphPath = join(cwd, 'vault', 'index', 'graph.json');
  if (!existsSync(graphPath)) {
    return { ok: false, error: 'graph.json absent — lancez : claude-atelier vault graph' };
  }
  let graph;
  try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); }
  catch { return { ok: false, error: 'graph.json illisible — relancez vault graph' }; }
  return queryGraph(graph, queryText);
}

// ─── Lot 3 — vault path + vault explain + communautés ────────────────────────

function pathVaultGraph(cwd, nodeA, nodeB) {
  const graphPath = join(cwd, 'vault', 'index', 'graph.json');
  if (!existsSync(graphPath)) {
    return { ok: false, error: 'graph.json absent — lancez : claude-atelier vault graph' };
  }
  let graph;
  try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); }
  catch { return { ok: false, error: 'graph.json illisible — relancez vault graph' }; }

  const nodeA_obj = findNodeByIdOrLabel(graph.nodes, nodeA);
  const nodeB_obj = findNodeByIdOrLabel(graph.nodes, nodeB);

  if (!nodeA_obj || !nodeB_obj) {
    return { ok: false, error: `Nœud(s) introuvable(s): "${nodeA}", "${nodeB}"` };
  }

  const result = bfsPath(graph.nodes, graph.edges, nodeA_obj.id, nodeB_obj.id);
  if (!result) {
    return { ok: true, path: [], edges: [], message: `Aucun chemin entre "${nodeA_obj.label}" et "${nodeB_obj.label}"` };
  }

  const pathWithLabels = result.path.map(id => {
    const node = graph.nodes.find(n => n.id === id);
    return { id, label: node?.label || id, type: node?.type || 'unknown' };
  });

  return { ok: true, path: pathWithLabels, edges: result.edges };
}

function printPath(result, nodeA, nodeB) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault path${NC}`);
  console.log(`  De   : ${nodeA}`);
  console.log(`  À    : ${nodeB}`);
  console.log('');

  if (!result.path.length || result.message) {
    console.log(`  ${result.message || 'Aucun chemin trouvé'}`);
    return;
  }

  console.log(`Chemin (${result.path.length} nœud${result.path.length > 1 ? 's' : ''}):`);
  for (let i = 0; i < result.path.length; i++) {
    const node = result.path[i];
    console.log(`  ${i}. ${node.label} (${node.type})`);
    if (i < result.edges.length) {
      const edge = result.edges[i];
      console.log(`     → ${edge.type}${edge.confidence ? ` [${edge.confidence}]` : ''}`);
    }
  }
}

function printExplain(result) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  const node = result.node;
  console.log(`\n${CYAN}[PETER] vault explain${NC}`);
  console.log(`  Nœud    : ${node.id}`);
  console.log(`  Type    : ${node.type}`);
  console.log(`  Label   : ${node.label}`);
  if (node.path) console.log(`  Path    : ${node.path}`);
  if (node.tags?.length) console.log(`  Tags    : ${node.tags.join(', ')}`);
  if (node.mtime) console.log(`  MTime   : ${node.mtime}`);
  console.log('');
  console.log(`${result.explanation}`);

  if (result.neighbors.incoming.length > 0) {
    console.log('');
    console.log('Entrantes :');
    for (const n of result.neighbors.incoming) {
      console.log(`  - ${n.node} (via ${n.edgeType})`);
    }
  }
  if (result.neighbors.outgoing.length > 0) {
    console.log('');
    console.log('Sortantes :');
    for (const n of result.neighbors.outgoing) {
      console.log(`  - ${n.node} (via ${n.edgeType})`);
    }
  }
}

function printQuery(result, queryText) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault query${NC}`);
  console.log(`  Question : ${queryText}`);
  console.log('');
  if (!result.results.length) {
    console.log(`  Aucun résultat pour "${queryText}".`);
    return;
  }
  console.log('Résultats :');
  for (const r of result.results) {
    const pathStr = r.path ? ` — ${r.path}` : '';
    console.log(`- ${r.id} — score ${r.score}${pathStr}`);
  }
  if (result.neighbors.length) {
    console.log('');
    console.log('Voisins utiles :');
    for (const n of result.neighbors) console.log(`- ${n}`);
  }
}

function maintainVault(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }

  const statePath = join(vaultDir, '.peter', 'state.json');
  const eventsPath = join(vaultDir, '.peter', 'events.jsonl');
  const previousState = loadState(statePath) ?? {};
  const previousHead = previousState.git?.head ?? previousState.maintenance?.lastHead ?? '';
  const currentHead = getGitHead(cwd);

  const update = updateVault(cwd);
  if (!update.ok) return update;

  const graph = graphVault(cwd);
  if (!graph.ok) return graph;

  const maintenanceCheck = collectMaintenanceAlerts(cwd, previousHead, currentHead);
  const mailbox = appendMailboxAlerts(vaultDir, maintenanceCheck.alerts, currentHead);
  const report = reportVault(cwd);
  if (!report.ok) return report;

  const runAt = nowIso();
  const cron = updateCronHeartbeat(cwd, runAt);
  const state = {
    ...loadState(statePath),
    version: STATE_VERSION,
    lastRun: runAt,
    lastCommand: 'maintain',
    health: maintenanceCheck.alerts.length > 0 ? 'warn' : 'ok',
    git: currentHead ? { head: currentHead } : (previousState.git ?? {}),
    maintenance: {
      lastRun: runAt,
      previousHead,
      lastHead: currentHead || previousHead,
      changedFiles: maintenanceCheck.changedFiles,
      changedCount: maintenanceCheck.changedFiles.length,
      alertsCount: maintenanceCheck.alerts.length,
      mailboxWritten: mailbox.written,
      docsCheck: maintenanceCheck.alerts.some(alert => alert.type === 'stale-docs') ? 'warn' : maintenanceCheck.mode,
    },
    pulse: {
      status: maintenanceCheck.alerts.length > 0 ? 'warn' : 'ok',
      mode: cron?.enabled ? 'cron' : 'manual',
      lastBeatAt: runAt,
      nextBeatAt: cron?.nextRunAt ?? null,
    },
  };
  saveState(statePath, state);

  appendEvent(eventsPath, {
    ts: runAt,
    type: 'maintain',
    head: currentHead || null,
    alerts: maintenanceCheck.alerts.map(alert => ({ type: alert.type, summary: alert.summary, details: alert.details ?? [] })),
    update: {
      fileCount: update.fileCount,
      newCount: update.newCount,
      modCount: update.modCount,
      deletedCount: update.deletedCount,
    },
    graph: {
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
    },
    report: {
      freshness: report.freshness,
      reportPath: relative(cwd, report.reportPath),
    },
    cron: cron ? {
      enabled: cron.enabled,
      intervalLabel: cron.intervalLabel,
      nextRunAt: cron.nextRunAt,
    } : { enabled: false },
  });

  return {
    ok: true,
    update,
    graph,
    report,
    alerts: maintenanceCheck.alerts,
    mailboxWritten: mailbox.written,
    mailboxPath: mailbox.mailboxPath,
    statePath,
    eventsPath,
    cron,
  };
}

function printMaintain(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault maintain${NC}`);
  console.log(`  Projet   : ${cwd}`);
  console.log(`  Fichiers : ${result.update.fileCount} (${result.update.newCount} new, ${result.update.modCount} mod, ${result.update.deletedCount} del)`);
  console.log(`  Graphe   : ${result.graph.nodeCount} nœuds / ${result.graph.edgeCount} relations`);
  console.log(`  Rapport  : ${relative(cwd, result.report.reportPath)}`);
  console.log(`  Events   : ${relative(cwd, result.eventsPath)}`);
  if (result.mailboxWritten > 0) {
    console.log(`  ${YELLOW}[MAILBOX]${NC} ${result.mailboxWritten} alerte(s) écrite(s) dans ${relative(cwd, result.mailboxPath)}`);
  }
  if (result.cron?.enabled) {
    console.log(`  ${GREEN}[PULSE]${NC} prochain réveil prévu : ${result.cron.nextRunAt}`);
  }
  console.log(`\n${result.alerts.length ? YELLOW : GREEN}${result.alerts.length ? '⚠' : '✓'}${NC} ${result.alerts.length ? `${result.alerts.length} alerte(s) détectée(s).` : 'Maintenance Peter terminée.'}`);
}

function startVaultCron(cwd, intervalText) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }
  const parsed = parseIntervalToMinutes(intervalText);
  if (!parsed) {
    return { ok: false, error: 'Intervalle invalide. Utilisez par exemple --interval 30m, 6h ou 1d (minimum 15m).' };
  }
  const cronPath = join(vaultDir, '.peter', 'cron.json');
  const eventsPath = join(vaultDir, '.peter', 'events.jsonl');
  const now = nowIso();
  const existing = loadCronConfig(cronPath) ?? {};
  const config = {
    ...existing,
    version: CRON_VERSION,
    enabled: true,
    intervalMinutes: parsed.minutes,
    intervalLabel: parsed.label,
    startedAt: existing.startedAt ?? now,
    updatedAt: now,
    nextRunAt: addMinutes(now, parsed.minutes),
  };
  saveCronConfig(cronPath, config);
  appendEvent(eventsPath, { ts: now, type: 'cron_start', intervalLabel: parsed.label, intervalMinutes: parsed.minutes });
  return { ok: true, cronPath, eventsPath, config };
}

function stopVaultCron(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }
  const cronPath = join(vaultDir, '.peter', 'cron.json');
  const eventsPath = join(vaultDir, '.peter', 'events.jsonl');
  const existing = loadCronConfig(cronPath) ?? { version: CRON_VERSION };
  const now = nowIso();
  const config = {
    ...existing,
    enabled: false,
    updatedAt: now,
    stoppedAt: now,
  };
  saveCronConfig(cronPath, config);
  appendEvent(eventsPath, { ts: now, type: 'cron_stop' });
  return { ok: true, cronPath, eventsPath, config };
}

function statusVaultCron(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }
  const cronPath = join(vaultDir, '.peter', 'cron.json');
  const statePath = join(vaultDir, '.peter', 'state.json');
  const config = loadCronConfig(cronPath);
  const state = loadState(statePath) ?? {};
  return {
    ok: true,
    cronPath,
    enabled: !!config?.enabled,
    config,
    lastRun: state.maintenance?.lastRun ?? state.lastRun ?? null,
    pulse: state.pulse ?? null,
  };
}


function printScanDocs(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  process.stdout.write(`${CYAN}[PETER] vault docs scan${NC}\n`);
  process.stdout.write(`  Fichiers : ${result.fileCount} fichiers .md indexés\n\n`);
  
  process.stdout.write('Classification :\n');
  for (const [kind, count] of Object.entries(result.byKind).sort()) {
    process.stdout.write(`  - ${kind}: ${count}\n`);
  }
  
  process.stdout.write(`\n  Protégés (BMAD) : ${result.protected}\n`);
  process.stdout.write(`  ${GREEN}→${NC} ${result.catalogPath} généré\n\n`);
  process.stdout.write(`${GREEN}✓${NC} Catalogue Markdown scanné.\n`);
}

function printClassifyDocs(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  process.stdout.write(`${CYAN}[PETER] vault docs classify${NC}\n`);
  process.stdout.write(`\nClassification : ${result.totalCount} documents\n\n`);
  
  for (const [kind, docs] of Object.entries(result.byKind).sort()) {
    process.stdout.write(`  ${kind}: ${docs.length}\n`);
  }
  
  if (result.protected.length > 0) {
    process.stdout.write(`\nProtected (BMAD) : ${result.protected.length}\n`);
    for (const doc of result.protected) {
      process.stdout.write(`  - ${doc.path}\n`);
    }
  }
  
  if (result.unknown.length > 0) {
    process.stdout.write(`\nUnknown (à réorganiser) : ${result.unknown.length}\n`);
    for (const doc of result.unknown.slice(0, 5)) {
      process.stdout.write(`  - ${doc.path}\n`);
    }
    if (result.unknown.length > 5) {
      process.stdout.write(`  ... et ${result.unknown.length - 5} de plus\n`);
    }
  }
  process.stdout.write('\n');
}

function printOrganizeDocs(result, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  
  process.stdout.write(`${CYAN}[PETER] vault docs organize${NC}\n`);
  const mode = result.simulation ? 'PLAN' : 'APPLIED';
  process.stdout.write(`\nMode : ${mode}\n`);
  
  if (result.plan && result.plan.length > 0) {
    process.stdout.write(`\nMigrations prévues : ${result.plan.length}\n`);
    for (const mig of result.plan.slice(0, 5)) {
      process.stdout.write(`  ${mig.from} → ${mig.to}\n`);
    }
    if (result.plan.length > 5) {
      process.stdout.write(`  ... et ${result.plan.length - 5} de plus\n`);
    }
  }
  
  if (result.protected && result.protected.length > 0) {
    process.stdout.write(`\n⚠️  Fichiers protégés (BMAD) : ${result.protected.length}\n`);
    for (const doc of result.protected.slice(0, 3)) {
      process.stdout.write(`  - ${doc.path}\n`);
    }
  }
  
  if (result.simulation) {
    process.stdout.write(`\n${result.migrationsPath} généré\n`);
    process.stdout.write(`Lancez : claude-atelier vault docs organize --apply --confirm\n`);
  } else {
    process.stdout.write(`\n${result.moved.length} fichiers déplacés\n`);
  }
  process.stdout.write('\n');
}

function printCron(result, cwd, action) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }
  if (action === 'start') {
    console.log(`\n${CYAN}[PETER] vault cron start${NC}`);
    console.log(`  Config  : ${relative(cwd, result.cronPath)}`);
    console.log(`  Interval: ${result.config.intervalLabel} (${result.config.intervalMinutes} min)`);
    console.log(`  Prochain réveil : ${result.config.nextRunAt}`);
    console.log(`\n${GREEN}✓${NC} Pouls Peter armé. Brancher CronCreate/scheduler externe sur \`claude-atelier vault maintain\`.`);
    return;
  }
  if (action === 'stop') {
    console.log(`\n${CYAN}[PETER] vault cron stop${NC}`);
    console.log(`  Config : ${relative(cwd, result.cronPath)}`);
    console.log(`\n${YELLOW}✓${NC} Réveil autonome Peter désactivé.`);
    return;
  }
  console.log(`\n${CYAN}[PETER] vault cron status${NC}`);
  if (!result.config) {
    console.log(`  ${YELLOW}[OFF]${NC} Aucun cron Peter configuré.`);
    return;
  }
  console.log(`  État     : ${result.enabled ? `${GREEN}ON${NC}` : `${YELLOW}OFF${NC}`}`);
  console.log(`  Interval : ${result.config.intervalLabel ?? `${result.config.intervalMinutes}m`}`);
  if (result.config.lastHeartbeat) console.log(`  Dernier battement : ${result.config.lastHeartbeat}`);
  if (result.config.nextRunAt) console.log(`  Prochain réveil   : ${result.config.nextRunAt}`);
  if (result.lastRun) console.log(`  Dernière maintenance : ${result.lastRun}`);
}

// ──────────────────────────────────────────────────────────────────
// Lot 5 — vault watch daemon
// ──────────────────────────────────────────────────────────────────

function printWatchStart(result) {
  if (!result.ok) {
    process.stderr.write(`${RED}[WATCH]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[WATCH] vault watch start${NC}`);
  console.log(`  PID      : ${result.pid}`);
  console.log(`  Interval : ${result.interval}s`);
  console.log(`\n${GREEN}✓${NC} Daemon watch lancé.`);
}

function printWatchStop(result) {
  if (!result.ok) {
    console.log(`${YELLOW}[WATCH]${NC} ${result.error}`);
    return;
  }
  console.log(`\n${CYAN}[WATCH] vault watch stop${NC}`);
  console.log(`  PID stoppé : ${result.pid}`);
  console.log(`\n${GREEN}✓${NC} Daemon watch arrêté.`);
}

function printWatchStatus(result) {
  if (!result.active) {
    console.log(`\n${CYAN}[WATCH] vault watch status${NC}`);
    console.log(`  ${YELLOW}[INACTIF]${NC} Aucun daemon watch`);
    return;
  }
  console.log(`\n${CYAN}[WATCH] vault watch status${NC}`);
  console.log(`  ${GREEN}[ACTIF]${NC} PID ${result.pid}`);
  console.log(`  Démarré le  : ${result.startedAt}`);
  console.log(`  Interval    : ${result.interval}s`);
}

function printWatchOnce(result) {
  if (!result.ok) {
    process.stderr.write(`${RED}[WATCH]${NC} ${result.error}\n`);
    return;
  }
  console.log(`\n${CYAN}[WATCH] vault watch once${NC}`);
  console.log(`  Elapsed     : ${result.elapsed}ms`);
  console.log(`  Fichiers    : ${result.changedFiles?.length ?? 0} changés`);
  if (result.update) console.log(`  Update      : ${result.update.ok ? `${GREEN}OK${NC}` : `${RED}FAIL${NC}`}`);
  if (result.graph) console.log(`  Graph       : ${result.graph.ok ? `${GREEN}OK${NC}` : `${RED}FAIL${NC}`}`);
  console.log();
}

// ──────────────────────────────────────────────────────────────────
// Lot 8 — vault export (multi-formats HTML/Obsidian/Wiki/SVG/GraphML/Neo4j)
// ──────────────────────────────────────────────────────────────────

function printExport(result, format, cwd) {
  if (!result.ok) {
    process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
    return;
  }

  console.log(`\n${CYAN}[PETER] vault export --${format}${NC}`);

  if (format === 'html') {
    console.log(`  → ${relative(cwd, result.path)} (${result.size} KB)`);
    console.log(`\n${GREEN}✓${NC} Graphe D3 généré. Ouvre : open ${relative(cwd, result.path)}`);
  } else if (format === 'obsidian') {
    console.log(`  → ${relative(cwd, result.path)}`);
    console.log(`  → ${result.count} fichiers .md`);
    console.log(`\n${GREEN}✓${NC} Vault Obsidian prêt.`);
  } else if (format === 'wiki') {
    console.log(`  → ${relative(cwd, result.path)}`);
    console.log(`  → ${result.typeCount} types (${result.nodeCount} nœuds)`);
    console.log(`\n${GREEN}✓${NC} Wiki structuré prêt.`);
  } else if (format === 'svg') {
    console.log(`  → ${relative(cwd, result.path)} (${result.size} KB)`);
    console.log(`\n${GREEN}✓${NC} Graphe SVG statique généré.`);
  } else if (format === 'graphml') {
    console.log(`  → ${relative(cwd, result.path)}`);
    console.log(`  → ${result.nodeCount} nœuds, ${result.edgeCount} relations`);
    console.log(`\n${GREEN}✓${NC} Format GraphML standard généré.`);
  } else if (format === 'neo4j') {
    console.log(`  → ${relative(cwd, result.path)}`);
    console.log(`  → ${result.nodeCount} nœuds, ${result.edgeCount} relations`);
    console.log(`\n${GREEN}✓${NC} Scripts Cypher Neo4j générés. Utilise : bash import.sh`);
  }
}

export async function runVault(argv) {
  const { sub, positional, queryText, cwd, dryRun, json, withSymbols, intervalText } = parseArgs(argv);

  if (sub === 'init') {
    const result = initVault(cwd, dryRun);
    result.hook = installPeterHook(cwd, dryRun);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printInit(result, cwd, dryRun);
    return 0;
  }

  if (sub === 'status') {
    const status = statusVault(cwd);
    if (json) process.stdout.write(JSON.stringify(status, null, 2) + '\n');
    else printStatus(status, cwd);
    return 0;
  }

  if (sub === 'report') {
    const result = reportVault(cwd);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printReport(result, cwd);
    return result.ok ? 0 : 1;
  }

  if (sub === 'stale') {
    const result = staleVault(cwd);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printStale(result);
    return result.ok ? 0 : 1;
  }

  if (sub === 'update') {
    const result = updateVault(cwd);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printUpdate(result, cwd);
    return result.ok ? 0 : 1;
  }

  if (sub === 'graph') {
    const symCount = withSymbols ? countCodeSymbols(cwd) : 0;
    const result = graphVault(cwd, symCount);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printGraph(result, cwd);
    return result.ok ? 0 : 1;
  }

  if (sub === 'query') {
    const result = queryVaultGraph(cwd, queryText);
    if (json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      if (!result.ok) process.stderr.write(`${RED}[PETER]${NC} ${result.error}\n`);
      else printQuery(result, queryText);
    }
    return result.ok ? 0 : 1;
  }

  if (sub === 'maintain') {
    const result = maintainVault(cwd);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printMaintain(result, cwd);
    return result.ok ? 0 : 1;
  }


  if (sub === 'docs') {
    const action = positional[0];
    if (action === 'scan') {
      const result = scanDocs(cwd);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printScanDocs(result, cwd);
      return result.ok ? 0 : 1;
    }
    if (action === 'classify') {
      const result = classifyDocs(cwd);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printClassifyDocs(result, cwd);
      return result.ok ? 0 : 1;
    }
    if (action === 'organize') {
      const apply = argv.includes('--apply');
      const confirm = argv.includes('--confirm');
      const isPlan = argv.includes('--plan');
      const result = organizeDocs(cwd, apply && !isPlan, confirm);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printOrganizeDocs(result, cwd);
      return result.ok ? 0 : 1;
    }
    process.stderr.write(`${RED}error${NC}: vault docs <scan|classify|organize>\n`);
    return 1;
  }

  if (sub === 'cron') {
    const action = positional[0] ?? 'status';
    const result = action === 'start'
      ? startVaultCron(cwd, intervalText)
      : action === 'stop'
        ? stopVaultCron(cwd)
        : action === 'status'
          ? statusVaultCron(cwd)
          : { ok: false, error: `Action cron inconnue "${action}"` };
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printCron(result, cwd, action);
    return result.ok ? 0 : 1;
  }

  if (sub === 'path') {
    const nodeA = positional[0];
    const nodeB = positional[1];
    if (!nodeA || !nodeB) {
      process.stderr.write(`${RED}error${NC}: vault path <nodeA> <nodeB>\n`);
      return 1;
    }
    const result = pathVaultGraph(cwd, nodeA, nodeB);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printPath(result, nodeA, nodeB);
    return result.ok ? 0 : 1;
  }

  if (sub === 'explain') {
    const nodeId = positional[0];
    if (!nodeId) {
      process.stderr.write(`${RED}error${NC}: vault explain <node>\n`);
      return 1;
    }
    const result = explainVaultNode(cwd, nodeId);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printExplain(result);
    return result.ok ? 0 : 1;
  }

  if (sub === 'export') {
    const formats = ['html', 'obsidian', 'wiki', 'svg', 'graphml', 'neo4j'];
    const format = formats.find(f => argv.includes(`--${f}`)) || 'html';
    const result = exportVault(cwd, format);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else printExport(result, format, cwd);
    return result.ok ? 0 : 1;
  }

  if (sub === 'watch') {
    const action = positional[0] ?? 'status';
    const intervalSec = Math.max(5, Math.floor(Number(intervalText) || 30));

    if (action === 'once') {
      const result = onceVaultWatch(cwd);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printWatchOnce(result);
      return result.ok ? 0 : 1;
    }

    if (action === 'start') {
      const result = startVaultWatch(cwd, intervalSec);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printWatchStart(result);
      return result.ok ? 0 : 1;
    }

    if (action === 'stop') {
      const result = stopVaultWatch(cwd);
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printWatchStop(result);
      return result.ok ? 0 : 1;
    }

    if (action === 'status') {
      const result = watchStatus(join(cwd, 'vault'));
      if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printWatchStatus(result);
      return 0;
    }

    process.stderr.write(`${RED}error${NC}: action watch inconnue "${action}"\n`);
    return 1;
  }

  if (sub === 'mcp') {
    const { startMcpServer } = await import('../src/vault/mcp/server.js');
    await startMcpServer(cwd, dryRun);
    return 0;
  }

  process.stderr.write(`${RED}error${NC}: sous-commande vault inconnue "${sub}"\n`);
  process.stderr.write('Usage: claude-atelier vault [init|status|report|stale|update|graph|query|explain|path|export|watch|maintain|cron] [--cwd <path>] [--dry-run] [--json]\n');
  return 1;
}
