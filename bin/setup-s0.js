/**
 * setup-s0.js — Interactive setup wizard (§0 + QMD)
 *
 * Flow :
 *   1. Lire + classifier §0 (renseigné / vide / template erroné)
 *   2. Poser les questions ciblées sur les champs manquants
 *   3. Mettre à jour CLAUDE.md §0
 *   4. Proposer QMD si ≥ 5 fichiers .md et pas encore activé
 *   5. Afficher un banner récapitulatif
 *
 * Appelé par init.js après la copie des fichiers.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { join, basename } from 'node:path';

const YELLOW = '\x1b[0;33m';
const CYAN   = '\x1b[0;36m';
const GREEN  = '\x1b[0;32m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const NC     = '\x1b[0m';

const EMPTY = '—';

// ── §0 parsing ────────────────────────────────────────────────────────────────

function parseS0(content) {
  const fields = {};
  let inS0 = false;

  for (const line of content.split('\n')) {
    if (line.startsWith('## §0'))           { inS0 = true; continue; }
    if (inS0 && /^## §[1-9]/.test(line))   { break; }
    if (!inS0 || !line.startsWith('| '))   continue;
    if (line.startsWith('| Clé') || line.startsWith('| ---')) continue;

    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) fields[parts[0]] = parts[1];
  }

  return fields;
}

function updateS0(content, fields) {
  let inS0 = false;

  return content.split('\n').map(line => {
    if (line.startsWith('## §0'))           { inS0 = true; return line; }
    if (inS0 && /^## §[1-9]/.test(line))   { inS0 = false; return line; }
    if (!inS0 || !line.startsWith('| '))   return line;
    if (line.startsWith('| Clé') || line.startsWith('| ---')) return line;

    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2 && fields[parts[0]] !== undefined) {
      return `| ${parts[0]} | ${fields[parts[0]]} |`;
    }
    return line;
  }).join('\n');
}

// ── Auto-detection ────────────────────────────────────────────────────────────

function detectContext(projectRoot) {
  const ctx = {};

  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name && pkg.name !== 'claude-atelier') ctx.name = pkg.name;

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack = [];
      if (deps['next'])                               stack.push('Next.js');
      else if (deps['react'])                         stack.push('React');
      if (deps['vite'])                               stack.push('Vite');
      if (deps['express'])                            stack.push('Express');
      if (deps['fastify'])                            stack.push('Fastify');
      if (deps['firebase'] || deps['firebase-admin']) stack.push('Firebase');
      if (deps['typescript'])                         stack.push('TypeScript');
      if (deps['prisma'])                             stack.push('Prisma');
      if (deps['drizzle-orm'])                        stack.push('Drizzle');
      if (stack.length)                               ctx.stack = stack.join(' · ');
    } catch (_) {}
  }

  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'setup.py'))) {
    ctx.stack = ctx.stack ? ctx.stack + ' · Python' : 'Python';
  }
  if (existsSync(join(projectRoot, 'Cargo.toml'))) {
    ctx.stack = ctx.stack ? ctx.stack + ' · Rust' : 'Rust';
  }
  if (existsSync(join(projectRoot, 'pom.xml')) || existsSync(join(projectRoot, 'build.gradle'))) {
    ctx.stack = ctx.stack ? ctx.stack + ' · Java' : 'Java';
  }
  if (existsSync(join(projectRoot, 'Dockerfile')) || existsSync(join(projectRoot, 'docker-compose.yml'))) {
    ctx.stack = ctx.stack ? ctx.stack + ' · Docker' : 'Docker';
  }

  const git = spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8', cwd: projectRoot
  });
  if (git.status === 0 && git.stdout.trim()) ctx.repo = git.stdout.trim();

  if (!ctx.name) ctx.name = basename(projectRoot);

  return ctx;
}

// ── .md file counter ──────────────────────────────────────────────────────────

function countMdFiles(dir, depth = 0) {
  if (depth > 6) return 0;
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.claude'].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) count += countMdFiles(full, depth + 1);
      else if (entry.name.endsWith('.md')) count++;
    }
  } catch (_) {}
  return count;
}

// ── Field definitions ─────────────────────────────────────────────────────────

const FIELD_META = {
  'Projet courant':     { label: 'Nom du projet',      examples: null },
  'Phase':              { label: 'Phase actuelle',      examples: 'MVP · Alpha · Beta · Prod · Maintenance' },
  'Stack':              { label: 'Stack technique',     examples: 'React · Node.js · PostgreSQL' },
  'Repo':               { label: 'URL du repo Git',     examples: null },
  'Conventions':        { label: 'Conventions',         examples: 'commits FR · tests Jest · ESLint strict' },
  'Endpoints actifs':   { label: 'Endpoints / routes',  examples: '/api/users · /api/cars' },
  'Contraintes métier': { label: 'Contraintes métier',  examples: 'RGPD · multi-tenant · géoloc' },
  'MCPs actifs':        { label: 'MCPs actifs',         examples: 'qmd · playwright' },
  'Gate pré-push':      { label: 'Gate pré-push',       examples: null },
};

const SKIP_FIELDS = new Set(['Gate pré-push']);

// ── Classifier ────────────────────────────────────────────────────────────────

function isEmpty(v)        { return !v || v === EMPTY || v.trim() === ''; }
function isTemplate(k, v)  {
  if (k === 'Stack' && /React\/Vite.+Firebase.+Ollama/.test(v)) return true;
  return false;
}

function classify(current) {
  const filled = [], suspect = [], empty = [];
  for (const [k, v] of Object.entries(current)) {
    if (SKIP_FIELDS.has(k)) continue;
    if (isEmpty(v))         empty.push(k);
    else if (isTemplate(k, v)) suspect.push(k);
    else                    filled.push(k);
  }
  return { filled, suspect, empty };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function setupS0(claudeMdPath, projectRoot) {
  if (!existsSync(claudeMdPath)) return;

  const content  = readFileSync(claudeMdPath, 'utf8');
  const current  = parseS0(content);
  const detected = detectContext(projectRoot);
  const { filled, suspect, empty } = classify(current);
  const needsConfig = [...empty, ...suspect];
  const mdCount  = countMdFiles(projectRoot);
  const qmdActive = (current['MCPs actifs'] || '').toLowerCase().includes('qmd');

  const isInteractive = process.stdin.isTTY;

  // ── State report ──
  console.log(`\n${BOLD}━━━  Configuration du projet  ━━━${NC}\n`);

  if (filled.length > 0) {
    console.log(`${GREEN}§0 renseigné${NC}`);
    for (const k of filled) console.log(`  ${DIM}${k}${NC} → ${current[k]}`);
    console.log('');
  }

  if (suspect.length > 0) {
    console.log(`${YELLOW}§0 valeurs par défaut (à corriger)${NC}`);
    for (const k of suspect) console.log(`  ${DIM}${k}${NC} → ${current[k]}`);
    console.log('');
  }

  if (empty.length > 0) {
    console.log(`${YELLOW}§0 vide${NC} : ${empty.join(' · ')}\n`);
  }

  if (needsConfig.length === 0) {
    console.log(`${GREEN}§0 complet.${NC}`);
  }

  // ── QMD detection (before asking anything) ──
  const proposeQmd = mdCount >= 5 && !qmdActive;
  if (proposeQmd) {
    console.log(`${CYAN}QMD${NC} : ${mdCount} fichiers .md détectés — moteur de recherche sémantique disponible.\n`);
  }

  // Non-interactive : show summary and exit
  if (!isInteractive) {
    if (needsConfig.length > 0) {
      console.log(`${DIM}Mode non-interactif — config ignorée. Relance "claude-atelier init" dans un terminal.${NC}`);
    }
    if (proposeQmd) {
      console.log(`${DIM}→ Dans Claude Code : tape /qmd-init pour indexer.${NC}`);
    }
    console.log('');
    return;
  }

  // ── §0 interactive config ──
  let rl, ask;
  const needInteractive = needsConfig.length > 0 || proposeQmd;

  if (needInteractive) {
    rl  = createInterface({ input: process.stdin, output: process.stdout });
    ask = (q) => new Promise(r => rl.question(q, r));
  }

  let s0Updated = false;

  if (needsConfig.length > 0) {
    const doConfig = await ask(`Configurer §0 maintenant ? ${DIM}[O/n]${NC} `);

    if (doConfig.trim().toLowerCase() !== 'n') {
      console.log(`\n${DIM}Entrée vide = valeur détectée ou inchangée · tiret seul (—) = vider · Ctrl+C = annuler${NC}\n`);

      const updates = {};

      for (const key of needsConfig) {
        const meta     = FIELD_META[key] || { label: key, examples: null };
        const hint     = key === 'Projet courant' ? detected.name
                       : key === 'Stack'          ? detected.stack
                       : key === 'Repo'           ? detected.repo
                       : null;
        const existing = current[key] && !isEmpty(current[key]) && !isTemplate(key, current[key])
                       ? current[key] : null;

        let prompt = `  ${CYAN}${meta.label}${NC}`;
        if (hint)     prompt += ` ${DIM}[détecté : ${hint}]${NC}`;
        if (existing) prompt += ` ${DIM}[actuel : ${existing}]${NC}`;
        if (meta.examples && !hint && !existing) prompt += ` ${DIM}(ex: ${meta.examples})${NC}`;
        prompt += ' : ';

        const answer = (await ask(prompt)).trim();

        if (answer === EMPTY)      updates[key] = EMPTY;
        else if (answer !== '')    updates[key] = answer;
        else if (hint) {
          updates[key] = hint;
          console.log(`    ${DIM}→ ${hint}${NC}`);
        }
      }

      if (Object.keys(updates).length > 0) {
        console.log(`\n${GREEN}Modifications §0 :${NC}`);
        for (const [k, v] of Object.entries(updates)) {
          console.log(`  ${DIM}${current[k] || EMPTY}${NC} → ${GREEN}${v}${NC}  ${DIM}(${k})${NC}`);
        }
        const updatedContent = updateS0(content, { ...current, ...updates });
        writeFileSync(claudeMdPath, updatedContent);

        // Also update current for QMD check below
        Object.assign(current, updates);
        s0Updated = true;
      } else {
        console.log(`\n${DIM}§0 inchangé.${NC}`);
      }
    } else {
      console.log(`\n${DIM}§0 ignoré. Dans Claude Code : « Mets à jour §0 : projet X, stack Y »${NC}`);
    }
  }

  // ── QMD proposal ──
  if (proposeQmd) {
    console.log('');
    const doQmd = await ask(`Ajouter QMD à §0 (MCPs actifs) et indexer le projet ? ${DIM}[O/n]${NC} `);

    if (doQmd.trim().toLowerCase() !== 'n') {
      // Add qmd to MCPs actifs in §0
      const freshContent = readFileSync(claudeMdPath, 'utf8');
      const freshCurrent = parseS0(freshContent);
      const currentMcps  = freshCurrent['MCPs actifs'] || EMPTY;
      const newMcps      = isEmpty(currentMcps) || currentMcps === EMPTY
                         ? 'qmd'
                         : currentMcps.includes('qmd') ? currentMcps : currentMcps + ' · qmd';

      const updatedContent = updateS0(freshContent, { ...freshCurrent, 'MCPs actifs': newMcps });
      writeFileSync(claudeMdPath, updatedContent);
      s0Updated = true;

      console.log(`  ${GREEN}MCPs actifs → ${newMcps}${NC}`);
      console.log(`\n  ${DIM}Lance ${CYAN}/qmd-init${DIM} dans Claude Code pour indexer les ${mdCount} fichiers .md.${NC}`);
    } else {
      console.log(`  ${DIM}QMD ignoré. Tu pourras l'activer plus tard avec /qmd-init.${NC}`);
    }
  }

  if (needInteractive) rl.close();

  // ── Final banner ──
  console.log(`\n${BOLD}${GREEN}━━━  Setup terminé${NC}`);
  if (s0Updated)   console.log(`  ${GREEN}✓${NC} §0 mis à jour`);
  if (proposeQmd && !qmdActive) console.log(`  ${CYAN}→${NC} /qmd-init pour indexer (dans Claude Code)`);
  console.log(`  ${CYAN}→${NC} claude-atelier doctor pour vérifier l'installation`);
  console.log('');
}
