import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { buildGraphFromDatabase } from '../src/graph/builder.js';
import { detectAndPersistCommunities } from '../src/graph/communities.js';
import { computeGodNodes } from '../src/graph/pagerank.js';
import { calculateBlastRadius } from '../src/graph/blast-radius.js';

describe('Topological Graph & Blast Radius Engine', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');

    // Create module A (Auth)
    upsertNode(db, { id: 'fn:auth:login', depth_zone: 'twilight', kind: 'function', name: 'login', file_path: 'src/auth/login.ts', summary: 'Login' });
    upsertNode(db, { id: 'fn:auth:token', depth_zone: 'twilight', kind: 'function', name: 'token', file_path: 'src/auth/token.ts', summary: 'Token' });
    upsertEdge(db, { source_id: 'fn:auth:login', target_id: 'fn:auth:token', relation: 'calls' });

    // Create module B (Checkout)
    upsertNode(db, { id: 'fn:checkout:pay', depth_zone: 'twilight', kind: 'function', name: 'pay', file_path: 'src/checkout/pay.ts', summary: 'Pay' });
    upsertEdge(db, { source_id: 'fn:checkout:pay', target_id: 'fn:auth:token', relation: 'calls' });

    // Create Test
    upsertNode(db, { id: 'test:auth', depth_zone: 'twilight', kind: 'function', name: 'authSpec', file_path: 'tests/auth.spec.ts', summary: 'Auth Test' });
    upsertEdge(db, { source_id: 'test:auth', target_id: 'fn:auth:login', relation: 'calls' });

    // Create ADR & Incident
    upsertNode(db, { id: 'adr:001', depth_zone: 'abyssal', kind: 'adr', name: 'ADR-001 SSR Isolation', summary: 'Keep tokens isolated' });
    upsertNode(db, { id: 'inc:001', depth_zone: 'abyssal', kind: 'incident', name: 'Incident-001 Leak', summary: 'Token leaked in cache' });
    upsertEdge(db, { source_id: 'fn:auth:token', target_id: 'adr:001', relation: 'governed_by' });
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

  it('should detect communities and rank God Nodes', () => {
    const graph = buildGraphFromDatabase(db);
    const communities = detectAndPersistCommunities(graph, db);
    expect(communities.length).toBeGreaterThan(0);

    const godNodes = computeGodNodes(graph, db);
    expect(godNodes.length).toBeGreaterThan(0);
    // fn:auth:token has multiple incoming calls, so it should have a high score
    const topNode = godNodes[0];
    expect(topNode.id).toBeDefined();
  });

  it('should calculate blast radius, affected tests, and matched ADRs & incidents', () => {
    const blast = calculateBlastRadius(db, ['src/auth/token.ts']);

    expect(blast.entry_files).toContain('src/auth/token.ts');
    // Callers are login and pay
    expect(blast.affected_files).toContain('src/auth/login.ts');
    expect(blast.affected_files).toContain('src/checkout/pay.ts');

    // Covering test
    expect(blast.covering_tests).toContain('tests/auth.spec.ts');

    // Governing ADRs
    expect(blast.governing_adrs.some(a => a.id === 'adr:001')).toBe(true);

    // Known Incidents
    expect(blast.known_incidents.some(i => i.id === 'inc:001')).toBe(true);
  });
});
