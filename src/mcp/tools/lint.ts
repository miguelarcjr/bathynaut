import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

export const LintSchema = z.object({
  project_path: z.string().optional().describe('Caminho opcional do repositorio')
});

export function handleLint(db: Database, memoryRoot?: string) {
  // 1. Orphan nodes (no incoming and no outgoing edges)
  const orphans = db.prepare(`
    SELECT id, name, kind, file_path
    FROM nodes
    WHERE id NOT IN (SELECT source_id FROM edges)
      AND id NOT IN (SELECT target_id FROM edges)
  `).all();

  // 2. Broken edges (source or target not in nodes table)
  const brokenEdges = db.prepare(`
    SELECT source_id, target_id, relation
    FROM edges
    WHERE source_id NOT IN (SELECT id FROM nodes)
       OR target_id NOT IN (SELECT id FROM nodes)
  `).all();

  // 3. Stale ADRs (status = 'stale' OR governed_by edge with needs_review = 1)
  const staleAdrs = db.prepare(`
    SELECT DISTINCT n.id, n.name, n.file_path, n.status
    FROM nodes n
    LEFT JOIN edges e ON e.target_id = n.id AND e.relation = 'governed_by'
    WHERE n.depth_zone = 'abyssal'
      AND (n.status = 'stale' OR e.needs_review = 1)
  `).all();

  // 4. Untested God Nodes (high PageRank functions/classes without test coverage)
  const untestedGodNodes = db.prepare(`
    SELECT n.id, n.name, n.kind, n.file_path, n.pagerank_score
    FROM nodes n
    WHERE n.depth_zone != 'abyssal'
      AND n.kind IN ('function', 'class', 'entrypoint')
      AND n.pagerank_score >= 0.05
      AND n.id NOT IN (
        SELECT e.target_id FROM edges e
        INNER JOIN nodes src ON src.id = e.source_id
        WHERE e.relation IN ('tests_for', 'tested_by', 'calls')
          AND (src.kind = 'test' OR src.file_path LIKE '%.spec.%' OR src.file_path LIKE '%.test.%')
      )
    ORDER BY n.pagerank_score DESC
    LIMIT 20
  `).all();

  // 5. Pending raw files in memoryRoot/raw
  let pendingRawFiles: string[] = [];
  if (memoryRoot) {
    const rawDir = path.join(memoryRoot, 'raw');
    if (fs.existsSync(rawDir)) {
      try {
        pendingRawFiles = fs
          .readdirSync(rawDir)
          .filter(f => !f.startsWith('.') && f.toLowerCase() !== 'readme.md');
      } catch {}
    }
  }

  const totalNodes = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
  const totalEdges = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;

  const isHealthy =
    brokenEdges.length === 0 &&
    staleAdrs.length === 0 &&
    untestedGodNodes.length === 0;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: isHealthy ? 'HEALTHY' : 'WARNINGS_FOUND',
            stats: { total_nodes: totalNodes, total_edges: totalEdges },
            orphan_nodes_count: orphans.length,
            orphan_nodes: orphans.slice(0, 20),
            broken_edges_count: brokenEdges.length,
            broken_edges: brokenEdges.slice(0, 20),
            stale_adrs_count: staleAdrs.length,
            stale_adrs: staleAdrs,
            untested_god_nodes_count: untestedGodNodes.length,
            untested_god_nodes: untestedGodNodes,
            pending_raw_files_count: pendingRawFiles.length,
            pending_raw_files: pendingRawFiles
          },
          null,
          2
        )
      }
    ]
  };
}
