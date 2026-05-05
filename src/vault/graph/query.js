// src/vault/graph/query.js — graph querying and scoring

function scoreNode(node, tokens) {
  const haystack = [node.id, node.label || '', ...(node.tags || []), node.excerpt || '']
    .join(' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  let score = 0;
  for (const token of tokens) {
    const count = haystack.split(token).length - 1;
    if (count > 0) score += count;
  }
  return score;
}

function queryGraph(graph, queryText, limit = 10) {
  const tokens = (queryText || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(t => t.length >= 2);

  if (!tokens.length) return { ok: true, results: [], neighbors: [] };

  const scored = (graph.nodes || [])
    .map(n => ({ node: n, score: scoreNode(n, tokens) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const resultIds = new Set(scored.map(r => r.node.id));
  const neighborIds = new Set();
  for (const edge of (graph.edges || [])) {
    if (resultIds.has(edge.from) && !resultIds.has(edge.to)) neighborIds.add(edge.to);
    if (resultIds.has(edge.to) && !resultIds.has(edge.from)) neighborIds.add(edge.from);
  }

  return {
    ok: true,
    results: scored.map(r => ({
      id: r.node.id, type: r.node.type, label: r.node.label,
      score: r.score, path: r.node.path || '',
    })),
    neighbors: [...neighborIds].slice(0, 10).map(id => id.split(':').pop()),
  };
}

export { scoreNode, queryGraph };
