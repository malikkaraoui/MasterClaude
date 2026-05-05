#!/usr/bin/env node
/**
 * gen-help.js — Generate HELP string in bin/cli.js from src/features.json
 *
 * Reads src/features.json and package.json, generates a formatted HELP string,
 * and replaces the HELP block in bin/cli.js between the markers:
 *   const HELP = `
 *   ...
 *   `;
 *
 * Usage: node scripts/gen-help.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Read source files
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const features = JSON.parse(readFileSync(join(rootDir, 'src/features.json'), 'utf8'));

// Build commands section
const cmdLines = features.commands.map(cmd => {
  const name = cmd.name.padEnd(18);
  return `  ${name}${cmd.description}`;
});

// Build options section
const optLines = features.options.map(opt => {
  const flag = opt.flag.padEnd(20);
  return `  ${flag}${opt.description}`;
});

// Build highlights section
const highlightLines = features.highlights.map(h => `  • ${h}`);

// Generate HELP string
const helpContent = `
claude-atelier v${pkg.version}
${pkg.description}

Usage:
  claude-atelier <command> [options]

Commands:
${cmdLines.join('\n')}

Options:
${optLines.join('\n')}

Highlights:
${highlightLines.join('\n')}

Repo: ${pkg.homepage}
`;

// Read bin/cli.js
const cliPath = join(rootDir, 'bin/cli.js');
let cliContent = readFileSync(cliPath, 'utf8');

// Replace HELP block
// Match: const HELP = `...`;
const helpPattern = /const HELP = `[\s\S]*?`;/;
const newHelpBlock = `const HELP = \`${helpContent}\`;`;

if (!helpPattern.test(cliContent)) {
  process.stderr.write('error: could not find HELP block in bin/cli.js\n');
  process.exit(1);
}

cliContent = cliContent.replace(helpPattern, newHelpBlock);

// Write back
writeFileSync(cliPath, cliContent, 'utf8');

// Report success
process.stdout.write(
  `[gen-help] HELP régénéré (v${pkg.version}, ${features.commands.length} commandes)\n`
);
