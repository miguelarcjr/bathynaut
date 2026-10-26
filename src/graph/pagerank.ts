import pagerankPkg from 'graphology-metrics/centrality/pagerank.js';
import { Database } from 'better-sqlite3';

const pagerank: any = (pagerankPkg as any).default || pagerankPkg;

export interface GodNode {
  id: string;
  name: string;
  kind: string;
  score: number;
}

export function computeGodNodes(graph: any, db?: Database, topN = 10): GodNode[] {
  if (!graph || graph.order === 0) return [];

  const scores: Record<string, number> = pagerank(graph, { alpha: 0.85 });

  const ranked: GodNode[] = Object.entries(scores)
    .map(([id, score]) => ({
      id,
      name: (graph.getNodeAttribute(id, 'name') as string) || id,
      kind: (graph.getNodeAttribute(id, 'kind') as string) || 'unknown',
      score: Number(score)
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
