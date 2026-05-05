// src/vault/graph/explain.js — graph node explanation and community detection

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { findNodeByIdOrLabel } from './path.js';

function explainVaultNode(cwd, nodeId) {
  const graphPath = join(cwd, 'vault', 'index', 'graph.json');
  if (!existsSync(graphPath)) {
    return { ok: false, error: 'graph.json absent — lancez : claude-atelier vault graph' };
  }
  let graph;
  try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); }
  catch { return { ok: false, error: 'graph.json illisible — relancez vault graph' }; }

  const node = findNodeByIdOrLabel(graph.nodes, nodeId);
  if (!node) {
    return { ok: false, error: `Nœud introuvable: "${nodeId}"` };
  }

  // Collecter les voisins entrants et sortants
  const neighbors = { in: [], out: [] };
  for (const edge of graph.edges) {
    if (edge.to === node.id) {
      const neighbor = graph.nodes.find(n => n.id === edge.from);
      if (neighbor) {
        neighbors.in.push({ node: neighbor, edgeType: edge.type, confidence: edge.confidence });
      }
    } else if (edge.from === node.id) {
      const neighbor = graph.nodes.find(n => n.id === edge.to);
      if (neighbor) {
        neighbors.out.push({ node: neighbor, edgeType: edge.type, confidence: edge.confidence });
      }
    }
  }

  // Générer une explication textuelle simple
  const parts = [];
  parts.push(`Ce nœud est un ${node.type}.`);

  if (node.label) {
    parts.push(`Son label est "${node.label}".`);
  }

  const allNeighbors = [...neighbors.out, ...neighbors.in];
  if (allNeighbors.length > 0) {
    const keyNeighbors = allNeighbors.slice(0, 2).map(n => n.node.label).join(', ');
    parts.push(`Il est lié à: ${keyNeighbors}.`);
  }

  const explanation = parts.join(' ');

  return {
    ok: true,
    node: {
      id: node.id,
      type: node.type,
      label: node.label,
      excerpt: node.excerpt || '',
      path: node.path || '',
      tags: node.tags || [],
      mtime: node.mtime || '',
      confidence: node.confidence || '',
    },
    neighbors: {
      incoming: neighbors.in.map(n => ({ edgeType: n.edgeType, node: n.node.label, confidence: n.confidence })),
      outgoing: neighbors.out.map(n => ({ edgeType: n.edgeType, node: n.node.label, confidence: n.confidence })),
    },
    explanation,
  };
}

function computeCommunities(nodes, edges) {
  const adjacency = new Map();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }

  const communities = new Map();
  const visited = new Set();
  let communityId = 0;

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;

    // BFS pour trouver la composante connexe
    const queue = [nodeId];
    const community = [];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      community.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    communities.set(communityId, community);
    communityId++;
  }

  // Retourner { nodeIdToCommunityId, byId }
  const nodeIdToCommunityId = new Map();
  const byId = {};
  for (const [cid, members] of communities) {
    byId[cid] = members;
    for (const nid of members) {
      nodeIdToCommunityId.set(nid, cid);
    }
  }

  return { nodeIdToCommunityId, byId, count: communities.size };
}

export { explainVaultNode, computeCommunities };
