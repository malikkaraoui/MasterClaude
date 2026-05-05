#!/usr/bin/env node
/**
 * test/lint-npm-files.js — Vérifie que toutes les dirs référencées par les scripts
 * bin/*.js via PKG_ROOT sont déclarées dans le tableau `files` de package.json.
 *
 * Leçon : `.claude/` manquait dans `files` → `claude-atelier update` crashait
 * pour tous les utilisateurs (templateDir not found). Ce test détecte la régression.
 *
 * Exit 0 = OK, Exit 1 = répertoires manquants dans files[].
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 1. Charger package.json ───────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const filesArray = pkg.files || [];

// Normalise : retire trailing slash → ["bin", "src", ".claude", ...]
const declaredRoots = filesArray.map((f) => f.replace(/\/$/, ''));

// ── 2. Répertoires requis par les commandes CLI publiées ──────────────────────
// Pour chaque commande, on liste les répertoires PKG_ROOT-relative qu'elle ouvre.
// Si un répertoire manque dans `files`, la commande sera cassée chez l'utilisateur.
const REQUIRED = [
  { dir: '.claude',   command: 'update',  reason: 'templateDir pour update.js' },
  { dir: 'src',       command: 'init',    reason: 'langDir, stacks, skills, templates' },
  { dir: 'scripts',   command: 'init',    reason: 'scripts/ copiés lors du init' },
  { dir: 'bin',       command: 'all',     reason: 'scripts CLI eux-mêmes' },
];

// ── 3. Checks ─────────────────────────────────────────────────────────────────
const errors = [];

for (const { dir, command, reason } of REQUIRED) {
  // (a) Le répertoire existe-t-il physiquement ?
  const abs = join(ROOT, dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    errors.push(`[missing-dir] ${dir}/ n'existe pas sur le filesystem (commande: ${command})`);
    continue;
  }

  // (b) Est-il couvert par le tableau files[] ?
  // Couvert si : dir listé entier, dir sous un root listé, ou ≥1 fichier explicite dans dir
  const covered = declaredRoots.some(
    (root) => root === dir || dir.startsWith(root + '/') || root.startsWith(dir + '/')
  );
  if (!covered) {
    errors.push(
      `[npm-files] ${dir}/ absent de package.json#files → commande "${command}" cassée chez les users (${reason})`
    );
  }
}

// ── 4. Résultat ───────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error('lint-npm-files : ÉCHEC');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`lint-npm-files OK — ${REQUIRED.length} répertoires CLI vérifiés dans package.json#files`);
