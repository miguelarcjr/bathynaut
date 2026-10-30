import path from 'node:path';
import { NodeRecord, EdgeRecord } from '../../types.js';

function normalizePosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Resolves an import specifier (e.g. `../auth/jwt.js` or `./supabaseClient`) relative to `importerFile`
 * against the set of known file paths in the graph.
 */
export function resolveImportSpecifier(
  importerFile: string,
  specifier: string,
  knownFiles: Set<string>
): string | null {
  const normImporter = normalizePosix(importerFile);
  const importerDir = path.posix.dirname(normImporter);

  let baseCandidate = '';
  if (specifier.startsWith('.')) {
    baseCandidate = path.posix.normalize(path.posix.join(importerDir, specifier));
  } else if (specifier.startsWith('@/')) {
    baseCandidate = path.posix.normalize(path.posix.join('src', specifier.slice(2)));
  } else {
    return null; // External npm/pip package
  }

  // Strip .js / .jsx / .mjs / .ts extension to test multiple source extensions
  const stripped = baseCandidate.replace(/\.(js|jsx|mjs|cjs|ts|tsx)$/i, '');
  const candidates = [
    baseCandidate,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}.js`,
    `${stripped}.jsx`,
    `${stripped}.py`,
    `${stripped}.go`,
    `${stripped}.rs`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
    `${stripped}/index.js`
  ];

  for (const cand of candidates) {
    const normCand = normalizePosix(cand);
    if (knownFiles.has(normCand)) {
      return normCand;
    }
  }

  return null;
}

/**
 * Extracts imported symbol names from an import statement snippet:
 * e.g. `import { verifyJwt, decode as dec } from '../auth/jwt.js'` -> ['verifyJwt', 'decode', 'dec']
 */
function parseImportedSymbolsFromSnippet(snippet: string | null | undefined): string[] {
  if (!snippet) return [];
  const symbols: string[] = [];
  const braceMatch = snippet.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const parts = braceMatch[1].split(',');
    for (const part of parts) {
      const tokens = part.trim().split(/\s+as\s+/i);
      for (const t of tokens) {
        const clean = t.trim();
        if (clean) symbols.push(clean);
      }
    }
  }
  const defaultMatch = snippet.match(/import\s+([A-Za-z0-9_$]+)\s+from/);
  if (defaultMatch && defaultMatch[1]) {
    symbols.push(defaultMatch[1]);
  }
  return symbols;
}

/**
 * Two-Pass Deterministic Symbol & Import Linker.
 * Pass 1: Resolves `import:<specifier>` edges to canonical `file:<resolvedPath>` nodes.
 * Pass 2: Resolves `calls` (`fn:<calleeName>`) to canonical `fn:<targetFile>:<calleeName>` nodes,
 *         and generates `tests_for` edges when test files/functions call production symbols.
 */
export function linkSymbolsAndImports(
  nodes: NodeRecord[],
  rawEdges: EdgeRecord[]
): EdgeRecord[] {
  const knownFiles = new Set<string>();
  const nodeById = new Map<string, NodeRecord>();
  const functionsByFileAndName = new Map<string, NodeRecord>();
  const functionsByName = new Map<string, NodeRecord[]>();

  for (const n of nodes) {
    nodeById.set(n.id, n);
    if (n.kind === 'file' && n.file_path) {
      knownFiles.add(normalizePosix(n.file_path));
    }
    if ((n.kind === 'function' || n.kind === 'test' || n.kind === 'class') && n.file_path) {
      const normFile = normalizePosix(n.file_path);
      functionsByFileAndName.set(`${normFile}::${n.name}`, n);
      const list = functionsByName.get(n.name) || [];
      list.push(n);
      functionsByName.set(n.name, list);
    }
  }

  // Track which files each file imports from, and which specific symbols were imported
  // Map<importerFile, Array<{ targetFile: string, importedSymbols: string[] }>>
  const fileImportsMap = new Map<string, Array<{ targetFile: string; importedSymbols: string[] }>>();

  const resolvedEdges: EdgeRecord[] = [];
  const seenEdgeKeys = new Set<string>();

  const pushEdge = (edge: EdgeRecord) => {
    const key = `${edge.source_id}->${edge.relation}->${edge.target_id}`;
    if (!seenEdgeKeys.has(key)) {
      seenEdgeKeys.add(key);
      resolvedEdges.push(edge);
    }
  };

  // PASS 1: Resolve `imports` edges
  for (const edge of rawEdges) {
    if (edge.relation === 'imports' && edge.target_id.startsWith('import:')) {
      const specifier = edge.target_id.slice('import:'.length);
      const sourceNode = nodeById.get(edge.source_id);
      const importerFile = sourceNode?.file_path ? normalizePosix(sourceNode.file_path) : edge.source_id.replace(/^file:/, '');

      const resolvedFile = resolveImportSpecifier(importerFile, specifier, knownFiles);
      if (resolvedFile) {
        const importedSymbols = parseImportedSymbolsFromSnippet(edge.context_snippet);
        const list = fileImportsMap.get(importerFile) || [];
        list.push({ targetFile: resolvedFile, importedSymbols });
        fileImportsMap.set(importerFile, list);

        pushEdge({
          source_id: edge.source_id,
          target_id: `file:${resolvedFile}`,
          relation: 'imports',
          confidence: 'EXTRACTED',
          weight: 1.0,
          context_snippet: edge.context_snippet
        });
      } else {
        // Keep external import edge as-is
        pushEdge(edge);
      }
    } else if (edge.relation !== 'calls') {
      pushEdge(edge);
    }
  }

  // PASS 2: Resolve `calls` edges (`fn:<calleeName>`)
  for (const edge of rawEdges) {
    if (edge.relation !== 'calls') continue;

    if (!edge.target_id.startsWith('fn:') || edge.target_id.split(':').length > 2) {
      pushEdge(edge);
      continue;
    }

    const calleeName = edge.target_id.slice('fn:'.length);
    const callerNode = nodeById.get(edge.source_id);
    const callerFile = callerNode?.file_path
      ? normalizePosix(callerNode.file_path)
      : edge.source_id.replace(/^(fn|file|class):/, '').split(':')[0];

    let resolvedTargetNode: NodeRecord | undefined;
    let confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' = 'EXTRACTED';

    // Rule 1: Same-file definition
    resolvedTargetNode = functionsByFileAndName.get(`${callerFile}::${calleeName}`);

    // Rule 2: Imported file definition
    if (!resolvedTargetNode) {
      const importsForCaller = fileImportsMap.get(callerFile) || [];
      for (const imp of importsForCaller) {
        const candidate = functionsByFileAndName.get(`${imp.targetFile}::${calleeName}`);
        if (candidate) {
          resolvedTargetNode = candidate;
          confidence = 'EXTRACTED';
          break;
        }
      }
    }

    // Rule 3: Unique exported / global definition in repo
    if (!resolvedTargetNode) {
      const candidates = functionsByName.get(calleeName) || [];
      if (candidates.length === 1) {
        resolvedTargetNode = candidates[0];
        confidence = 'INFERRED';
      } else if (candidates.length > 1) {
        const exportedCandidates = candidates.filter(c => c.is_exported === 1);
        if (exportedCandidates.length === 1) {
          resolvedTargetNode = exportedCandidates[0];
          confidence = 'INFERRED';
        } else if (exportedCandidates.length > 1) {
          resolvedTargetNode = exportedCandidates[0];
          confidence = 'AMBIGUOUS';
        }
      }
    }

    if (resolvedTargetNode) {
      pushEdge({
        source_id: edge.source_id,
        target_id: resolvedTargetNode.id,
        relation: 'calls',
        confidence,
        weight: edge.weight ?? 1.0,
        context_snippet: edge.context_snippet
      });

      // If caller is a test file or test function, also emit deterministic `tests_for` edge!
      const isCallerTest =
        callerNode?.kind === 'test' ||
        /\.(test|spec)\.[a-z0-9]+$/i.test(callerFile) ||
        /(^|\/)(tests?|__tests__)\//i.test(callerFile);

      if (isCallerTest && resolvedTargetNode.kind !== 'test') {
        pushEdge({
          source_id: edge.source_id,
          target_id: resolvedTargetNode.id,
          relation: 'tests_for',
          confidence: 'EXTRACTED',
          weight: 1.0,
          context_snippet: `Coberto por teste em ${callerFile}`
        });
      }
    } else {
      // Unresolved external call
      pushEdge(edge);
    }
  }

  return resolvedEdges;
}

