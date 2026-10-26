import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { calculateBlastRadius } from '../../graph/blast-radius.js';

export const SonarSchema = z.object({
  files: z.array(z.string()).describe('Lista de caminhos de arquivos que serao editados ou analisados')
});

export function handleSonar(db: Database, args: z.infer<typeof SonarSchema>) {
  const blast = calculateBlastRadius(db, args.files);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(blast, null, 2)
      }
    ]
  };
}
