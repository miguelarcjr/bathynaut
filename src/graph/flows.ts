import { Database } from 'better-sqlite3';
import { FlowRecord, NodeRecord } from '../types.js';
import { upsertFlow, getOutgoingEdges, getNodeById } from '../storage/queries.js';

const CRITICAL_KEYWORDS_RE = /(auth|login|token|jwt|session|password|secret|crypto|pay|webhook|invoice|checkout|sql|db|permission|admin|rbac)/i;

/**
 * Detects entrypoints in the codebase and traces forward Execution Flows via `calls` edges.
 * Computes criticality scores based on depth, community crossings, and sensitive domain keywords.
 */
export function detectAndPersistFlows(db: Database, maxDepth = 6): FlowRecord[] {
  const allCodeNodes = db.prepare(`
    SELECT * FROM nodes
    WHERE kind IN ('function', 'entrypoint')
  `).all() as NodeRecord[];

  if (allCodeNodes.length === 0) return [];

  // Entrypoints: explicitly flagged is_entrypoint = 1 OR functions that call others and have no non-test callers
  const entrypoints: NodeRecord[] = [];
  for (const n of allCodeNodes) {
    if (n.is_entrypoint === 1) {
      entrypoints.push(n);
      continue;
    }
    const outgoingCalls = db.prepare("SELECT COUNT(*) as cnt FROM edges WHERE source_id = ? AND relation = 'calls'").get(n.id) as { cnt: number };
    if (outgoingCalls.cnt === 0) continue;

    const incomingNonTest = db.prepare(`
      SELECT COUNT(*) as cnt FROM edges e
      INNER JOIN nodes src ON src.id = e.source_id
      WHERE e.target_id = ? AND e.relation = 'calls' AND src.kind != 'test'
    `).get(n.id) as { cnt: number };

    if (incomingNonTest.cnt === 0) {
      entrypoints.push(n);
    }
  }

  const detectedFlows: FlowRecord[] = [];

  for (const entry of entrypoints) {
    const visited = new Set<string>([entry.id]);
    const pathNodes: string[] = [entry.id];
    const terminals: string[] = [];
    const communitiesSeen = new Set<number>();
    if (entry.community_id !== null && entry.community_id !== undefined) {
      communitiesSeen.add(entry.community_id);
    }

    let maxReachedDepth = 1;
    let hasCriticalKeyword = CRITICAL_KEYWORDS_RE.test(`${entry.name} ${entry.file_path ?? ''}`);

    const queue: Array<{ id: string; depth: number }> = [{ id: entry.id, depth: 1 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth > maxReachedDepth) maxReachedDepth = depth;
      if (depth >= maxDepth) {
        terminals.push(id);
        continue;
      }

      const outgoing = getOutgoingEdges(db, id).filter(e => e.relation === 'calls');
      let advanced = false;

      for (const edge of outgoing) {
        const targetNode = getNodeById(db, edge.target_id);
        if (!targetNode || visited.has(targetNode.id)) continue;

        visited.add(targetNode.id);
        pathNodes.push(targetNode.id);
        advanced = true;

        if (targetNode.community_id !== null && targetNode.community_id !== undefined) {
          communitiesSeen.add(targetNode.community_id);
        }
        if (CRITICAL_KEYWORDS_RE.test(`${targetNode.name} ${targetNode.file_path ?? ''}`)) {
          hasCriticalKeyword = true;
        }

        queue.push({ id: targetNode.id, depth: depth + 1 });
      }

      if (!advanced && id !== entry.id) {
        terminals.push(id);
      }
    }

    if (pathNodes.length < 2) continue;

    const crossesCommunities = communitiesSeen.size > 1 ? communitiesSeen.size - 1 : 0;
    const depthFactor = Math.min(maxReachedDepth / maxDepth, 1.0) * 0.4;
    const communityFactor = Math.min(crossesCommunities * 0.2, 0.3);
    const securityFactor = hasCriticalKeyword ? 0.3 : 0.0;
    const criticalityScore = Number(Math.min(1.0, depthFactor + communityFactor + securityFactor).toFixed(2));

    const lastNode = getNodeById(db, pathNodes[pathNodes.length - 1]);
    const flowId = `flow:${entry.id}`;
    const flowName = `${entry.name} -> ${lastNode?.name || 'end'}`;

    const flowRecord: FlowRecord = {
      id: flowId,
      name: flowName,
      entrypoint_id: entry.id,
      terminal_ids_json: JSON.stringify(terminals.length > 0 ? terminals : [pathNodes[pathNodes.length - 1]]),
      node_path_json: JSON.stringify(pathNodes),
      depth: maxReachedDepth,
      crosses_communities: crossesCommunities,
      criticality_score: criticalityScore
    };

    upsertFlow(db, flowRecord);
    detectedFlows.push(flowRecord);
  }

  return detectedFlows;
}
