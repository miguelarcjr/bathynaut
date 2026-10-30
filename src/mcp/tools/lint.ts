import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectSurprisingConnections,
  detectKnowledgeGaps,
  findLargeFunctions
} from '../../graph/insights.js';

export const LintSchema = z.object({
  project_path: z.string().optional().describe('Caminho opcional do repositorio'),
  workspace_hint: z.string().optional().describe('Alias para project_path')
});

function walkRawFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.toLowerCase() === 'readme.md') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRawFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

export function handleLint(db: Database, memoryRoot?: string) {
  // 1. Orphan nodes (no incoming and no outgoing edges)
  const orphans = db.prepare(`
    SELECT id, name, kind, file_path
    FROM nodes
    WHERE status = 'active'
      AND id NOT IN (SELECT source_id FROM edges)
      AND id NOT IN (SELECT target_id FROM edges)
  `).all();

  // 2. Broken edges / Dangling links (source or target not in nodes table)
  const brokenEdges = db.prepare(`
    SELECT source_id, target_id, relation, context_snippet
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

  // 5. Uncompiled raw files (cross-checked against sources_json of compiled notes — ZK-Wiki parity)
  const compiledSources = new Set<string>();
  const sourceRows = db.prepare('SELECT sources_json FROM nodes WHERE sources_json IS NOT NULL').all() as Array<{ sources_json: string }>;
  for (const row of sourceRows) {
    try {
      const list = JSON.parse(row.sources_json) as string[];
      for (const s of list) {
        const norm = s.replace(/\\/g, '/');
        compiledSources.add(norm);
        compiledSources.add(path.basename(norm));
      }
    } catch {}
  }

  let uncompiledRawSources: string[] = [];
  let pendingRawBasenames: string[] = [];
  if (memoryRoot) {
    const rawDir = path.join(memoryRoot, 'raw');
    const allRawAbs = walkRawFiles(rawDir);
    for (const absFile of allRawAbs) {
      const relToMemory = path.relative(memoryRoot, absFile).replace(/\\/g, '/');
      const base = path.basename(absFile);
      if (!compiledSources.has(relToMemory) && !compiledSources.has(base)) {
        uncompiledRawSources.push(relToMemory);
        pendingRawBasenames.push(base);
      }
    }
  }

  // 6. Architectural Drift (Surprising Connections), Knowledge Gaps & Monolithic Large Functions
  const surprisingConnections = detectSurprisingConnections(db, 10);
  const knowledgeGaps = detectKnowledgeGaps(db);
  const largeFunctions = findLargeFunctions(db, 50, 15);

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
            health_status: isHealthy ? 'healthy' : 'needs_attention',
            stats: { total_nodes: totalNodes, total_edges: totalEdges },
            orphan_nodes_count: orphans.length,
            orphan_nodes: orphans.slice(0, 20),
            orphan_active_notes: orphans.slice(0, 20),
            broken_edges_count: brokenEdges.length,
            broken_edges: brokenEdges.slice(0, 20),
            dangling_links: brokenEdges.slice(0, 20),
            stale_adrs_count: staleAdrs.length,
            stale_adrs: staleAdrs,
            untested_god_nodes_count: untestedGodNodes.length,
            untested_god_nodes: untestedGodNodes,
            pending_raw_files_count: pendingRawBasenames.length,
            pending_raw_files: pendingRawBasenames,
            uncompiled_raw_sources: uncompiledRawSources,
            large_functions: largeFunctions,
            surprising_connections: surprisingConnections,
            knowledge_gaps: knowledgeGaps
          },
          null,
          2
        )
      }
    ]
  };
}
