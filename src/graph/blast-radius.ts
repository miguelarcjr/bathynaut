import { Database } from 'better-sqlite3';
import { BlastRadiusResult, NodeRecord, RiskLevel, EnforcementLevel } from '../types.js';
import { getIncomingEdges, getOutgoingEdges, getNodeById, getFlowsForNode } from '../storage/queries.js';

const SENSITIVE_DOMAIN_RE = /(auth|login|token|jwt|session|password|secret|crypto|pay|webhook|invoice|checkout|sql|db|permission|admin|rbac)/i;

export interface BlastRadiusOptions {
  maxDepth?: number;
  changedLineRanges?: Record<string, Array<[number, number]>>;
}

function computeRiskLevel(score: number): RiskLevel {
  if (score >= 0.75) return 'CRITICAL';
  if (score >= 0.5) return 'HIGH';
  if (score >= 0.25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Deterministic BFS Blast Radius & Risk Score Calculator v0.2 SOTA.
 */
export function calculateBlastRadius(
  db: Database,
  targetFiles: string[],
  options: BlastRadiusOptions = {}
): BlastRadiusResult {
  const maxDepth = options.maxDepth ?? 3;
  const result: BlastRadiusResult = {
    entry_files: targetFiles,
    affected_files: [],
    blocking_invariants: [],
    risk_score: 0,
    risk_level: 'LOW',
    affected_nodes: [],
    affected_flows: [],
    covering_tests: [],
    untested_functions: [],
    governing_adrs: [],
    known_incidents: []
  };

  if (!targetFiles || targetFiles.length === 0) {
    return result;
  }

  const normalizedTargets = targetFiles.map(f => f.replace(/\\/g, '/'));

  // 1. Find all entry nodes in target files
  const entryNodes: NodeRecord[] = [];
  const seenEntryIds = new Set<string>();

  for (const target of normalizedTargets) {
    const matched = db.prepare(`
      SELECT * FROM nodes
      WHERE file_path = ? OR file_path LIKE ?
    `).all(target, `%${target}`) as NodeRecord[];

    for (const n of matched) {
      // If line ranges from git diff are specified for this file, filter functions to those overlapping changed lines (or keep file node)
      const ranges = options.changedLineRanges?.[target];
      if (ranges && ranges.length > 0 && n.kind !== 'file' && n.line_start && n.line_end) {
        const overlaps = ranges.some(([start, end]) => !(n.line_end! < start || n.line_start! > end));
        if (!overlaps) continue;
      }

      if (!seenEntryIds.has(n.id)) {
        seenEntryIds.add(n.id);
        entryNodes.push(n);
      }
    }
  }

  const visitedNodeIds = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const n of entryNodes) {
    visitedNodeIds.add(n.id);
    queue.push({ id: n.id, depth: 0 });
    result.affected_nodes.push({
      id: n.id,
      name: n.name,
      kind: n.kind,
      file_path: n.file_path || '',
      line_start: n.line_start,
      line_end: n.line_end,
      signature: n.signature,
      code_excerpt: n.code_excerpt,
      confidence: 'EXTRACTED'
    });
  }

  const affectedFilesSet = new Set<string>(normalizedTargets);
  const coveringTestsSet = new Set<string>();
  const testedNodeIds = new Set<string>();

  // 2. BFS on incoming callers (`calls`, `imports`, `tests_for`)
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const incoming = getIncomingEdges(db, id);
    for (const edge of incoming) {
      if (edge.relation === 'calls' || edge.relation === 'imports' || edge.relation === 'tests_for' || edge.relation === 'tested_by') {
        const callerNode = getNodeById(db, edge.source_id);
        const callerFile = callerNode?.file_path?.replace(/\\/g, '/') || '';
        const isTestCaller =
          edge.relation === 'tests_for' ||
          edge.relation === 'tested_by' ||
          callerNode?.kind === 'test' ||
          callerFile.includes('.spec.') ||
          callerFile.includes('.test.');

        if (isTestCaller) {
          testedNodeIds.add(id);
          if (callerFile) coveringTestsSet.add(callerFile);
        }

        if (!visitedNodeIds.has(edge.source_id)) {
          visitedNodeIds.add(edge.source_id);
          if (callerNode) {
            result.affected_nodes.push({
              id: callerNode.id,
              name: callerNode.name,
              kind: callerNode.kind,
              file_path: callerFile,
              line_start: callerNode.line_start,
              line_end: callerNode.line_end,
              signature: callerNode.signature,
              code_excerpt: callerNode.code_excerpt,
              confidence: edge.confidence || 'EXTRACTED'
            });
            if (callerFile) {
              affectedFilesSet.add(callerFile);
            }
          }
          queue.push({ id: edge.source_id, depth: depth + 1 });
        }
      }
    }
  }

  result.affected_files = Array.from(affectedFilesSet);
  result.covering_tests = Array.from(coveringTestsSet);

  // 3. Identify untested production functions in the blast radius & collect affected Execution Flows
  const seenFlows = new Set<string>();
  for (const nodeId of visitedNodeIds) {
    const node = getNodeById(db, nodeId);
    if (!node) continue;

    // Collect execution flows passing through this node
    const nodeFlows = getFlowsForNode(db, nodeId);
    for (const fl of nodeFlows) {
      if (!seenFlows.has(fl.id)) {
        seenFlows.add(fl.id);
        let parsedPath: string[] = [];
        try { parsedPath = JSON.parse(fl.node_path_json); } catch {}
        result.affected_flows.push({
          id: fl.id,
          name: fl.name,
          depth: fl.depth,
          criticality_score: fl.criticality_score,
          path: parsedPath
        });
      }
    }

    // Check if production function is covered directly or via a tested caller in the chain
    if (node.kind === 'function' || node.kind === 'entrypoint') {
      const fPath = node.file_path?.replace(/\\/g, '') || '';
      const isTestFile = fPath.includes('.spec.') || fPath.includes('.test.');
      if (!isTestFile && !testedNodeIds.has(node.id)) {
        // Check if any direct caller is tested
        const incoming = getIncomingEdges(db, node.id);
        const hasTestedCaller = incoming.some(e => testedNodeIds.has(e.source_id));
        if (!hasTestedCaller) {
          result.untested_functions.push({
            id: node.id,
            name: node.name,
            file_path: node.file_path || '',
            line_start: node.line_start
          });
        }
      }
    }
  }

  // 4. Find all governing ADRs, blocking invariants, stale warnings, and incidents
  for (const nodeId of visitedNodeIds) {
    const outgoing = getOutgoingEdges(db, nodeId);
    for (const edge of outgoing) {
      if (edge.relation === 'governed_by') {
        const adrNode = getNodeById(db, edge.target_id);
        if (adrNode && adrNode.status !== 'superseded') {
          let invariants: string[] = [];
          try { invariants = JSON.parse(adrNode.invariants_json || '[]'); } catch {}
          const enforcement: EnforcementLevel = adrNode.enforcement || 'advisory';
          const staleWarning = edge.needs_review === 1 || adrNode.status === 'stale';

          const existingAdr = result.governing_adrs.find(a => a.id === adrNode.id);
          if (!existingAdr) {
            result.governing_adrs.push({
              id: adrNode.id,
              title: adrNode.name,
              summary: adrNode.summary || '',
              enforcement,
              invariants,
              stale_warning: staleWarning
            });

            if (enforcement === 'blocking' || invariants.length > 0) {
              for (const inv of invariants) {
                result.blocking_invariants.push({
                  adr_id: adrNode.id,
                  title: adrNode.name,
                  enforcement,
                  invariant: inv
                });
              }
            }
          } else if (staleWarning) {
            existingAdr.stale_warning = true;
          }

          // Check if this ADR mitigates or relates to any incidents
          const adrOutgoing = getOutgoingEdges(db, adrNode.id);
          for (const adrEdge of adrOutgoing) {
            if (adrEdge.relation === 'mitigates' || adrEdge.relation === 'caused_by') {
              const incidentNode = getNodeById(db, adrEdge.target_id);
              if (incidentNode && !result.known_incidents.some(i => i.id === incidentNode.id)) {
                result.known_incidents.push({
                  id: incidentNode.id,
                  title: incidentNode.name,
                  warning: incidentNode.summary || ''
                });
              }
            }
          }
        }
      }
    }
  }

  // 5. Compute deterministic Risk Score (0.0 to 1.0)
  let risk = 0.0;
  // Factor A: Caller blast size (up to 0.25)
  const callerCount = Math.max(0, result.affected_nodes.length - entryNodes.length);
  risk += Math.min(callerCount * 0.05, 0.25);

  // Factor B: Untested production functions (up to 0.25)
  if (result.untested_functions.length > 0) {
    risk += Math.min(result.untested_functions.length * 0.1, 0.25);
  }

  // Factor C: Sensitive domain keywords (0.20)
  const touchesSensitive = result.affected_nodes.some(n =>
    SENSITIVE_DOMAIN_RE.test(`${n.name} ${n.file_path}`)
  );
  if (touchesSensitive) {
    risk += 0.20;
  }

  // Factor D: Blocking ADRs or Known Incidents in scope (up to 0.30)
  if (result.blocking_invariants.length > 0) {
    risk += 0.15;
  }
  if (result.known_incidents.length > 0) {
    risk += 0.15;
  }

  result.risk_score = Number(Math.min(1.0, risk).toFixed(2));
  result.risk_level = computeRiskLevel(result.risk_score);

  return result;
}
