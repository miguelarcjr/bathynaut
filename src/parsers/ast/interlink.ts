import { minimatch } from 'minimatch';
import { NodeRecord, EdgeRecord } from '../../types.js';
import { ParsedZettelNote } from '../markdown/zettelkasten.js';

/**
 * Connects physical code AST nodes to Zettelkasten ADR nodes via applies_to glob patterns.
 * If ADR-001 declares applies_to: ["src/routes/auth*"], all nodes whose file_path matches
 * receive a 'governed_by' edge pointing to the ADR, and the ADR receives an 'implements' edge.
 */
export function interlinkCodeWithADRs(
  codeNodes: NodeRecord[],
  adrNotes: ParsedZettelNote[]
): EdgeRecord[] {
  const interlinkEdges: EdgeRecord[] = [];
  const seen = new Set<string>();

  for (const adr of adrNotes) {
    if (adr.appliesTo.length === 0) continue;

    for (const codeNode of codeNodes) {
      if (!codeNode.file_path) continue;
      const normalizedPath = codeNode.file_path.replace(/\\/g, '/');

      const matches = adr.appliesTo.some(pattern => {
        const normalizedPattern = pattern.replace(/\\/g, '/');
        return minimatch(normalizedPath, normalizedPattern, { matchBase: true }) ||
               normalizedPath.includes(normalizedPattern.replace(/\*/g, ''));
      });

      if (matches) {
        const key = `${codeNode.id}->governed_by->${adr.node.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          interlinkEdges.push({
            source_id: codeNode.id,
            target_id: adr.node.id,
            relation: 'governed_by',
            confidence: 'INFERRED',
            weight: 1.0,
            context_snippet: `Escopo correspondente: ${adr.appliesTo.join(', ')}`
          });
        }
      }
    }
  }

  return interlinkEdges;
}
