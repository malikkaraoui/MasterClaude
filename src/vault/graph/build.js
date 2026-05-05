// src/vault/graph/build.js — graph construction from vault

import { join, dirname } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadManifest } from '../core/manifest.js';
import {
  getStateLine, slugify, extractConcepts, buildIgnoreMatcher, parseIgnoreFile,
  computeFileSHA256, DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_PATTERNS,
  extractBulletItems, extractSubsectionItems, extractMailboxPending, extractDecisions,
} from '../core/utils.js';
import { readFirstHeading, readExcerpt, getFileMtime, extractBmadSignals } from '../docs/scan.js';
import { computeCommunities } from './explain.js';

const BMAD_MARKERS = ['.bmad', '.bmad-method', 'bmad-core'];

function buildGraph(cwd, opts = {}) {
  const vaultDir = join(cwd, 'vault');
  const manifestPath = join(vaultDir, 'index', 'manifest.json');
  const manifest = loadManifest(manifestPath);
  const now = new Date().toISOString();

  const nodes = new Map();
  const edges = [];
  const byType = {};

  function addNode(n) {
    if (!nodes.has(n.id)) {
      nodes.set(n.id, n);
      byType[n.type] = (byType[n.type] || 0) + 1;
    }
  }

  function addEdge(e) { edges.push(e); }

  // Nœud projet racine
  const briefPath = join(vaultDir, '00-brief.md');
  const briefContent = existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : '';
  const projectName = getStateLine(briefContent, 'Projet') || 'projet';
  addNode({
    id: 'project:root', type: 'project', label: projectName, path: '',
    tags: ['project'], excerpt: getStateLine(briefContent, 'Phase') || '',
    mtime: now, sha256: '', confidence: 'INFERRED',
  });

  // Fichiers vault connus
  const KNOWN_VAULT_FILES = [
    '00-brief.md', '10-mailbox.md', '20-decisions.md',
    '30-discoveries.md', '40-roadmap.md', '90-sources.md', 'PETER_REPORT.md',
  ];
  for (const name of KNOWN_VAULT_FILES) {
    const fp = join(vaultDir, name);
    if (!existsSync(fp)) continue;
    const relPath = `vault/${name}`;
    addNode({
      id: `vault_file:${relPath}`, type: 'vault_file',
      label: readFirstHeading(fp) || name, path: relPath,
      tags: ['vault'], excerpt: readExcerpt(fp),
      mtime: getFileMtime(fp), sha256: '', confidence: 'EXTRACTED',
    });
    addEdge({ from: 'project:root', to: `vault_file:${relPath}`, type: 'document' });
  }

  // Décisions depuis 20-decisions.md
  const decisionsPath = join(vaultDir, '20-decisions.md');
  if (existsSync(decisionsPath)) {
    const decisionsContent = readFileSync(decisionsPath, 'utf8');
    const decisions = extractDecisions(decisionsContent);
    for (const d of decisions) {
      const decisionId = `decision:${slugify(d.title)}`;
      addNode({
        id: decisionId, type: 'decision', label: d.title, path: 'vault/20-decisions.md',
        tags: ['decision'], excerpt: d.decision || '',
        mtime: now, sha256: '', confidence: 'EXTRACTED',
      });
      addEdge({ from: 'vault_file:vault/20-decisions.md', to: decisionId, type: 'contains' });
    }
  }

  // Roadmap items depuis 40-roadmap.md
  const roadmapPath = join(vaultDir, '40-roadmap.md');
  if (existsSync(roadmapPath)) {
    const roadmapContent = readFileSync(roadmapPath, 'utf8');
    const feuItems = extractSubsectionItems(roadmapContent, 'Roadmap vivante', 'Sur le feu');
    for (let i = 0; i < feuItems.length; i++) {
      const itemId = `roadmap_item:feu_${i}`;
      addNode({
        id: itemId, type: 'roadmap_item', label: feuItems[i], path: 'vault/40-roadmap.md',
        tags: ['roadmap', 'sur_le_feu'], excerpt: feuItems[i],
        mtime: now, sha256: '', confidence: 'EXTRACTED',
      });
      addEdge({ from: 'vault_file:vault/40-roadmap.md', to: itemId, type: 'contains' });
    }
  }

  // BMAD artifacts depuis manifest.files
  if (manifest && Array.isArray(manifest.files)) {
    for (const f of manifest.files) {
      if (!BMAD_MARKERS.some(m => f.path.includes(m))) continue;
      const bmadId = `protected_artifact:${slugify(f.path)}`;
      addNode({
        id: bmadId, type: 'protected_artifact', label: f.path, path: f.path,
        tags: ['protected'], excerpt: 'Protected Business-Model-Analysis Document',
        mtime: f.mtime || now, sha256: f.sha256 || '', confidence: 'PROTECTED',
      });
      addEdge({ from: bmadId, to: 'project:root', type: 'protected_by_method' });
    }
  }

  // Fallback BMAD depuis brief textuel
  const bmadSignals = extractBmadSignals(briefPath);
  for (const signal of bmadSignals) {
    const bmadId = `protected_artifact:${slugify(signal)}`;
    if (!nodes.has(bmadId)) {
      addNode({
        id: bmadId, type: 'protected_artifact', label: signal, path: 'vault/BMAD',
        tags: ['protected'], excerpt: 'Protected Business-Model-Analysis Document',
        mtime: now, sha256: '', confidence: 'PROTECTED',
      });
    }
  }

  // Nœuds concepts depuis manifest
  if (manifest && manifest.concepts && Array.isArray(manifest.concepts)) {
    for (const concept of manifest.concepts) {
      addNode({
        id: `concept:${concept.name}`, type: 'concept',
        label: concept.name, path: '',
        tags: ['concept'], excerpt: concept.description || '',
        mtime: now, sha256: '', confidence: 'MANIFEST',
        frequency: concept.frequency || 0,
      });
    }
  }

  // Nœuds centraux par degré (calculé avant community — ne dépend pas des communautés)
  const degree = {};
  for (const e of edges) {
    degree[e.from] = (degree[e.from] || 0) + 1;
    degree[e.to] = (degree[e.to] || 0) + 1;
  }
  const centralNodes = Array.from(nodes.keys()).sort((a, b) => (degree[b] || 0) - (degree[a] || 0)).slice(0, 8);

  // doc_category nodes + classified_as edges depuis catalog
  const catalogPath = join(vaultDir, 'library', 'catalog.json');
  if (existsSync(catalogPath)) {
    let catalog;
    try { catalog = JSON.parse(readFileSync(catalogPath, 'utf8')); } catch { catalog = null; }
    if (catalog && Array.isArray(catalog.documents)) {
      for (const doc of catalog.documents) {
        const catId = `doc_category:${doc.kind}`;
        addNode({ id: catId, type: 'doc_category', label: doc.kind, path: '', tags: ['doc_category'], excerpt: '', mtime: now, sha256: '', confidence: 'EXTRACTED' });
        const docId = doc.graphNodeId || `markdown_document:${doc.path}`;
        if (!nodes.has(docId)) {
          addNode({ id: docId, type: 'markdown_document', label: doc.title || doc.path, path: doc.path, tags: ['document'], excerpt: '', mtime: now, sha256: '', confidence: 'CATALOG' });
        }
        addEdge({ from: docId, to: catId, type: 'classified_as', confidence: 'EXTRACTED' });
      }
    }
  }

  // Nodes risk (⚠️) et question (? / Question:) depuis vault files
  const vaultMdFiles = ['20-decisions.md', '30-discoveries.md', '40-roadmap.md'];
  for (const name of vaultMdFiles) {
    const fp = join(vaultDir, name);
    if (!existsSync(fp)) continue;
    const content = readFileSync(fp, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.replace(/^[-*]\s+/, '').trim();
      if (trimmed.startsWith('⚠️') || trimmed.startsWith('⚠ ')) {
        const label = trimmed.replace(/^⚠️\s*|^⚠\s*/, '').trim();
        if (label) addNode({ id: `risk:${slugify(label)}`, type: 'risk', label, path: `vault/${name}`, tags: ['risk'], excerpt: label, mtime: now, sha256: '', confidence: 'EXTRACTED' });
      } else if (trimmed.startsWith('? ') || trimmed.startsWith('Question:')) {
        const label = trimmed.replace(/^\?\s+|^Question:\s*/i, '').trim();
        if (label) addNode({ id: `question:${slugify(label)}`, type: 'question', label, path: `vault/${name}`, tags: ['question'], excerpt: label, mtime: now, sha256: '', confidence: 'EXTRACTED' });
      }
    }
  }

  // Communautés calculées après tous les nœuds pour couvrir risk/question/doc_category
  const { nodeIdToCommunityId, byId: commById, count: commCount } = computeCommunities(Array.from(nodes.values()), edges);
  for (const node of nodes.values()) {
    node.community = nodeIdToCommunityId.get(node.id) ?? 0;
  }

  const byKind = byType;

  return {
    version: 1,
    generatedAt: now,
    nodes: Array.from(nodes.values()),
    edges,
    stats: {
      byType,
      byKind,
      centralNodes,
      nodeCount: nodes.size,
      edgeCount: edges.length,
      symbolCount: opts.symbolCount ?? 0,
      communities: { count: commCount, byId: commById },
    },
  };
}

function graphVault(cwd, symbolCount = 0) {
  const vaultDir = join(cwd, 'vault');
  if (!existsSync(vaultDir)) {
    return { ok: false, error: 'Aucun vault projet. Lancez : claude-atelier vault init' };
  }
  const graph = buildGraph(cwd, { symbolCount });
  const graphPath = join(vaultDir, 'index', 'graph.json');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  return {
    ok: true,
    graphPath,
    nodeCount: graph.stats.nodeCount,
    edgeCount: graph.stats.edgeCount,
    symbolCount: graph.stats.symbolCount,
    centralNodes: graph.stats.centralNodes.slice(0, 5).map(id => id.split(':').pop()),
  };
}

export { buildGraph, graphVault };
