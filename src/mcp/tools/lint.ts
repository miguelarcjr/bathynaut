import { Database } from 'better-sqlite3';
import { getAllNodes, getAllEdges } from '../../storage/queries.js';

export function handleLint(db: Database) {
  const nodes = getAllNodes(db);
  const edges = getAllEdges(db);

  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source_id);
    connectedIds.add(e.target_id);
  }

  const orphanNodes = nodes.filter(n => !connectedIds.has(n.id) && n.kind !== 'file');
  const brokenEdges = edges.filter(e => {
    const sourceExists = nodes.some(n => n.id === e.source_id);
    const targetExists = nodes.some(n => n.id === e.target_id);
    return !sourceExists || !targetExists;
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: orphanNodes.length === 0 && brokenEdges.length === 0 ? 'healthy' : 'warning',
          total_nodes: nodes.length,
          total_edges: edges.length,
          orphan_nodes_count: orphanNodes.length,
          orphan_nodes: orphanNodes.slice(0, 10).map(n => ({ id: n.id, name: n.name, kind: n.kind })),
          broken_edges_count: brokenEdges.length,
          broken_edges: brokenEdges.slice(0, 10)
        }, null, 2)
      }
    ]
  };
}
