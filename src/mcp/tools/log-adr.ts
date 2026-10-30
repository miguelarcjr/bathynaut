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
  id: z.string().regex(/^[a-z0-9-]+$/).optional().describe('Optional declarative kebab-case ID to create or recompile an existing note (e.g., adr-001-auth-jwt)'),
  title: z.string().describe('Concise title of the note or architectural decision'),
  summary: z.string().max(240).optional().describe('Short summary (up to 180 chars) for index.md'),
  category: z.enum(['decisions', 'incidents', 'patterns', 'entities', 'architecture']).default('decisions').describe('CoALA taxonomy category'),
  context: z.string().optional().default('').describe('Context and rationale for why this decision/note was created'),
  decision: z.string().optional().default('').describe('The decision taken or detailed technical specification'),
  body_markdown: z.string().max(6000).optional().describe('Optional full Markdown body (alternative to context + decision)'),
  enforcement: z.enum(['blocking', 'warning', 'advisory']).default('advisory').describe('Architectural enforcement level'),
  invariants: z.array(z.string()).default([]).describe('List of verifiable invariants for this decision'),
  applies_to: z.array(z.string()).default([]).describe('File scope glob patterns governed by this decision (e.g., ["src/routes/auth*"])'),
  symbols: z.array(z.string()).default([]).describe('Code symbols explicitly governed (e.g., ["checkQuota", "AuthService"])'),
  sources: z.array(z.string()).default([]).describe('Raw sources in raw/ or docs compiled by this note (e.g., ["raw/rfc-001.md"])'),
  edges: z.object({
    supersedes: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    implements: z.array(z.string()).default([]),
    mitigates: z.array(z.string()).default([]),
    tensions_with: z.array(z.string()).default([]),
    caused_by: z.array(z.string()).default([]),
    verified_by: z.array(z.string()).default([])
  }).optional(),
  supersedes: EdgeListOrString.describe('ID(s) of previous ADR(s) superseded by this note'),
  mitigates: EdgeListOrString.describe('ID(s) of incident(s) mitigated by this decision'),
  caused_by: EdgeListOrString.describe('ID(s) of root cause(s) if this is an incident'),
  depends_on: EdgeListOrString.describe('ID(s) of note(s) this note depends on'),
  implements: EdgeListOrString.describe('ID(s) of pattern(s) or architecture implemented by this note'),
  tensions_with: EdgeListOrString.describe('ID(s) of note(s) with trade-off or architectural tension'),
  verified_by: EdgeListOrString.describe('ID(s) or test suite verifying this invariant'),
  project_path: z.string().optional().describe('Optional repository path'),
  workspace_hint: z.string().optional().describe('Alias for project_path')
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
    : `# ${args.title}\n\n## Context\n${args.context}\n\n## Decision\n${args.decision}${typedRelationsLines.length > 0 ? '\n\n' + typedRelationsLines.join('\n') : ''}`;

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
