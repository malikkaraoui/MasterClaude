#!/usr/bin/env node
/**
 * claude-atelier init — Install config into .claude/ or ~/.claude/
 *
 * Usage:
 *   claude-atelier init                 # project-local (./.claude/)
 *   claude-atelier init --global        # user-global (~/.claude/)
 *   claude-atelier init --lang en       # English version
 *   claude-atelier init --dry-run       # show what would be copied
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { showWelcome } from './welcome.js';
import { runPostInstallChecks } from './post-install-checks.js';
import { generateHooksSection } from './hooks-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const CYAN = '\x1b[0;36m';
const NC = '\x1b[0m';

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

    // Symlink (Unix) with copy fallback (Windows)
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

// ── Prompt oui/non interactif ─────────────────────────────────────────────────
async function promptYesNo(question, defaultYes = true) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? '[O/n]' : '[o/N]';
  return new Promise(resolve => {
    rl.question(`${question} ${hint} `, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'o' || a === 'oui' || a === 'y' || a === 'yes');
    });
  });
}

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

function parseArgs(argv) {
  const args = argv.slice(2).filter(a => a !== 'init');
  return {
    global: args.includes('--global'),
    dryRun: args.includes('--dry-run'),
    lang: args.includes('--lang') ? args[args.indexOf('--lang') + 1] || 'fr' : 'fr',
  };
}

function copyDirRecursive(src, dest, dryRun, copied, { skipExisting = false } = {}) {
  if (!existsSync(src)) return;

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;

    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!dryRun && !existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyDirRecursive(srcPath, destPath, dryRun, copied, { skipExisting });
    } else {
      // CLAUDE.md is user-customized (§0, project context) — never overwrite
      const isClaude = entry.name === 'CLAUDE.md';
      if ((isClaude || skipExisting) && existsSync(destPath)) {
        console.log(`${YELLOW}[SKIP]${NC} ${destPath} (already exists — not overwritten)`);
        continue;
      }
      if (dryRun) {
        copied.push(destPath);
      } else {
        if (!existsSync(dirname(destPath))) {
          mkdirSync(dirname(destPath), { recursive: true });
        }
        copyFileSync(srcPath, destPath);
        copied.push(destPath);
      }
    }
  }
}

function mergeSettings(existingPath, templatePath) {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));

  if (!existsSync(existingPath)) {
    return template;
  }

  const existing = JSON.parse(readFileSync(existingPath, 'utf8'));

  // Merge strategy: keep existing values, add missing keys from template
  const merged = { ...template, ...existing };

  // Deep merge env
  if (template.env || existing.env) {
    merged.env = { ...template.env, ...(existing.env || {}) };
  }

  // Deep merge permissions
  if (template.permissions || existing.permissions) {
    merged.permissions = { ...template.permissions, ...(existing.permissions || {}) };
    // Merge allow/deny arrays (union, no duplicates)
    if (template.permissions?.allow || existing.permissions?.allow) {
      merged.permissions.allow = [...new Set([
        ...(template.permissions?.allow || []),
        ...(existing.permissions?.allow || []),
      ])];
    }
    if (template.permissions?.deny || existing.permissions?.deny) {
      // deny: existing wins — never re-add entries the user explicitly removed.
      // Only add template entries if no existing deny list at all (fresh install).
      if (existing.permissions?.deny) {
        merged.permissions.deny = existing.permissions.deny;
      } else {
        merged.permissions.deny = template.permissions?.deny || [];
      }
    }
  }

  // Deep merge preferences
  if (template.preferences || existing.preferences) {
    merged.preferences = { ...template.preferences, ...(existing.preferences || {}) };
  }

  return merged;
}

export async function runInit(argv) {
  const { global: isGlobal, dryRun, lang: langArg } = parseArgs(argv);

  let lang = langArg;
  if (!lang && process.stdin.isTTY) {
    const cfgPath = isGlobal
      ? join(homedir(), '.claude', 'atelier-config.json')
      : join(process.cwd(), '.claude', 'atelier-config.json');
    if (!existsSync(cfgPath)) {
      lang = await promptLang();
    }
  }
  lang = lang ?? 'fr';

  // Validate lang — must have a CLAUDE.md to be considered ready
  const langDir = join(PKG_ROOT, 'src', lang);
  const langClaude = join(langDir, 'CLAUDE.md');
  if (!existsSync(langDir)) {
    const available = readdirSync(join(PKG_ROOT, 'src'))
      .filter(d => statSync(join(PKG_ROOT, 'src', d)).isDirectory() && !['stacks', 'templates'].includes(d));
    process.stderr.write(`${RED}error${NC}: language "${lang}" not available. Available: ${available.join(', ')}\n`);
    return 1;
  }
  if (!existsSync(langClaude)) {
    process.stderr.write(`${RED}error${NC}: language "${lang}" exists but has no CLAUDE.md — not ready for use.\n`);
    process.stderr.write(`See src/${lang}/README.md for the translation roadmap.\n`);
    return 1;
  }

  // Determine target
  const target = isGlobal
    ? join(homedir(), '.claude')
    : join(process.cwd(), '.claude');

  const label = isGlobal ? `~/.claude/ (global)` : `./.claude/ (project)`;

  console.log(`\n${CYAN}claude-atelier init${NC}`);
  console.log(`Target: ${label}`);
  console.log(`Language: ${lang}`);
  if (dryRun) console.log(`${YELLOW}DRY RUN${NC} — nothing will be written\n`);
  else console.log('');

  const copied = [];

  // 1. Copy lang files (runtime, orchestration, autonomy, security, ecosystem)
  const srcLang = join(PKG_ROOT, 'src', lang);
  copyDirRecursive(srcLang, target, dryRun, copied);

  // 2. Copy stacks
  const srcStacks = join(PKG_ROOT, 'src', 'stacks');
  const destStacks = join(target, 'stacks');
  copyDirRecursive(srcStacks, destStacks, dryRun, copied);

  // 2b. Copy skills into .claude/skills/ (superpowers skills)
  const srcSkills = join(PKG_ROOT, 'src', 'skills');
  const destSkills = isGlobal
    ? join(homedir(), '.claude', 'skills')
    : join(process.cwd(), '.claude', 'skills');
  copyDirRecursive(srcSkills, destSkills, dryRun, copied);

  // 2c. Copy commands into .claude/commands/ (native Claude Code slash commands)
  const srcCommands = join(PKG_ROOT, '.claude', 'commands');
  const destCommands = isGlobal
    ? join(homedir(), '.claude', 'commands')
    : join(process.cwd(), '.claude', 'commands');
  if (existsSync(srcCommands)) {
    copyDirRecursive(srcCommands, destCommands, dryRun, copied, { skipExisting: true });
  }

  // 3. Merge settings.json + inject hooks with resolved absolute paths
  const settingsTemplate = join(PKG_ROOT, 'src', 'templates', 'settings.json');
  const settingsDest = join(target, 'settings.json');
  const hooksDir = isGlobal ? join(homedir(), '.claude', 'hooks') : join(process.cwd(), 'hooks');
  const scriptsDir = isGlobal ? join(homedir(), '.claude', 'scripts') : join(process.cwd(), 'scripts');
  if (existsSync(settingsTemplate)) {
    if (dryRun) {
      if (existsSync(settingsDest)) {
        copied.push(`${settingsDest} (merged with existing + hooks injected)`);
      } else {
        copied.push(settingsDest);
      }
    } else {
      const merged = mergeSettings(settingsDest, settingsTemplate);
      // Always regenerate hooks — paths are machine-specific and must reflect the current install
      merged.hooks = generateHooksSection(hooksDir, scriptsDir);
      if (!existsSync(dirname(settingsDest))) {
        mkdirSync(dirname(settingsDest), { recursive: true });
      }
      writeFileSync(settingsDest, JSON.stringify(merged, null, 2) + '\n');
      copied.push(settingsDest);
    }
  }

  // 4. Copy .claudeignore to project root (not inside .claude/)
  const claudeignoreSrc = join(PKG_ROOT, 'src', 'templates', '.claudeignore');
  const claudeignoreDest = isGlobal
    ? join(homedir(), '.claudeignore')
    : join(process.cwd(), '.claudeignore');
  if (existsSync(claudeignoreSrc) && !existsSync(claudeignoreDest)) {
    if (!dryRun) {
      copyFileSync(claudeignoreSrc, claudeignoreDest);
    }
    copied.push(claudeignoreDest);
  } else if (existsSync(claudeignoreDest)) {
    console.log(`${YELLOW}[SKIP]${NC} .claudeignore already exists`);
  }

  // 5. Copy .gitignore template to project root (skip if exists)
  const gitignoreSrc = join(PKG_ROOT, 'src', 'templates', '.gitignore');
  const gitignoreDest = isGlobal
    ? null  // no .gitignore for global install
    : join(process.cwd(), '.gitignore');
  if (gitignoreDest && existsSync(gitignoreSrc) && !existsSync(gitignoreDest)) {
    if (!dryRun) {
      copyFileSync(gitignoreSrc, gitignoreDest);
    }
    copied.push(gitignoreDest);
  } else if (gitignoreDest && existsSync(gitignoreDest)) {
    console.log(`${YELLOW}[SKIP]${NC} .gitignore already exists`);
  }

  // 6. Copy scripts/
  const scriptsSrc = join(PKG_ROOT, 'scripts');
  const scriptsDest = isGlobal
    ? join(homedir(), '.claude', 'scripts')
    : join(process.cwd(), 'scripts');
  copyDirRecursive(scriptsSrc, scriptsDest, dryRun, copied);

  // 6b. Copy hooks/
  const hooksSrc = join(PKG_ROOT, 'hooks');
  const hooksDest = isGlobal
    ? join(homedir(), '.claude', 'hooks')
    : join(process.cwd(), 'hooks');
  if (existsSync(hooksSrc)) {
    if (!dryRun && !existsSync(hooksDest)) mkdirSync(hooksDest, { recursive: true });
    copyDirRecursive(hooksSrc, hooksDest, dryRun, copied);
  }

  // 7. Merge .mcp.json (MCP servers: qmd + magic)
  const mcpTemplate = join(PKG_ROOT, 'src', 'templates', '.mcp.json');
  const mcpDest = isGlobal
    ? join(homedir(), '.mcp.json')
    : join(process.cwd(), '.mcp.json');
  if (existsSync(mcpTemplate)) {
    if (dryRun) {
      copied.push(existsSync(mcpDest) ? `${mcpDest} (merged)` : mcpDest);
    } else {
      const tpl = JSON.parse(readFileSync(mcpTemplate, 'utf8'));
      let merged = tpl;
      if (existsSync(mcpDest)) {
        const existing = JSON.parse(readFileSync(mcpDest, 'utf8'));
        merged = {
          ...existing,
          mcpServers: { ...tpl.mcpServers, ...(existing.mcpServers || {}) },
        };
      }
      writeFileSync(mcpDest, JSON.stringify(merged, null, 2) + '\n');
      copied.push(mcpDest);
    }
  }

  // 8b. Copy AGENTS.md to project root (cross-agent standard)
  const agentsMdSrc = join(PKG_ROOT, 'src', 'templates', 'AGENTS.md');
  const agentsMdDest = isGlobal
    ? join(homedir(), '.claude', 'AGENTS.md')
    : join(process.cwd(), 'AGENTS.md');
  if (agentsMdDest && existsSync(agentsMdSrc) && !existsSync(agentsMdDest)) {
    if (!dryRun) {
      copyFileSync(agentsMdSrc, agentsMdDest);
    }
    copied.push(agentsMdDest);
  } else if (agentsMdDest && existsSync(agentsMdDest)) {
    console.log(`${YELLOW}[SKIP]${NC} AGENTS.md already exists`);
  }

  // 8. Copy .env.example (guide pour les clés API)
  const envExSrc = join(PKG_ROOT, 'src', 'templates', '.env.example');
  const envExDest = isGlobal
    ? null
    : join(process.cwd(), '.env.example');
  if (envExDest && existsSync(envExSrc) && !existsSync(envExDest)) {
    if (!dryRun) {
      copyFileSync(envExSrc, envExDest);
    }
    copied.push(envExDest);
  } else if (envExDest && existsSync(envExDest)) {
    console.log(`${YELLOW}[SKIP]${NC} .env.example already exists`);
  }

  // Summary
  console.log(`\n${GREEN}${copied.length} files${NC} ${dryRun ? 'would be' : ''} installed:\n`);
  for (const f of copied) {
    const display = f.startsWith(process.cwd())
      ? relative(process.cwd(), f)
      : f;
    console.log(`  ${display}`);
  }

  if (!dryRun) {
    const cfgPath = join(target, 'atelier-config.json');
    const existingCfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
    if (!existingCfg.lang) {
      writeFileSync(cfgPath, JSON.stringify({ ...existingCfg, lang }, null, 2) + '\n', 'utf8');
      console.log(`${GREEN}[CONFIG]${NC} lang=${lang} → ${cfgPath}`);
    }
  }

  if (!dryRun) {
    // §0 + QMD interactive wizard
    if (!isGlobal) {
      const claudeMd = join(target, 'CLAUDE.md');
      const { setupS0 } = await import('./setup-s0.js');
      await setupS0(claudeMd, process.cwd());
    }

    // Bridge .claude/skills/ → .github/skills/ (cross-agent standard)
    if (!isGlobal) {
      bridgeSkillsToGithub(join(target, 'skills'), process.cwd());
    }

    // Post-install checks : npm audit + package.json#files
    await runPostInstallChecks(process.cwd(), PKG_ROOT);

    // Welcome screen adapté à l'état du projet
    const claudeMdFinal = join(target, 'CLAUDE.md');
    await showWelcome({ claudeMdPath: claudeMdFinal, projectRoot: process.cwd(), pkgRoot: PKG_ROOT, action: 'init' });

    // Check for newer version (static command, no user input)
    try {
      const pkgJson = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
      const latest = execSync('npm view claude-atelier version 2>/dev/null', { encoding: 'utf8' }).trim();
      if (latest && latest !== pkgJson.version) {
        console.log(`${YELLOW}[UPDATE]${NC} claude-atelier ${pkgJson.version} → ${GREEN}${latest}${NC} disponible`);
        console.log(`  ${CYAN}npm update claude-atelier${NC}\n`);
      }
    } catch (_) {}

    // Créer .claude/features.json (vide = tous défauts ON) si absent
    const featuresDest = join(target, 'features.json');
    if (!existsSync(featuresDest)) {
      writeFileSync(featuresDest, '{}\n');
      console.log(`${GREEN}[FEATURES]${NC} .claude/features.json créé — toutes les features actives par défaut`);
      console.log(`  ${CYAN}npx claude-atelier features${NC} pour voir et modifier\n`);
    }

    // Propose hooks globaux (install projet uniquement)
    if (!isGlobal) {
      const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
      let globalAlreadyHasHooks = false;
      if (existsSync(globalSettingsPath)) {
        try {
          const g = JSON.parse(readFileSync(globalSettingsPath, 'utf8'));
          globalAlreadyHasHooks = !!g.hooks;
        } catch (_) {}
      }

      if (!globalAlreadyHasHooks) {
        console.log(`\n${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}`);
        console.log(`${CYAN}│  🚀  Hooks globaux  (~/.claude/settings.json)                │${NC}`);
        console.log(`${CYAN}├──────────────────────────────────────────────────────────────┤${NC}`);
        console.log(`${CYAN}│${NC}  Sans ça, Claude CLI (terminal) n'applique AUCUN rail hors   ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  de ce projet. Avec les hooks globaux :                      ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  • Entête §1 (heure + modèle + pastille) à chaque réponse   ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  • Routing Haiku / Sonnet / Opus automatique                 ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  • Guards git (no-sign, commits FR, tests avant push)        ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  • Ollama status + mode A/M (proxy local ou Anthropic)       ${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  Modifie : ~/.claude/settings.json  (section hooks seulement)${CYAN}│${NC}`);
        console.log(`${CYAN}│${NC}  Réversible : supprimez la clé "hooks" pour annuler.         ${CYAN}│${NC}`);
        console.log(`${CYAN}└──────────────────────────────────────────────────────────────┘${NC}`);

        const doGlobal = await promptYesNo(`\nConfigurer les hooks globaux ?`);
        if (doGlobal) {
          const globalHooksDir = join(homedir(), '.claude', 'hooks');
          const globalScriptsDir = join(homedir(), '.claude', 'scripts');
          if (!existsSync(globalHooksDir)) mkdirSync(globalHooksDir, { recursive: true });
          if (!existsSync(globalScriptsDir)) mkdirSync(globalScriptsDir, { recursive: true });
          copyDirRecursive(join(PKG_ROOT, 'hooks'), globalHooksDir, false, []);
          copyDirRecursive(join(PKG_ROOT, 'scripts'), globalScriptsDir, false, []);
          let globalSettings = {};
          if (existsSync(globalSettingsPath)) {
            try { globalSettings = JSON.parse(readFileSync(globalSettingsPath, 'utf8')); } catch (_) {}
          }
          globalSettings.hooks = generateHooksSection(globalHooksDir, globalScriptsDir);
          if (!existsSync(dirname(globalSettingsPath))) {
            mkdirSync(dirname(globalSettingsPath), { recursive: true });
          }
          writeFileSync(globalSettingsPath, JSON.stringify(globalSettings, null, 2) + '\n');
          console.log(`\n${GREEN}[HOOKS GLOBAL]${NC} ~/.claude/settings.json mis à jour`);
        } else {
          console.log(`${YELLOW}[SKIP]${NC} Hooks globaux ignorés — ${CYAN}npx claude-atelier init --global${NC} plus tard.`);
        }
      }
    }

    // Message de redémarrage — TOUJOURS affiché
    console.log(`\n${YELLOW}⚡ Redémarrez Claude Code pour activer les hooks :${NC}`);
    console.log(`   Terminal : fermez et rouvrez  ${CYAN}claude${NC}`);
    console.log(`   VS Code  : Cmd+Shift+P → ${CYAN}"Developer: Reload Window"${NC}`);
    console.log(`   Sans redémarrage les hooks ne seront pas actifs.\n`);

  } else {
    console.log(`\n${YELLOW}DRY RUN complete.${NC} Remove --dry-run to install for real.\n`);
  }

  return 0;
}
