/**
 * applyProfile — API programmatique pour injecter une config claude-atelier dans un worktree.
 * Utilisée par le plugin @paperclipai/plugin-atelier.
 *
 * Usage :
 *   import { applyProfile } from 'claude-atelier'
 *   await applyProfile({ cwd: '/path/to/worktree', profile: 'lean' })
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES } from './profiles/index.js';
import {
  mergeSettings,
  mergeMcpServers,
  mergeFileDirectory,
  mergeSkills,
} from './merge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

/**
 * @typedef {'full' | 'lean' | 'review-only'} ProfileName
 *
 * @typedef {{
 *   cwd: string,
 *   profile: ProfileName,
 *   skills?: string[],
 *   hooks?: string[],
 *   mcp?: Record<string, unknown>,
 *   mergeStrategy?: 'repo-wins' | 'atelier-wins',
 *   dryRun?: boolean,
 * }} ApplyProfileOpts
 *
 * @typedef {{ applied: string[], skipped: string[], warnings: string[] }} ApplyResult
 */

/**
 * @param {ApplyProfileOpts} opts
 * @returns {Promise<ApplyResult>}
 */
export async function applyProfile(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('applyProfile: opts est obligatoire');
  }
  const {
    cwd,
    profile,
    skills: skillsOverride,
    hooks: hooksOverride,
    mcp: mcpOverride,
    mergeStrategy = 'repo-wins',
    dryRun = false,
  } = opts;

  const result = { applied: [], skipped: [], warnings: [] };

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!cwd || typeof cwd !== 'string') {
    throw new Error('applyProfile: cwd est obligatoire');
  }
  const resolvedCwd = resolve(cwd);
  if (!existsSync(resolvedCwd) || !statSync(resolvedCwd).isDirectory()) {
    throw new Error(`applyProfile: cwd "${resolvedCwd}" n'existe pas ou n'est pas un dossier`);
  }
  if (!PROFILES[profile]) {
    throw new Error(`applyProfile: profil inconnu "${profile}". Valides: ${Object.keys(PROFILES).join(', ')}`);
  }

  const preset = PROFILES[profile];
  const winner = mergeStrategy === 'atelier-wins' ? 'injected' : 'existing';

  // Listes effectives (override ou preset) — Array.isArray pour rejeter null/non-array explicites
  const skillNames = Array.isArray(skillsOverride) ? skillsOverride : preset.skills;
  const hookNames = Array.isArray(hooksOverride) ? hooksOverride : preset.hooks;
  const mcpConfig = mcpOverride ?? preset.mcp;

  const claudeDir = join(resolvedCwd, '.claude');

  if (!dryRun) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // ── 1. settings.json ────────────────────────────────────────────────────────
  const settingsSrc = join(PKG_ROOT, 'src', 'templates', 'settings.json');
  const settingsDest = join(claudeDir, 'settings.json');

  if (existsSync(settingsSrc)) {
    const injectedSettings = JSON.parse(readFileSync(settingsSrc, 'utf8'));
    const existingSettings = existsSync(settingsDest)
      ? (() => { try { return JSON.parse(readFileSync(settingsDest, 'utf8')); } catch { return {}; } })()
      : {};

    const merged = mergeSettings(existingSettings, injectedSettings, winner);

    if (dryRun) {
      result.applied.push(settingsDest + ' (dry-run)');
    } else {
      writeFileSync(settingsDest, JSON.stringify(merged, null, 2) + '\n');
      result.applied.push(settingsDest);
    }
  }

  // ── 2. hooks/ ───────────────────────────────────────────────────────────────
  if (hookNames.length > 0) {
    const hooksSrcDir = join(PKG_ROOT, 'hooks');
    const hooksDestDir = join(claudeDir, 'hooks');

    if (!dryRun) mkdirSync(hooksDestDir, { recursive: true });

    const existingHooks = existsSync(hooksDestDir)
      ? readdirSync(hooksDestDir)
      : [];

    const availableHooks = existsSync(hooksSrcDir)
      ? readdirSync(hooksSrcDir)
      : [];

    const toInject = hookNames.filter(h => availableHooks.includes(h));
    const missing = hookNames.filter(h => !availableHooks.includes(h));

    for (const m of missing) {
      result.warnings.push(`hook "${m}" introuvable dans le package — ignoré`);
    }

    const { toWrite, toSkip, warnings } = mergeFileDirectory(existingHooks, toInject, winner);
    result.warnings.push(...warnings.map(w => `hooks/${w}`));

    for (const hook of toSkip) {
      result.skipped.push(join(hooksDestDir, hook));
    }
    for (const hook of toWrite) {
      const src = join(hooksSrcDir, hook);
      const dest = join(hooksDestDir, hook);
      if (dryRun) {
        result.applied.push(dest + ' (dry-run)');
      } else {
        copyFileSync(src, dest);
        result.applied.push(dest);
      }
    }
  }

  // ── 3. skills/ ──────────────────────────────────────────────────────────────
  if (skillNames.length > 0) {
    const skillsSrcDir = join(PKG_ROOT, 'src', 'skills');
    const skillsDestDir = join(claudeDir, 'skills');

    if (!dryRun) mkdirSync(skillsDestDir, { recursive: true });

    const existingSkills = existsSync(skillsDestDir)
      ? readdirSync(skillsDestDir)
      : [];

    const { toInstall, warnings } = mergeSkills(existingSkills, skillNames);
    result.warnings.push(...warnings);

    for (const prefixedSkill of toInstall) {
      // Validation path traversal
      if (/[/\\]|\.\./.test(prefixedSkill)) {
        result.warnings.push(`skill "${prefixedSkill}" nom invalide — ignoré`);
        continue;
      }
      // Lookup source : d'abord le nom complet (ex: atelier-config), puis sans préfixe (ex: angle-mort)
      const srcName = prefixedSkill.replace(/^atelier-/, '');
      const srcSkillDir = existsSync(join(skillsSrcDir, prefixedSkill))
        ? join(skillsSrcDir, prefixedSkill)
        : join(skillsSrcDir, srcName);
      const destSkillDir = join(skillsDestDir, prefixedSkill);

      if (!existsSync(srcSkillDir)) {
        result.warnings.push(`skill "${srcName}" introuvable dans le package — ignoré`);
        continue;
      }

      if (dryRun) {
        result.applied.push(destSkillDir + '/ (dry-run)');
      } else {
        copyDirRecursive(srcSkillDir, destSkillDir, result);
      }
    }
  }

  // ── 4. .mcp.json ────────────────────────────────────────────────────────────
  const mcpServers = mcpConfig?.mcpServers ?? {};
  if (Object.keys(mcpServers).length > 0) {
    const mcpDest = join(resolvedCwd, '.mcp.json');
    const existingMcp = existsSync(mcpDest)
      ? (() => { try { return JSON.parse(readFileSync(mcpDest, 'utf8')); } catch { return {}; } })()
      : {};

    const { merged, warnings } = mergeMcpServers(
      existingMcp.mcpServers ?? {},
      mcpServers,
      winner
    );
    result.warnings.push(...warnings);

    const final = { ...existingMcp, mcpServers: merged };

    if (dryRun) {
      result.applied.push(mcpDest + ' (dry-run)');
    } else {
      writeFileSync(mcpDest, JSON.stringify(final, null, 2) + '\n');
      result.applied.push(mcpDest);
    }
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyDirRecursive(src, dest, result) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, result);
    } else {
      copyFileSync(srcPath, destPath);
      result.applied.push(destPath);
    }
  }
}
