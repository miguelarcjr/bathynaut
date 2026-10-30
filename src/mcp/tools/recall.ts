import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { hybridSearchRRF } from '../../storage/rrf-search.js';
import { packWithinTokenBudget, PackableExcerptItem } from '../../storage/token-packer.js';

export const RecallSchema = z.object({
  query: z.string().describe('Pergunta, simbolo ou conceito para buscar via Hybrid RRF (BM25 + PageRank + Backlinks)'),
  limit: z.number().default(10).describe('Numero maximo de resultados'),
  token_budget: z.number().default(2000).describe('Orcamento maximo de tokens para os trechos retornados'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio')
});

export function handleRecall(db: Database, args: z.infer<typeof RecallSchema>) {
  const rrfResponse = hybridSearchRRF(db, args.query, { limit: args.limit ?? 10 });

  const packable: PackableExcerptItem[] = rrfResponse.results.map((item, idx) => ({
    id: item.node.id,
    title: `${item.node.kind} ${item.node.name}`,
    citation: item.citation,
    signature: item.node.signature,
    snippet: item.node.body_markdown || item.node.code_excerpt || item.node.summary || '',
    priority: 100 - idx * 5
  }));

  const packed = packWithinTokenBudget(packable, args.token_budget ?? 2000);

  const enrichedResults = rrfResponse.results.map(item => ({
    ...item.node,
    rrf_score: item.rrf_score,
    citation: item.citation,
    deprecation_warning: item.deprecation_warning,
    outgoing_relations: item.outgoing_relations,
    backlinks: item.backlinks
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            query: args.query,
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
