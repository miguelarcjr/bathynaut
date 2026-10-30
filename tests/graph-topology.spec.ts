import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { buildGraphFromDatabase } from '../src/graph/builder.js';
import { detectAndPersistCommunities } from '../src/graph/communities.js';
import { computeGodNodes } from '../src/graph/pagerank.js';
import { detectAndPersistFlows } from '../src/graph/flows.js';
import { parseUnifiedDiffOutput } from '../src/graph/git-diff.js';
import { calculateBlastRadius } from '../src/graph/blast-radius.js';

describe('Topological Graph, Execution Flows & Blast Radius v2 Engine', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');

    // Create module A (Auth)
    upsertNode(db, {
      id: 'fn:auth:login',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'loginHandler',
      file_path: 'src/auth/login.ts',
      line_start: 10,
      line_end: 30,
      is_entrypoint: 1,
      signature: 'export async function loginHandler(req: Request)',
      summary: 'Login entrypoint'
    });
    upsertNode(db, {
      id: 'fn:auth:token',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'verifyAuthToken',
      file_path: 'src/auth/token.ts',
      line_start: 5,
      line_end: 25,
      signature: 'export function verifyAuthToken(token: string)',
      summary: 'Token verifier'
    });
    upsertEdge(db, { source_id: 'fn:auth:login', target_id: 'fn:auth:token', relation: 'calls' });

    // Create module B (Checkout) — untested function calling verifyAuthToken
    upsertNode(db, {
      id: 'fn:checkout:pay',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'processPayment',
      file_path: 'src/checkout/pay.ts',
      line_start: 1,
      line_end: 40,
      is_entrypoint: 1,
      signature: 'export async function processPayment(orderId: string)',
      summary: 'Payment processor'
    });
    upsertEdge(db, { source_id: 'fn:checkout:pay', target_id: 'fn:auth:token', relation: 'calls' });

    // Create Test covering loginHandler (but NOT processPayment)
    upsertNode(db, {
      id: 'test:auth',
      depth_zone: 'twilight',
      kind: 'test',
      name: 'authSpec',
      file_path: 'tests/auth.spec.ts',
      summary: 'Auth Test'
    });
    upsertEdge(db, { source_id: 'test:auth', target_id: 'fn:auth:login', relation: 'calls' });
    upsertEdge(db, { source_id: 'test:auth', target_id: 'fn:auth:login', relation: 'tests_for' });

    // Create Blocking ADR & Incident with stale edge warning
    upsertNode(db, {
      id: 'adr:001',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'ADR-001 SSR Isolation',
      enforcement: 'blocking',
      invariants_json: JSON.stringify(['Nunca armazenar JWT em variavel global mutavel']),
      summary: 'Keep tokens isolated'
    });
    upsertNode(db, {
      id: 'inc:001',
      depth_zone: 'abyssal',
      kind: 'incident',
      name: 'Incident-001 Leak',
      summary: 'Token leaked in cache'
    });
    upsertEdge(db, {
      source_id: 'fn:auth:token',
      target_id: 'adr:001',
      relation: 'governed_by',
      needs_review: 1
    });
    upsertEdge(db, { source_id: 'adr:001', target_id: 'inc:001', relation: 'mitigates' });
  });

  afterEach(() => {
    db.close();
  });

  it('should build in-memory graphology graph from database', () => {
    const graph = buildGraphFromDatabase(db);
    expect(graph.order).toBeGreaterThanOrEqual(4);
    expect(graph.size).toBeGreaterThanOrEqual(3);
  });

  it('should detect communities with cohesion and compute God Nodes, degrees and Bridge flags', () => {
    const graph = buildGraphFromDatabase(db);
    const communities = detectAndPersistCommunities(graph, db);
    expect(communities.length).toBeGreaterThan(0);
    expect(communities[0].cohesion).toBeGreaterThanOrEqual(0);

    const godNodes = computeGodNodes(graph, db);
    expect(godNodes.length).toBeGreaterThan(0);

    const tokenRow = db.prepare('SELECT in_degree, out_degree FROM nodes WHERE id = ?').get('fn:auth:token') as any;
    expect(tokenRow.in_degree).toBeGreaterThanOrEqual(2);
  });

  it('should trace and persist Execution Flows from entrypoints', () => {
    const graph = buildGraphFromDatabase(db);
    detectAndPersistCommunities(graph, db);
    const flows = detectAndPersistFlows(db);

    expect(flows.length).toBeGreaterThanOrEqual(2);
    const loginFlow = flows.find(f => f.entrypoint_id === 'fn:auth:login');
    expect(loginFlow).toBeDefined();
    expect(loginFlow?.criticality_score).toBeGreaterThan(0);
    expect(JSON.parse(loginFlow!.node_path_json)).toContain('fn:auth:token');
  });

  it('should calculate Blast Radius v2 with blocking_invariants, affected_flows, untested_functions, stale_warning and risk_score', () => {
    const graph = buildGraphFromDatabase(db);
    detectAndPersistCommunities(graph, db);
    detectAndPersistFlows(db);

    const blast = calculateBlastRadius(db, ['src/auth/token.ts']);

    expect(blast.entry_files).toContain('src/auth/token.ts');
    expect(blast.affected_files).toContain('src/auth/login.ts');
    expect(blast.affected_files).toContain('src/checkout/pay.ts');
    expect(blast.covering_tests).toContain('tests/auth.spec.ts');

    // Blocking invariants surfaced at the top
    expect(blast.blocking_invariants.length).toBe(1);
    expect(blast.blocking_invariants[0].invariant).toContain('Nunca armazenar JWT');

    // Governing ADRs with stale_warning
    const adr = blast.governing_adrs.find(a => a.id === 'adr:001');
    expect(adr).toBeDefined();
    expect(adr?.stale_warning).toBe(true);

    // Affected execution flows
    expect(blast.affected_flows.length).toBeGreaterThanOrEqual(2);

    // Untested functions (processPayment has no covering test!)
    expect(blast.untested_functions.some(u => u.id === 'fn:checkout:pay')).toBe(true);

    // Risk score & level
    expect(blast.risk_score).toBeGreaterThan(0.3);
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(blast.risk_level);
  });

  it('should parse unified git diff output into file paths and changed line ranges', () => {
    const sampleDiff = `diff --git a/src/auth/token.ts b/src/auth/token.ts
index 1234567..89abcdef 100644
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -10,0 +11,5 @@ export function verifyAuthToken(token: string) {
+  const x = 1;
`;
    const parsed = parseUnifiedDiffOutput(sampleDiff);
    expect(parsed['src/auth/token.ts']).toBeDefined();
    expect(parsed['src/auth/token.ts'][0]).toEqual([11, 15]);
  });
});
