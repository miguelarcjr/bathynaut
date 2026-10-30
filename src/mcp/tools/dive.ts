import { Database } from 'better-sqlite3';
import { z } from 'zod';

export const DiveSchema = z.object({
  community_id: z.number().optional().describe('ID da comunidade topologica para inspecionar'),
  query: z.string().optional().describe('Termo de busca para encontrar subsistemas'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio')
});

export function handleDive(db: Database, args: z.infer<typeof DiveSchema>) {
  let communities;
  if (args.community_id !== undefined) {
    communities = db.prepare('SELECT * FROM communities WHERE id = ?').all(args.community_id);
  } else if (args.query) {
    communities = db.prepare('SELECT * FROM communities WHERE name LIKE ? OR description LIKE ? ORDER BY size DESC LIMIT 10').all(`%${args.query}%`, `%${args.query}%`);
  } else {
    communities = db.prepare('SELECT * FROM communities ORDER BY size DESC LIMIT 10').all();
  }

  const godNodes = db.prepare(`
    SELECT id, name, kind, file_path, pagerank_score, in_degree, out_degree, community_id
    FROM nodes
    WHERE pagerank_score > 0
    ORDER BY pagerank_score DESC
    LIMIT 10
  `).all();

  const bridgeNodes = db.prepare(`
    SELECT id, name, kind, file_path, pagerank_score, in_degree, out_degree, community_id
    FROM nodes
    WHERE is_bridge = 1
    ORDER BY pagerank_score DESC
    LIMIT 10
  `).all();

  const topFlows = db.prepare(`
    SELECT id, name, entrypoint_id, depth, crosses_communities, criticality_score, node_path_json
    FROM flows
    ORDER BY criticality_score DESC, depth DESC
    LIMIT 10
  `).all();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            communities,
            top_god_nodes: godNodes,
            bridge_nodes: bridgeNodes,
            top_flows: topFlows
          },
          null,
          2
        )
      }
    ]
  };
}
