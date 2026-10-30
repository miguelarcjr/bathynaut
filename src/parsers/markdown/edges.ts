import { EdgeRecord, RelationType } from '../../types.js';

export const TYPED_RELATIONS: RelationType[] = [
  'supersedes',
  'mitigates',
  'caused_by',
  'depends_on',
  'implements',
  'tensions_with',
  'verified_by',
  'governed_by'
];

export const INVERSE_RELATIONS: Record<string, string> = {
  supersedes: 'superseded_by',
  mitigates: 'mitigated_by',
  caused_by: 'caused_incident',
  depends_on: 'required_by',
  implements: 'implemented_by',
  verified_by: 'verifies',
  mentions: 'mentioned_in',
  tensions_with: 'tensions_with',
  shares_scope_with: 'shares_scope_with',
  governed_by: 'governs'
};

const RELATION_WEIGHTS: Record<string, number> = {
  supersedes: 1.0,
  mitigates: 1.0,
  caused_by: 1.0,
  governed_by: 1.0,
  depends_on: 0.9,
  implements: 0.9,
  verified_by: 0.9,
  tensions_with: 0.8,
  mentions: 0.5,
  shares_scope_with: 0.4
};

/**
 * Extracts typed semantic edges and generic [[wikilink]] mentions from a Zettelkasten note.
 */
export function extractTypedEdges(
  sourceId: string,
  frontmatter: Record<string, any>,
  body: string
): EdgeRecord[] {
  const edges: EdgeRecord[] = [];
  const seen = new Set<string>();

  const addEdge = (targetRaw: string, relation: RelationType, snippet: string, customWeight?: number) => {
    const cleanTarget = String(targetRaw).replace(/[\[\]]/g, '').split('|')[0].trim();
    if (!cleanTarget || cleanTarget === sourceId) return;
    const key = `${sourceId}->${relation}->${cleanTarget}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push({
        source_id: sourceId,
        target_id: cleanTarget,
        relation,
        confidence: 'EXTRACTED',
        weight: customWeight ?? RELATION_WEIGHTS[relation] ?? 1.0,
        context_snippet: snippet.slice(0, 240)
      });
    }
  };

  // 1. Structured frontmatter.edges object (e.g., edges: { supersedes: ["adr-001"], tensions_with: ["pat-02"] })
  if (frontmatter && typeof frontmatter.edges === 'object' && frontmatter.edges !== null) {
    for (const rel of TYPED_RELATIONS) {
      const val = frontmatter.edges[rel];
      if (!val) continue;
      const list = Array.isArray(val) ? val : [val];
      for (const target of list) {
        addEdge(target, rel, `Declarado em frontmatter (edges.${rel})`, 1.0);
      }
    }
  }

  // 2. Top-level frontmatter fields (supersedes, depends_on, mitigates, tensions_with, caused_by, verified_by, implements)
  for (const rel of TYPED_RELATIONS) {
    const val = frontmatter?.[rel];
    if (!val) continue;
    const list = Array.isArray(val) ? val : [val];
    for (const target of list) {
      addEdge(target, rel, `Declarado em frontmatter (${rel})`, 1.0);
    }
  }

  // 3. Line-by-line body parsing for typed relations and generic [[mentions]]
  const lines = body.split(/\r?\n/);
  const typedInlineRegex = /\b(supersedes|mitigates|caused_by|depends_on|implements|tensions_with|verified_by|governed_by)::\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gi;
  const genericWikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

  for (const rawLine of lines) {
    const cleanLine = rawLine.replace(/^[-*>\s#]+/, '').trim();
    if (!cleanLine) continue;

    const matchedTargetsInLine = new Set<string>();
    let match: RegExpExecArray | null;

    typedInlineRegex.lastIndex = 0;
    while ((match = typedInlineRegex.exec(cleanLine)) !== null) {
      const relation = match[1].toLowerCase() as RelationType;
      const targetId = match[2].trim();
      matchedTargetsInLine.add(targetId);
      addEdge(targetId, relation, cleanLine);
    }

    genericWikilinkRegex.lastIndex = 0;
    while ((match = genericWikilinkRegex.exec(cleanLine)) !== null) {
      const targetId = match[1].trim();
      if (!matchedTargetsInLine.has(targetId)) {
        addEdge(targetId, 'mentions', cleanLine, 0.5);
      }
    }
  }

  return edges;
}
