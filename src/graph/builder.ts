import graphology from 'graphology';
import { Database } from 'better-sqlite3';
import { getAllNodes, getAllEdges } from '../storage/queries.js';

const GraphConstructor: any = (graphology as any).default || graphology;

export function buildGraphFromDatabase(db: Database): any {
  const graph = new GraphConstructor({ multi: false, type: 'directed' });

  const nodes = getAllNodes(db);
  const edges = getAllEdges(db);

  for (const n of nodes) {
    if (!graph.hasNode(n.id)) {
      graph.addNode(n.id, {
        name: n.name,
        kind: n.kind,
        depth_zone: n.depth_zone,
        file_path: n.file_path,
        summary: n.summary
      });
    }
  }

  for (const e of edges) {
    if (graph.hasNode(e.source_id) && graph.hasNode(e.target_id)) {
      if (!graph.hasEdge(e.source_id, e.target_id)) {
        graph.addEdge(e.source_id, e.target_id, {
          relation: e.relation,
          weight: e.weight ?? 1.0
        });
      }
    }
  }

  return graph;
}
