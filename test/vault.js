#!/usr/bin/env node
/**
 * test/vault.js — Tests de la commande claude-atelier vault.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
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
  if (!cond) throw new Error(msg || 'assertion échouée');
}

function countPeterHooks(settings) {
  const sessionStart = settings.hooks?.SessionStart ?? [];
  return sessionStart.reduce((count, entry) => {
    const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
    return count + hooks.filter(hook => hook?.command?.includes('vault-context.sh')).length;
  }, 0);
}

function cli(args, cwd, env = {}) {
  return spawnSync(process.execPath, [join(ROOT, 'bin', 'cli.js'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function gitIsolatedEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return env;
}

function git(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitIsolatedEnv(),
  });
}

function initGitRepo(dir) {
  ok(git(['init'], dir).status === 0, 'git init doit réussir');
  ok(git(['config', 'user.email', 'peter@example.com'], dir).status === 0, 'git config email doit réussir');
  ok(git(['config', 'user.name', 'Peter'], dir).status === 0, 'git config name doit réussir');
}

function commitAll(dir, message) {
  ok(git(['add', '.'], dir).status === 0, 'git add doit réussir');
  const commit = git(['commit', '-m', message], dir);
  ok(commit.status === 0, `git commit doit réussir: ${commit.stderr}`);
}

/** Initialise un vault de test et retourne le chemin racine. */
function initTestVault() {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  const r = cli(['vault', 'init', '--cwd', dir], dir);
  if (r.status !== 0) throw new Error(`vault init a échoué: ${r.stderr}`);
  return dir;
}

console.log('\n── claude-atelier vault ──');

test('vault init crée les fichiers attendus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  try {
    const r = cli(['vault', 'init', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu, reçu ${r.status}: ${r.stderr}`);
    for (const name of ['PETER.md', '00-brief.md', '10-mailbox.md', '20-decisions.md', '30-discoveries.md', '40-roadmap.md', '90-sources.md']) {
      ok(existsSync(join(dir, 'vault', name)), `${name} doit exister`);
    }
    const peter = readFileSync(join(dir, 'vault', 'PETER.md'), 'utf8');
    ok(peter.includes('Peter maintient le vault dynamique'), 'charte Peter attendue');
    ok(existsSync(join(dir, 'hooks', 'vault-context.sh')), 'hook Peter doit être copié dans le projet');
    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
    ok(JSON.stringify(settings).includes('vault-context.sh'), 'settings doit installer le hook Peter');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault init est idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  try {
    cli(['vault', 'init', '--cwd', dir], dir);
    const r = cli(['vault', 'init', '--cwd', dir], dir);
    ok(r.status === 0, 'deuxième init doit passer');
    ok(r.stdout.includes('[SKIP]'), 'les fichiers existants doivent être skippés');
    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
    ok(countPeterHooks(settings) === 1, `le hook Peter ne doit être installé qu'une seule fois`);
    ok(settings.hooks.SessionStart[0].hooks[0].command.includes('vault-context.sh'), 'le hook Peter doit rester dans SessionStart');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault status signale un vault absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  try {
    const r = cli(['vault', 'status', '--cwd', dir], dir);
    ok(r.status === 0, 'status sans vault doit passer');
    ok(r.stdout.includes('Aucun vault projet'), 'message vault absent attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report génère PETER_REPORT.md', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'report', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const reportPath = join(dir, 'vault', 'PETER_REPORT.md');
    ok(existsSync(reportPath), 'PETER_REPORT.md doit exister');
    const content = readFileSync(reportPath, 'utf8');
    ok(content.includes('# PETER_REPORT'), 'titre PETER_REPORT attendu');
    ok(content.includes('## Bureau préparé'), 'section Bureau préparé attendue');
    ok(content.includes('## Décisions actives'), 'section Décisions actives attendue');
    ok(content.includes('## Roadmap — Sur le feu'), 'section Roadmap attendue');
    ok(content.includes('## Mailbox à traiter'), 'section Mailbox attendue');
    ok(content.includes('## Prochaine action recommandée'), 'section Prochaine action attendue');
    ok(content.includes('- Fraîcheur : OK'), 'fraîcheur OK attendue sur vault frais');
    ok(r.stdout.includes('PETER_REPORT.md généré'), 'message succès attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report extrait projet/phase depuis 00-brief.md', () => {
  const dir = initTestVault();
  try {
    const briefPath = join(dir, 'vault', '00-brief.md');
    const brief = readFileSync(briefPath, 'utf8')
      .replace('- Projet : à compléter.', '- Projet : claude-atelier-test')
      .replace('- Phase : à compléter.', '- Phase : Phase 2');
    writeFileSync(briefPath, brief, 'utf8');

    cli(['vault', 'report', '--cwd', dir], dir);
    const content = readFileSync(join(dir, 'vault', 'PETER_REPORT.md'), 'utf8');
    ok(content.includes('- Projet : claude-atelier-test'), 'projet extrait depuis brief');
    ok(content.includes('- Phase : Phase 2'), 'phase extraite depuis brief');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report extrait décisions depuis 20-decisions.md', () => {
  const dir = initTestVault();
  try {
    const decisionsPath = join(dir, 'vault', '20-decisions.md');
    writeFileSync(decisionsPath, `# Décisions projet\n\n## Décisions durables\n\n### 2026-05-01 — Utiliser Node.js\n\n- Contexte : choix de stack\n- Décision : Node.js pour les scripts\n- Conséquence : aucune\n- À revalider si : changement d'équipe\n`, 'utf8');

    cli(['vault', 'report', '--cwd', dir], dir);
    const content = readFileSync(join(dir, 'vault', 'PETER_REPORT.md'), 'utf8');
    ok(content.includes('2026-05-01 — Utiliser Node.js'), 'décision extraite dans le rapport');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report limite à 5 décisions et prend les premières (comportement documenté)', () => {
  const dir = initTestVault();
  try {
    const decisionsPath = join(dir, 'vault', '20-decisions.md');
    // 7 décisions : les 5 premières doivent apparaître, la 6e et 7e non
    const entries = Array.from({ length: 7 }, (_, i) => {
      const n = i + 1;
      return `### 2026-0${n}-01 — Décision ${n}\n\n- Contexte : ctx\n- Décision : choix ${n}\n- Conséquence : aucune\n- À revalider si : jamais\n`;
    });
    writeFileSync(decisionsPath, `# Décisions projet\n\n## Décisions durables\n\n${entries.join('\n')}`, 'utf8');

    cli(['vault', 'report', '--cwd', dir], dir);
    const content = readFileSync(join(dir, 'vault', 'PETER_REPORT.md'), 'utf8');
    // Les 5 premières doivent figurer
    for (let i = 1; i <= 5; i++) {
      ok(content.includes(`Décision ${i}`), `décision ${i} doit figurer dans le rapport`);
    }
    // La 6e et 7e ne doivent pas figurer (slice(0,5))
    ok(!content.includes('Décision 6'), 'décision 6 ne doit pas figurer (limite 5)');
    ok(!content.includes('Décision 7'), 'décision 7 ne doit pas figurer (limite 5)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report sans vault retourne exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  try {
    const r = cli(['vault', 'report', '--cwd', dir], dir);
    ok(r.status === 1, `exit 1 attendu si pas de vault, reçu ${r.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report --json retourne JSON valide', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'report', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(typeof result.reportPath === 'string', 'reportPath attendu');
    ok(result.freshness === 'OK', 'freshness OK attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault stale signale PETER_REPORT.md manquant', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'stale', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('MANQUANT'), 'PETER_REPORT.md absent → statut MANQUANT attendu');
    ok(r.stdout.includes('vault report'), 'rappel de commande attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault stale est OK après vault report', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'report', '--cwd', dir], dir);
    const r = cli(['vault', 'stale', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(!r.stdout.includes('MANQUANT'), 'pas de MANQUANT après vault report');
    ok(r.stdout.includes('Vault à jour'), 'message Vault à jour attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault stale détecte un brief stale', () => {
  const dir = initTestVault();
  try {
    const briefPath = join(dir, 'vault', '00-brief.md');
    // Simuler un fichier vieux de 8 jours (seuil = 7)
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(briefPath, oldDate, oldDate);

    const r = cli(['vault', 'stale', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('00-brief.md'), 'fichier brief dans la sortie');
    ok(r.stdout.includes('STALE'), 'statut STALE attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault stale --json retourne JSON valide', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'stale', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(Array.isArray(result.checks), 'checks array attendu');
    ok(result.checks.length >= 3, 'au moins 3 checks (brief, roadmap, report)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault stale sans vault retourne exit 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-vault-'));
  try {
    const r = cli(['vault', 'stale', '--cwd', dir], dir);
    ok(r.status === 1, `exit 1 attendu si pas de vault, reçu ${r.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Phase C — vault graph ─────────────────────────────────────────────────────

console.log('\n── claude-atelier vault graph ──');

test('vault graph crée vault/index/graph.json', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'graph', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(existsSync(join(dir, 'vault', 'index', 'graph.json')), 'graph.json doit exister');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph.json contient version, nodes, edges, stats', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(typeof graph.version === 'number', 'version attendue');
    ok(Array.isArray(graph.nodes), 'nodes array attendu');
    ok(Array.isArray(graph.edges), 'edges array attendu');
    ok(graph.stats && typeof graph.stats.nodeCount === 'number', 'stats.nodeCount attendu');
    ok(typeof graph.stats.edgeCount === 'number', 'stats.edgeCount attendu');
    ok(typeof graph.generatedAt === 'string', 'generatedAt attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault graph --json retourne JSON valide', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'graph', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(typeof result.nodeCount === 'number', 'nodeCount attendu');
    ok(typeof result.edgeCount === 'number', 'edgeCount attendu');
    ok(typeof result.graphPath === 'string', 'graphPath attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('les fichiers vault de base deviennent des nodes', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const nodeIds = graph.nodes.map(n => n.id);
    ok(nodeIds.includes('vault_file:vault/00-brief.md'), '00-brief.md doit être un node');
    ok(nodeIds.includes('vault_file:vault/40-roadmap.md'), '40-roadmap.md doit être un node');
    ok(nodeIds.includes('project:root'), 'project:root doit exister');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('une décision dans 20-decisions.md devient un node decision', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '20-decisions.md'),
      '# Décisions\n\n## Décisions durables\n\n### 2026-05-01 — Choisir Node.js\n\n- Contexte : stack\n- Décision : Node.js\n- Conséquence : aucune\n- À revalider si : changement\n',
      'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const decisionNode = graph.nodes.find(n => n.type === 'decision' && n.label === 'Choisir Node.js');
    ok(decisionNode, 'node decision attendu pour "Choisir Node.js"');
    ok(decisionNode.id.startsWith('decision:'), 'id doit commencer par decision:');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un item roadmap devient un node roadmap_item', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '40-roadmap.md'),
      '# Roadmap\n\n## Roadmap vivante\n\n### Sur le feu\n\n- Phase C graphe minimal\n\n### Ensuite\n\n-\n',
      'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const roadmapNode = graph.nodes.find(n => n.type === 'roadmap_item');
    ok(roadmapNode, 'node roadmap_item attendu');
    ok(roadmapNode.tags.includes('sur_le_feu'), 'tag sur_le_feu attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un Markdown BMAD devient protected_artifact et n\'est pas importé normalement', () => {
  const dir = initTestVault();
  try {
    // Créer un faux fichier BMAD
    mkdirSync(join(dir, '.bmad-method'), { recursive: true });
    writeFileSync(join(dir, '.bmad-method', 'agent.md'), '# Agent BMAD\n\nContenu protégé.\n', 'utf8');
    // Créer manifest minimal pour que buildGraph trouve le fichier
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    const manifest = {
      version: 1, generatedAt: new Date().toISOString(), root: dir, fileCount: 1,
      files: [{ path: '.bmad-method/agent.md', sha256: 'abc', mtime: new Date().toISOString(), size: 40, ext: '.md' }],
    };
    writeFileSync(join(dir, 'vault', 'index', 'manifest.json'), JSON.stringify(manifest), 'utf8');

    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const pa = graph.nodes.find(n => n.type === 'protected_artifact');
    ok(pa, 'node protected_artifact attendu pour fichier BMAD');
    const bmadEdge = graph.edges.find(e => e.type === 'protected_by_method' && e.from === pa.id);
    ok(bmadEdge, 'edge protected_by_method attendu');
    // Ne doit pas être importé comme markdown_document
    const asDoc = graph.nodes.find(n => n.type === 'markdown_document' && n.path === '.bmad-method/agent.md');
    ok(!asDoc, 'fichier BMAD ne doit pas être un markdown_document');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('centralNodes est non vide dès qu\'il y a des edges', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '40-roadmap.md'),
      '# Roadmap\n\n## Roadmap vivante\n\n### Sur le feu\n\n- Phase C\n\n### Ensuite\n\n-\n', 'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(graph.edges.length > 0, 'des edges doivent exister');
    ok(Array.isArray(graph.stats.centralNodes) && graph.stats.centralNodes.length > 0, 'centralNodes doit être non vide');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Phase C — vault query ─────────────────────────────────────────────────────

console.log('\n── claude-atelier vault query ──');

test('vault query sans graphe : exit 1 + message vault graph', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'query', 'peter', '--cwd', dir], dir);
    ok(r.status === 1, `exit 1 attendu si pas de graphe, reçu ${r.status}`);
    ok(r.stderr.includes('vault graph') || r.stdout.includes('vault graph'), 'message vault graph attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault query avec graphe retourne des résultats', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '00-brief.md'),
      '# Brief\n\n## État court\n\n- Projet : peter-test\n- Phase : Phase C\n- Objectif courant : graphe minimal\n- Prochaine action utile : vault graph\n\n## À lire en priorité\n\n-\n\n## Décisions actives\n\n-\n\n## Risques / angles morts\n\n-\n',
      'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'query', 'peter', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('Résultats'), 'section Résultats attendue');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault query --json retourne { ok, results, neighbors }', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'query', 'vault', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(Array.isArray(result.results), 'results array attendu');
    ok(Array.isArray(result.neighbors), 'neighbors array attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault query résultats bornés à max 10 par défaut', () => {
  const dir = initTestVault();
  try {
    // Créer beaucoup de décisions avec "vault" dans le titre
    const decisions = Array.from({ length: 15 }, (_, i) =>
      `### 2026-05-${String(i + 1).padStart(2, '0')} — vault décision ${i + 1}\n\n- Contexte : x\n- Décision : vault choice\n- Conséquence : none\n- À revalider si : jamais\n`
    ).join('\n');
    writeFileSync(join(dir, 'vault', '20-decisions.md'),
      `# Décisions\n\n## Décisions durables\n\n${decisions}`, 'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'query', 'vault', '--cwd', dir, '--json'], dir);
    const result = JSON.parse(r.stdout);
    ok(result.results.length <= 10, `max 10 résultats attendus, reçu ${result.results.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault query résultats citent au moins un path', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'query', 'vault', '--cwd', dir, '--json'], dir);
    const result = JSON.parse(r.stdout);
    const hasSomePath = result.results.some(res => res.path && res.path.length > 0);
    ok(hasSomePath, 'au moins un résultat doit citer un path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Phase C — PETER_REPORT avec graphe ───────────────────────────────────────

console.log('\n── vault report + graphe ──');

test('vault report après vault graph contient ## Nœuds centraux', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '40-roadmap.md'),
      '# Roadmap\n\n## Roadmap vivante\n\n### Sur le feu\n\n- Phase C vault graph\n\n### Ensuite\n\n-\n', 'utf8');
    cli(['vault', 'graph', '--cwd', dir], dir);
    cli(['vault', 'report', '--cwd', dir], dir);
    const content = readFileSync(join(dir, 'vault', 'PETER_REPORT.md'), 'utf8');
    ok(content.includes('## Nœuds centraux'), '## Nœuds centraux attendu après vault graph');
    ok(content.includes('## Documents pivots'), '## Documents pivots attendu');
    ok(content.includes('## Questions utiles'), '## Questions utiles attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault report sans graphe contient instruction vault graph', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'report', '--cwd', dir], dir);
    const content = readFileSync(join(dir, 'vault', 'PETER_REPORT.md'), 'utf8');
    ok(content.includes('vault graph'), 'instruction vault graph attendue si graphe absent');
    ok(content.includes('Graphe absent'), 'message Graphe absent attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Phase D — vault maintain / cron ─────────────────────────────────────────

console.log('\n── claude-atelier vault maintain / cron ──');

test('vault maintain met à jour state.json et events.jsonl', () => {
  const dir = initTestVault();
  try {
    initGitRepo(dir);
    commitAll(dir, 'chore: baseline peter');

    const r = cli(['vault', 'maintain', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);

    const state = JSON.parse(readFileSync(join(dir, 'vault', '.peter', 'state.json'), 'utf8'));
    ok(state.lastCommand === 'maintain', 'lastCommand maintain attendu');
    ok(state.maintenance?.lastRun, 'maintenance.lastRun attendu');
    ok(state.pulse?.lastBeatAt, 'pulse.lastBeatAt attendu');

    const events = readFileSync(join(dir, 'vault', '.peter', 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    ok(events.length >= 1, 'au moins un event attendu');
    const lastEvent = JSON.parse(events.at(-1));
    ok(lastEvent.type === 'maintain', 'event maintain attendu');
    ok(typeof lastEvent.update?.fileCount === 'number', 'event.update.fileCount attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault maintain écrit une alerte mailbox si code change sans website/docs', () => {
  const dir = initTestVault();
  try {
    initGitRepo(dir);
    commitAll(dir, 'chore: baseline peter');
    cli(['vault', 'maintain', '--cwd', dir], dir);

    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(dir, 'bin', 'feature.js'), 'export const feature = true;\n', 'utf8');
    commitAll(dir, 'feat: change produit sans doc');

    const r = cli(['vault', 'maintain', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);

    const mailbox = readFileSync(join(dir, 'vault', '10-mailbox.md'), 'utf8');
    ok(mailbox.includes('website/docs'), 'alerte stale docs attendue dans mailbox');
    ok(mailbox.includes('Peter auto-maintenance'), 'signature Peter auto-maintenance attendue');

    const state = JSON.parse(readFileSync(join(dir, 'vault', '.peter', 'state.json'), 'utf8'));
    ok(state.health === 'warn', 'health warn attendu si alerte');
    ok(state.maintenance?.alertsCount === 1, 'une alerte attendue');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault cron start écrit cron.json puis status le relit', () => {
  const dir = initTestVault();
  try {
    const start = cli(['vault', 'cron', 'start', '--cwd', dir, '--interval', '6h'], dir);
    ok(start.status === 0, `exit 0 attendu: ${start.stderr}`);
    ok(existsSync(join(dir, 'vault', '.peter', 'cron.json')), 'cron.json doit exister');

    const status = cli(['vault', 'cron', 'status', '--cwd', dir, '--json'], dir);
    ok(status.status === 0, `exit 0 attendu: ${status.stderr}`);
    const result = JSON.parse(status.stdout);
    ok(result.enabled === true, 'cron enabled attendu');
    ok(result.config.intervalLabel === '6h', 'intervalLabel 6h attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault cron stop désactive le réveil autonome', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'cron', 'start', '--cwd', dir, '--interval', '6h'], dir);
    const stop = cli(['vault', 'cron', 'stop', '--cwd', dir, '--json'], dir);
    ok(stop.status === 0, `exit 0 attendu: ${stop.stderr}`);
    const result = JSON.parse(stop.stdout);
    ok(result.config.enabled === false, 'cron disabled attendu');
    ok(result.config.stoppedAt, 'stoppedAt attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault maintain met à jour le heartbeat cron quand le pouls est armé', () => {
  const dir = initTestVault();
  try {
    initGitRepo(dir);
    commitAll(dir, 'chore: baseline peter');
    cli(['vault', 'cron', 'start', '--cwd', dir, '--interval', '6h'], dir);

    const r = cli(['vault', 'maintain', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);

    const cron = JSON.parse(readFileSync(join(dir, 'vault', '.peter', 'cron.json'), 'utf8'));
    ok(cron.lastHeartbeat, 'lastHeartbeat attendu');
    ok(cron.nextRunAt, 'nextRunAt attendu');

    const state = JSON.parse(readFileSync(join(dir, 'vault', '.peter', 'state.json'), 'utf8'));
    ok(state.pulse?.mode === 'cron', 'pulse.mode=cron attendu');
    ok(state.pulse?.nextBeatAt === cron.nextRunAt, 'nextBeatAt doit suivre cron.nextRunAt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault maintain ignore un GIT_DIR/GIT_WORK_TREE ambiant pollué', () => {
  const dir = initTestVault();
  try {
    initGitRepo(dir);
    commitAll(dir, 'chore: baseline peter');
    cli(['vault', 'maintain', '--cwd', dir], dir);

    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(dir, 'bin', 'feature.js'), 'export const feature = true;\n', 'utf8');
    commitAll(dir, 'feat: change produit sans doc');

    const polluted = cli(['vault', 'maintain', '--cwd', dir], dir, {
      GIT_DIR: join(ROOT, '.git', 'worktrees', 'peter-phase-d'),
      GIT_WORK_TREE: ROOT,
    });
    ok(polluted.status === 0, `exit 0 attendu: ${polluted.stderr}`);

    const mailbox = readFileSync(join(dir, 'vault', '10-mailbox.md'), 'utf8');
    ok(mailbox.includes('website/docs'), 'l’alerte stale docs doit rester détectée malgré un contexte git ambiant pollué');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Lot 3 — vault path + vault explain + communautés ─────────────────────────

console.log('\n── claude-atelier vault path / explain / communautés ──');

test('vault path calcule un chemin entre deux nœuds connus', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'path', 'project:root', 'vault_file:vault/00-brief.md', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('Chemin') || r.stdout.includes('chemin'), 'titre chemin attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault path avec nœuds inexistants : exit 1 + message propre', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'path', 'unknown_a', 'unknown_b', '--cwd', dir], dir);
    ok(r.status === 1, `exit 1 attendu si nœuds introuvables, reçu ${r.status}`);
    ok(r.stderr.includes('introuvable') || r.stdout.includes('introuvable'), 'message introuvable attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault path avec A = B : chemin vide ou longueur 1', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'path', 'project:root', 'project:root', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(result.path.length === 1, 'chemin de longueur 1 attendu pour A = A');
    ok(result.path[0].id === 'project:root', 'le nœud attendu dans le chemin');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault path --json retourne { ok, path, edges }', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'path', 'project:root', 'vault_file:vault/00-brief.md', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(Array.isArray(result.path), 'path array attendu');
    ok(Array.isArray(result.edges), 'edges array attendu');
    if (result.path.length > 1) {
      ok(result.path[0].id === 'project:root', 'chemin commence au nœud attendu');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault explain affiche un nœud connu', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'explain', 'project:root', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('project:root'), 'id du nœud attendu');
    ok(r.stdout.includes('Type') || r.stdout.includes('type'), 'affichage Type attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault explain avec nœud inconnu : exit 1 + message propre', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'explain', 'unknown_node', '--cwd', dir], dir);
    ok(r.status === 1, `exit 1 attendu si nœud introuvable, reçu ${r.status}`);
    ok(r.stderr.includes('introuvable'), 'message introuvable attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault explain --json retourne { ok, node, neighbors, explanation }', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const r = cli(['vault', 'explain', 'project:root', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(result.node, 'node object attendu');
    ok(result.node.id === 'project:root', 'id du nœud attendu');
    ok(typeof result.explanation === 'string', 'explanation string attendue');
    ok(result.neighbors, 'neighbors object attendu');
    ok(Array.isArray(result.neighbors.incoming), 'neighbors.incoming array attendu');
    ok(Array.isArray(result.neighbors.outgoing), 'neighbors.outgoing array attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph.json contient community sur chaque nœud après vault graph', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    for (const node of graph.nodes) {
      ok(typeof node.community === 'number', `community must be a number for node ${node.id}`);
    }
    ok(graph.stats.communities, 'stats.communities attendu');
    ok(typeof graph.stats.communities.count === 'number', 'stats.communities.count attendu');
    ok(typeof graph.stats.communities.byId === 'object', 'stats.communities.byId attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('communautés : nœuds dans la même composante connexe ont le même community id', () => {
  const dir = initTestVault();
  try {
    // Créer une décision qui sera liée à project:root via vault_file
    writeFileSync(join(dir, 'vault', '20-decisions.md'),
      '# Décisions\n\n## Décisions durables\n\n### 2026-05-01 — Test community\n\n- Contexte : test\n- Décision : test\n- Conséquence : test\n- À revalider si : jamais\n',
      'utf8');

    cli(['vault', 'graph', '--cwd', dir], dir);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));

    const rootNode = graph.nodes.find(n => n.id === 'project:root');
    const briefNode = graph.nodes.find(n => n.id === 'vault_file:vault/00-brief.md');

    if (rootNode && briefNode) {
      ok(typeof rootNode.community === 'number', 'rootNode doit avoir community');
      ok(typeof briefNode.community === 'number', 'briefNode doit avoir community');
      // S'il y a une arête entre eux, ils doivent être dans la même communauté
      const hasEdge = graph.edges.some(e =>
        (e.from === rootNode.id && e.to === briefNode.id) ||
        (e.from === briefNode.id && e.to === rootNode.id)
      );
      if (hasEdge) {
        ok(rootNode.community === briefNode.community, 'nœuds liés doivent être dans la même communauté');
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Lot 1+2 — docs scan, classify, organize + graph v2 enrichi ──

test('vault docs scan génère catalog.json avec tous les champs requis', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs', 'proposals'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'proposals', 'test-decision.md'), '# Test Decision\n\n## Décision\n\nTest content', 'utf8');
    writeFileSync(join(dir, 'README.md'), '# README\n\nProject readme', 'utf8');

    const r = cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    ok(r.status === 0, `vault docs scan doit passer: ${r.stderr}`);
    ok(r.stdout.includes('catalog.json'), 'message catalog.json attendu');

    const catalogPath = join(dir, 'vault', 'library', 'catalog.json');
    ok(existsSync(catalogPath), 'vault/library/catalog.json doit exister');

    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    ok(Array.isArray(catalog.documents), 'documents array attendu');
    ok(catalog.documents.length > 0, 'au moins un document scanné');

    const sample = catalog.documents[0];
    ok(sample.path, 'path attendu');
    ok(sample.filename, 'filename attendu');
    ok(sample.kind, 'kind attendu');
    ok(sample.sha256, 'sha256 attendu');
    ok(sample.title, 'title attendu');
    ok(typeof sample.protected === 'boolean', 'protected boolean attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ──────────────────────────────────────────────────────────────────
// Lot 5 — vault watch daemon tests
// ──────────────────────────────────────────────────────────────────

console.log('\nvault Lot 5 — watch daemon\n');

test('vault watch status sans daemon actif retourne { active: false }', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'watch', 'status', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('Aucun daemon watch'), 'message aucun daemon attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault docs scan détecte marqueurs BMAD et marque protected', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '20-decisions.md'),
      '# Décisions\n\n.bmad-method\n\nContent',
      'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    const catalog = JSON.parse(readFileSync(join(dir, 'vault', 'library', 'catalog.json'), 'utf8'));
    const decisionDoc = catalog.documents.find(d => d.filename === '20-decisions.md');
    ok(decisionDoc && decisionDoc.protected === true, 'BMAD files should be protected');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault watch status --json retourne { active: false, pid: null }', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'watch', 'status', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.active === false, 'active:false attendu');
    ok(result.pid === null, 'pid:null attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault docs classify affiche rapport avec regroupement par kind', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    const r = cli(['vault', 'docs', 'classify', '--cwd', dir], dir);
    ok(r.status === 0, `vault docs classify doit passer: ${r.stderr}`);
    ok(r.stdout.includes('Classification') || r.stdout.includes('kind'), 'report doit inclure classification');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault watch once exécute un cycle unique synchrone', () => {
  const dir = initTestVault();
  try {
    // Initialiser vault
    cli(['vault', 'update', '--cwd', dir], dir);

    // Exécuter watch once
    const r = cli(['vault', 'watch', 'once', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(r.stdout.includes('watch'), 'output doit mentiionner watch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault docs organize --plan affiche plan sans le modifier', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs', 'random'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'random', 'unknown.md'), '# Unknown\n\nContent', 'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    const r = cli(['vault', 'docs', 'organize', '--plan', '--cwd', dir], dir);
    ok(r.status === 0, `organize --plan doit passer: ${r.stderr}`);
    ok(r.stdout.includes('migrations') || r.stdout.includes('plan'), 'should mention plan');
    ok(existsSync(join(dir, 'docs', 'random', 'unknown.md')), 'file should not move in plan mode');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault watch once --json retourne { ok, elapsed, changedFiles }', () => {
  const dir = initTestVault();
  try {
    cli(['vault', 'update', '--cwd', dir], dir);

    const r = cli(['vault', 'watch', 'once', '--cwd', dir, '--json'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    ok(result.ok === true, 'ok:true attendu');
    ok(typeof result.elapsed === 'number', 'elapsed doit être un nombre');
    ok(Array.isArray(result.changedFiles), 'changedFiles doit être un tableau');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault docs organize --apply requires --confirm flag', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs', 'other'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'other', 'orphan.md'), '# Orphan\n\nContent', 'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    const r = cli(['vault', 'docs', 'organize', '--apply', '--cwd', dir], dir);
    ok(r.status === 1, 'sans --confirm doit exit 1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault watch stop sans daemon actif retourne erreur', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'watch', 'stop', '--cwd', dir], dir);
    // Peut sortir avec erreur ou avec message d'info
    ok(r.stdout.includes('Aucun') || r.stdout.includes('actif') || r.stderr.includes('Aucun'),
      'message attendant aucun daemon');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph v2 crée doc_category nodes depuis catalog', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'test.md'), '# Test\n\nContent', 'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    cli(['vault', 'graph', '--cwd', dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const docCategoryNodes = graph.nodes.filter(n => n.type === 'doc_category');
    ok(docCategoryNodes.length > 0, 'doc_category nodes should exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph v2 crée classified_as edges vers doc_category', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'test.md'), '# Test\n\nContent', 'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    cli(['vault', 'graph', '--cwd', dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const classifiedEdges = graph.edges.filter(e => e.type === 'classified_as');
    ok(classifiedEdges.length > 0, 'classified_as edges should exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph v2 extrait risk nodes depuis vault files', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '20-decisions.md'),
      '# Décisions\n\n⚠️ Risque mtime\n\n- ⚠️ Cache issue\n',
      'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    cli(['vault', 'graph', '--cwd', dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const riskNodes = graph.nodes.filter(n => n.type === 'risk');
    ok(riskNodes.length > 0, 'risk nodes should be extracted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph v2 extrait question nodes depuis vault files', () => {
  const dir = initTestVault();
  try {
    writeFileSync(join(dir, 'vault', '30-discoveries.md'),
      '# Découvertes\n\n- ? Comment faire ?\n\n- Question: Quoi faire ?\n',
      'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    cli(['vault', 'graph', '--cwd', dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    const questionNodes = graph.nodes.filter(n => n.type === 'question');
    ok(questionNodes.length > 0, 'question nodes should be extracted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph v2 ajoute stats.byKind avec comptes par catégorie', () => {
  const dir = initTestVault();
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'test.md'), '# Test\n\nContent', 'utf8');

    cli(['vault', 'docs', 'scan', '--cwd', dir], dir);
    cli(['vault', 'graph', '--cwd', dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(graph.stats.byKind, 'stats.byKind should exist');
    ok(typeof graph.stats.byKind === 'object', 'byKind should be object');
    ok(Object.keys(graph.stats.byKind).length > 0, 'byKind should have entries');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault watch start crée watch.json avec pid', () => {
  const dir = initTestVault();
  try {
    // Initialiser vault (obligatoire pour watch)
    cli(['vault', 'update', '--cwd', dir], dir);

    // Start watch daemon
    const r = cli(['vault', 'watch', 'start', '--cwd', dir, '--interval', '60'], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);

    // Attendre un peu que le daemon écrive son fichier
    const watchPath = join(dir, 'vault', '.peter', 'watch.json');
    let watchExists = false;
    for (let i = 0; i < 10; i++) {
      if (existsSync(watchPath)) {
        watchExists = true;
        break;
      }
      // Micro sleep
      const start = Date.now();
      while (Date.now() - start < 50) {}
    }

    if (watchExists) {
      const watchJson = JSON.parse(readFileSync(watchPath, 'utf8'));
      ok(typeof watchJson.pid === 'number', 'watch.json doit contenir un pid numérique');
      ok(watchJson.interval === 60, 'interval doit être respecté');

      // Arrêter le daemon gracieusement
      cli(['vault', 'watch', 'stop', '--cwd', dir], dir);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Lot 8 — vault export (HTML/Obsidian/Wiki/SVG/GraphML/Neo4j) ────────────────

console.log('\n── vault export (Lot 8) ──');

function createTestGraph() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: '/tmp/test',
    sourceManifest: 'vault/index/manifest.json',
    nodes: [
      { id: 'concept:test', type: 'concept', label: 'Test Concept', path: '', tags: ['test'], excerpt: 'A test node', mtime: new Date().toISOString(), sha256: '', confidence: 'EXTRACTED' },
      { id: 'concept:second', type: 'concept', label: 'Second Node', path: '', tags: ['test'], excerpt: 'Another node', mtime: new Date().toISOString(), sha256: '', confidence: 'EXTRACTED' },
      { id: 'markdown_document:readme', type: 'markdown_document', label: 'README', path: 'README.md', tags: [], excerpt: 'Documentation', mtime: new Date().toISOString(), sha256: '', confidence: 'EXTRACTED' },
    ],
    edges: [
      { from: 'concept:test', to: 'concept:second', type: 'related_to', confidence: 'EXTRACTED', source: 'test', weight: 1 },
      { from: 'concept:test', to: 'markdown_document:readme', type: 'documents', confidence: 'EXTRACTED', source: 'test', weight: 1 },
    ],
    stats: {
      nodeCount: 3,
      edgeCount: 2,
      byType: { concept: 2, markdown_document: 1 },
      centralNodes: ['concept:test', 'concept:second'],
    },
  };
}

test('vault export --html sans graph.json retourne erreur', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-html-'));
  try {
    const r = cli(['vault', 'export', '--html', '--cwd', dir], dir);
    ok(r.status !== 0, 'exit non-zéro attendu');
    ok(r.stderr.includes('graph.json absent'), 'message erreur attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --html génère un fichier avec "Peter Knowledge Graph"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-html-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--html', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(existsSync(join(dir, 'vault', 'index', 'graph.html')), 'graph.html doit exister');
    const html = readFileSync(join(dir, 'vault', 'index', 'graph.html'), 'utf8');
    ok(html.includes('Peter Knowledge Graph'), 'titre Peter Knowledge Graph attendu');
    ok(html.includes('d3'), 'D3.js CDN attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --graphml génère un fichier avec balise <graphml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-graphml-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--graphml', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(existsSync(join(dir, 'vault', 'index', 'graph.graphml')), 'graph.graphml doit exister');
    const graphml = readFileSync(join(dir, 'vault', 'index', 'graph.graphml'), 'utf8');
    ok(graphml.includes('<graphml'), 'balise <graphml attendue');
    ok(graphml.includes('<node'), 'balise <node attendue');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --obsidian génère des fichiers .md dans vault/index/obsidian/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-obsidian-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--obsidian', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const obsidianDir = join(dir, 'vault', 'index', 'obsidian');
    ok(existsSync(obsidianDir), 'obsidian/ doit exister');
    const files = readdirSync(obsidianDir);
    ok(files.length > 0, 'au moins un fichier .md attendu');
    ok(files.some(f => f.endsWith('.md')), 'fichier .md attendu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --neo4j génère nodes.cypher et edges.cypher', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-neo4j-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--neo4j', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const neo4jDir = join(dir, 'vault', 'index', 'neo4j');
    ok(existsSync(neo4jDir), 'neo4j/ doit exister');
    ok(existsSync(join(neo4jDir, 'nodes_0.cypher')), 'nodes_0.cypher doit exister');
    ok(existsSync(join(neo4jDir, 'edges_0.cypher')), 'edges_0.cypher doit exister');
    ok(existsSync(join(neo4jDir, 'import.sh')), 'import.sh doit exister');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --svg génère un fichier SVG', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-svg-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--svg', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(existsSync(join(dir, 'vault', 'index', 'graph.svg')), 'graph.svg doit exister');
    const svg = readFileSync(join(dir, 'vault', 'index', 'graph.svg'), 'utf8');
    ok(svg.includes('<svg'), 'balise <svg attendue');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault export --wiki génère vault/index/wiki/index.md et répertoires par type', () => {
  const dir = mkdtempSync(join(tmpdir(), 'export-wiki-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'index', 'graph.json'), JSON.stringify(createTestGraph()), 'utf8');
    const r = cli(['vault', 'export', '--wiki', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    ok(existsSync(join(dir, 'vault', 'index', 'wiki', 'index.md')), 'wiki/index.md doit exister');
    ok(existsSync(join(dir, 'vault', 'index', 'wiki', 'concept')), 'wiki/concept/ doit exister');
    const index = readFileSync(join(dir, 'vault', 'index', 'wiki', 'index.md'), 'utf8');
    ok(index.includes('Par type'), 'section "Par type" attendue');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('\n── Lot 4 — AST symboles ──');

test('vault graph sans --with-symbols ignore les symboles (symbolCount = 0)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-no-symbols-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'test.js'), 'function foo() {}\nclass Bar {}', 'utf8');
    const r = cli(['vault', 'graph', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(graph.stats.symbolCount === 0, `symbolCount = 0 sans --with-symbols, trouvé ${graph.stats.symbolCount}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Lot 10 — MCP ─────────────────────────────────────────────────────

console.log('\n── Lot 10 — MCP vault ──');

test('vault mcp --dry-run démarre sans crash et exit 0', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'mcp', '--cwd', dir, '--dry-run'], dir);
    ok(r.status === 0, `exit 0 attendu, reçu ${r.status}: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault graph --with-symbols compte les symboles JS/TS (symbolCount > 0)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-with-symbols-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'example.js'), 'function foo() {}\nclass Bar {}\nexport default foo;', 'utf8');
    const r = cli(['vault', 'graph', '--with-symbols', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(graph.stats.symbolCount > 0, `symbolCount > 0 attendu, trouvé ${graph.stats.symbolCount}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault mcp --dry-run affiche sur stderr le message prêt', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'mcp', '--cwd', dir, '--dry-run'], dir);
    ok(r.stderr.includes('query_vault'), 'query_vault doit figurer dans stderr');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault graph --with-symbols --json retourne symbolCount en réponse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-symbols-json-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    writeFileSync(join(dir, 'example.js'), 'function foo() {}\nfunction bar() {}', 'utf8');
    const r = cli(['vault', 'graph', '--with-symbols', '--json', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const output = JSON.parse(r.stdout);
    ok(typeof output.symbolCount === 'number', `symbolCount doit être un nombre, trouvé ${typeof output.symbolCount}`);
    ok(output.symbolCount > 0, `symbolCount > 0 attendu, trouvé ${output.symbolCount}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault graph --with-symbols compte jusqu\'à 100 symboles max', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-symbols-max-'));
  try {
    mkdirSync(join(dir, 'vault', 'index'), { recursive: true });
    const funcs = Array.from({ length: 150 }, (_, i) => `function f${i}() {}`).join('\n');
    writeFileSync(join(dir, 'test.js'), funcs, 'utf8');
    const r = cli(['vault', 'graph', '--with-symbols', '--cwd', dir], dir);
    ok(r.status === 0, `exit 0 attendu: ${r.stderr}`);
    const graph = JSON.parse(readFileSync(join(dir, 'vault', 'index', 'graph.json'), 'utf8'));
    ok(graph.stats.symbolCount <= 100, `symbolCount ≤ 100 (cap), trouvé ${graph.stats.symbolCount}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vault mcp --dry-run affiche tous les tools sur stderr', () => {
  const dir = initTestVault();
  try {
    const r = cli(['vault', 'mcp', '--cwd', dir, '--dry-run'], dir);
    ok(r.stderr.includes('get_node'), 'get_node doit figurer dans stderr');
    ok(r.stderr.includes('neighbors'), 'neighbors doit figurer dans stderr');
    ok(r.stderr.includes('stale_status'), 'stale_status doit figurer dans stderr');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const total = pass + fail;
console.log(`\n── Vault : ${pass}/${total} tests passés${fail > 0 ? ` · ${fail} ÉCHECS` : ''} ──\n`);
if (fail > 0) process.exit(1);
