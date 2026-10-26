import matter from 'gray-matter';
import { z } from 'zod';
import path from 'node:path';
import { NodeRecord, EdgeRecord } from '../../types.js';
import { extractTypedEdges } from './edges.js';

export const NoteFrontmatterSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  category: z.enum(['decisions', 'incidents', 'patterns', 'entities']).optional(),
  status: z.enum(['active', 'deprecated', 'superseded']).default('active'),
  applies_to: z.array(z.string()).or(z.string()).optional(),
  summary: z.string().optional(),
  updated_at: z.string().optional()
});

export interface ParsedZettelNote {
  node: NodeRecord;
  edges: EdgeRecord[];
  appliesTo: string[];
}

export function parseZettelkastenNote(filePath: string, fileContent: string): ParsedZettelNote {
  const { data, content } = matter(fileContent);
  const validated = NoteFrontmatterSchema.safeParse(data);
  const frontmatter: any = validated.success ? validated.data : (data || {});

  const fileStem = path.basename(filePath, path.extname(filePath));
  const id = frontmatter.id || fileStem;
  
  // Category resolution: frontmatter > folder name > 'decisions'
  const parentFolder = path.basename(path.dirname(filePath));
  const category = frontmatter.category || 
    (['decisions', 'incidents', 'patterns', 'entities'].includes(parentFolder) ? parentFolder : 'decisions');

  const appliesTo: string[] = frontmatter.applies_to 
    ? (Array.isArray(frontmatter.applies_to) ? frontmatter.applies_to : [frontmatter.applies_to])
    : [];

  const title = frontmatter.title || id;
  const summary = frontmatter.summary || content.slice(0, 160).replace(/[#*\r\n]/g, ' ').trim() || title;

  const node: NodeRecord = {
    id,
    depth_zone: 'abyssal',
    kind: category === 'decisions' ? 'adr' : (category === 'incidents' ? 'incident' : (category === 'patterns' ? 'pattern' : 'entity')),
    name: title,
    file_path: filePath,
    summary,
    status: frontmatter.status || 'active',
    applies_to_json: JSON.stringify(appliesTo),
    body_markdown: content.trim(),
    updated_at: frontmatter.updated_at || new Date().toISOString()
  };

  const edges = extractTypedEdges(id, data, content);

  return { node, edges, appliesTo };
}
