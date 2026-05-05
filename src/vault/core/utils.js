// src/vault/core/utils.js — helpers partagés

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';;
import { createHash } from 'node:crypto';;
import { join } from 'node:path';;

const DEFAULT_CRON_INTERVAL = '6h';

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.turbo', '.svelte-kit', 'out', '.output',
]);

const DEFAULT_IGNORE_PATTERNS = [
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '*.min.js', '*.min.css', '*.map', '.DS_Store', 'Thumbs.db',
];

const STALE_DAYS = { brief: 7, roadmap: 14, report: 1, mailbox_warn: 3 };

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function nowIso() {
  return new Date().toISOString();
}

function shortSha(sha) {
  return typeof sha === 'string' && sha ? sha.slice(0, 8) : 'inconnu';
}

function addMinutes(isoString, minutes) {
  return new Date(new Date(isoString).getTime() + minutes * 60_000).toISOString();
}

function parseIntervalToMinutes(input = DEFAULT_CRON_INTERVAL) {
  const raw = String(input || DEFAULT_CRON_INTERVAL).trim().toLowerCase();
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = unit === 'm' ? 1 : unit === 'h' ? 60 : 1440;
  const minutes = value * factor;
  if (minutes < 15) return null;
  return { minutes, label: `${value}${unit}` };
}

function daysSince(filePath) {
  if (!existsSync(filePath)) return Infinity;
  return (Date.now() - statSync(filePath).mtimeMs) / 86_400_000;
}

function readJsonIfExists(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function extractBulletItems(content, heading) {
  const lines = content.split('\n');
  const items = [];
  let active = false;
  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      if (active) break;
      if (line.replace(/^#+\s+/, '') === heading) { active = true; continue; }
    }
    if (active && line.trim().startsWith('- ')) {
      const item = line.trim().slice(2).trim();
      if (item) items.push(item);
    }
  }
  return items;
}

function extractSubsectionItems(content, section, subsection) {
  const lines = content.split('\n');
  const items = [];
  let inSec = false;
  let inSub = false;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inSec) break;
      inSec = line.slice(3).trim() === section;
      continue;
    }
    if (inSec && line.startsWith('### ')) {
      if (inSub) break;
      inSub = line.slice(4).trim() === subsection;
      continue;
    }
    if (inSub && line.trim().startsWith('- ')) {
      const item = line.trim().slice(2).trim();
      if (item) items.push(item);
    }
  }
  return items;
}

function extractMailboxPending(content) {
  const lines = content.split('\n');
  const entries = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (cur) entries.push(cur);
      cur = { title: line.slice(4).trim(), status: '', action: '' };
    }
    if (cur && line.trim().startsWith('- Statut : ')) {
      cur.status = line.trim().slice('- Statut : '.length).trim();
    }
    if (cur && line.trim().startsWith('- Action proposée : ')) {
      cur.action = line.trim().slice('- Action proposée : '.length).trim();
    }
  }
  if (cur) entries.push(cur);
  return entries.filter(e => e.status === 'nouveau' || e.status === 'à challenger');
}

function extractDecisions(content) {
  const lines = content.split('\n');
  const decisions = [];
  let inSec = false;
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      inSec = line.slice(3).trim() === 'Décisions durables';
      continue;
    }
    if (inSec && line.startsWith('### ')) {
      if (cur) decisions.push(cur);
      const rawTitle = line.slice(4).trim();
      const dashIdx = rawTitle.indexOf(' — ');
      const title = dashIdx >= 0 ? rawTitle.slice(dashIdx + 3) : rawTitle;
      cur = { title, rawTitle, decision: '' };
    }
    if (cur && line.trim().startsWith('- Décision : ')) {
      cur.decision = line.trim().slice('- Décision : '.length).trim();
    }
  }
  if (cur) decisions.push(cur);
  return decisions.slice(0, 5);
}

function getStateLine(content, key) {
  const prefix = `- ${key} : `;
  for (const line of content.split('\n')) {
    if (line.trim().startsWith(prefix)) return line.trim().slice(prefix.length).trim();
  }
  return '—';
}

function generateReport(vaultDir) {
  const read = (name) => {
    const p = join(vaultDir, name);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  };

  const brief = read('00-brief.md');
  const mailbox = read('10-mailbox.md');
  const decisions = read('20-decisions.md');
  const roadmap = read('40-roadmap.md');

  const projet = getStateLine(brief, 'Projet');
  const phase = getStateLine(brief, 'Phase');
  const nextAction = getStateLine(brief, 'Prochaine action utile');

  const stale =
    daysSince(join(vaultDir, '00-brief.md')) > STALE_DAYS.brief ||
    daysSince(join(vaultDir, '40-roadmap.md')) > STALE_DAYS.roadmap;
  const freshness = stale ? 'STALE' : 'OK';

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const risques = extractBulletItems(brief, 'Risques / angles morts');
  const feuItems = extractSubsectionItems(roadmap, 'Roadmap vivante', 'Sur le feu');
  const mailboxPending = extractMailboxPending(mailbox);
  const decisionItems = extractDecisions(decisions);
  const priorityRead = extractBulletItems(brief, 'À lire en priorité');

  const L = [];
  const s = (line) => L.push(line);

  s('# PETER_REPORT');
  s('');
  s(`> Généré par Peter — ${now} — Ne pas éditer manuellement.`);
  s('');
  s('## Bureau préparé');
  s('');
  s(`- Projet : ${projet}`);
  s(`- Phase : ${phase}`);
  s(`- Dernière mise à jour : ${now}`);
  s(`- Fraîcheur : ${freshness}`);
  s('');
  s("## À savoir avant d'agir");
  s('');
  if (priorityRead.length) {
    priorityRead.forEach(i => s(`- ${i}`));
  } else {
    s('- Aucun élément prioritaire signalé dans 00-brief.md');
  }
  s('');
  s('## Décisions actives');
  s('');
  if (decisionItems.length) {
    decisionItems.forEach(d => s(`- **${d.rawTitle || d.title}**${d.decision ? ` — ${d.decision}` : ''}`));
  } else {
    s('- Aucune décision enregistrée dans 20-decisions.md');
  }
  s('');
  s('## Roadmap — Sur le feu');
  s('');
  if (feuItems.length) {
    feuItems.forEach(i => s(`- ${i}`));
  } else {
    s('- Rien en cours dans 40-roadmap.md');
  }
  s('');
  s('## Risques / contradictions');
  s('');
  if (risques.length) {
    risques.forEach(r => s(`- ${r}`));
  } else {
    s('- Aucun risque documenté dans 00-brief.md');
  }
  s('');
  s('## Mailbox à traiter');
  s('');
  if (mailboxPending.length) {
    mailboxPending.forEach(e => s(`- **${e.title}** [${e.status}]${e.action ? ` → ${e.action}` : ''}`));
  } else {
    s('- Aucune entrée en attente dans 10-mailbox.md');
  }
  s('');
  s('## Prochaine action recommandée');
  s('');
  s(`- ${nextAction !== '—' ? nextAction : 'À définir dans vault/00-brief.md'}`);
  s('');

  // Sections graphe Phase C
  const graphPath = join(vaultDir, 'index', 'graph.json');
  if (existsSync(graphPath)) {
    let graph = null;
    try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); } catch { /* skip */ }
    if (graph) {
      s('## Nœuds centraux');
      s('');
      const centralNodes = graph.stats?.centralNodes ?? [];
      if (centralNodes.length) {
        const deg = {};
        for (const e of graph.edges ?? []) {
          deg[e.from] = (deg[e.from] || 0) + 1;
          deg[e.to] = (deg[e.to] || 0) + 1;
        }
        for (const nodeId of centralNodes.slice(0, 8)) {
          const node = (graph.nodes ?? []).find(n => n.id === nodeId);
          const rel = deg[nodeId] || 0;
          const pathStr = node?.path ? ` — ${node.path}` : '';
          s(`- ${nodeId} — ${rel} relation(s)${pathStr}`);
        }
      } else {
        s('- Aucun nœud central calculé — relancez vault graph');
      }
      s('');
      s('## Documents pivots');
      s('');
      const pivots = (graph.nodes ?? [])
        .filter(n => (n.type === 'markdown_document' || n.type === 'vault_file') && n.path)
        .slice(0, 5);
      if (pivots.length) {
        for (const n of pivots) {
          s(`- ${n.path}${n.label && n.label !== n.path ? ` — ${n.label}` : ''}`);
        }
      } else {
        s('- Aucun document pivot trouvé');
      }
      s('');
      s('## Questions utiles');
      s('');
      s('- Quels documents expliquent la phase actuelle ?');
      s('- Quelles décisions structurent le projet ?');
      s('- Quels risques bloquent la prochaine étape ?');
      s('');
    }
  } else {
    s('## Nœuds centraux');
    s('');
    s('- Graphe absent — lancer `claude-atelier vault graph`.');
    s('');
  }

  return L.join('\n');
}

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

function buildIgnoreMatcher(extraPatterns = [], prefixExclusions = []) {
  const patterns = [...DEFAULT_IGNORE_PATTERNS, ...extraPatterns]
    .filter(p => !p.startsWith('!'))
    .map(p => {
      const anchored = p.startsWith('/');
      const dirOnly = p.endsWith('/');
      const clean = p.replace(/^\//, '').replace(/\/$/, '');
      try {
        return { raw: clean, anchored, dirOnly, re: globToRegex(clean) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return (relPath, isDir) => {
    // Exclusions de sous-arborescences entières (vault/.peter, vault/index, etc.)
    for (const prefix of prefixExclusions) {
      if (relPath === prefix || relPath.startsWith(prefix + '/')) return true;
    }
    const name = relPath.split('/').pop();
    for (const pat of patterns) {
      if (pat.dirOnly && !isDir) continue;
      const test = pat.anchored
        ? pat.re.test(relPath)
        : pat.re.test(relPath) || pat.re.test(name);
      if (test) return true;
    }
    return false;
  };
}

function computeFileSHA256(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function gitChildEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return env;
}

function getGitHead(cwd) {
  try {
    return execSync('git rev-parse HEAD', {
      cwd,
      env: gitChildEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function listChangedFilesSince(cwd, previousHead, currentHead) {
  if (!previousHead || !currentHead || previousHead === currentHead) return [];
  try {
    const output = execSync(`git --no-pager diff --name-only ${previousHead}..${currentHead}`, {
      cwd,
      env: gitChildEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return output ? output.split('\n').map(line => line.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isProductChangePath(filePath) {
  return filePath === 'package.json'
    || filePath === 'README.md'
    || filePath === 'index.js'
    || filePath.startsWith('bin/')
    || filePath.startsWith('hooks/')
    || filePath.startsWith('src/')
    || filePath.startsWith('scripts/');
}

function isWebsiteDocsPath(filePath) {
  return filePath.startsWith('website/docs/');
}

const GENERIC_CONCEPTS_EXTRACT = new Set([
  'avec', 'pour', 'dans', 'vers', 'plus', 'cette', 'comme', 'sans',
  'aussi', 'meme', 'sont', 'sera', 'etre', 'avoir', 'faire', 'tout',
  'quoi', 'dont', 'mais', 'donc', 'bien', 'tres', 'entre', 'tous',
  'lors', 'apres', 'avant', 'depuis', 'selon', 'ainsi', 'alors',
  'enfin', 'cela', 'ceci', 'celui', 'celle', 'type', 'null', 'vrai',
]);

function extractConcepts(text) {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = normalized
    .replace(/[#*`[\](){}|:]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 4 && !GENERIC_CONCEPTS_EXTRACT.has(w));
  return [...new Set(words)].slice(0, 8);
}

export {
  slugify,
  nowIso,
  shortSha,
  addMinutes,
  parseIntervalToMinutes,
  daysSince,
  readJsonIfExists,
  extractBulletItems,
  extractSubsectionItems,
  extractMailboxPending,
  extractDecisions,
  getStateLine,
  generateReport,
  parseIgnoreFile,
  globToRegex,
  buildIgnoreMatcher,
  computeFileSHA256,
  gitChildEnv,
  getGitHead,
  listChangedFilesSince,
  isProductChangePath,
  isWebsiteDocsPath,
  extractConcepts,
  walkDir,
  DEFAULT_CRON_INTERVAL,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_IGNORE_PATTERNS,
  STALE_DAYS,
};

function* walkDir(dir, isIgnored, relPrefix = '') {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
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
