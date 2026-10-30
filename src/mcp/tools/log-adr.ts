import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { upsertNode, upsertEdge, getAllNodes } from '../../storage/queries.js';
import { parseZettelkastenNote } from '../../parsers/markdown/zettelkasten.js';
import { interlinkCodeWithADRs } from '../../parsers/ast/interlink.js';
import { generateMOCIndex } from '../../parsers/markdown/scanner.js';

export const LogAdrSchema = z.object({
  title: z.string().describe('Titulo conciso da nota ou decisao arquitetural'),
  category: z.enum(['decisions', 'incidents', 'patterns', 'entities', 'architecture']).default('decisions').describe('Categoria da taxonomia CoALA'),
  context: z.string().describe('Contexto e razao pela qual a decisao/nota foi criada'),
  decision: z.string().describe('A decisao tomada ou especificacao detalhada'),
  enforcement: z.enum(['blocking', 'warning', 'advisory']).default('advisory').describe('Nivel de enforcement arquitetural'),
  invariants: z.array(z.string()).default([]).describe('Lista de invariantes verificaveis desta decisao'),
  applies_to: z.array(z.string()).default([]).describe('Padroes glob de arquivos afetados por essa decisao (ex: ["src/routes/auth*"])'),
  symbols: z.array(z.string()).default([]).describe('Simbolos de codigo explicitamente governados (ex: ["checkQuota", "AuthService"])'),
  supersedes: z.string().optional().describe('ID de ADR anterior que esta sendo substituida por esta'),
  mitigates: z.string().optional().describe('ID de incidente que esta decisao mitiga'),
  caused_by: z.string().optional().describe('ID de causa raiz se for um incidente'),
  depends_on: z.string().optional().describe('ID de nota da qual esta depende'),
  implements: z.string().optional().describe('ID de padrao ou arquitetura que esta nota implementa'),
  tensions_with: z.string().optional().describe('ID de nota com trade-off ou tensao arquitetural'),
  verified_by: z.string().optional().describe('ID ou suite de testes que verifica este invariante'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio')
});

const CATEGORY_PREFIX: Record<string, string> = {
  decisions: 'adr',
  incidents: 'inc',
  patterns: 'pat',
  entities: 'ent',
  architecture: 'arch'
};

export function handleLogAdr(db: Database, memoryRoot: string, args: z.infer<typeof LogAdrSchema>) {
  const category = args.category || 'decisions';
  const categoryDir = path.join(memoryRoot, 'wiki', category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const existingFiles = fs.readdirSync(categoryDir).filter(f => f.endsWith('.md'));
  const num = String(existingFiles.length + 1).padStart(3, '0');
  const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const prefix = CATEGORY_PREFIX[category] || 'adr';
  const noteId = `${prefix}-${num}-${slug}`;
  const filePath = path.join(categoryDir, `${noteId}.md`);

  const appliesToYaml = args.applies_to.length > 0
    ? `\napplies_to:\n${args.applies_to.map(g => `  - "${g}"`).join('\n')}`
    : '';
  const symbolsYaml = args.symbols.length > 0
    ? `\nsymbols:\n${args.symbols.map(s => `  - "${s}"`).join('\n')}`
    : '';
  const invariantsYaml = args.invariants.length > 0
    ? `\ninvariants:\n${args.invariants.map(i => `  - "${i.replace(/"/g, '\\"')}"`).join('\n')}`
    : '';
  const supersedesYaml = args.supersedes ? `\nsupersedes: ${args.supersedes}` : '';

  const typedRelationsLines: string[] = [];
  if (args.mitigates) typedRelationsLines.push(`mitigates:: [[${args.mitigates}]]`);
  if (args.supersedes) typedRelationsLines.push(`supersedes:: [[${args.supersedes}]]`);
  if (args.caused_by) typedRelationsLines.push(`caused_by:: [[${args.caused_by}]]`);
  if (args.depends_on) typedRelationsLines.push(`depends_on:: [[${args.depends_on}]]`);
  if (args.implements) typedRelationsLines.push(`implements:: [[${args.implements}]]`);
  if (args.tensions_with) typedRelationsLines.push(`tensions_with:: [[${args.tensions_with}]]`);
  if (args.verified_by) typedRelationsLines.push(`verified_by:: [[${args.verified_by}]]`);

  const markdownContent = `---
id: ${noteId}
title: ${args.title}
category: ${category}
status: active
enforcement: ${args.enforcement || 'advisory'}${appliesToYaml}${symbolsYaml}${invariantsYaml}${supersedesYaml}
updated_at: ${new Date().toISOString().split('T')[0]}
---

# ${args.title}

## Contexto
${args.context}

## Decisao
${args.decision}
${typedRelationsLines.length > 0 ? '\n' + typedRelationsLines.join('\n') : ''}
`;

  fs.writeFileSync(filePath, markdownContent, 'utf-8');

  const parsedNote = parseZettelkastenNote(filePath, markdownContent);
  upsertNode(db, parsedNote.node);

  for (const edge of parsedNote.edges) {
    upsertEdge(db, edge);
    if (edge.relation === 'supersedes') {
      db.prepare("UPDATE nodes SET status = 'superseded' WHERE id = ?").run(edge.target_id);
    }
  }

  // Auto-Interlink immediately against all existing code nodes in SQLite
  const codeNodes = getAllNodes(db).filter(n => n.depth_zone !== 'abyssal' && n.id !== noteId);
  const interlinkedEdges = interlinkCodeWithADRs(codeNodes, [parsedNote]);
  for (const edge of interlinkedEdges) {
    upsertEdge(db, edge);
  }

  // Regenerate MOC index.md automatically
  try {
    generateMOCIndex(memoryRoot, db);
  } catch {}

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            adr_id: noteId,
            category,
            enforcement: args.enforcement || 'advisory',
            file_path: filePath,
            interlinked_edges: interlinkedEdges.length
          },
          null,
          2
        )
      }
    ]
  };
}
