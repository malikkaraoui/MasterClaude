#!/usr/bin/env node
/**
 * claude-atelier — CLI entry point
 *
 * P1 scope: version + help only. All real commands (init, update, doctor, lint)
 * are stubbed and will be implemented in P4.
 *
 * Usage:
 *   claude-atelier --version
 *   claude-atelier --help
 *   claude-atelier <command> [options]
 */

import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

// ⚠️  BLOC GÉNÉRÉ — ne pas éditer manuellement.
// Source : src/features.json → scripts/gen-help.js → npm version (preversion)
const HELP = `
claude-atelier v0.26.0
Framework complet Claude Code: 31 agents, 18 skills, MCP GitHub intégré, vault Peter (graphe + query + MCP), bridge Telegram bidirectionnel (voix + alertes FIFO temps réel), loop Copilot autonome, mémoire persistante, review gate avant push. Production-ready.

Usage:
  claude-atelier <command> [options]

Commands:
  init              Installe la config dans ./.claude/ (ou ~/.claude/ avec --global)
  update            Met à jour la config en préservant §0 et les customisations projet
  doctor            Vérifie l'intégrité de l'installation
  lint              Valide les références markdown et la longueur du core CLAUDE.md
  features          Tableau de contrôle des features (on/off par feature)
  review-local      Review automatique d'un handoff via Ollama local (anti-bypass auto-review Claude)
  pulse             Gestion du pouls multi-agents (statut, init, mise à jour)
  vault             Initialise et inspecte le vault dynamique projet maintenu par Peter
  apply             Injecte un profil de config dans un worktree cible (API Paperclip)

Options:
  --version, -v       Affiche la version et quitte
  --help, -h          Affiche l'aide et quitte
  --global            Cible la config globale (~/.claude/) au lieu du projet
  --lang <fr|en>      Langue (défaut : fr)

Highlights:
  • Runtime bilingue FR/EN avec règles de code et orchestration
  • Gates de sécurité : secrets, lint, tests, pre-push
  • Routing automatique Haiku/Sonnet/Opus selon la tâche
  • Skills slash commands (/handoff, /angle-mort, /token-routing…)
  • Hooks : horodatage, métriques, garde-fous commits
  • Système de présence multi-agents (pouls.md) avec Maestro §0 watcher
  • Bridge Telegram bidirectionnel : commandes mobile + alertes FIFO temps réel (O_NONBLOCK)

Repo: https://github.com/malikkaraoui/claude-atelier#readme
`;

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, [join(__dirname, '..', relativePath)], {
    stdio: 'inherit'
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }

  return 1;
}

function runLint() {
  const scripts = ['test/lint-refs.js', 'test/lint-length.js'];

  for (const script of scripts) {
    const exitCode = runNodeScript(script);

    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

async function main(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const command = args[0];
  const knownCommands = ['init', 'update', 'doctor', 'lint', 'features', 'review-local', 'apply', 'pulse', 'vault'];

  if (!knownCommands.includes(command)) {
    process.stderr.write(`error: unknown command "${command}"\n`);
    process.stderr.write(`run "claude-atelier --help" for usage\n`);
    return 1;
  }

  if (command === 'lint') {
    return runLint();
  }

  if (command === 'doctor') {
    return runNodeScript('test/doctor.js');
  }

  if (command === 'init') {
    const { runInit } = await import('./init.js');
    return runInit(process.argv);
  }

  if (command === 'update') {
    const { runUpdate } = await import('./update.js');
    return runUpdate(process.argv);
  }

  if (command === 'features') {
    const { runFeatures } = await import('./features.js');
    return runFeatures(process.argv);
  }

  if (command === 'review-local') {
    const { runReviewLocal } = await import('./review-local.js');
    return runReviewLocal(process.argv);
  }

  if (command === 'apply') {
    const { runApply } = await import('./apply.js');
    return runApply(process.argv);
  }

  if (command === 'pulse') {
    const { runPulse } = await import('./pulse.js');
    return runPulse(process.argv);
  }

  if (command === 'vault') {
    const { runVault } = await import('./vault.js');
    return runVault(process.argv);
  }

  process.stderr.write(
    `error: command "${command}" is not yet implemented\n`
  );
  return 2;
}

function checkForUpdate() {
  try {
    const latest = execSync('npm view claude-atelier version 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
    if (latest && latest !== pkg.version) {
      process.stderr.write(`\n\x1b[33m[UPDATE]\x1b[0m claude-atelier ${pkg.version} → \x1b[32m${latest}\x1b[0m disponible\n`);
      process.stderr.write(`  \x1b[36mnpm update claude-atelier\x1b[0m ou \x1b[36mnpx claude-atelier@latest init\x1b[0m\n\n`);
    }
  } catch (_) {}
}

main(process.argv).then(code => {
  checkForUpdate();
  process.exit(code);
});
