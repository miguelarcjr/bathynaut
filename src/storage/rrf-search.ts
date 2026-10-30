import { Database } from 'better-sqlite3';
import { NodeRecord } from '../types.js';
import { searchNodesFTS, getOutgoingEdges, getIncomingEdges, getNodeById } from './queries.js';
import { INVERSE_RELATIONS } from '../parsers/markdown/edges.js';

export interface RRFBacklink {
  source_id: string;
  source_name: string;
  relation: string;
  inverse_relation: string;
  snippet?: string | null;
}

export interface RRFSearchResultItem {
  node: NodeRecord;
  rrf_score: number;
  citation: string;
  deprecation_warning?: string;
  outgoing_relations: Array<{
    target_id: string;
    target_name: string;
    relation: string;
    confidence: string;
  }>;
  backlinks: RRFBacklink[];
}

export interface RRFSearchResponse {
  query: string;
  count: number;
  results: RRFSearchResultItem[];
}

/**
 * Hybrid Reciprocal Rank Fusion (RRF) Search Engine:
 * Combines FTS5 BM25 lexical rank (with camelCase/snake_case identifier expansion),
 * PageRank topological centrality, and 1-Hop semantic neighborhood + bidirectional backlinks.
 */
export function hybridSearchRRF(
  db: Database,
  query: string,
  options: { limit?: number; k?: number } = {}
): RRFSearchResponse {
  const limit = options.limit ?? 10;
  const k = options.k ?? 60;

  // 1. Lexical FTS5 ranking
  const ftsCandidates = searchNodesFTS(db, query, Math.max(limit * 3, 30));
  if (ftsCandidates.length === 0) {
    return { query, count: 0, results: [] };
  }

  // 2. Sort a copy by PageRank + status priority for centrality rank
  const centralitySorted = [...ftsCandidates].sort((a, b) => {
    const scoreA = (a.pagerank_score || 0) + (a.depth_zone === 'abyssal' && a.status === 'active' ? 0.05 : 0);
    const scoreB = (b.pagerank_score || 0) + (b.depth_zone === 'abyssal' && b.status === 'active' ? 0.05 : 0);
    return scoreB - scoreA;
  });

  const lexicalRankMap = new Map<string, number>();
  ftsCandidates.forEach((n, idx) => lexicalRankMap.set(n.id, idx + 1));

  const centralityRankMap = new Map<string, number>();
  centralitySorted.forEach((n, idx) => centralityRankMap.set(n.id, idx + 1));

  // 3. Compute RRF Score: 1 / (k + rank_lexical) + 0.5 * (1 / (k + rank_centrality))
  const scored = ftsCandidates.map(node => {
    const rLex = lexicalRankMap.get(node.id) ?? 100;
    const rCent = centralityRankMap.get(node.id) ?? 100;
    let rrf = 1 / (k + rLex) + 0.5 * (1 / (k + rCent));

    // Penalize superseded nodes slightly so active replacement surfaces higher, while still keeping them discoverable
    if (node.status === 'superseded' || node.status === 'deprecated') {
      rrf *= 0.85;
    }

    return {
      node,
      rrf_score: Number(rrf.toFixed(6))
    };
  });

  scored.sort((a, b) => b.rrf_score - a.rrf_score);
  const topScored = scored.slice(0, limit);

  // 4. Enrich with 1-Hop Outgoing Relations, Bidirectional Backlinks, and Deprecation Warnings
  const results: RRFSearchResultItem[] = topScored.map(({ node, rrf_score }) => {
    const outgoingRaw = getOutgoingEdges(db, node.id);
    const incomingRaw = getIncomingEdges(db, node.id);

    const outgoing_relations = outgoingRaw.slice(0, 12).map(e => {
      const targetNode = getNodeById(db, e.target_id);
      return {
        target_id: e.target_id,
        target_name: targetNode?.name || e.target_id,
        relation: e.relation,
        confidence: e.confidence || 'EXTRACTED'
      };
    });

    const backlinks: RRFBacklink[] = incomingRaw.slice(0, 12).map(e => {
      const sourceNode = getNodeById(db, e.source_id);
      const inverseLabel = INVERSE_RELATIONS[e.relation] || e.relation;
      return {
        source_id: e.source_id,
        source_name: sourceNode?.name || e.source_id,
        relation: e.relation,
        inverse_relation: inverseLabel,
        snippet: e.context_snippet
      };
    });

    let deprecation_warning: string | undefined;
    const supersededByEdge = backlinks.find(b => b.inverse_relation === 'superseded_by');
    if (node.status === 'superseded' || supersededByEdge) {
      deprecation_warning = supersededByEdge
        ? `ATENCAO: Esta nota tem status 'superseded' e foi substituida por [[${supersededByEdge.source_id}]] (${supersededByEdge.source_name}).`
        : `ATENCAO: Esta nota tem status 'superseded' (arquitetura legada).`;
    } else if (node.status === 'stale') {
      deprecation_warning = `ATENCAO: Esta nota esta marcada como 'stale' (o codigo governado sofreu alteracoes).`;
    }

    const citation = node.file_path
      ? node.line_start && node.line_end
        ? `${node.file_path}:${node.line_start}-${node.line_end}`
        : node.file_path
      : node.id;

    return {
      node,
      rrf_score,
      citation,
      deprecation_warning,
      outgoing_relations,
      backlinks
    };
  });

  return {
    query,
    count: results.length,
    results
  };
}

