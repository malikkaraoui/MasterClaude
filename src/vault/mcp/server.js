/**
 * src/vault/mcp/server.js — Serveur MCP Peter (JSON-RPC 2.0 stdio)
 * Implémente le protocole MCP minimal pour exposer les outils vault.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import readline from 'node:readline';

class MCPServer {
  constructor(cwd, dryRun = false) {
    this.cwd = cwd;
    this.dryRun = dryRun;
    this.initialized = false;
    this.graph = null;
    this.nextId = 1;
  }

  // Charge le graph depuis vault/index/graph.json
  loadGraph() {
    const graphPath = join(this.cwd, 'vault', 'index', 'graph.json');
    if (!existsSync(graphPath)) {
      throw new Error(`graph.json not found at ${graphPath}`);
    }
    const content = readFileSync(graphPath, 'utf8');
    this.graph = JSON.parse(content);
    return this.graph;
  }

  // Retourne le statut stale en lisant vault/.peter/state.json
  getStaleStatus() {
    const statePath = join(this.cwd, 'vault', '.peter', 'state.json');
    if (!existsSync(statePath)) {
      return { status: 'unknown', health: 'unknown' };
    }
    const content = readFileSync(statePath, 'utf8');
    const state = JSON.parse(content);
    return {
      status: state.health === 'warn' ? 'warn' : 'ok',
      health: state.health || 'ok',
      lastRun: state.maintenance?.lastRun,
    };
  }

  // Tool: query_vault — recherche par texte libre dans le graphe
  queryVault(query, limit = 10) {
    if (!this.graph) this.loadGraph();

    const results = [];
    const terms = query.toLowerCase().split(/\s+/);

    for (const node of this.graph.nodes) {
      let score = 0;

      // Scoring simple : compte les termes qui correspondent
      for (const term of terms) {
        if (node.label?.toLowerCase().includes(term)) score += 2;
        if (node.id?.toLowerCase().includes(term)) score += 1;
        if (node.excerpt?.toLowerCase().includes(term)) score += 1;
      }

      if (score > 0) {
        results.push({
          id: node.id,
          label: node.label,
          type: node.type,
          path: node.path,
          excerpt: node.excerpt,
          score,
        });
      }
    }

    // Tri par score décroissant et limite
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // Tool: get_node — retourne un nœud par id ou label
  getNode(id) {
    if (!this.graph) this.loadGraph();

    // Recherche par id exact
    let node = this.graph.nodes.find(n => n.id === id);
    if (node) return node;

    // Recherche par label (case-insensitive)
    node = this.graph.nodes.find(n =>
      n.label?.toLowerCase() === id.toLowerCase()
    );
    if (node) return node;

    // Recherche par id partiel
    node = this.graph.nodes.find(n =>
      n.id?.toLowerCase().includes(id.toLowerCase())
    );
    return node || null;
  }

  // Tool: neighbors — retourne les voisins d'un nœud
  neighbors(id, depth = 1) {
    if (!this.graph) this.loadGraph();

    const node = this.getNode(id);
    if (!node) return null;

    const result = {
      id: node.id,
      label: node.label,
      incoming: [],
      outgoing: [],
    };

    // Niveaux de profondeur
    const visited = new Set([node.id]);
    let current = [node.id];
    let currentDepth = 0;

    while (currentDepth < depth && current.length > 0) {
      const next = [];

      for (const nodeId of current) {
        // Edges entrants
        for (const edge of this.graph.edges) {
          if (edge.to === nodeId && !visited.has(edge.from)) {
            const neighbor = this.graph.nodes.find(n => n.id === edge.from);
            if (neighbor) {
              result.incoming.push({
                id: neighbor.id,
                label: neighbor.label,
                edgeType: edge.type,
              });
              visited.add(neighbor.id);
              next.push(neighbor.id);
            }
          }
        }

        // Edges sortants
        for (const edge of this.graph.edges) {
          if (edge.from === nodeId && !visited.has(edge.to)) {
            const neighbor = this.graph.nodes.find(n => n.id === edge.to);
            if (neighbor) {
              result.outgoing.push({
                id: neighbor.id,
                label: neighbor.label,
                edgeType: edge.type,
              });
              visited.add(neighbor.id);
              next.push(neighbor.id);
            }
          }
        }
      }

      current = next;
      currentDepth++;
    }

    return result;
  }

  // Tool: stale_status — retourne l'état du vault
  staleStatus() {
    const status = this.getStaleStatus();
    return {
      status: status.status,
      health: status.health,
      lastRun: status.lastRun,
    };
  }

  // Retourne la liste des outils disponibles
  getToolsList() {
    return {
      tools: [
        {
          name: 'query_vault',
          description: 'Cherche des nœuds dans le graphe vault par texte libre',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Texte de recherche',
              },
              limit: {
                type: 'number',
                description: 'Nombre max de résultats (défaut: 10)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_node',
          description: 'Retourne un nœud du graphe vault par son id ou label',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Identifiant ou label du nœud',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'neighbors',
          description:
            'Retourne les voisins directs d\'un nœud dans le graphe',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Identifiant ou label du nœud',
              },
              depth: {
                type: 'number',
                description: 'Profondeur max (défaut: 1)',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'stale_status',
          description: 'Retourne l\'état de fraîcheur du vault (stale/ok/warn)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    };
  }

  // Appelle un outil et retourne le résultat
  callTool(name, args) {
    try {
      switch (name) {
        case 'query_vault':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(this.queryVault(args.query, args.limit), null, 2),
              },
            ],
          };

        case 'get_node':
          const node = this.getNode(args.id);
          if (!node) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Node not found: ${args.id}`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(node, null, 2),
              },
            ],
          };

        case 'neighbors':
          const neighbors = this.neighbors(args.id, args.depth || 1);
          if (!neighbors) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Node not found: ${args.id}`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(neighbors, null, 2),
              },
            ],
          };

        case 'stale_status':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(this.staleStatus(), null, 2),
              },
            ],
          };

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Traite une requête JSON-RPC
  handleRequest(req) {
    const { jsonrpc, id, method, params } = req;

    if (method === 'initialize') {
      this.initialized = true;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'peter-vault',
            version: '1.0.0',
          },
        },
      };
    }

    if (method === 'notifications/initialized') {
      return null; // No response for notifications
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: this.getToolsList(),
      };
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const result = this.callTool(name, args || {});
      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    };
  }

  // Démarre le serveur en mode stdio
  async start() {
    if (this.dryRun) {
      // Mode dry-run : affiche sur stderr et exit
      process.stderr.write(
        '[MCP] Peter vault MCP server ready. Tools: query_vault, get_node, neighbors, stale_status\n'
      );
      process.exit(0);
    }

    // Charge le graphe une seule fois au démarrage
    try {
      this.loadGraph();
    } catch (e) {
      process.stderr.write(`[MCP] Failed to load graph: ${e.message}\n`);
      process.exit(1);
    }

    // Écoute les lignes JSON-RPC sur stdin
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      try {
        const req = JSON.parse(line);
        const res = this.handleRequest(req);
        if (res) {
          process.stdout.write(JSON.stringify(res) + '\n');
        }
      } catch (e) {
        const res = {
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error',
          },
        };
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }
}

export function startMcpServer(cwd, dryRun = false) {
  const server = new MCPServer(cwd, dryRun);
  return server.start();
}
