import louvainPkg from 'graphology-communities-louvain';
import { Database } from 'better-sqlite3';

const louvain: any = (louvainPkg as any).default || louvainPkg;

export interface CommunityResult {
  id: number;
  name: string;
  size: number;
  cohesion: number;
  members: string[];
}

export function detectAndPersistCommunities(graph: any, db?: Database): CommunityResult[] {
  if (!graph || graph.order === 0) return [];

  const communitiesMap = louvain(graph) as Record<string, number>;

  const grouped = new Map<number, string[]>();
  for (const [nodeId, commId] of Object.entries(communitiesMap)) {
    const numericId = Number(commId);
    const list = grouped.get(numericId) || [];
    list.push(nodeId);
    grouped.set(numericId, list);
  }

  const results: CommunityResult[] = [];

  for (const [commId, members] of grouped.entries()) {
    const memberSet = new Set(members);
    let internalEdges = 0;
    let boundaryEdges = 0;

    for (const nodeId of members) {
      const neighbors: string[] = graph.neighbors ? graph.neighbors(nodeId) : [];
      for (const nb of neighbors) {
        if (memberSet.has(nb)) {
          internalEdges++;
        } else {
          boundaryEdges++;
        }
      }
    }

    const totalDegreeEdges = internalEdges + boundaryEdges;
    const cohesion = totalDegreeEdges > 0
      ? Number((internalEdges / totalDegreeEdges).toFixed(3))
      : 1.0;

    const filePaths = members
      .map(id => graph.getNodeAttribute(id, 'file_path'))
      .filter(Boolean) as string[];

    let commName = `Subsystem-${commId + 1}`;
    if (filePaths.length > 0) {
      const stems = filePaths.map(p => {
        const parts = p.replace(/\\/g, '/').split('/');
        return parts.length > 1 ? parts[parts.length - 2] : parts[0];
      });
      const counts = new Map<string, number>();
      for (const s of stems) counts.set(s, (counts.get(s) || 0) + 1);
      const topStem = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topStem) {
        commName = `Modulo: ${topStem.toUpperCase()}`;
      }
    }

    results.push({
      id: commId,
      name: commName,
      size: members.length,
      cohesion,
      members
    });

    if (db) {
      db.prepare(`
        INSERT OR REPLACE INTO communities (id, name, cohesion, size)
        VALUES (?, ?, ?, ?)
      `).run(commId, commName, cohesion, members.length);

      const updateNodeStmt = db.prepare('UPDATE nodes SET community_id = ? WHERE id = ?');
      for (const memberId of members) {
        updateNodeStmt.run(commId, memberId);
      }
    }
  }

  return results;
}
