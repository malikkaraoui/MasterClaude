#!/usr/bin/env node
// Vérifie que le repo source garde `.claude/skills/` synchronisé avec `src/skills/`

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const srcRoot = join(ROOT, 'src', 'skills');
const runtimeRoot = join(ROOT, '.claude', 'skills');

function listFiles(rootDir) {
  const out = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const abs = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        out.push(relative(rootDir, abs));
      }
    }
  }

  walk(rootDir);
  return out.sort();
}

if (!existsSync(srcRoot)) {
  console.error('skills source absents : src/skills/ introuvable');
  process.exit(1);
}

if (!existsSync(runtimeRoot)) {
  console.error('runtime skills absents : .claude/skills/ introuvable');
  process.exit(1);
}

const srcFiles = listFiles(srcRoot);
const runtimeFiles = listFiles(runtimeRoot);
const errors = [];

for (const rel of srcFiles) {
  if (!runtimeFiles.includes(rel)) {
    errors.push(`manque dans .claude/skills : ${rel}`);
  }
}

for (const rel of runtimeFiles) {
  if (!srcFiles.includes(rel)) {
    errors.push(`fichier en trop dans .claude/skills : ${rel}`);
  }
}

for (const rel of srcFiles) {
  if (!runtimeFiles.includes(rel)) continue;
  const srcAbs = join(srcRoot, rel);
  const runtimeAbs = join(runtimeRoot, rel);
  if (statSync(srcAbs).size !== statSync(runtimeAbs).size) {
    errors.push(`contenu différent : ${rel}`);
    continue;
  }
  const srcContent = readFileSync(srcAbs, 'utf8');
  const runtimeContent = readFileSync(runtimeAbs, 'utf8');
  if (srcContent !== runtimeContent) {
    errors.push(`contenu différent : ${rel}`);
  }
}

if (errors.length > 0) {
  console.error('runtime skills désynchronisés :');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`runtime skills sync OK (${srcFiles.length} fichiers comparés).`);
