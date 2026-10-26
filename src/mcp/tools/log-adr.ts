import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { upsertNode, upsertEdge } from '../../storage/queries.js';

export const LogAdrSchema = z.object({
  title: z.string().describe('Titulo conciso da decisao arquitetural'),
  context: z.string().describe('Contexto e razao pela qual a decisao foi tomada'),
  decision: z.string().describe('A decisao tomada'),
  applies_to: z.array(z.string()).default([]).describe('Padroes de arquivos afetados por essa decisao (ex: ["src/routes/auth*"])'),
  supersedes: z.string().optional().describe('ID de ADR anterior que esta sendo substituida por esta'),
  mitigates: z.string().optional().describe('ID de incidente que esta decisao mitiga')
});

export function handleLogAdr(db: Database, memoryRoot: string, args: z.infer<typeof LogAdrSchema>) {
  const decisionsDir = path.join(memoryRoot, 'wiki', 'decisions');
  if (!fs.existsSync(decisionsDir)) {
    fs.mkdirSync(decisionsDir, { recursive: true });
  }

  // Count existing ADRs to generate number
  const existingFiles = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
  const adrNum = String(existingFiles.length + 1).padStart(3, '0');
  const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const adrId = `adr-${adrNum}-${slug}`;
  const filePath = path.join(decisionsDir, `${adrId}.md`);

  const appliesToYaml = args.applies_to.length > 0
    ? `\napplies_to:\n${args.applies_to.map(g => `  - "${g}"`).join('\n')}`
    : '';

  const supersedesYaml = args.supersedes ? `\nsupersedes: ${args.supersedes}` : '';

  const markdownContent = `---
id: ${adrId}
title: ${args.title}
category: decisions
status: active${appliesToYaml}${supersedesYaml}
updated_at: ${new Date().toISOString().split('T')[0]}
---

# ${args.title}

## Contexto
${args.context}

## Decisao
${args.decision}
${args.mitigates ? `\nmitigates:: [[${args.mitigates}]]` : ''}
${args.supersedes ? `\nsupersedes:: [[${args.supersedes}]]` : ''}
`;

  fs.writeFileSync(filePath, markdownContent, 'utf-8');

  // Insert into SQLite
  upsertNode(db, {
    id: adrId,
    depth_zone: 'abyssal',
    kind: 'adr',
    name: args.title,
    file_path: filePath,
    summary: args.decision.slice(0, 160),
    applies_to_json: JSON.stringify(args.applies_to),
    body_markdown: markdownContent
  });

  if (args.supersedes) {
    upsertEdge(db, {
      source_id: adrId,
      target_id: args.supersedes,
      relation: 'supersedes',
      confidence: 'EXTRACTED'
    });
    // Mark superseded node as superseded
    db.prepare("UPDATE nodes SET status = 'superseded' WHERE id = ?").run(args.supersedes);
  }

  if (args.mitigates) {
    upsertEdge(db, {
      source_id: adrId,
      target_id: args.mitigates,
      relation: 'mitigates',
      confidence: 'EXTRACTED'
    });
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, adr_id: adrId, file_path: filePath }, null, 2)
      }
    ]
  };
}
