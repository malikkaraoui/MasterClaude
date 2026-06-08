#!/usr/bin/env node
/**
 * scripts/autonomous-check.js — Boucle autonome nocturne
 * Analyse : git log 24h + vault discoveries + roadmap
 * Écrit des propositions dans vault/10-mailbox.md
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAILBOX = join(ROOT, 'vault', '10-mailbox.md');
const DISCOVERIES = join(ROOT, 'vault', '30-discoveries.md');
const ROADMAP = join(ROOT, 'vault', '40-roadmap.md');
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT_PATH || join(process.env.HOME ?? '', 'Vault', 'Malik');

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

function gitLog24h() {
  const r = spawnSync('git', ['log', '--oneline', '--since=24 hours ago', '--no-merges'], {
    cwd: ROOT, encoding: 'utf8',
  });
  return r.stdout?.trim() ?? '';
}

function readFile(path) {
  if (!existsSync(path)) return '';
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function extractSurLeFeu(roadmap) {
  const m = roadmap.match(/## Sur le feu([\s\S]*?)(?=\n## |\n---)/);
  if (!m) return [];
  return m[1].split('\n').filter(l => l.includes('**') && !l.includes('✅'));
}

function buildEntry(date, summary, actions) {
  return [
    `### ${date} — Analyse autonome [auto]`,
    '',
    '- Source : autonomous-check',
    '- Statut : nouveau',
    `- Résumé : ${summary}`,
    '- Pourquoi ici : réveil autonome — aucune instruction en cours',
    '- Action proposée :',
    ...actions.map(a => `  - ${a}`),
    '',
  ].join('\n');
}

// Retourne les fichiers .md modifiés dans les dernières `hours` heures
function obsidianRecentFiles(hours = 25) {
  if (!existsSync(OBSIDIAN_VAULT)) return [];
  const cutoff = Date.now() - hours * 3600 * 1000;
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!e.name.endsWith('.md')) continue;
      try {
        const mtime = statSync(full).mtimeMs;
        if (mtime >= cutoff) results.push({ path: full, name: e.name.replace('.md', '') });
      } catch { /* ignore */ }
    }
  }
  walk(OBSIDIAN_VAULT);
  return results;
}

function snippetObsidian(filePath, maxChars = 300) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.replace(/^---[\s\S]*?---\n/, '').slice(0, maxChars).replace(/\n+/g, ' ').trim();
  } catch { return ''; }
}

function analyze() {
  const commits = gitLog24h();
  const roadmap = readFile(ROADMAP);
  const discoveries = readFile(DISCOVERIES);
  const entries = [];
  const date = now();

  // Activité git
  if (commits) {
    const count = commits.split('\n').length;
    const hasFix = commits.includes('fix');
    entries.push(buildEntry(date, `${count} commit(s) en 24h`, [
      'Lancer /handoff-debt pour vérifier la dette §25',
      hasFix ? 'Fix récent → vérifier test de non-régression' : 'Continuer la feature en cours',
    ]));
  } else {
    entries.push(buildEntry(date, 'Aucun commit en 24h — idle', [
      'Lire vault/40-roadmap.md → choisir prochaine tâche "Sur le feu"',
      'Proposer une amélioration pulse ou session-manager',
    ]));
  }

  // Tâches roadmap en cours
  const pending = extractSurLeFeu(roadmap);
  if (pending.length > 0) {
    entries.push(buildEntry(date, `${pending.length} tâche(s) en cours (roadmap)`, [
      ...pending.slice(0, 3).map(p => `Continuer : ${p.replace(/- \*\*|\*\*/g, '').split('—')[0].trim()}`),
    ]));
  }

  // Discoveries récentes
  const discLines = discoveries.split('\n').filter(l => l.trim().length > 20);
  if (discLines.length > 0) {
    entries.push(buildEntry(date, 'Découvertes en vault — consolidation possible', [
      'Identifier les patterns répétitifs dans vault/30-discoveries.md',
      'Extraire une décision dans vault/20-decisions.md si pertinent',
    ]));
  }

  // Vault Obsidian — notes récentes (mis à jour chaque jour ~21h)
  const obsFiles = obsidianRecentFiles(25);
  if (obsFiles.length > 0) {
    for (const f of obsFiles.slice(0, 3)) {
      const snippet = snippetObsidian(f.path);
      if (!snippet) continue;
      entries.push(buildEntry(date, `Vault Obsidian — note récente : "${f.name}"`, [
        `Lire et analyser : ${f.path}`,
        `Extrait : ${snippet.slice(0, 120)}…`,
        'Identifier si actionnable pour MasterClaude ou business → proposer dans mailbox',
      ]));
    }
  }

  return entries;
}

function appendToMailbox(entries) {
  const mailbox = readFile(MAILBOX);
  const marker = '## Courrier entrant';
  const idx = mailbox.indexOf(marker);
  const block = entries.join('\n');

  let updated;
  if (idx === -1) {
    updated = mailbox + '\n' + block;
  } else {
    const nlIdx = mailbox.indexOf('\n', idx);
    const insertAt = nlIdx === -1 ? idx + marker.length : nlIdx + 1;
    updated = mailbox.slice(0, insertAt) + '\n' + block + mailbox.slice(insertAt);
  }
  writeFileSync(MAILBOX, updated, 'utf8');
  console.log(`[AUTO-CHECK] ${entries.length} entrée(s) → vault/10-mailbox.md`);
}

const entries = analyze();
if (entries.length > 0) appendToMailbox(entries);
else console.log('[AUTO-CHECK] rien à écrire');
