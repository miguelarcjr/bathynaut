import { Database } from 'better-sqlite3';
import { NodeRecord, EdgeRecord, FileStateRecord, FlowRecord } from '../types.js';

/**
 * Splits camelCase, PascalCase, snake_case, kebab-case, and paths into space-separated tokens.
 * E.g. "calculateBlastRadius_v2-auth" -> "calculate blast radius v2 auth"
 */
export function tokenizeIdentifier(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-./:\\]+/g, ' ')
    .toLowerCase()
    .trim();
}

export function upsertNode(db: Database, node: NodeRecord): void {
  const stmt = db.prepare(`
    INSERT INTO nodes (
      id, depth_zone, kind, name, qualified_name, file_path, line_start, line_end,
      signature, docstring, code_excerpt, content_hash, is_exported, is_entrypoint,
      community_id, pagerank_score, in_degree, out_degree, is_bridge,
      summary, status, enforcement, applies_to_json, symbols_json, invariants_json,
      sources_json, body_markdown
    ) VALUES (
      @id, @depth_zone, @kind, @name, @qualified_name, @file_path, @line_start, @line_end,
      @signature, @docstring, @code_excerpt, @content_hash, @is_exported, @is_entrypoint,
      @community_id, @pagerank_score, @in_degree, @out_degree, @is_bridge,
      @summary, @status, @enforcement, @applies_to_json, @symbols_json, @invariants_json,
      @sources_json, @body_markdown
    )
    ON CONFLICT(id) DO UPDATE SET
      depth_zone = excluded.depth_zone,
      kind = excluded.kind,
      name = excluded.name,
      qualified_name = excluded.qualified_name,
      file_path = excluded.file_path,
      line_start = excluded.line_start,
      line_end = excluded.line_end,
      signature = COALESCE(excluded.signature, nodes.signature),
      docstring = COALESCE(excluded.docstring, nodes.docstring),
      code_excerpt = COALESCE(excluded.code_excerpt, nodes.code_excerpt),
      content_hash = COALESCE(excluded.content_hash, nodes.content_hash),
      is_exported = excluded.is_exported,
      is_entrypoint = excluded.is_entrypoint,
      community_id = COALESCE(excluded.community_id, nodes.community_id),
      pagerank_score = CASE WHEN excluded.pagerank_score > 0 THEN excluded.pagerank_score ELSE nodes.pagerank_score END,
      in_degree = excluded.in_degree,
      out_degree = excluded.out_degree,
      is_bridge = excluded.is_bridge,
      summary = excluded.summary,
      status = excluded.status,
      enforcement = excluded.enforcement,
      applies_to_json = excluded.applies_to_json,
      symbols_json = excluded.symbols_json,
      invariants_json = excluded.invariants_json,
      sources_json = excluded.sources_json,
      body_markdown = excluded.body_markdown,
      updated_at = datetime('now')
  `);

  stmt.run({
    id: node.id,
    depth_zone: node.depth_zone,
    kind: node.kind,
    name: node.name,
    qualified_name: node.qualified_name ?? null,
    file_path: node.file_path ?? null,
    line_start: node.line_start ?? null,
    line_end: node.line_end ?? null,
    signature: node.signature ?? null,
    docstring: node.docstring ?? null,
    code_excerpt: node.code_excerpt ?? null,
    content_hash: node.content_hash ?? null,
    is_exported: node.is_exported ?? 0,
    is_entrypoint: node.is_entrypoint ?? 0,
    community_id: node.community_id ?? null,
    pagerank_score: node.pagerank_score ?? 0.0,
    in_degree: node.in_degree ?? 0,
    out_degree: node.out_degree ?? 0,
    is_bridge: node.is_bridge ?? 0,
    summary: node.summary,
    status: node.status ?? 'active',
    enforcement: node.enforcement ?? 'advisory',
    applies_to_json: node.applies_to_json ?? '[]',
    symbols_json: node.symbols_json ?? '[]',
    invariants_json: node.invariants_json ?? '[]',
    sources_json: node.sources_json ?? '[]',
    body_markdown: node.body_markdown ?? null
  });

  // Keep FTS5 in sync with tokenized_identifiers
  try {
    const tokenized = tokenizeIdentifier(`${node.name} ${node.qualified_name ?? ''} ${node.file_path ?? ''}`);
    db.prepare('DELETE FROM nodes_fts WHERE id = ?').run(node.id);
    db.prepare(`
      INSERT INTO nodes_fts (id, name, tokenized_identifiers, signature, summary, docstring, body_markdown)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      node.id,
      node.name,
      tokenized,
      node.signature ?? '',
      node.summary,
      node.docstring ?? '',
      node.body_markdown ?? ''
    );
  } catch {
    // FTS sync fallback
  }
}

export function upsertEdge(db: Database, edge: EdgeRecord): void {
  const stmt = db.prepare(`
    INSERT INTO edges (
      source_id, target_id, relation, confidence, weight, context_snippet, needs_review
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
      confidence = excluded.confidence,
      weight = excluded.weight,
      context_snippet = COALESCE(excluded.context_snippet, edges.context_snippet),
      needs_review = CASE WHEN excluded.needs_review = 1 THEN 1 ELSE edges.needs_review END
  `);
  stmt.run(
    edge.source_id,
    edge.target_id,
    edge.relation,
    edge.confidence ?? 'EXTRACTED',
    edge.weight ?? 1.0,
    edge.context_snippet ?? null,
    edge.needs_review ?? 0
  );
}

export function upsertFileState(db: Database, state: FileStateRecord): void {
  const normalizedPath = state.file_path.replace(/\\/g, '/');
  db.prepare(`
    INSERT INTO file_state (file_path, mtime_ms, sha256, byte_size, kind, last_synced_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(file_path) DO UPDATE SET
      mtime_ms = excluded.mtime_ms,
      sha256 = excluded.sha256,
      byte_size = excluded.byte_size,
      kind = excluded.kind,
      last_synced_at = datetime('now')
  `).run(normalizedPath, Math.floor(state.mtime_ms), state.sha256, state.byte_size, state.kind);
}

export function getFileState(db: Database, filePath: string): FileStateRecord | undefined {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return db.prepare('SELECT * FROM file_state WHERE file_path = ?').get(normalizedPath) as FileStateRecord | undefined;
}

export function getAllFileStates(db: Database): FileStateRecord[] {
  return db.prepare('SELECT * FROM file_state').all() as FileStateRecord[];
}

export function deleteFileState(db: Database, filePath: string): void {
  const normalizedPath = filePath.replace(/\\/g, '/');
  db.prepare('DELETE FROM file_state WHERE file_path = ?').run(normalizedPath);
}

export function deleteNodesByFilePath(db: Database, filePath: string): void {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const existingNodes = db.prepare('SELECT id FROM nodes WHERE file_path = ? OR file_path = ?').all(filePath, normalizedPath) as Array<{ id: string }>;
  for (const n of existingNodes) {
    db.prepare('DELETE FROM edges WHERE source_id = ?').run(n.id);
    db.prepare('DELETE FROM nodes_fts WHERE id = ?').run(n.id);
    db.prepare('DELETE FROM nodes WHERE id = ?').run(n.id);
  }
}

export function upsertFlow(db: Database, flow: FlowRecord): void {
  db.prepare(`
    INSERT INTO flows (
      id, name, entrypoint_id, terminal_ids_json, node_path_json,
      depth, crosses_communities, criticality_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      entrypoint_id = excluded.entrypoint_id,
      terminal_ids_json = excluded.terminal_ids_json,
      node_path_json = excluded.node_path_json,
      depth = excluded.depth,
      crosses_communities = excluded.crosses_communities,
      criticality_score = excluded.criticality_score
  `).run(
    flow.id,
    flow.name,
    flow.entrypoint_id,
    flow.terminal_ids_json,
    flow.node_path_json,
    flow.depth,
    flow.crosses_communities,
    flow.criticality_score
  );

  // Sync flow_memberships
  db.prepare('DELETE FROM flow_memberships WHERE flow_id = ?').run(flow.id);
  try {
    const pathNodes = JSON.parse(flow.node_path_json) as string[];
    const insertMember = db.prepare('INSERT OR REPLACE INTO flow_memberships (flow_id, node_id, step_order) VALUES (?, ?, ?)');
    pathNodes.forEach((nodeId, idx) => {
      insertMember.run(flow.id, nodeId, idx);
    });
  } catch {}
}

export function getFlowsForNode(db: Database, nodeId: string): FlowRecord[] {
  return db.prepare(`
    SELECT f.* FROM flows f
    INNER JOIN flow_memberships fm ON fm.flow_id = f.id
    WHERE fm.node_id = ?
    ORDER BY f.criticality_score DESC
  `).all(nodeId) as FlowRecord[];
}

export function getNodeById(db: Database, id: string): NodeRecord | undefined {
  return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRecord | undefined;
}

export function searchNodesFTS(db: Database, query: string, limit = 20): NodeRecord[] {
  const expanded = tokenizeIdentifier(query);
  const sanitized = expanded.replace(/[^\w\s]/gi, ' ').trim();
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
      const results = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as NodeRecord[];
      const map = new Map(results.map(r => [r.id, r]));
      return ids.map(id => map.get(id)!).filter(Boolean);
    }

    const ids = ftsRows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const results = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as NodeRecord[];

    const map = new Map(results.map(r => [r.id, r]));
    return ids.map(id => map.get(id)!).filter(Boolean);
  } catch {
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
  const normalized = filePath.replace(/\\/g, '/');
  return db.prepare('SELECT * FROM nodes WHERE file_path = ? OR file_path = ?').all(filePath, normalized) as NodeRecord[];
}

export function getAllNodes(db: Database): NodeRecord[] {
  return db.prepare('SELECT * FROM nodes').all() as NodeRecord[];
}

export function getAllEdges(db: Database): EdgeRecord[] {
  return db.prepare('SELECT * FROM edges').all() as EdgeRecord[];
}
