import Graph from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank.js';
import { Database } from 'better-sqlite3';

export interface GodNode {
  id: string;
  name: string;
  kind: string;
  score: number;
}

export function computeGodNodes(graph: Graph, db?: Database, topN = 10): GodNode[] {
  if (graph.order === 0) return [];

  const scores = pagerank(graph, { alpha: 0.85 });

  const ranked: GodNode[] = Object.entries(scores)
    .map(([id, score]) => ({
      id,
      name: graph.getNodeAttribute(id, 'name') || id,
      kind: graph.getNodeAttribute(id, 'kind') || 'unknown',
      score
    }))
    .sort((a, b) => b.score - a.score);

  if (db) {
    const updateStmt = db.prepare('UPDATE nodes SET pagerank_score = ? WHERE id = ?');
    for (const r of ranked) {
      updateStmt.run(r.score, r.id);
    }
  }

  return ranked.slice(0, topN);
}
