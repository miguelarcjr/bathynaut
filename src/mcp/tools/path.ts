import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { buildGraphFromDatabase } from '../../graph/builder.js';
import shortestPath from 'graphology-shortest-path';

export const PathSchema = z.object({
  from: z.string().describe('ID do no ou nome do simbolo de origem'),
  to: z.string().describe('ID do no ou nome do simbolo de destino')
});

export function handlePath(db: Database, args: z.infer<typeof PathSchema>) {
  const graph = buildGraphFromDatabase(db);
  
  // Resolve node IDs if symbol names were passed
  let fromId = args.from;
  let toId = args.to;

  if (!graph.hasNode(fromId)) {
    const candidate = db.prepare('SELECT id FROM nodes WHERE name = ? OR id LIKE ? LIMIT 1').get(args.from, `%${args.from}%`) as { id: string } | undefined;
    if (candidate) fromId = candidate.id;
  }

  if (!graph.hasNode(toId)) {
    const candidate = db.prepare('SELECT id FROM nodes WHERE name = ? OR id LIKE ? LIMIT 1').get(args.to, `%${args.to}%`) as { id: string } | undefined;
    if (candidate) toId = candidate.id;
  }

  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Nao foi possivel encontrar um dos nos no grafo', fromId, toId })
        }
      ]
    };
  }

  const path = shortestPath.bidirectional(graph, fromId, toId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ from: fromId, to: toId, hops: path ? path.length - 1 : 0, path: path || 'Sem conexao direta' }, null, 2)
      }
    ]
  };
}
