// src/vault/docs/classify.js — document classification and organization

import { dirname, join } from 'node:path';;
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readJsonIfExists, extractConcepts } from '../core/utils.js';

function classifyMarkdownKind(filename, relPath, content) {
  const pathLower = relPath.toLowerCase();
  
  if (pathLower.includes('decision') || content.includes('## Décision')) return 'decision';
  if (pathLower.includes('roadmap') || pathLower.includes('plan') || pathLower.includes('milestone')) return 'roadmap';
  if (pathLower.includes('brief') || pathLower.includes('overview') || pathLower.includes('intro')) return 'brief';
  if (pathLower.includes('skill') || pathLower.includes('competence')) return 'skill';
  if (pathLower.includes('template') || pathLower.includes('modele')) return 'template';
  if (pathLower.includes('config') || pathLower.includes('configuration')) return 'config';
  if (pathLower.includes('handoff')) return 'handoff';
  if (pathLower.includes('log') || pathLower.includes('journal') || pathLower.includes('report')) return 'log';
  if (filename.toLowerCase() === 'readme.md') return 'readme';
  
  return 'unknown';
}

function calculateVaultRelevance(kind, pathLower) {
  if (pathLower.startsWith('vault/')) return 0.9;
  if (['config', 'skill'].includes(kind)) return 0.7;
  if (['decision', 'roadmap'].includes(kind)) return 0.5;
  if (['readme', 'log'].includes(kind)) return 0.3;
  return 0.1;
}

function suggestDestination(kind, pathLower, hasBmad) {
  if (hasBmad) return pathLower; // Protégé, ne pas déplacer
  if (pathLower.startsWith('vault/')) return pathLower;
  
  const suggestions = {
    decision: 'vault/decisions/',
    roadmap: 'vault/roadmap/',
    brief: 'vault/briefs/',
    skill: 'vault/skills/',
    template: 'vault/templates/',
    config: 'vault/configs/',
    handoff: 'vault/handoffs/',
    log: 'vault/logs/',
    readme: 'vault/library/readme/',
    unknown: 'vault/library/archive/',
  };
  
  return suggestions[kind] || 'vault/library/archive/';
}

function classifyDocs(cwd) {
  const vaultDir = join(cwd, 'vault');
  const catalogPath = join(vaultDir, 'library', 'catalog.json');
  if (!existsSync(catalogPath)) {
    return { ok: false, error: 'catalog.json absent — lancez : claude-atelier vault docs scan' };
  }

  let documents;
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf8'));
    documents = parsed.documents || parsed;
  } catch {
    return { ok: false, error: 'catalog.json illisible' };
  }

  const byKind = {};
  const protected_ = [];
  const unknown = [];
  const byVaultRelevance = documents.slice().sort((a, b) => b.vaultRelevance - a.vaultRelevance);

  for (const doc of documents) {
    if (!byKind[doc.kind]) byKind[doc.kind] = [];
    byKind[doc.kind].push(doc);
    if (doc.protected) protected_.push(doc);
    if (doc.kind === 'unknown') unknown.push(doc);
  }

  return {
    ok: true,
    byKind,
    protected: protected_,
    topByVaultRelevance: byVaultRelevance.slice(0, 10),
    unknown,
    totalCount: documents.length,
  };
}

function organizeDocs(cwd, apply = false, confirm = false) {
  const vaultDir = join(cwd, 'vault');
  const catalogPath = join(vaultDir, 'library', 'catalog.json');
  if (!existsSync(catalogPath)) {
    return { ok: false, error: 'catalog.json absent — lancez : claude-atelier vault docs scan' };
  }

  if (apply && !confirm) {
    return { ok: false, error: 'Drapeaux --apply ET --confirm requis pour modifier les fichiers' };
  }

  let documents;
  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf8'));
    documents = parsed.documents || parsed;
  } catch {
    return { ok: false, error: 'catalog.json illisible' };
  }

  const plan = [];
  const protected_ = [];
  const moved = [];
  const libraryDir = join(vaultDir, 'library');
  const migrationsPath = join(libraryDir, 'migrations.json');
  const eventsPath = join(libraryDir, 'events.jsonl');

  // Identifier les fichiers à déplacer
  for (const doc of documents) {
    if (doc.protected) {
      protected_.push(doc);
    } else if (doc.kind === 'unknown' && !doc.path.startsWith('vault/')) {
      const dest = suggestDestination(doc.kind, doc.path.toLowerCase(), false);
      plan.push({
        from: doc.path,
        to: dest + doc.filename,
        kind: doc.kind,
        reason: 'Document non classifié dans le vault',
      });
    }
  }

  // Sauvegarder le plan
  writeFileSync(migrationsPath, JSON.stringify({ plan, protected: protected_.length, timestamp: new Date().toISOString() }, null, 2) + '\n', 'utf8');

  if (!apply) {
    return {
      ok: true,
      simulation: true,
      migrationsPath,
      plan,
      protected: protected_,
      message: 'Plan de réorganisation (lecture seule)',
    };
  }

  // Appliquer le plan
  for (const migration of plan) {
    try {
      const srcPath = join(cwd, migration.from);
      const destPath = join(cwd, migration.to);
      mkdirSync(dirname(destPath), { recursive: true });
      renameSync(srcPath, destPath);
      moved.push(migration);
      appendFileSync(eventsPath, JSON.stringify({ type: 'moved', from: migration.from, to: migration.to, timestamp: new Date().toISOString() }) + '\n', 'utf8');
    } catch (e) {
      // Ignorer les erreurs de déplacement
    }
  }

  return {
    ok: true,
    simulation: false,
    migrationsPath,
    moved,
    protected: protected_,
    eventsPath,
  };
}

export { classifyMarkdownKind, calculateVaultRelevance, suggestDestination, classifyDocs, organizeDocs };
