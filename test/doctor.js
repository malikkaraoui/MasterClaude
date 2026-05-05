#!/usr/bin/env node
/**
 * claude-atelier doctor — Diagnostic santé de l'installation
 *
 * Usage:
 *   node test/doctor.js          # output texte coloré
 *   node test/doctor.js --json   # output JSON structuré (CI-friendly)
 *
 * Exit codes: 0 = sain, 1 = problèmes détectés
 *
 * Inspiré du `claw doctor` (claw-code) — checks structurés par catégorie.
 */

import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');

const results = [];

function check(category, name, status, message) {
  results.push({ category, name, status, message });
  if (JSON_MODE) return;
  const tag = status === 'pass' ? `${GREEN}[OK]${NC}  ` : status === 'fail' ? `${RED}[FAIL]${NC}` : `${YELLOW}[WARN]${NC}`;
  console.log(`${tag} ${DIM}[${category}]${NC} ${message}`);
}

function pass(category, name, msg) { check(category, name, 'pass', msg); }
function fail(category, name, msg) { check(category, name, 'fail', msg); }
function warn(category, name, msg) { check(category, name, 'warn', msg); }

// ─── Détection cible ────────────────────────────────────────────────────────

let isSelfRepo = false;
try {
  const pkgCwd = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  isSelfRepo = pkgCwd.name === 'claude-atelier';
} catch {}
const isInstalledProject = !isSelfRepo && existsSync(join(process.cwd(), '.claude', 'CLAUDE.md'));
const srcDir = isInstalledProject ? join(process.cwd(), '.claude') : join(ROOT, 'src', 'fr');
const templatesDir = isInstalledProject ? join(process.cwd(), '.claude') : join(ROOT, 'src', 'templates');
const scriptsDir = isInstalledProject ? join(process.cwd(), 'scripts') : join(ROOT, 'scripts');
const hooksDir = isInstalledProject ? join(process.cwd(), 'hooks') : join(ROOT, 'hooks');

const mode = isInstalledProject ? 'installed project' : 'source repo';
if (!JSON_MODE) console.log(`\nclaude-atelier doctor (${mode})\n`);

// ─── ENV — environnement système ────────────────────────────────────────────

const nodeVersion = process.versions.node;
const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
if (nodeMajor >= 18) pass('env', 'node-version', `Node.js ${nodeVersion} (≥ 18 requis)`);
else fail('env', 'node-version', `Node.js ${nodeVersion} — requis ≥ 18`);

const gitCheck = spawnSync('git', ['--version'], { stdio: 'pipe' });
if (gitCheck.status === 0) pass('env', 'git', `git installé (${gitCheck.stdout.toString().trim()})`);
else fail('env', 'git', 'git non disponible dans le PATH');

if (!isInstalledProject) {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    pass('env', 'package-json', `package.json valide (claude-atelier@${pkg.version})`);
  } catch {
    fail('env', 'package-json', 'package.json invalide ou manquant');
  }
}

// ─── CORE — CLAUDE.md ───────────────────────────────────────────────────────

const claudePath = join(srcDir, 'CLAUDE.md');
if (existsSync(claudePath)) {
  const lines = readFileSync(claudePath, 'utf8').split('\n').length;
  if (lines <= 150) pass('core', 'claude-md', `CLAUDE.md ${lines}/150 lignes`);
  else fail('core', 'claude-md', `CLAUDE.md ${lines} lignes (> 150)`);
} else {
  fail('core', 'claude-md', `CLAUDE.md absent (${claudePath})`);
}

// ─── SATELLITES — répertoires + fichiers attendus ───────────────────────────

const expectedFiles = {
  runtime: ['code-review.md', 'todo-session.md', 'extended-thinking.md'],
  orchestration: ['modes.md', 'subagents.md', 'parallelization.md', 'models-routing.md', 'spawn-rules.md', 'mcp-lifecycle.md'],
  autonomy: ['permission-modes.md', 'night-mode.md', 'loop-watchers.md'],
  security: ['secrets-rules.md', 'pre-push-gate.md', 'emergency.md'],
  ecosystem: ['skills.md', 'plugins.md', 'hooks.md', 'memory-system.md', 'qmd-integration.md'],
};

for (const [dir, files] of Object.entries(expectedFiles)) {
  const dirPath = join(srcDir, dir);
  if (!existsSync(dirPath)) {
    fail('satellites', dir, `répertoire absent : ${dir}/`);
    continue;
  }
  const missing = files.filter((f) => !existsSync(join(dirPath, f)));
  if (missing.length === 0) pass('satellites', dir, `${dir}/ — ${files.length} fichiers`);
  else fail('satellites', dir, `${dir}/ — manque : ${missing.join(', ')}`);
}

// ─── CONFIG — settings, ignores ─────────────────────────────────────────────

const settingsPath = join(templatesDir, 'settings.json');
if (existsSync(settingsPath)) {
  try {
    JSON.parse(readFileSync(settingsPath, 'utf8'));
    pass('config', 'settings-json', 'settings.json valide');
  } catch {
    fail('config', 'settings-json', 'settings.json présent mais JSON invalide');
  }
} else {
  fail('config', 'settings-json', `settings.json absent (${settingsPath})`);
}

for (const name of ['.gitignore', '.claudeignore']) {
  const p = isInstalledProject ? join(process.cwd(), name) : join(ROOT, 'src', 'templates', name);
  if (existsSync(p)) pass('config', name, `${name} présent`);
  else fail('config', name, `${name} absent`);
}

// ─── SECURITY — gate, no legacy ─────────────────────────────────────────────

const gatePath = join(scriptsDir, 'pre-push-gate.sh');
if (existsSync(gatePath)) {
  const isExec = (statSync(gatePath).mode & 0o111) !== 0;
  if (isExec) pass('security', 'pre-push-gate', 'pre-push-gate.sh exécutable');
  else warn('security', 'pre-push-gate', 'pre-push-gate.sh présent mais non exécutable (chmod +x)');
} else {
  fail('security', 'pre-push-gate', 'pre-push-gate.sh absent');
}

function findLegacyFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findLegacyFiles(p));
    else if (e.name.includes('_legacy')) out.push(p);
  }
  return out;
}
const legacy = findLegacyFiles(srcDir);
if (legacy.length === 0) pass('security', 'no-legacy', 'aucun fichier _legacy.md résiduel');
else fail('security', 'no-legacy', `${legacy.length} fichiers _legacy.md présents`);

// ─── HOOKS — répertoire, manifest, exécutables ──────────────────────────────

if (existsSync(hooksDir)) {
  const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith('.sh'));
  pass('hooks', 'directory', `hooks/ — ${hookFiles.length} scripts`);

  const nonExec = hookFiles
    .filter((f) => !f.startsWith('_'))
    .filter((f) => (statSync(join(hooksDir, f)).mode & 0o111) === 0);
  if (nonExec.length === 0) pass('hooks', 'executable', 'tous les hooks actifs sont exécutables (helpers _*.sh ignorés)');
  else warn('hooks', 'executable', `${nonExec.length} hooks non exécutables : ${nonExec.join(', ')}`);

  const manifestPath = isInstalledProject
    ? join(process.cwd(), '.claude', 'hooks-manifest.json')
    : join(ROOT, '.claude', 'hooks-manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      pass('hooks', 'manifest', `hooks-manifest.json valide (${m.hooks?.length || 0} entrées)`);
      const lint = spawnSync(process.execPath, [join(__dirname, 'lint-hooks-manifest.js')], { stdio: 'pipe' });
      if (lint.status === 0) pass('hooks', 'manifest-lint', 'manifest cohérent avec hooks/');
      else fail('hooks', 'manifest-lint', 'manifest incohérent (npm run lint:hooks-manifest)');
    } catch {
      fail('hooks', 'manifest', 'hooks-manifest.json présent mais JSON invalide');
    }
  } else if (!isInstalledProject) {
    fail('hooks', 'manifest', 'hooks-manifest.json absent (.claude/hooks-manifest.json)');
  }

  const sc = spawnSync('shellcheck', ['--version'], { stdio: 'pipe' });
  if (sc.status === 0) {
    const targets = hookFiles.map((f) => join(hooksDir, f));
    const scriptsExist = existsSync(scriptsDir);
    if (scriptsExist) {
      for (const f of readdirSync(scriptsDir)) if (f.endsWith('.sh')) targets.push(join(scriptsDir, f));
    }
    const lint = spawnSync('shellcheck', ['--severity=warning', ...targets], { stdio: 'pipe' });
    if (lint.status === 0) pass('hooks', 'shellcheck', `shellcheck OK sur ${targets.length} scripts shell (severity ≥ warning)`);
    else {
      const firstIssue = lint.stdout.toString().split('\n').slice(0, 4).join(' | ').slice(0, 200);
      fail('hooks', 'shellcheck', `shellcheck a détecté des problèmes : ${firstIssue}…`);
    }
  } else {
    warn('hooks', 'shellcheck', 'shellcheck non installé — `brew install shellcheck` (recommandé pour valider les hooks shell)');
  }
} else {
  warn('hooks', 'directory', 'hooks/ absent (optionnel selon installation)');
}

// ─── DOCS — fichiers racine ─────────────────────────────────────────────────

const docFiles = ['README.md', 'CHANGELOG.md', 'PHILOSOPHY.md', 'PARITY.md', 'SECURITY.md', 'LICENSE'];
for (const f of docFiles) {
  const p = isInstalledProject ? null : join(ROOT, f);
  if (!p) continue;
  if (existsSync(p)) pass('docs', f.toLowerCase(), `${f} présent`);
  else warn('docs', f.toLowerCase(), `${f} absent (recommandé)`);
}

// ─── CI — actionlint sur les workflows GitHub ───────────────────────────────

const workflowsDir = isInstalledProject ? null : join(ROOT, '.github', 'workflows');
if (workflowsDir && existsSync(workflowsDir)) {
  const workflows = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  if (workflows.length > 0) {
    const al = spawnSync('actionlint', ['--version'], { stdio: 'pipe' });
    if (al.status === 0) {
      const lint = spawnSync('actionlint', workflows.map((f) => join(workflowsDir, f)), { stdio: 'pipe' });
      if (lint.status === 0) pass('ci', 'actionlint', `actionlint OK sur ${workflows.length} workflows`);
      else {
        const firstIssue = lint.stdout.toString().split('\n').slice(0, 4).join(' | ').slice(0, 200);
        fail('ci', 'actionlint', `actionlint a détecté des problèmes : ${firstIssue}…`);
      }
    } else {
      warn('ci', 'actionlint', 'actionlint non installé — `brew install actionlint` (valide les workflows YAML avant push)');
    }
  }
}

// ─── HANDOFFS — dette §25 calculée depuis git ───────────────────────────────

const handoffDebtScript = isInstalledProject
  ? join(process.cwd(), 'scripts', 'handoff-debt.sh')
  : join(ROOT, 'scripts', 'handoff-debt.sh');
if (existsSync(handoffDebtScript)) {
  const debt = spawnSync('bash', [handoffDebtScript, '--json'], { stdio: 'pipe' });
  try {
    const data = JSON.parse(debt.stdout.toString());
    const d = data.currentDebt;
    const msg = `dette: ${d.commitsSince} commits · +${d.linesAdded}/-${d.linesDeleted} lignes · ${d.daysSince}j depuis dernier handoff intégré`;
    if (data.exceedsThreshold) {
      // Détecter si on est sur main : PUSH_TO_MAIN, GITHUB_REF_NAME, ou git rev-parse
      const refName = process.env.GITHUB_REF_NAME || '';
      const gitBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe' }).stdout?.toString().trim() || '';
      const onMain = process.env.PUSH_TO_MAIN === 'true'
        || ['main', 'master'].includes(refName)
        || (process.env.PUSH_TO_MAIN !== 'false' && ['main', 'master'].includes(gitBranch));
      if (onMain) {
        fail('handoffs', 'debt', `§25 dépassée — ${msg} · ${data.reasons}`);
      } else {
        warn('handoffs', 'debt', `§25 dépassée — ${msg} · review Copilot attendu sur la PR`);
      }
    } else {
      pass('handoffs', 'debt', `§25 sous seuil — ${msg}`);
    }
  } catch {
    warn('handoffs', 'debt', 'handoff-debt.sh erreur JSON — check manuel requis');
  }
} else if (!isInstalledProject) {
  fail('handoffs', 'debt', 'scripts/handoff-debt.sh absent — §25 non enforcé');
}

// ─── REFS — lint-refs (markdown links) ──────────────────────────────────────

const lintRefs = spawnSync(process.execPath, [join(__dirname, 'lint-refs.js')], { stdio: 'pipe' });
if (lintRefs.status === 0) pass('refs', 'markdown-links', 'références markdown OK');
else fail('refs', 'markdown-links', 'références cassées (npm run lint:refs pour détails)');

// ─── GIT — hook pre-push installé (optionnel) ───────────────────────────────

if (isInstalledProject) {
  const hookPath = join(process.cwd(), '.git', 'hooks', 'pre-push');
  if (existsSync(hookPath)) pass('git', 'pre-push-hook', 'git pre-push hook installé');
  else warn('git', 'pre-push-hook', 'git pre-push hook non installé (optionnel)');
}

// ─── Output final ───────────────────────────────────────────────────────────

const byStatus = {
  pass: results.filter((r) => r.status === 'pass').length,
  fail: results.filter((r) => r.status === 'fail').length,
  warn: results.filter((r) => r.status === 'warn').length,
};
const byCategory = results.reduce((acc, r) => {
  acc[r.category] = (acc[r.category] || 0) + 1;
  return acc;
}, {});
const healthy = byStatus.fail === 0;

if (JSON_MODE) {
  console.log(JSON.stringify({
    healthy,
    total: results.length,
    byStatus,
    byCategory,
    results,
    mode,
    timestamp: new Date().toISOString(),
  }, null, 2));
} else {
  console.log('');
  const cats = Object.keys(byCategory).sort();
  console.log(`Total : ${results.length} checks sur ${cats.length} catégories (${cats.join(', ')})`);
  if (byStatus.fail === 0 && byStatus.warn === 0) {
    console.log(`${GREEN}SAIN${NC} — ${byStatus.pass} checks réussis`);
  } else if (byStatus.fail === 0) {
    console.log(`${YELLOW}OK avec ${byStatus.warn} avertissement(s)${NC} — ${byStatus.pass} réussis`);
  } else {
    console.log(`${RED}MALADE${NC} — ${byStatus.fail} échec(s), ${byStatus.warn} avertissement(s), ${byStatus.pass} réussis`);
  }
}

process.exit(healthy ? 0 : 1);
