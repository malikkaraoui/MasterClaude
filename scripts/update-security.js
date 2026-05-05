#!/usr/bin/env node
// scripts/update-security.js — Sync SECURITY.md supported versions from package.json
// Usage: node scripts/update-security.js

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const [major, minor] = pkg.version.split('.');
const current = `${major}.${minor}.x`;
const previous = minor === '0'
  ? `< ${major}.0`
  : `< ${major}.${minor}`;

const table = `| Version  | Supported          |
| -------- | ------------------ |
| ${current.padEnd(8)} | :white_check_mark: |
| ${previous.padEnd(8)} | :x:                |`;

const securityPath = resolve(root, 'SECURITY.md');
const content = readFileSync(securityPath, 'utf8');

const updated = content.replace(
  /<!-- AUTO-GENERATED[^]*?<!-- END AUTO-GENERATED -->/,
  `<!-- AUTO-GENERATED — do not edit manually. Run: node scripts/update-security.js -->\n${table}\n<!-- END AUTO-GENERATED -->`
);

if (updated === content) {
  console.log('SECURITY.md already up to date');
} else {
  writeFileSync(securityPath, updated);
  console.log(`SECURITY.md updated → ${current} supported`);
}
