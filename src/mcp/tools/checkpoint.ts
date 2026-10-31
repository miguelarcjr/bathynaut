import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

export const CheckpointSchema = z.object({
  summary: z.string().describe('Executive summary of progress achieved during the session'),
  active_tasks: z.array(z.string()).describe('List of immediate next tasks'),
  decisions: z.array(z.string()).default([]).describe('Decisions made during the turn'),
  project_path: z.string().optional().describe('Optional repository path'),
  workspace_hint: z.string().optional().describe('Alias for project_path')
});

export function handleCheckpoint(memoryRoot: string, args: z.infer<typeof CheckpointSchema>) {
  if (!fs.existsSync(memoryRoot)) {
    fs.mkdirSync(memoryRoot, { recursive: true });
  }

  const activeContextPath = path.join(memoryRoot, 'activeContext.md');
  const decisions = args.decisions || [];
  const activeTasks = args.active_tasks || [];

  const content = `# Active Session State (Checkpoint)
> Last updated: ${new Date().toISOString()}

## Progress Summary
${args.summary}

## Next Active Tasks
${activeTasks.map(t => `- [ ] ${t}`).join('\n')}

## Recent Turn Decisions
${decisions.length > 0 ? decisions.map(d => `- ${d}`).join('\n') : '_No additional decisions recorded._'}
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
