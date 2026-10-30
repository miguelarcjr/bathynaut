import pagerankPkg from 'graphology-metrics/centrality/pagerank.js';
import { Database } from 'better-sqlite3';

const pagerank: any = (pagerankPkg as any).default || pagerankPkg;

export interface GodNode {
  id: string;
  name: string;
  kind: string;
  score: number;
  in_degree: number;
  out_degree: number;
  is_bridge: number;
}

export function computeGodNodes(graph: any, db?: Database, topN = 10): GodNode[] {
  if (!graph || graph.order === 0) return [];

  const scores: Record<string, number> = pagerank(graph, { alpha: 0.85 });

  // Load community assignments if db is provided
  const nodeCommunities = new Map<string, number>();
  if (db) {
    const rows = db.prepare('SELECT id, community_id FROM nodes WHERE community_id IS NOT NULL').all() as Array<{ id: string; community_id: number }>;
    for (const r of rows) {
      nodeCommunities.set(r.id, r.community_id);
    }
  }

  const ranked: GodNode[] = Object.entries(scores)
    .map(([id, score]) => {
      const inDeg = graph.inDegree ? graph.inDegree(id) : 0;
      const outDeg = graph.outDegree ? graph.outDegree(id) : 0;
      const myComm = nodeCommunities.get(id);
      let isBridge = 0;

      if (myComm !== undefined && graph.neighbors) {
        const neighbors: string[] = graph.neighbors(id);
        for (const nb of neighbors) {
          const nbComm = nodeCommunities.get(nb);
          if (nbComm !== undefined && nbComm !== myComm) {
            isBridge = 1;
            break;
          }
        }
      }

      return {
        id,
        name: (graph.getNodeAttribute(id, 'name') as string) || id,
        kind: (graph.getNodeAttribute(id, 'kind') as string) || 'unknown',
        score: Number(score),
        in_degree: inDeg,
        out_degree: outDeg,
        is_bridge: isBridge
      };
    })
    .sort((a, b) => b.score - a.score);

  if (db) {
    const updateStmt = db.prepare(`
      UPDATE nodes
      SET pagerank_score = ?, in_degree = ?, out_degree = ?, is_bridge = ?
      WHERE id = ?
    `);
    for (const r of ranked) {
      updateStmt.run(r.score, r.in_degree, r.out_degree, r.is_bridge, r.id);
    }

    // Update god_node_id on each community
    const commRows = db.prepare('SELECT id FROM communities').all() as Array<{ id: number }>;
    for (const c of commRows) {
      const topMember = db.prepare(`
        SELECT id FROM nodes WHERE community_id = ? ORDER BY pagerank_score DESC LIMIT 1
      `).get(c.id) as { id: string } | undefined;
      if (topMember) {
        db.prepare('UPDATE communities SET god_node_id = ? WHERE id = ?').run(topMember.id, c.id);
      }
    }
  }

  return ranked.slice(0, topN);
}
