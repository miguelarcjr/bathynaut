import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { searchNodesFTS } from '../../storage/queries.js';

export const RecallSchema = z.object({
  query: z.string().describe('Pergunta ou conceito para buscar na memoria causal e no codigo'),
  limit: z.number().default(10).describe('Numero maximo de resultados')
});

export function handleRecall(db: Database, args: z.infer<typeof RecallSchema>) {
  const results = searchNodesFTS(db, args.query, args.limit);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ query: args.query, count: results.length, matches: results }, null, 2)
      }
    ]
  };
}
