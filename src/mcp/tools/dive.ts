import { Database } from 'better-sqlite3';
import { z } from 'zod';

export const DiveSchema = z.object({
  community_id: z.number().optional().describe('ID da comunidade topologica para inspecionar'),
  query: z.string().optional().describe('Termo de busca para encontrar subsistemas')
});

export function handleDive(db: Database, args: z.infer<typeof DiveSchema>) {
  let communities;
  if (args.community_id !== undefined) {
    communities = db.prepare('SELECT * FROM communities WHERE id = ?').all(args.community_id);
  } else {
    communities = db.prepare('SELECT * FROM communities ORDER BY size DESC LIMIT 10').all();
  }

  const godNodes = db.prepare(`
    SELECT id, name, kind, file_path, pagerank_score 
    FROM nodes 
    WHERE pagerank_score > 0 
    ORDER BY pagerank_score DESC 
    LIMIT 10
  `).all();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ communities, top_god_nodes: godNodes }, null, 2)
      }
    ]
  };
}
