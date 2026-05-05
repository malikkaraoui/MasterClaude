// src/vault/docs/scan.js — document scanning and cataloging

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';;
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';;
import { readJsonIfExists } from '../core/utils.js';
import { classifyMarkdownKind, calculateVaultRelevance, suggestDestination } from './classify.js';

const BMAD_MARKERS = ['.bmad', '.bmad-method', 'bmad-core'];

function readFirstHeading(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const line = content.split('\n').find(l => l.startsWith('# '));
    return line ? line.replace(/^#\s+/, '') : '';
  } catch {
    return '';
  }
}

function isBmadPath(relPath) {
  return BMAD_MARKERS.some(m => relPath.includes(m));
}

function readExcerpt(filePath, maxLen = 120) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'));
    const text = lines.slice(0, 3).join(' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  } catch {
    return '';
  }
}

function getFileMtime(filePath) {
  try { return statSync(filePath).mtime.toISOString(); } catch { return ''; }
}

function extractH1(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function extractBmadSignals(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const signals = [];
    if (content.includes('.bmad')) signals.push('.bmad');
    if (content.includes('.bmad-method')) signals.push('.bmad-method');
    if (content.includes('bmad-core')) signals.push('bmad-core');
    return signals;
  } catch {
    return [];
  }
}

function scanDocs(cwd) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }

  const documents = [];
  const libraryDir = join(vaultDir, 'library');
  mkdirSync(libraryDir, { recursive: true });

  const findMarkdownFiles = (dir, basePath = '') => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const relPath = join(basePath, entry.name).replace(/\\/g, '/');

      if (['node_modules', '.git', '.venv', 'dist', 'build', '.next'].includes(entry.name)) continue;
      if (relPath.includes('.claude/worktrees/')) continue;

      if (entry.isDirectory()) {
        findMarkdownFiles(fullPath, relPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          const stat = statSync(fullPath);
          const hash = createHash('sha256').update(content).digest('hex');
          const title = extractH1(fullPath) || entry.name.replace(/\.md$/, '');
          const kind = classifyMarkdownKind(entry.name, relPath, content);
          const bmadSignals = extractBmadSignals(fullPath);
          const vaultRelevance = calculateVaultRelevance(kind, relPath.toLowerCase());
          const suggested = suggestDestination(kind, relPath.toLowerCase(), bmadSignals.length > 0);

          documents.push({
            path: relPath,
            filename: entry.name,
            title,
            sha256: hash,
            mtime: stat.mtime.toISOString(),
            size: stat.size,
            kind,
            confidence: 0.85,
            status: 'active',
            vaultRelevance,
            reason: `Classification ${kind} basée sur structure fichier et contenu`,
            suggestedDestination: suggested,
            protected: bmadSignals.length > 0,
            bmadSignals,
            graphNodeId: `markdown_document:${relPath}`,
          });
        } catch (e) {
          // Ignore les fichiers illisibles
        }
      }
    }
  };

  findMarkdownFiles(cwd);

  const catalogPath = join(libraryDir, 'catalog.json');
  writeFileSync(catalogPath, JSON.stringify({ documents }, null, 2) + '\n', 'utf8');

  return {
    ok: true,
    catalogPath,
    fileCount: documents.length,
    byKind: documents.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {}),
    protected: documents.filter(e => e.protected).length,
  };
}

export { readFirstHeading, isBmadPath, readExcerpt, getFileMtime, extractH1, extractBmadSignals, scanDocs };
