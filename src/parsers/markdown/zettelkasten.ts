import matter from 'gray-matter';
import { z } from 'zod';
import path from 'node:path';
import { NodeRecord, EdgeRecord, EnforcementLevel, NodeKind, NoteStatus } from '../../types.js';
import { extractTypedEdges } from './edges.js';

export const COALA_CATEGORIES = ['decisions', 'incidents', 'patterns', 'entities', 'architecture'] as const;
export type CoalaCategory = (typeof COALA_CATEGORIES)[number];

export const NoteFrontmatterSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  category: z.enum(COALA_CATEGORIES).optional(),
  status: z.enum(['active', 'proposed', 'deprecated', 'superseded', 'stale']).default('active'),
  enforcement: z.enum(['blocking', 'warning', 'advisory']).default('advisory'),
  applies_to: z.array(z.string()).or(z.string()).optional(),
  symbols: z.array(z.string()).or(z.string()).optional(),
  invariants: z.array(z.string()).or(z.string()).optional(),
  sources: z.array(z.string()).or(z.string()).optional(),
  summary: z.string().optional(),
  updated_at: z.string().optional()
});

export interface ParsedZettelNote {
  node: NodeRecord;
  edges: EdgeRecord[];
  appliesTo: string[];
  symbols: string[];
  invariants: string[];
  sources: string[];
  category: CoalaCategory;
}

function categoryToNodeKind(category: CoalaCategory): NodeKind {
  switch (category) {
    case 'decisions':
      return 'adr';
    case 'incidents':
      return 'incident';
    case 'patterns':
      return 'pattern';
    case 'architecture':
      return 'architecture';
    case 'entities':
    default:
      return 'entity';
  }
}

function toStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  if (typeof val === 'string') return [val.trim()].filter(Boolean);
  return [];
}

function parseMatterSafe(fileContent: string): { data: Record<string, any>; content: string } {
  try {
    return matter(fileContent);
  } catch {
    // Auto-heal unquoted colons in YAML frontmatter (e.g., legacy zk-wiki notes with `summary: Foo: Bar`)
    const healed = fileContent.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_, yamlBlock: string) => {
      const fixedLines = yamlBlock.split(/\r?\n/).map(line => {
        const match = line.match(/^(\s*(?:title|summary)\s*:\s*)(.+)$/);
        if (match) {
          const val = match[2].trim();
          if (!val.startsWith('"') && !val.startsWith("'") && val.includes(':')) {
            return `${match[1]}${JSON.stringify(val)}`;
          }
        }
        return line;
      });
      return `---\n${fixedLines.join('\n')}\n---`;
    });
    try {
      return matter(healed);
    } catch {
      const stripped = fileContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      return { data: {}, content: stripped };
    }
  }
}

export function parseZettelkastenNote(filePath: string, fileContent: string): ParsedZettelNote {
  const { data, content } = parseMatterSafe(fileContent);
  const validated = NoteFrontmatterSchema.safeParse(data);
  const frontmatter: any = validated.success ? { ...data, ...validated.data } : (data || {});

  const fileStem = path.basename(filePath, path.extname(filePath));
  const id = frontmatter.id || fileStem;

  const parentFolder = path.basename(path.dirname(filePath)).toLowerCase();
  const category: CoalaCategory = COALA_CATEGORIES.includes(frontmatter.category)
    ? frontmatter.category
    : (COALA_CATEGORIES.includes(parentFolder as CoalaCategory) ? (parentFolder as CoalaCategory) : 'decisions');

  const appliesTo = toStringArray(frontmatter.applies_to);
  const symbols = toStringArray(frontmatter.symbols);
  const invariants = toStringArray(frontmatter.invariants);
  const sources = toStringArray(frontmatter.sources);

  const enforcement: EnforcementLevel = ['blocking', 'warning', 'advisory'].includes(frontmatter.enforcement)
    ? frontmatter.enforcement
    : 'advisory';

  const status: NoteStatus = ['active', 'proposed', 'deprecated', 'superseded', 'stale'].includes(frontmatter.status)
    ? frontmatter.status
    : 'active';

  const title = frontmatter.title || id;
  const summary = frontmatter.summary || content.slice(0, 180).replace(/[#*\r\n]/g, ' ').trim() || title;

  const node: NodeRecord = {
    id,
    depth_zone: 'abyssal',
    kind: categoryToNodeKind(category),
    name: title,
    file_path: filePath,
    summary,
    status,
    enforcement,
    applies_to_json: JSON.stringify(appliesTo),
    symbols_json: JSON.stringify(symbols),
    invariants_json: JSON.stringify(invariants),
    sources_json: JSON.stringify(sources),
    body_markdown: content.trim(),
    updated_at: frontmatter.updated_at || new Date().toISOString().split('T')[0]
  };

  const edges = extractTypedEdges(id, data || {}, content);

  return {
    node,
    edges,
    appliesTo,
    symbols,
    invariants,
    sources,
    category
  };
}
