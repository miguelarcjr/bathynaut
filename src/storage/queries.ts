import { Database } from 'better-sqlite3';
import { NodeRecord, EdgeRecord, CommunityRecord } from '../types.js';

export function upsertNode(db: Database, node: NodeRecord): void {
  const stmt = db.prepare(`
    INSERT INTO nodes (
      id, depth_zone, kind, name, file_path, line_start, line_end,
      community_id, pagerank_score, summary, status, applies_to_json, body_markdown
    ) VALUES (
      @id, @depth_zone, @kind, @name, @file_path, @line_start, @line_end,
      @community_id, @pagerank_score, @summary, @status, @applies_to_json, @body_markdown
    )
    ON CONFLICT(id) DO UPDATE SET
      depth_zone = excluded.depth_zone,
      kind = excluded.kind,
      name = excluded.name,
      file_path = excluded.file_path,
      line_start = excluded.line_start,
      line_end = excluded.line_end,
      community_id = excluded.community_id,
      pagerank_score = excluded.pagerank_score,
      summary = excluded.summary,
      status = excluded.status,
      applies_to_json = excluded.applies_to_json,
      body_markdown = excluded.body_markdown,
      updated_at = datetime('now')
  `);

  stmt.run({
    id: node.id,
    depth_zone: node.depth_zone,
    kind: node.kind,
    name: node.name,
    file_path: node.file_path ?? null,
    line_start: node.line_start ?? null,
    line_end: node.line_end ?? null,
    community_id: node.community_id ?? null,
    pagerank_score: node.pagerank_score ?? 0.0,
    summary: node.summary,
    status: node.status ?? 'active',
    applies_to_json: node.applies_to_json ?? '[]',
    body_markdown: node.body_markdown ?? null
  });

  // Keep FTS5 in sync
  try {
    db.prepare('DELETE FROM nodes_fts WHERE id = ?').run(node.id);
    db.prepare('INSERT INTO nodes_fts (id, name, summary, body_markdown) VALUES (?, ?, ?, ?)').run(
      node.id,
      node.name,
      node.summary,
      node.body_markdown ?? ''
    );
  } catch (err) {
    // FTS sync failure fallback
  }
}

export function upsertEdge(db: Database, edge: EdgeRecord): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO edges (
      source_id, target_id, relation, confidence, weight, context_snippet
    ) VALUES (
      ?, ?, ?, ?, ?, ?
    )
  `);
  stmt.run(
    edge.source_id,
    edge.target_id,
    edge.relation,
    edge.confidence ?? 'EXTRACTED',
    edge.weight ?? 1.0,
    edge.context_snippet ?? null
  );
}

export function getNodeById(db: Database, id: string): NodeRecord | undefined {
  return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRecord | undefined;
}

export function searchNodesFTS(db: Database, query: string, limit = 20): NodeRecord[] {
  const sanitized = query.replace(/[^\w\s]/gi, ' ').trim();
  if (!sanitized) return [];
  
  const terms = sanitized.split(/\s+/).filter(Boolean);
  const ftsQuery = terms.map(term => `"${term}"*`).join(' AND ');

  try {
    const ftsRows = db.prepare(`
      SELECT id FROM nodes_fts
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{ id: string }>;

    if (ftsRows.length === 0) {
      // try OR if AND yielded no results
      const orQuery = terms.map(term => `"${term}"*`).join(' OR ');
      const orRows = db.prepare(`
        SELECT id FROM nodes_fts
        WHERE nodes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(orQuery, limit) as Array<{ id: string }>;
      
      if (orRows.length === 0) return [];
      const ids = orRows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      return db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as NodeRecord[];
    }

    const ids = ftsRows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const results = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as NodeRecord[];
    
    // Sort in same order as FTS ranking
    const map = new Map(results.map(r => [r.id, r]));
    return ids.map(id => map.get(id)!).filter(Boolean);
  } catch (err) {
    // Fallback to LIKE if FTS query syntax error
    return db.prepare('SELECT * FROM nodes WHERE name LIKE ? OR summary LIKE ? LIMIT ?').all(
      `%${sanitized}%`,
      `%${sanitized}%`,
      limit
    ) as NodeRecord[];
  }
}

export function getOutgoingEdges(db: Database, sourceId: string): EdgeRecord[] {
  return db.prepare('SELECT * FROM edges WHERE source_id = ?').all(sourceId) as EdgeRecord[];
}

export function getIncomingEdges(db: Database, targetId: string): EdgeRecord[] {
  return db.prepare('SELECT * FROM edges WHERE target_id = ?').all(targetId) as EdgeRecord[];
}

export function getNodesByFilePath(db: Database, filePath: string): NodeRecord[] {
  return db.prepare('SELECT * FROM nodes WHERE file_path = ?').all(filePath) as NodeRecord[];
}

export function getAllNodes(db: Database): NodeRecord[] {
  return db.prepare('SELECT * FROM nodes').all() as NodeRecord[];
}

export function getAllEdges(db: Database): EdgeRecord[] {
  return db.prepare('SELECT * FROM edges').all() as EdgeRecord[];
}
