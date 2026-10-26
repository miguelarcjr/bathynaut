import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

export const CheckpointSchema = z.object({
  summary: z.string().describe('Resumo executivo do progresso alcancado no turno'),
  active_tasks: z.array(z.string()).describe('Lista de proximas tarefas imediatas'),
  decisions: z.array(z.string()).default([]).describe('Decisoes tomadas durante o turno')
});

export function handleCheckpoint(memoryRoot: string, args: z.infer<typeof CheckpointSchema>) {
  if (!fs.existsSync(memoryRoot)) {
    fs.mkdirSync(memoryRoot, { recursive: true });
  }

  const activeContextPath = path.join(memoryRoot, 'activeContext.md');
  const decisions = args.decisions || [];
  const activeTasks = args.active_tasks || [];

  const content = `# Estado Ativo da Sessao (Checkpoint)
> Ultima atualizacao: ${new Date().toISOString()}

## Resumo do Progresso
${args.summary}

## Proximas Tarefas Ativas
${activeTasks.map(t => `- [ ] ${t}`).join('\n')}

## Decisoes Recentes do Turno
${decisions.length > 0 ? decisions.map(d => `- ${d}`).join('\n') : '_Nenhuma decisao adicional registrada._'}
`;

  fs.writeFileSync(activeContextPath, content, 'utf-8');

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, checkpoint_file: activeContextPath, timestamp: new Date().toISOString() }, null, 2)
      }
    ]
  };
}
