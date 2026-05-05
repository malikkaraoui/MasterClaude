// src/vault/graph/export.js — graph export formats

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';;

function sanitizeFilename(label) {
  return label.replace(/[:\/?*"<>|]/g, '_');
}

function getNodeColor(type) {
  const colors = {
    project: '#4A90E2',
    vault_file: '#2ECC71',
    decision: '#F39C12',
    concept: '#9B59B6',
    markdown_document: '#95A5A6',
    roadmap_item: '#E74C3C',
  };
  return colors[type] || '#BDC3C7';
}

function exportHtmlGraph(cwd, graph) {
  const indexDir = join(cwd, 'vault', 'index');
  mkdirSync(indexDir, { recursive: true });
  const htmlPath = join(indexDir, 'graph.html');

  const date = new Date().toISOString().split('T')[0];
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Peter Knowledge Graph — ${date}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    h1 { color: #333; margin: 0 0 20px 0; }
    #graph { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .node { cursor: pointer; stroke: #fff; stroke-width: 2px; }
    .node:hover { stroke-width: 3px; }
    .link { stroke: #999; opacity: 0.6; }
    .link.highlight { stroke: #333; opacity: 1; stroke-width: 3px; }
    .tooltip { position: absolute; background: #333; color: white; padding: 8px 12px; border-radius: 4px; font-size: 12px; pointer-events: none; display: none; z-index: 1000; max-width: 200px; }
    .legend { margin-top: 20px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .legend-item { display: inline-block; margin-right: 20px; }
    .legend-color { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>Peter Knowledge Graph — ${date}</h1>
  <div id="graph"></div>
  <div class="legend" id="legend"></div>
  <div class="tooltip" id="tooltip"></div>

  <script>
    const graphData = {
      nodes: ${JSON.stringify(nodes.map(n => ({ id: n.id, label: n.label || n.id, type: n.type, excerpt: (n.excerpt || '').substring(0, 50) })))},
      links: ${JSON.stringify(edges.map(e => ({ source: e.from, target: e.to, type: e.type, weight: e.weight || 1 })))}
    };

    const width = 1200, height = 900;
    const svg = d3.select('#graph').append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g');

    const colorMap = {
      project: '#4A90E2', vault_file: '#2ECC71', decision: '#F39C12',
      concept: '#9B59B6', markdown_document: '#95A5A6', roadmap_item: '#E74C3C'
    };

    // Build degree map
    const degrees = {};
    graphData.nodes.forEach(n => degrees[n.id] = 0);
    graphData.links.forEach(l => {
      degrees[l.source] = (degrees[l.source] || 0) + 1;
      degrees[l.target] = (degrees[l.target] || 0) + 1;
    });

    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('class', 'link')
      .attr('stroke-width', d => Math.sqrt(d.weight) * 2);

    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('class', 'node')
      .attr('r', d => Math.sqrt((degrees[d.id] || 0) + 1) * 4 + 4)
      .attr('fill', d => colorMap[d.type] || '#BDC3C7')
      .call(drag(simulation));

    const tooltip = d3.select('#tooltip');
    node.on('mouseover', function(event, d) {
      tooltip.style('display', 'block')
        .html(\`<strong>\${d.label}</strong><br/><em>\${d.type}</em><br/>\${d.excerpt}\`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY + 10) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'))
    .on('click', function(event, d) {
      const neighbors = new Set();
      graphData.links.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (s === d.id) neighbors.add(t);
        if (t === d.id) neighbors.add(s);
      });
      link.classed('highlight', l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return s === d.id || t === d.id;
      });
      node.style('opacity', n => neighbors.has(n.id) || n.id === d.id ? 1 : 0.1);
    });

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
    });

    function drag(simulation) {
      return d3.drag()
        .on('start', event => { if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; })
        .on('drag', event => { event.subject.fx = event.x; event.subject.fy = event.y; })
        .on('end', event => { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; });
    }

    // Legend
    const legend = d3.select('#legend');
    Object.entries(colorMap).forEach(([type, color]) => {
      legend.append('div').attr('class', 'legend-item')
        .html(\`<div class="legend-color" style="background: \${color}"></div> \${type}\`);
    });
  </script>
</body>
</html>`;

  writeFileSync(htmlPath, html, 'utf8');
  const sizeKb = (html.length / 1024).toFixed(0);
  return { ok: true, path: htmlPath, size: sizeKb };
}

function exportObsidianVault(cwd, graph) {
  const vaultDir = join(cwd, 'vault', 'index', 'obsidian');
  mkdirSync(vaultDir, { recursive: true });

  const validTypes = ['project', 'vault_file', 'decision', 'roadmap_item', 'markdown_document', 'concept'];
  const nodes = (graph.nodes || []).filter(n => validTypes.includes(n.type)).slice(0, 500);
  const edges = graph.edges || [];

  // Build adjacency map
  const neighbors = new Map();
  edges.forEach(e => {
    if (!neighbors.has(e.from)) neighbors.set(e.from, []);
    if (!neighbors.has(e.to)) neighbors.set(e.to, []);
    neighbors.get(e.from).push({ id: e.to, type: e.type });
    neighbors.get(e.to).push({ id: e.from, type: e.type });
  });

  let count = 0;
  for (const node of nodes) {
    const filename = sanitizeFilename(node.id) + '.md';
    const relatedNodes = neighbors.get(node.id) || [];
    const relationsMarkdown = relatedNodes
      .map(rel => {
        const relNode = nodes.find(n => n.id === rel.id);
        return relNode ? `- [[${sanitizeFilename(relNode.id)}]] — ${rel.type}` : null;
      })
      .filter(Boolean)
      .join('\n');

    const content = `# ${node.label || node.id}

**Type:** ${node.type}
**Confidence:** ${node.confidence || 'unknown'}
**Path:** ${node.path || '(no path)'}

${node.excerpt || '(no excerpt)'}

## Relations

${relationsMarkdown || '(no relations)'}
`;

    writeFileSync(join(vaultDir, filename), content, 'utf8');
    count++;
  }

  return { ok: true, path: vaultDir, count };
}

function exportWikiVault(cwd, graph) {
  const wikiDir = join(cwd, 'vault', 'index', 'wiki');
  mkdirSync(wikiDir, { recursive: true });

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const byType = {};

  nodes.forEach(n => {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  });

  // Build adjacency
  const neighbors = new Map();
  edges.forEach(e => {
    if (!neighbors.has(e.from)) neighbors.set(e.from, []);
    if (!neighbors.has(e.to)) neighbors.set(e.to, []);
    neighbors.get(e.from).push({ id: e.to, type: e.type });
    neighbors.get(e.to).push({ id: e.from, type: e.type });
  });

  // Create index
  let indexContent = '# Peter Knowledge Wiki\n\n## Par type\n\n';
  for (const [type, typeNodes] of Object.entries(byType)) {
    indexContent += `\n### ${type} (${typeNodes.length})\n\n`;
    typeNodes.forEach(n => {
      const link = sanitizeFilename(n.id);
      indexContent += `- [${n.label || n.id}](./${type}/${link}.md)\n`;
    });
  }

  writeFileSync(join(wikiDir, 'index.md'), indexContent, 'utf8');

  // Create per-type directories
  for (const [type, typeNodes] of Object.entries(byType)) {
    const typeDir = join(wikiDir, type);
    mkdirSync(typeDir, { recursive: true });

    for (const node of typeNodes) {
      const filename = sanitizeFilename(node.id) + '.md';
      const relatedNodes = neighbors.get(node.id) || [];
      const relationsMarkdown = relatedNodes
        .map(rel => {
          const relNode = nodes.find(n => n.id === rel.id);
          return relNode ? `- [${relNode.label || relNode.id}](../${relNode.type}/${sanitizeFilename(relNode.id)}.md) — ${rel.type}` : null;
        })
        .filter(Boolean)
        .join('\n');

      const content = `# ${node.label || node.id}

**Type:** ${node.type}
**Confidence:** ${node.confidence || 'unknown'}
**Path:** ${node.path || '(no path)'}

${node.excerpt || '(no excerpt)'}

## Relations

${relationsMarkdown || '(no relations)'}
`;

      writeFileSync(join(typeDir, filename), content, 'utf8');
    }
  }

  return { ok: true, path: wikiDir, nodeCount: nodes.length, typeCount: Object.keys(byType).length };
}

function exportSvgGraph(cwd, graph) {
  const svgPath = join(cwd, 'vault', 'index', 'graph.svg');
  mkdirSync(dirname(svgPath), { recursive: true });

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const stats = graph.stats || {};
  const centralNodes = (stats.centralNodes || []).slice(0, 8);

  const radius = 400;
  const innerRadius = 150;
  const centerX = 600, centerY = 600;

  // Position nodes
  const nodePos = new Map();
  const centralSet = new Set(centralNodes);

  let centralIndex = 0;
  let otherIndex = 0;
  const centralCount = Math.min(centralNodes.length, nodes.length);
  const otherCount = Math.max(0, nodes.length - centralCount);

  for (const node of nodes) {
    if (centralSet.has(node.id)) {
      const angle = (centralIndex / centralCount) * Math.PI * 2;
      nodePos.set(node.id, {
        x: centerX + Math.cos(angle) * innerRadius,
        y: centerY + Math.sin(angle) * innerRadius,
        isCenter: true
      });
      centralIndex++;
    } else {
      const angle = (otherIndex / Math.max(1, otherCount)) * Math.PI * 2;
      nodePos.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        isCenter: false
      });
      otherIndex++;
    }
  }

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <style>
    .link { stroke: #999; opacity: 0.6; }
    .node { stroke: white; stroke-width: 2; }
    .node-text { font-size: 11px; text-anchor: middle; fill: #333; }
  </style>
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
    </style>
  </defs>\n`;

  // Draw edges
  for (const edge of edges) {
    const from = nodePos.get(edge.from);
    const to = nodePos.get(edge.to);
    if (from && to) {
      const opacity = Math.max(0.1, Math.min(1, (edge.weight || 1) / 2));
      svg += `  <line class="link" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-opacity="${opacity}" stroke-width="${Math.sqrt(edge.weight || 1)}" />\n`;
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const pos = nodePos.get(node.id);
    if (pos) {
      const r = pos.isCenter ? 6 : 4;
      const color = getNodeColor(node.type);
      svg += `  <circle class="node" cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${color}" />\n`;
    }
  }

  // Draw text labels for central nodes
  for (const node of nodes) {
    const pos = nodePos.get(node.id);
    if (pos && pos.isCenter) {
      const label = (node.label || node.id).substring(0, 12);
      svg += `  <text class="node-text" x="${pos.x}" y="${pos.y + 12}">${label}</text>\n`;
    }
  }

  svg += '</svg>';
  writeFileSync(svgPath, svg, 'utf8');

  return { ok: true, path: svgPath, size: (svg.length / 1024).toFixed(0) };
}

function exportGraphML(cwd, graph) {
  const graphmlPath = join(cwd, 'vault', 'index', 'graph.graphml');
  mkdirSync(dirname(graphmlPath), { recursive: true });

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/graphml">
  <key id="type" for="node" attr.name="type" attr.type="string"/>
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="confidence" for="node" attr.name="confidence" attr.type="string"/>
  <key id="path" for="node" attr.name="path" attr.type="string"/>
  <key id="excerpt" for="node" attr.name="excerpt" attr.type="string"/>
  <key id="edgeType" for="edge" attr.name="edgeType" attr.type="string"/>
  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>
  <graph id="peter" edgedefault="directed">\n`;

  for (const node of nodes) {
    const safeId = node.id.replace(/"/g, '&quot;');
    graphml += `    <node id="${safeId}">\n`;
    graphml += `      <data key="type">${node.type}</data>\n`;
    graphml += `      <data key="label">${(node.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</data>\n`;
    graphml += `      <data key="confidence">${node.confidence || 'unknown'}</data>\n`;
    graphml += `      <data key="path">${(node.path || '').replace(/"/g, '&quot;')}</data>\n`;
    graphml += `      <data key="excerpt">${(node.excerpt || '').substring(0, 100).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</data>\n`;
    graphml += `    </node>\n`;
  }

  for (const edge of edges) {
    const safeFrom = edge.from.replace(/"/g, '&quot;');
    const safeTo = edge.to.replace(/"/g, '&quot;');
    graphml += `    <edge source="${safeFrom}" target="${safeTo}">\n`;
    graphml += `      <data key="edgeType">${edge.type}</data>\n`;
    graphml += `      <data key="weight">${edge.weight || 1}</data>\n`;
    graphml += `    </edge>\n`;
  }

  graphml += `  </graph>
</graphml>`;

  writeFileSync(graphmlPath, graphml, 'utf8');

  return { ok: true, path: graphmlPath, nodeCount: nodes.length, edgeCount: edges.length };
}

function exportNeo4jCypher(cwd, graph) {
  const neo4jDir = join(cwd, 'vault', 'index', 'neo4j');
  mkdirSync(neo4jDir, { recursive: true });

  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const maxPerFile = 10000;

  // Nodes
  let nodesCypher = '';
  nodes.forEach((node, idx) => {
    if (idx > 0 && idx % maxPerFile === 0) {
      writeFileSync(join(neo4jDir, `nodes_${Math.floor(idx / maxPerFile)}.cypher`), nodesCypher, 'utf8');
      nodesCypher = '';
    }
    const safeId = node.id.replace(/"/g, '\\"');
    const safeLabel = (node.label || '').replace(/"/g, '\\"');
    const safeConfidence = (node.confidence || 'unknown').replace(/"/g, '\\"');
    nodesCypher += `CREATE (:${node.type.replace(/-/g, '_')} {id: "${safeId}", label: "${safeLabel}", confidence: "${safeConfidence}"});\n`;
  });
  if (nodesCypher) writeFileSync(join(neo4jDir, 'nodes_0.cypher'), nodesCypher, 'utf8');

  // Edges
  let edgesCypher = '';
  edges.forEach((edge, idx) => {
    if (idx > 0 && idx % maxPerFile === 0) {
      writeFileSync(join(neo4jDir, `edges_${Math.floor(idx / maxPerFile)}.cypher`), edgesCypher, 'utf8');
      edgesCypher = '';
    }
    const safeFrom = edge.from.replace(/"/g, '\\"');
    const safeTo = edge.to.replace(/"/g, '\\"');
    const safeType = edge.type.replace(/-/g, '_').toUpperCase();
    edgesCypher += `MATCH (a {id:"${safeFrom}"}),(b {id:"${safeTo}"}) CREATE (a)-[:${safeType}]->(b);\n`;
  });
  if (edgesCypher) writeFileSync(join(neo4jDir, 'edges_0.cypher'), edgesCypher, 'utf8');

  // Import script
  const importScript = `#!/bin/bash
# Neo4j import script for Peter Knowledge Graph
# Usage: bash import.sh [optional: cypher-shell-path]

CYPHER=\${1:-cypher-shell}

if ! command -v \$CYPHER &> /dev/null; then
  echo "Warning: cypher-shell not found. Install Neo4j to use this script."
  exit 1
fi

for file in nodes_*.cypher; do
  echo "Importing \$file..."
  \$CYPHER < "\$file"
done

for file in edges_*.cypher; do
  echo "Importing \$file..."
  \$CYPHER < "\$file"
done

echo "Neo4j import complete."
`;

  writeFileSync(join(neo4jDir, 'import.sh'), importScript, 'utf8');

  return { ok: true, path: neo4jDir, nodeCount: nodes.length, edgeCount: edges.length };
}

function exportVault(cwd, format) {
  const graphPath = join(cwd, 'vault', 'index', 'graph.json');
  if (!existsSync(graphPath)) {
    return { ok: false, error: 'graph.json absent — lancez : claude-atelier vault graph' };
  }

  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  } catch (err) {
    return { ok: false, error: `graph.json illisible: ${err.message}` };
  }

  const handlers = {
    html: () => exportHtmlGraph(cwd, graph),
    obsidian: () => exportObsidianVault(cwd, graph),
    wiki: () => exportWikiVault(cwd, graph),
    svg: () => exportSvgGraph(cwd, graph),
    graphml: () => exportGraphML(cwd, graph),
    neo4j: () => exportNeo4jCypher(cwd, graph),
  };

  if (!handlers[format]) {
    return { ok: false, error: `Format inconnu: ${format}. Formats disponibles: html, obsidian, wiki, svg, graphml, neo4j` };
  }

  return handlers[format]();
}

export { sanitizeFilename, getNodeColor, exportHtmlGraph, exportObsidianVault, exportWikiVault, exportSvgGraph, exportGraphML, exportNeo4jCypher, exportVault };
