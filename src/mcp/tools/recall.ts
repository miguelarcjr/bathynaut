import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { hybridSearchRRF, RRFSearchResultItem } from '../../storage/rrf-search.js';
import { packWithinTokenBudget, PackableExcerptItem } from '../../storage/token-packer.js';
import { getNodeById, getOutgoingEdges, getIncomingEdges } from '../../storage/queries.js';
import { INVERSE_RELATIONS } from '../../parsers/markdown/edges.js';
import { initDatabase, getDatabasePath } from '../../storage/db.js';
import { NodeKind } from '../../types.js';

export const RecallSchema = z.object({
  query: z.string().optional().describe('Pergunta, simbolo ou conceito para buscar via Hybrid RRF (BM25 + PageRank + Backlinks)'),
  ids: z.array(z.string()).optional().describe('Leitura direta em lote de notas/simbolos especificos pelo ID (paridade wiki_read_compiled)'),
  category: z.enum(['decisions', 'incidents', 'patterns', 'entities', 'architecture']).optional().describe('Filtro opcional por categoria CoALA'),
  include_superseded: z.boolean().default(true).describe('Incluir notas substituidas/depreciadas nos resultados'),
  cross_repo: z.boolean().default(false).describe('Buscar federadamente em todos os repositorios registrados no Bathynaut'),
  limit: z.number().default(10).describe('Numero maximo de resultados'),
  token_budget: z.number().default(2000).describe('Orcamento maximo de tokens para os trechos retornados'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio'),
  workspace_hint: z.string().optional().describe('Alias para project_path')
});

const CATEGORY_TO_KIND: Record<string, NodeKind> = {
  decisions: 'adr',
  incidents: 'incident',
  patterns: 'pattern',
  entities: 'entity',
  architecture: 'architecture'
};

function enrichSingleNode(db: Database, nodeId: string): RRFSearchResultItem | null {
  const node = getNodeById(db, nodeId);
  if (!node) return null;

  const outgoingRaw = getOutgoingEdges(db, node.id);
  const incomingRaw = getIncomingEdges(db, node.id);

  const outgoing_relations = outgoingRaw.map(e => {
    const targetNode = getNodeById(db, e.target_id);
    return {
      target_id: e.target_id,
      target_name: targetNode?.name || e.target_id,
      relation: e.relation,
      confidence: e.confidence || 'EXTRACTED'
    };
  });

  const backlinks = incomingRaw.map(e => {
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
    rrf_score: 1.0,
    citation,
    deprecation_warning,
    outgoing_relations,
    backlinks
  };
}

export function handleRecall(db: Database, args: z.infer<typeof RecallSchema>) {
  let rawItems: RRFSearchResultItem[] = [];

  // Mode 1: Direct batch read by IDs (wiki_read_compiled parity)
  if (args.ids && args.ids.length > 0) {
    for (const id of args.ids) {
      const item = enrichSingleNode(db, id);
      if (item) rawItems.push(item);
    }
  } else if (args.query) {
    // Mode 2: Hybrid RRF Search (with optional cross_repo federation)
    const rrfResponse = hybridSearchRRF(db, args.query, { limit: (args.limit ?? 10) * 2 });
    rawItems.push(...rrfResponse.results);

    if (args.cross_repo) {
      try {
        const registryPath = path.join(os.homedir(), '.bathynaut', 'registry.json');
        if (fs.existsSync(registryPath)) {
          const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
          const seenIds = new Set(rawItems.map(i => i.node.id));
          for (const proj of reg.projects || []) {
            const otherDbPath = getDatabasePath(proj.path);
            if (fs.existsSync(otherDbPath)) {
              const otherDb = initDatabase(otherDbPath);
              try {
                const otherRes = hybridSearchRRF(otherDb, args.query, { limit: 5 });
                for (const item of otherRes.results) {
                  if (!seenIds.has(item.node.id)) {
                    seenIds.add(item.node.id);
                    rawItems.push(item);
                  }
                }
              } finally {
                otherDb.close();
              }
            }
          }
        }
      } catch {}
    }
  }

  // Apply category and include_superseded filters
  if (args.category) {
    const targetKind = CATEGORY_TO_KIND[args.category];
    rawItems = rawItems.filter(item => item.node.kind === targetKind);
  }

  if (args.include_superseded === false) {
    rawItems = rawItems.filter(item => item.node.status !== 'superseded' && item.node.status !== 'deprecated');
  }

  rawItems = rawItems.slice(0, args.limit ?? 10);

  const packable: PackableExcerptItem[] = rawItems.map((item, idx) => ({
    id: item.node.id,
    title: `${item.node.kind} ${item.node.name}`,
    citation: item.citation,
    signature: item.node.signature,
    snippet: item.node.body_markdown || item.node.code_excerpt || item.node.summary || '',
    priority: 100 - idx * 5
  }));

  const packed = packWithinTokenBudget(packable, args.token_budget ?? 2000);

  const enrichedResults = rawItems.map(item => ({
    ...item.node,
    rrf_score: item.rrf_score,
    citation: item.citation,
    deprecation_warning: item.deprecation_warning,
    outgoing_relations: item.outgoing_relations,
    backlinks: item.backlinks,
    inbound_backlinks: item.backlinks
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            query: args.query || (args.ids ? `ids:[${args.ids.join(',')}]` : ''),
            count: enrichedResults.length,
            token_budget: packed.tokenBudget,
            used_tokens: packed.usedTokens,
            results: enrichedResults,
            matches: enrichedResults,
            excerpts: packed.included
          },
          null,
          2
        )
      }
    ]
  };
}
