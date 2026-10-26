import { Database } from 'better-sqlite3';
import { BlastRadiusResult, NodeRecord } from '../types.js';
import { getIncomingEdges, getOutgoingEdges, getNodeById } from '../storage/queries.js';

/**
 * Deterministic BFS Blast Radius Calculator.
 * Given target files, finds all direct and indirect callers (downstream impact),
 * all test files covering those functions, and all ADRs/incidents governing the scope.
 */
export function calculateBlastRadius(
  db: Database,
  targetFiles: string[],
  maxDepth = 3
): BlastRadiusResult {
  const result: BlastRadiusResult = {
    entry_files: targetFiles,
    affected_files: [],
    affected_nodes: [],
    covering_tests: [],
    governing_adrs: [],
    known_incidents: []
  };

  const normalizedTargets = targetFiles.map(f => f.replace(/\\/g, '/'));
  
  // 1. Find all entry nodes in target files
  const placeholders = normalizedTargets.map(() => '?').join(',');
  const entryNodes = db.prepare(`
    SELECT * FROM nodes 
    WHERE file_path IN (${placeholders}) OR file_path LIKE ?
  `).all(...normalizedTargets, `%${normalizedTargets[0]}%`) as NodeRecord[];

  const visitedNodeIds = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const n of entryNodes) {
    visitedNodeIds.add(n.id);
    queue.push({ id: n.id, depth: 0 });
    result.affected_nodes.push({
      id: n.id,
      name: n.name,
      kind: n.kind,
      file_path: n.file_path || ''
    });
  }

  const affectedFilesSet = new Set<string>(normalizedTargets);

  // 2. BFS on incoming callers (who calls these entry nodes)
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const incoming = getIncomingEdges(db, id);
    for (const edge of incoming) {
      if (edge.relation === 'calls' || edge.relation === 'imports') {
        if (!visitedNodeIds.has(edge.source_id)) {
          visitedNodeIds.add(edge.source_id);
          const callerNode = getNodeById(db, edge.source_id);
          if (callerNode) {
            result.affected_nodes.push({
              id: callerNode.id,
              name: callerNode.name,
              kind: callerNode.kind,
              file_path: callerNode.file_path || ''
            });
            if (callerNode.file_path) {
              affectedFilesSet.add(callerNode.file_path.replace(/\\/g, '/'));
            }
            // Check if caller is a test file
            if (callerNode.file_path && (callerNode.file_path.includes('.spec.') || callerNode.file_path.includes('.test.'))) {
              result.covering_tests.push(callerNode.file_path);
            }
          }
          queue.push({ id: edge.source_id, depth: depth + 1 });
        }
      }
    }
  }

  result.affected_files = Array.from(affectedFilesSet);

  // 3. Find all governing ADRs and incidents connected to affected nodes
  for (const nodeId of visitedNodeIds) {
    const outgoing = getOutgoingEdges(db, nodeId);
    for (const edge of outgoing) {
      if (edge.relation === 'governed_by') {
        const adrNode = getNodeById(db, edge.target_id);
        if (adrNode && adrNode.kind === 'adr') {
          if (!result.governing_adrs.some(a => a.id === adrNode.id)) {
            result.governing_adrs.push({
              id: adrNode.id,
              title: adrNode.name,
              summary: adrNode.summary
            });
          }

          // Check if this ADR mitigates any incidents
          const adrOutgoing = getOutgoingEdges(db, adrNode.id);
          for (const adrEdge of adrOutgoing) {
            if (adrEdge.relation === 'mitigates') {
              const incidentNode = getNodeById(db, adrEdge.target_id);
              if (incidentNode && !result.known_incidents.some(i => i.id === incidentNode.id)) {
                result.known_incidents.push({
                  id: incidentNode.id,
                  title: incidentNode.name,
                  warning: incidentNode.summary
                });
              }
            }
          }
        }
      }
    }
  }

  return result;
}
