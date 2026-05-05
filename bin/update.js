#!/usr/bin/env node
/**
 * claude-atelier update — Update config, preserving all user customizations
 *
 * Strategy:
 *  1. Backup current .claude/ → .claude/.backup-YYYYMMDD-HHMMSS/
 *  2. Copy all template files from package .claude/ to target
 *  3. settings.json : merge (user values win, new keys added)
 *  4. CLAUDE.md     : merge §0 (project context preserved)
 *  5. Report what changed: [NEW] / [UPDATED] / [MERGED] / [SKIP]
 *
 * Usage:
 *   claude-atelier update                 # project-local (./.claude/)
 *   claude-atelier update --global        # user-global (~/.claude/)
 *   claude-atelier update --dry-run       # show what would change
 */

import {
  existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync,
  readdirSync, statSync, cpSync, symlinkSync,
} from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { showWelcome } from './welcome.js';
import { runPostInstallChecks } from './post-install-checks.js';
import { generateHooksSection } from './hooks-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const GREEN  = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const CYAN   = '\x1b[0;36m';
const DIM    = '\x1b[2m';
const NC     = '\x1b[0m';

function parseArgs(argv) {
  const args = argv.slice(2).filter(a => a !== 'update');
  return {
    global: args.includes('--global'),
    dryRun: args.includes('--dry-run'),
    migrateAgentsMd: args.includes('--migrate-agents-md'),
  };
}

// ── settings.json : user values win, new template keys added ─────────────────
function mergeSettings(templatePath, existingPath) {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  if (!existsSync(existingPath)) return { result: template, merged: false };

  const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
  const merged   = { ...template, ...existing };

  if (template.env || existing.env) {
    merged.env = { ...(template.env || {}), ...(existing.env || {}) };
  }

  if (template.permissions || existing.permissions) {
    merged.permissions = { ...(template.permissions || {}), ...(existing.permissions || {}) };
    if (template.permissions?.allow || existing.permissions?.allow) {
      merged.permissions.allow = [...new Set([
        ...(template.permissions?.allow || []),
        ...(existing.permissions?.allow || []),
      ])];
    }
    // deny: existing wins (user explicitly chose these)
    if (existing.permissions?.deny) {
      merged.permissions.deny = existing.permissions.deny;
    } else if (template.permissions?.deny) {
      merged.permissions.deny = template.permissions.deny;
    }
  }

  if (template.preferences || existing.preferences) {
    merged.preferences = { ...(template.preferences || {}), ...(existing.preferences || {}) };
  }

  return { result: merged, merged: true };
}

// ── CLAUDE.md : extract §0 from existing, inject into new template ───────────
function extractSection0(content) {
  const m = content.match(/^## §0 Contexte projet actif\n\n[\s\S]*?(?=^## §\d|$)/m);
  return m ? m[0].trim() : null;
}

function mergeClaude(templateContent, existingPath) {
  if (!existsSync(existingPath)) return { result: templateContent, merged: false };

  const existing = readFileSync(existingPath, 'utf8');
  const section0 = extractSection0(existing);
  if (!section0) return { result: templateContent, merged: false };

  const merged = templateContent.replace(
    /^## §0 Contexte projet actif\n\n[\s\S]*?(?=^## §\d)/m,
    section0 + '\n\n'
  );
  return { result: merged, merged: true };
}

// ── Recursive copy with per-file smart merge ──────────────────────────────────
function copyDirRecursive(src, dest, dryRun, report, excludeDirs = []) {
  if (!existsSync(src)) return;

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.gitkeep' || excludeDirs.includes(entry.name)) continue;

    const srcPath  = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!dryRun && !existsSync(destPath)) mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath, dryRun, report, excludeDirs);
      continue;
    }

    const exists = existsSync(destPath);

    // settings.json — always merge
    if (entry.name === 'settings.json') {
      if (!dryRun) {
        const { result, merged } = mergeSettings(srcPath, destPath);
        if (!existsSync(dirname(destPath))) mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, JSON.stringify(result, null, 2) + '\n');
        report.push({ tag: merged ? 'MERGED' : 'NEW', path: destPath });
      } else {
        report.push({ tag: exists ? 'MERGED' : 'NEW', path: destPath });
      }
      continue;
    }

    // CLAUDE.md — merge §0
    if (entry.name === 'CLAUDE.md') {
      if (!dryRun) {
        const templateContent = readFileSync(srcPath, 'utf8');
        const { result, merged } = mergeClaude(templateContent, destPath);
        if (!existsSync(dirname(destPath))) mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, result);
        report.push({ tag: merged ? 'MERGED' : 'NEW', path: destPath });
      } else {
        report.push({ tag: exists ? 'MERGED' : 'NEW', path: destPath });
      }
      continue;
    }

    // All other files — copy (update)
    if (!dryRun) {
      if (!existsSync(dirname(destPath))) mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
    report.push({ tag: exists ? 'UPDATED' : 'NEW', path: destPath });
  }
}

// ── Bridge .claude/skills/ → .github/skills/ (cross-agent standard) ──────────
function bridgeSkillsToGithub(claudeSkillsDir, projectRoot) {
  if (!existsSync(claudeSkillsDir)) return;

  const githubSkillsDir = join(projectRoot, '.github', 'skills');
  if (!existsSync(githubSkillsDir)) mkdirSync(githubSkillsDir, { recursive: true });

  let created = 0;
  let skipped = 0;

  for (const entry of readdirSync(claudeSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(claudeSkillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    const linkPath = join(githubSkillsDir, `${entry.name}.md`);
    if (existsSync(linkPath)) { skipped++; continue; }

    try {
      symlinkSync(relative(githubSkillsDir, skillMd), linkPath);
    } catch (_) {
      copyFileSync(skillMd, linkPath);
    }
    created++;
  }

  if (created > 0) {
    console.log(`${GREEN}[BRIDGE]${NC} .github/skills/ — ${created} skill(s) liés`);
  } else if (skipped > 0) {
    console.log(`${YELLOW}[SKIP]${NC} .github/skills/ — ${skipped} skill(s) déjà présents`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── AGENTS.md : additive copy — never overwrite existing ─────────────────────
function copyAgentsMd(templatePath, destPath, dryRun, report) {
  if (!existsSync(templatePath)) return;
  const exists = existsSync(destPath);
  if (exists) {
    report.push({ tag: 'SKIP', path: destPath });
    if (!dryRun) console.log(`\x1b[0;33m[SKIP]\x1b[0m AGENTS.md already exists (additive — not overwritten)`);
    return;
  }
  if (!dryRun) {
    copyFileSync(templatePath, destPath);
  }
  report.push({ tag: 'NEW', path: destPath });
}

export async function runUpdate(argv) {
  const opts = parseArgs(argv);

  const targetDir = opts.global
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  const templateDir = join(PKG_ROOT, '.claude');

  if (!existsSync(templateDir)) {
    process.stderr.write(`✘ Template directory not found: ${templateDir}\n`);
    return 1;
  }

  console.log(`\n${CYAN}claude-atelier update${NC}`);
  console.log(`Target : ${opts.global ? '~/.claude/' : './.claude/'}`);
  if (opts.dryRun) console.log(`${YELLOW}DRY RUN${NC} — nothing will be written\n`);
  else console.log('');

  // 1. Backup existing .claude/ before touching anything
  let backupPath = null;
  if (!opts.dryRun && existsSync(targetDir)) {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    backupPath = join(dirname(targetDir), `.claude-backup-${ts}`);
    cpSync(targetDir, backupPath, { recursive: true });
    console.log(`${DIM}Backup → ${relative(process.cwd(), backupPath)}/ (temporaire — ajoutez .claude-backup-*/ à votre .gitignore)${NC}\n`);
  }

  // 2. Copy/merge all template files (skip backup dir as exclude)
  const report = [];
  copyDirRecursive(templateDir, targetDir, opts.dryRun, report);

  // 2a. Always regenerate hooks — paths are machine-specific
  if (!opts.dryRun) {
    const hooksDir = opts.global ? join(homedir(), '.claude', 'hooks') : join(process.cwd(), 'hooks');
    const scriptsDir = opts.global ? join(homedir(), '.claude', 'scripts') : join(process.cwd(), 'scripts');
    const settingsDest = join(targetDir, 'settings.json');
    if (existsSync(settingsDest)) {
      const s = JSON.parse(readFileSync(settingsDest, 'utf8'));
      s.hooks = generateHooksSection(hooksDir, scriptsDir);
      writeFileSync(settingsDest, JSON.stringify(s, null, 2) + '\n');
      report.push({ tag: 'MERGED', path: settingsDest + ' (hooks régénérés)' });
    }
  }

  // 2b. AGENTS.md — additive copy to project root (or ~/.claude/ for global)
  {
    const agentsMdSrc = join(PKG_ROOT, 'src', 'templates', 'AGENTS.md');
    const agentsMdDest = opts.global
      ? join(homedir(), '.claude', 'AGENTS.md')
      : join(process.cwd(), 'AGENTS.md');
    copyAgentsMd(agentsMdSrc, agentsMdDest, opts.dryRun, report);
  }

  // 3. Print report grouped by tag
  const groups = { NEW: [], MERGED: [], UPDATED: [], SKIP: [] };
  for (const { tag, path } of report) {
    const display = path.startsWith(process.cwd()) ? relative(process.cwd(), path) : path;
    groups[tag].push(display);
  }

  for (const [tag, files] of Object.entries(groups)) {
    if (files.length === 0 || tag === 'SKIP') continue;
    const color = tag === 'NEW' ? GREEN : tag === 'MERGED' ? CYAN : YELLOW;
    console.log(`${color}[${tag}]${NC} ${files.length} fichier(s) :`);
    files.forEach(f => console.log(`  ${DIM}${f}${NC}`));
    console.log('');
  }

  if (opts.dryRun) {
    console.log(`${YELLOW}DRY RUN complete.${NC} Retire --dry-run pour appliquer.\n`);
    return 0;
  }

  if (backupPath) {
    console.log(`${DIM}Backup conservé : ${relative(process.cwd(), backupPath)}/${NC}`);
    console.log(`${DIM}Pour annuler : cp -r ${relative(process.cwd(), backupPath)}/ ${relative(process.cwd(), targetDir)}/${NC}\n`);
  }

  // --migrate-agents-md : informational notice only
  if (!opts.global && opts.migrateAgentsMd) {
    console.log(`\n${CYAN}[--migrate-agents-md]${NC} Migration structurelle AGENTS.md activée.`);
    console.log(`${YELLOW}Note :${NC} CLAUDE.md conservé tel quel — vérifier manuellement les sections dupliquées.\n`);
  }

  // Bridge .claude/skills/ → .github/skills/ (cross-agent standard)
  if (!opts.global) {
    bridgeSkillsToGithub(join(targetDir, 'skills'), process.cwd());
  }

  // Post-install checks : npm audit + package.json#files
  await runPostInstallChecks(process.cwd(), PKG_ROOT);

  // Welcome screen adapté à l'état du projet
  const claudeMd = opts.global
    ? join(homedir(), '.claude', 'CLAUDE.md')
    : join(process.cwd(), '.claude', 'CLAUDE.md');
  await showWelcome({ claudeMdPath: claudeMd, projectRoot: process.cwd(), pkgRoot: PKG_ROOT, action: 'update' });

  return 0;
}

runUpdate(process.argv).then(code => process.exit(code));
