#!/usr/bin/env node
/**
 * claude-atelier apply — Injecte un profil de config dans un worktree cible.
 *
 * Usage :
 *   claude-atelier apply --profile lean --cwd /path/to/worktree --yes
 *   claude-atelier apply --profile full --dry-run
 */

import { applyProfile } from '../src/apply-profile.js';
import { PROFILES } from '../src/profiles/index.js';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const CYAN = '\x1b[0;36m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const RED = '\x1b[0;31m';
const NC = '\x1b[0m';

function parseApplyArgs(argv) {
  const args = argv.slice(2).filter(a => a !== 'apply');
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    cwd: get('--cwd') ?? process.cwd(),
    profile: get('--profile') ?? 'full',
    merge: get('--merge') ?? 'repo-wins',
    yes: args.includes('--yes') || args.includes('-y'),
    dryRun: args.includes('--dry-run'),
  };
}

async function promptConfirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [O/n] `, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(!a || a === 'o' || a === 'oui' || a === 'y' || a === 'yes');
    });
  });
}

export async function runApply(argv) {
  const { cwd, profile, merge, yes, dryRun } = parseApplyArgs(argv);

  const validProfiles = Object.keys(PROFILES);
  if (!validProfiles.includes(profile)) {
    process.stderr.write(`${RED}error${NC}: profil inconnu "${profile}". Valides: ${validProfiles.join(', ')}\n`);
    return 1;
  }

  const validMerge = ['repo-wins', 'atelier-wins'];
  if (!validMerge.includes(merge)) {
    process.stderr.write(`${RED}error${NC}: stratégie inconnue "${merge}". Valides: ${validMerge.join(', ')}\n`);
    return 1;
  }

  const resolvedCwd = resolve(cwd);

  console.log(`\n${CYAN}claude-atelier apply${NC}`);
  console.log(`  Profil     : ${profile}`);
  console.log(`  Cible      : ${resolvedCwd}`);
  console.log(`  Merge      : ${merge}`);
  if (dryRun) console.log(`  ${YELLOW}DRY RUN${NC} — rien ne sera écrit`);
  console.log('');

  if (!yes && !dryRun) {
    const ok = await promptConfirm(`Appliquer le profil "${profile}" dans ${resolvedCwd} ?`);
    if (!ok) {
      console.log('Annulé.');
      return 0;
    }
  }

  let result;
  try {
    result = await applyProfile({
      cwd: resolvedCwd,
      profile,
      mergeStrategy: merge,
      dryRun,
    });
  } catch (err) {
    process.stderr.write(`${RED}error${NC}: ${err.message}\n`);
    return 1;
  }

  for (const w of result.warnings) {
    console.log(`  ${YELLOW}[WARN]${NC} ${w}`);
  }
  for (const f of result.skipped) {
    console.log(`  ${YELLOW}[SKIP]${NC} ${f}`);
  }
  for (const f of result.applied) {
    console.log(`  ${GREEN}[OK]${NC}   ${f}`);
  }

  console.log('');
  if (dryRun) {
    console.log(`${YELLOW}DRY RUN terminé${NC} — ${result.applied.length} fichier(s) seraient écrits.`);
  } else {
    console.log(`${GREEN}✓${NC} Profil "${profile}" appliqué — ${result.applied.length} fichier(s).`);
  }
  return 0;
}
