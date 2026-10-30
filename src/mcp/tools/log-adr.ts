import { Database } from 'better-sqlite3';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { upsertNode, upsertEdge, getAllNodes } from '../../storage/queries.js';
import { parseZettelkastenNote } from '../../parsers/markdown/zettelkasten.js';
import { interlinkCodeWithADRs } from '../../parsers/ast/interlink.js';
import { generateMOCIndex } from '../../parsers/markdown/scanner.js';

const EdgeListOrString = z.union([z.string(), z.array(z.string())]).optional();

export const LogAdrSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional().describe('ID declarativo opcional em kebab-case para criar ou recompilar uma nota existente (ex: adr-001-auth-jwt)'),
  title: z.string().describe('Titulo conciso da nota ou decisao arquitetural'),
  summary: z.string().max(240).optional().describe('Resumo de ate 180 caracteres para o index.md'),
  category: z.enum(['decisions', 'incidents', 'patterns', 'entities', 'architecture']).default('decisions').describe('Categoria da taxonomia CoALA'),
  context: z.string().optional().default('').describe('Contexto e razao pela qual a decisao/nota foi criada'),
  decision: z.string().optional().default('').describe('A decisao tomada ou especificacao detalhada'),
  body_markdown: z.string().max(6000).optional().describe('Corpo completo opcional em Markdown (alternativa a context + decision)'),
  enforcement: z.enum(['blocking', 'warning', 'advisory']).default('advisory').describe('Nivel de enforcement arquitetural'),
  invariants: z.array(z.string()).default([]).describe('Lista de invariantes verificaveis desta decisao'),
  applies_to: z.array(z.string()).default([]).describe('Padroes glob de arquivos afetados por essa decisao (ex: ["src/routes/auth*"])'),
  symbols: z.array(z.string()).default([]).describe('Simbolos de codigo explicitamente governados (ex: ["checkQuota", "AuthService"])'),
  sources: z.array(z.string()).default([]).describe('Fontes brutas em raw/ ou docs compiladas por esta nota (ex: ["raw/rfc-001.md"])'),
  edges: z.object({
    supersedes: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    implements: z.array(z.string()).default([]),
    mitigates: z.array(z.string()).default([]),
    tensions_with: z.array(z.string()).default([]),
    caused_by: z.array(z.string()).default([]),
    verified_by: z.array(z.string()).default([])
  }).optional(),
  supersedes: EdgeListOrString.describe('ID(s) de ADR anterior substituida por esta'),
  mitigates: EdgeListOrString.describe('ID(s) de incidente que esta decisao mitiga'),
  caused_by: EdgeListOrString.describe('ID(s) de causa raiz se for um incidente'),
  depends_on: EdgeListOrString.describe('ID(s) de nota da qual esta depende'),
  implements: EdgeListOrString.describe('ID(s) de padrao ou arquitetura que esta nota implementa'),
  tensions_with: EdgeListOrString.describe('ID(s) de nota com trade-off ou tensao arquitetural'),
  verified_by: EdgeListOrString.describe('ID(s) ou suite de testes que verifica este invariante'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio'),
  workspace_hint: z.string().optional().describe('Alias para project_path')
});

const CATEGORY_PREFIX: Record<string, string> = {
  decisions: 'adr',
  incidents: 'inc',
  patterns: 'pat',
  entities: 'ent',
  architecture: 'arch'
};

function normalizeEdgeArray(a?: string | string[], b?: string[]): string[] {
  const set = new Set<string>();
  if (Array.isArray(a)) a.forEach(x => x && set.add(x.trim()));
  else if (typeof a === 'string' && a.trim()) set.add(a.trim());
  if (Array.isArray(b)) b.forEach(x => x && set.add(x.trim()));
  return Array.from(set);
}

export function handleLogAdr(db: Database, memoryRoot: string, rawInput: z.input<typeof LogAdrSchema>) {
  const args = LogAdrSchema.parse(rawInput);
  const category = args.category || 'decisions';
  const categoryDir = path.join(memoryRoot, 'wiki', category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  let noteId = args.id;
  if (!noteId) {
    const existingFiles = fs.readdirSync(categoryDir).filter(f => f.endsWith('.md'));
    const num = String(existingFiles.length + 1).padStart(3, '0');
    const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const prefix = CATEGORY_PREFIX[category] || 'adr';
    noteId = `${prefix}-${num}-${slug}`;
  }

  const filePath = path.join(categoryDir, `${noteId}.md`);
  const today = new Date().toISOString().split('T')[0];

  const mergedEdges = {
    supersedes: normalizeEdgeArray(args.supersedes, args.edges?.supersedes),
    mitigates: normalizeEdgeArray(args.mitigates, args.edges?.mitigates),
    caused_by: normalizeEdgeArray(args.caused_by, args.edges?.caused_by),
    depends_on: normalizeEdgeArray(args.depends_on, args.edges?.depends_on),
    implements: normalizeEdgeArray(args.implements, args.edges?.implements),
    tensions_with: normalizeEdgeArray(args.tensions_with, args.edges?.tensions_with),
    verified_by: normalizeEdgeArray(args.verified_by, args.edges?.verified_by)
  };

  const typedRelationsLines: string[] = [];
  for (const [rel, targets] of Object.entries(mergedEdges)) {
    for (const t of targets) {
      typedRelationsLines.push(`${rel}:: [[${t}]]`);
    }
  }

  const summaryText = (args.summary || args.decision || args.context || args.title)
    .replace(/\r?\n/g, ' ')
    .trim()
    .slice(0, 180);

  const bodyText = args.body_markdown
    ? `${args.body_markdown.trim()}${typedRelationsLines.length > 0 ? '\n\n' + typedRelationsLines.join('\n') : ''}`
    : `# ${args.title}\n\n## Contexto\n${args.context}\n\n## Decisao\n${args.decision}${typedRelationsLines.length > 0 ? '\n\n' + typedRelationsLines.join('\n') : ''}`;

  const frontmatterObj: Record<string, any> = {
    id: noteId,
    title: args.title,
    summary: summaryText,
    category,
    status: 'active',
    enforcement: args.enforcement || 'advisory',
    updated_at: today
  };

  if (args.applies_to.length > 0) frontmatterObj.applies_to = args.applies_to;
  if (args.symbols.length > 0) frontmatterObj.symbols = args.symbols;
  if (args.invariants.length > 0) frontmatterObj.invariants = args.invariants;
  if (args.sources.length > 0) frontmatterObj.sources = args.sources;

  const nonEmptyEdges: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(mergedEdges)) {
    if (v.length > 0) nonEmptyEdges[k] = v;
  }
  if (Object.keys(nonEmptyEdges).length > 0) {
    frontmatterObj.edges = nonEmptyEdges;
  }

  const markdownContent = matter.stringify(bodyText, frontmatterObj);
  fs.writeFileSync(filePath, markdownContent, 'utf-8');

  // Remove old outgoing edges if recompiling an existing note ID
  db.prepare('DELETE FROM edges WHERE source_id = ?').run(noteId);

  const parsedNote = parseZettelkastenNote(filePath, markdownContent);
  upsertNode(db, parsedNote.node);

  // Physical file mutation + SQLite update for superseded notes (ZK-Wiki parity)
  const supersededMarked: string[] = [];
  for (const edge of parsedNote.edges) {
    upsertEdge(db, edge);
    if (edge.relation === 'supersedes') {
      const oldId = edge.target_id;
      db.prepare("UPDATE nodes SET status = 'superseded' WHERE id = ?").run(oldId);

      const oldNode = db.prepare('SELECT file_path FROM nodes WHERE id = ?').get(oldId) as { file_path: string | null } | undefined;
      let oldFilePath = oldNode?.file_path;
      if (oldFilePath && !path.isAbsolute(oldFilePath)) {
        const candidate1 = path.resolve(memoryRoot, oldFilePath);
        const candidate2 = path.resolve(path.dirname(path.dirname(memoryRoot)), oldFilePath);
        oldFilePath = fs.existsSync(candidate1) ? candidate1 : candidate2;
      }

      if (oldFilePath && fs.existsSync(oldFilePath)) {
        try {
          const oldRaw = fs.readFileSync(oldFilePath, 'utf-8');
          const parsedOld = matter(oldRaw);
          parsedOld.data.status = 'superseded';
          parsedOld.data.superseded_by = noteId;
          parsedOld.data.updated_at = today;
          const updatedOldMd = matter.stringify(parsedOld.content, parsedOld.data);
          fs.writeFileSync(oldFilePath, updatedOldMd, 'utf-8');
          supersededMarked.push(oldId);
        } catch {}
      } else {
        supersededMarked.push(oldId);
      }
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
            status: 'compiled_and_indexed',
            adr_id: noteId,
            id: noteId,
            category,
            enforcement: args.enforcement || 'advisory',
            file_path: filePath,
            superseded_marked: supersededMarked,
            interlinked_edges: interlinkedEdges.length
          },
          null,
          2
        )
      }
    ]
  };
}
