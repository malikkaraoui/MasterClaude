// src/vault/graph/path.js — path finding in graph

function findNodeByIdOrLabel(nodes, searchTerm) {
  const normalized = (searchTerm || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Cherche d'abord une correspondance exacte sur l'id
  for (const node of nodes) {
    if (node.id.toLowerCase() === searchTerm.toLowerCase()) return node;
  }
  // Puis une correspondance partielle sur label ou id
  for (const node of nodes) {
    const label = (node.label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const id = node.id.toLowerCase();
    if (label.includes(normalized) || id.includes(normalized)) return node;
  }
  return null;
}

function bfsPath(nodes, edges, startId, endId) {
  if (startId === endId) return { path: [startId], edges: [] };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edgesByFrom = {};
  const edgesByTo = {};

  for (const edge of edges) {
    if (!edgesByFrom[edge.from]) edgesByFrom[edge.from] = [];
    if (!edgesByTo[edge.to]) edgesByTo[edge.to] = [];
    edgesByFrom[edge.from].push(edge);
    edgesByTo[edge.to].push(edge);
  }

  const visited = new Set();
  const queue = [{ id: startId, path: [startId], edgesUsed: [] }];
  visited.add(startId);

  while (queue.length > 0) {
    const { id, path, edgesUsed } = queue.shift();

    // Explore edges partant de ce nœud
    if (edgesByFrom[id]) {
      for (const edge of edgesByFrom[id]) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          const newPath = [...path, edge.to];
          const newEdges = [...edgesUsed, edge];

          if (edge.to === endId) {
            return { path: newPath, edges: newEdges };
          }
          queue.push({ id: edge.to, path: newPath, edgesUsed: newEdges });
        }
      }
    }

    // Explore edges pointant vers ce nœud (graphe non orienté)
    if (edgesByTo[id]) {
      for (const edge of edgesByTo[id]) {
        if (!visited.has(edge.from)) {
          visited.add(edge.from);
          const newPath = [edge.from, ...path];
          const newEdges = [...edgesUsed, { ...edge, reversed: true }];

          if (edge.from === endId) {
            return { path: newPath, edges: newEdges };
          }
          queue.push({ id: edge.from, path: newPath, edgesUsed: newEdges });
        }
      }
    }
  }

  return null;
}

export { findNodeByIdOrLabel, bfsPath };
