import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { buildGraphFromDatabase } from '../../graph/builder.js';
import shortestPath from 'graphology-shortest-path';

export const PathSchema = z.object({
  from: z.string().describe('Source node ID or symbol name'),
  to: z.string().describe('Target node ID or symbol name'),
  project_path: z.string().optional().describe('Optional repository path')
});

export function handlePath(db: Database, args: z.infer<typeof PathSchema>) {
  const graph = buildGraphFromDatabase(db);

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
          text: JSON.stringify({ error: 'Could not locate one or both nodes in the graph', fromId, toId })
        }
      ]
    };
  }

  const path = shortestPath.bidirectional(graph, fromId, toId);

  const edges: Array<{ from: string; to: string; relation: string; confidence: string; snippet?: string | null }> = [];
  if (path && path.length > 1) {
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      const edgeRow = db.prepare(`
        SELECT source_id, target_id, relation, confidence, context_snippet
        FROM edges
        WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
        LIMIT 1
      `).get(u, v, v, u) as { source_id: string; target_id: string; relation: string; confidence: string; context_snippet: string | null } | undefined;

      edges.push({
        from: u,
        to: v,
        relation: edgeRow?.relation || 'connected',
        confidence: edgeRow?.confidence || 'EXTRACTED',
        snippet: edgeRow?.context_snippet ?? null
      });
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            from: fromId,
            to: toId,
            hops: path ? path.length - 1 : 0,
            path: path || 'No direct connection found',
            edges
          },
          null,
          2
        )
      }
    ]
  };
}
