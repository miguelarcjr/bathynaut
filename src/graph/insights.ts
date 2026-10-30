import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeRecord } from '../types.js';
import { upsertNode, upsertEdge, upsertFileState } from '../storage/queries.js';
import { parseZettelkastenNote } from '../parsers/markdown/zettelkasten.js';
import { interlinkCodeWithADRs } from '../parsers/ast/interlink.js';

export interface SurprisingConnection {
  source_id: string;
  source_name: string;
  source_file: string | null;
  source_community_id: number;
  source_community: string;
  target_id: string;
  target_name: string;
  target_file: string | null;
  target_community_id: number;
  target_community: string;
  relation: string;
  surprise_score: number;
}

export interface KnowledgeGap {
  community_id: number;
  community_name: string;
  size: number;
  cohesion: number;
  god_node_id: string | null;
  recommendation: string;
}

export interface LargeFunctionItem {
  id: string;
  name: string;
  kind: string;
  file_path: string | null;
  line_start: number;
  line_end: number;
  line_count: number;
  pagerank_score: number;
}

export interface SymbolRenamePreview {
  symbol_id: string;
  old_name: string;
  new_name: string;
  definition_file: string | null;
  line_start: number | null;
  line_end: number | null;
  affected_callers: Array<{
    caller_id: string;
    caller_name: string;
    file_path: string | null;
    line_start: number | null;
    relation: string;
    snippet: string | null;
  }>;
  affected_adrs: Array<{
    adr_id: string;
    title: string;
    file_path: string | null;
  }>;
}

/**
 * Detects cross-community calls/imports that represent potential Architectural Drift
 * or high-betweenness bridges between distant subsystems (inspired by Graphify).
 */
export function detectSurprisingConnections(db: Database, limit = 15): SurprisingConnection[] {
  const rows = db.prepare(`
    SELECT
      e.source_id,
      s.name as source_name,
      s.file_path as source_file,
      s.community_id as source_comm_id,
      cs.name as source_comm_name,
      cs.cohesion as source_cohesion,
      e.target_id,
      t.name as target_name,
      t.file_path as target_file,
      t.community_id as target_comm_id,
      ct.name as target_comm_name,
      ct.cohesion as target_cohesion,
      e.relation,
      (COALESCE(s.pagerank_score, 0.1) + COALESCE(t.pagerank_score, 0.1) + (COALESCE(cs.cohesion, 0.5) + COALESCE(ct.cohesion, 0.5)) * 0.5) as score
    FROM edges e
    INNER JOIN nodes s ON s.id = e.source_id
    INNER JOIN nodes t ON t.id = e.target_id
    LEFT JOIN communities cs ON cs.id = s.community_id
    LEFT JOIN communities ct ON ct.id = t.community_id
    WHERE e.relation IN ('calls', 'imports')
      AND s.community_id IS NOT NULL
      AND t.community_id IS NOT NULL
      AND s.community_id != t.community_id
      AND s.kind != 'test'
    ORDER BY score DESC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map(r => ({
    source_id: r.source_id,
    source_name: r.source_name,
    source_file: r.source_file,
    source_community_id: r.source_comm_id,
    source_community: r.source_comm_name || `Community ${r.source_comm_id}`,
    target_id: r.target_id,
    target_name: r.target_name,
    target_file: r.target_file,
    target_community_id: r.target_comm_id,
    target_community: r.target_comm_name || `Community ${r.target_comm_id}`,
    relation: r.relation,
    surprise_score: Number((r.score || 0.5).toFixed(3))
  }));
}

/**
 * Finds functional communities that have zero governing ADRs, patterns, or architecture notes.
 */
export function detectKnowledgeGaps(db: Database): KnowledgeGap[] {
  const communities = db.prepare('SELECT * FROM communities ORDER BY size DESC').all() as any[];
  const gaps: KnowledgeGap[] = [];

  for (const comm of communities) {
    const governedCount = db.prepare(`
      SELECT COUNT(*) as c
      FROM nodes n
      INNER JOIN edges e ON e.source_id = n.id
      WHERE n.community_id = ?
        AND e.relation = 'governed_by'
    `).get(comm.id) as { c: number };

    if (!governedCount || governedCount.c === 0) {
      gaps.push({
        community_id: comm.id,
        community_name: comm.name,
        size: comm.size,
        cohesion: comm.cohesion,
        god_node_id: comm.god_node_id ?? null,
        recommendation: `Community "${comm.name}" (${comm.size} symbols) has no governing ADR or architecture note. Record invariants via bathynaut_log_adr.`
      });
    }
  }

  return gaps;
}

/**
 * Finds monolithic functions/classes exceeding `minLines` lines of code (inspired by Code-Review-Graph).
 */
export function findLargeFunctions(db: Database, minLines = 50, limit = 20): LargeFunctionItem[] {
  const rows = db.prepare(`
    SELECT
      id, name, kind, file_path, line_start, line_end,
      (line_end - line_start + 1) as line_count,
      pagerank_score
    FROM nodes
    WHERE depth_zone != 'abyssal'
      AND kind IN ('function', 'entrypoint', 'class')
      AND line_start IS NOT NULL
      AND line_end IS NOT NULL
      AND (line_end - line_start + 1) >= ?
    ORDER BY line_count DESC, pagerank_score DESC
    LIMIT ?
  `).all(minLines, limit) as any[];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    file_path: r.file_path,
    line_start: r.line_start,
    line_end: r.line_end,
    line_count: r.line_count,
    pagerank_score: r.pagerank_score || 0
  }));
}

/**
 * Deterministic AST-backed symbol rename impact preview (inspired by Code-Review-Graph refactor_tool).
 */
export function previewSymbolRename(
  db: Database,
  symbolNameOrId: string,
  newName: string
): SymbolRenamePreview {
  let target = db.prepare('SELECT * FROM nodes WHERE id = ?').get(symbolNameOrId) as NodeRecord | undefined;
  if (!target) {
    target = db.prepare(`
      SELECT * FROM nodes
      WHERE (name = ? OR qualified_name = ?)
        AND depth_zone != 'abyssal'
      ORDER BY pagerank_score DESC
      LIMIT 1
    `).get(symbolNameOrId, symbolNameOrId) as NodeRecord | undefined;
  }

  if (!target) {
    return {
      symbol_id: symbolNameOrId,
      old_name: symbolNameOrId,
      new_name: newName,
      definition_file: null,
      line_start: null,
      line_end: null,
      affected_callers: [],
      affected_adrs: []
    };
  }

  const callers = db.prepare(`
    SELECT
      e.source_id as caller_id,
      n.name as caller_name,
      n.file_path,
      n.line_start,
      e.relation,
      e.context_snippet as snippet
    FROM edges e
    INNER JOIN nodes n ON n.id = e.source_id
    WHERE e.target_id = ?
      AND e.relation IN ('calls', 'imports', 'implements', 'tests_for', 'tested_by')
  `).all(target.id) as any[];

  const adrs = db.prepare(`
    SELECT
      n.id as adr_id,
      n.name as title,
      n.file_path
    FROM edges e
    INNER JOIN nodes n ON n.id = e.target_id
    WHERE e.source_id = ?
      AND e.relation = 'governed_by'
  `).all(target.id) as any[];

  return {
    symbol_id: target.id,
    old_name: target.name,
    new_name: newName,
    definition_file: target.file_path ?? null,
    line_start: target.line_start ?? null,
    line_end: target.line_end ?? null,
    affected_callers: callers,
    affected_adrs: adrs
  };
}

/**
 * Automatically synthesizes foundational architecture notes (`wiki/architecture/arch-community-*.md`)
 * for detected communities if `wiki/architecture` is currently empty.
 */
export function generateCommunityArchitectureNotes(memoryRoot: string, db: Database): number {
  const archDir = path.join(memoryRoot, 'wiki', 'architecture');
  fs.mkdirSync(archDir, { recursive: true });

  const existingArchFiles = fs.readdirSync(archDir).filter(f => f.endsWith('.md'));
  if (existingArchFiles.length > 0) {
    return 0; // Preserve user/agent authored architecture notes
  }

  const communities = db.prepare('SELECT * FROM communities WHERE size >= 2 ORDER BY size DESC LIMIT 8').all() as any[];
  let createdCount = 0;
  const codeNodes = db.prepare("SELECT * FROM nodes WHERE depth_zone != 'abyssal'").all() as NodeRecord[];

  for (const comm of communities) {
    const members = db.prepare(`
      SELECT name, kind, file_path, pagerank_score
      FROM nodes
      WHERE community_id = ? AND kind != 'file'
      ORDER BY pagerank_score DESC
      LIMIT 12
    `).all(comm.id) as any[];

    if (members.length === 0) continue;

    const filesSet = new Set<string>();
    const symbolsList: string[] = [];
    for (const m of members) {
      if (m.file_path) filesSet.add(m.file_path.replace(/\\/g, '/'));
      if (m.name && symbolsList.length < 6) symbolsList.push(m.name);
    }

    const appliesTo = Array.from(filesSet).slice(0, 6);
    const slug = String(comm.name || `cluster-${comm.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const noteId = `arch-cluster-${String(comm.id).padStart(2, '0')}-${slug}`;
    const notePath = path.join(archDir, `${noteId}.md`);
    const today = new Date().toISOString().split('T')[0];

    const markdown = `---
id: ${noteId}
title: "Topological Subsystem: ${comm.name}"
summary: "Functional cluster detected via Louvain (${comm.size} symbols, cohesion ${comm.cohesion})."
category: architecture
status: active
enforcement: advisory
updated_at: ${today}
applies_to:
${appliesTo.map(f => `  - "${f}"`).join('\n')}
symbols:
${symbolsList.map(s => `  - "${s}"`).join('\n')}
---

# Topological Subsystem: ${comm.name}

## Structural Overview
Functional community automatically detected by Bathynaut's topological engine with **${comm.size} symbols** and internal cohesion index **${comm.cohesion}**.

## Key Symbols & Gravity Centers (God Nodes)
${members.map(m => `- \`${m.name}\` (${m.kind} in \`${m.file_path || 'N/A'}\`)`).join('\n')}
`;

    fs.writeFileSync(notePath, markdown, 'utf-8');
    const stat = fs.statSync(notePath);
    const hash = crypto.createHash('sha256').update(markdown).digest('hex');
    const projectRoot = path.dirname(path.dirname(memoryRoot));
    const relPath = path.relative(projectRoot, notePath).replace(/\\/g, '/');

    const parsed = parseZettelkastenNote(relPath, markdown);
    upsertNode(db, parsed.node);
    const links = interlinkCodeWithADRs(codeNodes, [parsed]);
    for (const l of links) {
      upsertEdge(db, l);
    }
    upsertFileState(db, {
      file_path: relPath,
      mtime_ms: Math.floor(stat.mtimeMs),
      sha256: hash,
      byte_size: stat.size,
      kind: 'markdown'
    });
    createdCount++;
  }

  return createdCount;
}
