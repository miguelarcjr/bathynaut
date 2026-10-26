import { EdgeRecord, RelationType } from '../../types.js';

export const TYPED_RELATIONS: RelationType[] = [
  'mitigates',
  'depends_on',
  'supersedes',
  'implements',
  'governed_by'
];

/**
 * Extracts typed semantic edges from markdown body using the pattern:
 * relation:: [[target_id]] or relation:: [[target_id|Label]]
 */
export function extractTypedEdges(sourceId: string, frontmatter: Record<string, any>, body: string): EdgeRecord[] {
  const edges: EdgeRecord[] = [];
  const seen = new Set<string>();

  // 1. Frontmatter relations (e.g. supersedes: "adr-001" or supersedes: ["adr-001"])
  if (frontmatter.supersedes) {
    const list = Array.isArray(frontmatter.supersedes) ? frontmatter.supersedes : [frontmatter.supersedes];
    for (const target of list) {
      const cleanTarget = String(target).replace(/[\[\]]/g, '').trim();
      if (cleanTarget) {
        const key = `${sourceId}->supersedes->${cleanTarget}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            source_id: sourceId,
            target_id: cleanTarget,
            relation: 'supersedes',
            confidence: 'EXTRACTED',
            weight: 1.0,
            context_snippet: 'Declarado em frontmatter (supersedes)'
          });
        }
      }
    }
  }

  if (frontmatter.depends_on) {
    const list = Array.isArray(frontmatter.depends_on) ? frontmatter.depends_on : [frontmatter.depends_on];
    for (const target of list) {
      const cleanTarget = String(target).replace(/[\[\]]/g, '').trim();
      if (cleanTarget) {
        const key = `${sourceId}->depends_on->${cleanTarget}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            source_id: sourceId,
            target_id: cleanTarget,
            relation: 'depends_on',
            confidence: 'EXTRACTED',
            weight: 1.0,
            context_snippet: 'Declarado em frontmatter (depends_on)'
          });
        }
      }
    }
  }

  // 2. Inline regex pattern: (mitigates|depends_on|supersedes|implements)::\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]
  const regex = /(mitigates|depends_on|supersedes|implements|governed_by)::\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const relation = match[1].toLowerCase() as RelationType;
    const targetId = match[2].trim();
    const key = `${sourceId}->${relation}->${targetId}`;

    if (!seen.has(key)) {
      seen.add(key);
      const lineStart = Math.max(0, body.lastIndexOf('\n', match.index));
      const lineEnd = body.indexOf('\n', match.index + match[0].length);
      const snippet = body.substring(lineStart, lineEnd !== -1 ? lineEnd : body.length).trim();

      edges.push({
        source_id: sourceId,
        target_id: targetId,
        relation,
        confidence: 'EXTRACTED',
        weight: 1.0,
        context_snippet: snippet
      });
    }
  }

  return edges;
}
