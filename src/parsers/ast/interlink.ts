import { minimatch } from 'minimatch';
import { NodeRecord, EdgeRecord } from '../../types.js';
import { ParsedZettelNote } from '../markdown/zettelkasten.js';

/**
 * Triple-Anchoring Engine connecting physical code AST nodes to Zettelkasten notes:
 * 1. `applies_to` file path globs (`EXTRACTED`)
 * 2. `symbols` explicit symbol names in frontmatter (`EXTRACTED`)
 * 3. Inline backtick code mentions `` `symbolName()` `` in Markdown body (`INFERRED`)
 */
export function interlinkCodeWithADRs(
  codeNodes: NodeRecord[],
  adrNotes: ParsedZettelNote[]
): EdgeRecord[] {
  const interlinkEdges: EdgeRecord[] = [];
  const seen = new Set<string>();

  const pushGovernedEdge = (
    codeNodeId: string,
    adrId: string,
    confidence: 'EXTRACTED' | 'INFERRED',
    snippet: string
  ) => {
    const key = `${codeNodeId}->governed_by->${adrId}`;
    if (!seen.has(key)) {
      seen.add(key);
      interlinkEdges.push({
        source_id: codeNodeId,
        target_id: adrId,
        relation: 'governed_by',
        confidence,
        weight: 1.0,
        context_snippet: snippet
      });
    }
  };

  for (const adr of adrNotes) {
    if (adr.node.status === 'superseded') continue;

    // Extract inline backtick identifiers from body markdown (e.g. `processInvoice()` or `AuthService.login`)
    const inlineIdentifiers = new Set<string>();
    const body = adr.node.body_markdown || '';
    const backtickRegex = /`([A-Za-z_$][A-Za-z0-9_$.]*)(?:\([^`]*\))?`/g;
    let m: RegExpExecArray | null;
    while ((m = backtickRegex.exec(body)) !== null) {
      const rawIdent = m[1];
      inlineIdentifiers.add(rawIdent);
      if (rawIdent.includes('.')) {
        const parts = rawIdent.split('.');
        inlineIdentifiers.add(parts[parts.length - 1]);
      }
    }

    const explicitSymbols = new Set(adr.symbols || []);

    for (const codeNode of codeNodes) {
      // 1. Check explicit `symbols` list in frontmatter
      if (
        explicitSymbols.size > 0 &&
        (explicitSymbols.has(codeNode.name) ||
          (codeNode.qualified_name && explicitSymbols.has(codeNode.qualified_name)))
      ) {
        pushGovernedEdge(
          codeNode.id,
          adr.node.id,
          'EXTRACTED',
          `Simbolo ancorado em frontmatter: ${codeNode.name}`
        );
        continue;
      }

      // 2. Check `applies_to` file globs
      if (adr.appliesTo.length > 0 && codeNode.file_path) {
        const normalizedPath = codeNode.file_path.replace(/\\/g, '/');
        const matches = adr.appliesTo.some(pattern => {
          const normalizedPattern = pattern.replace(/\\/g, '/');
          return (
            minimatch(normalizedPath, normalizedPattern, { matchBase: true }) ||
            normalizedPath.includes(normalizedPattern.replace(/\*/g, ''))
          );
        });

        if (matches) {
          pushGovernedEdge(
            codeNode.id,
            adr.node.id,
            'INFERRED',
            `Escopo correspondente: ${adr.appliesTo.join(', ')}`
          );
          continue;
        }
      }

      // 3. Check inline backtick mentions in Markdown body (`doc_links`)
      if (
        codeNode.kind !== 'file' &&
        codeNode.name.length > 2 &&
        inlineIdentifiers.has(codeNode.name)
      ) {
        pushGovernedEdge(
          codeNode.id,
          adr.node.id,
          'INFERRED',
          `Mencionado inline no documento: \`${codeNode.name}\``
        );
      }
    }
  }

  return interlinkEdges;
}
