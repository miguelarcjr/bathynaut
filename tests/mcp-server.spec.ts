import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { handleSonar } from '../src/mcp/tools/sonar.js';
import { handleDive } from '../src/mcp/tools/dive.js';
import { handlePath } from '../src/mcp/tools/path.js';
import { handleRecall } from '../src/mcp/tools/recall.js';
import { handleLogAdr } from '../src/mcp/tools/log-adr.js';
import { handleCheckpoint } from '../src/mcp/tools/checkpoint.js';
import { handleLint } from '../src/mcp/tools/lint.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Bathynaut MCP Tools Suite', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bathynaut-mcp-'));
    dbPath = path.join(tmpDir, 'ocean.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute bathynaut_sonar returning blast radius, blocking_invariants, risk_score, affected_flows, and token-budgeted excerpts', () => {
    const db = initDatabase(dbPath);
    upsertNode(db, { id: 'src/auth.ts#login', depth_zone: 'epipelagic', kind: 'function', name: 'login', file_path: 'src/auth.ts', line_start: 1, line_end: 10 });
    upsertNode(db, { id: 'tests/auth.spec.ts#testLogin', depth_zone: 'epipelagic', kind: 'test', name: 'testLogin', file_path: 'tests/auth.spec.ts', line_start: 1, line_end: 5 });
    upsertNode(db, {
      id: 'adr-001',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'No sync crypto',
      file_path: '.bathynaut/memory/wiki/decisions/adr-001.md',
      applies_to_json: '["src/auth.ts"]',
      enforcement: 'blocking',
      invariants_json: JSON.stringify(['Never use synchronous pbkdf2Sync']),
      body_markdown: 'Critical decision regarding pbkdf2Sync in login'
    });

    upsertEdge(db, { source_id: 'tests/auth.spec.ts#testLogin', target_id: 'src/auth.ts#login', relation: 'tested_by', confidence: 'EXTRACTED' });
    upsertEdge(db, { source_id: 'src/auth.ts#login', target_id: 'adr-001', relation: 'governed_by', confidence: 'INFERRED' });

    const res = handleSonar(db, { files: ['src/auth.ts'], token_budget: 2000 });
    const parsed = JSON.parse(res.content[0].text);

    expect(parsed.target_files).toContain('src/auth.ts');
    expect(parsed.covering_tests.length).toBe(1);
    expect(parsed.governing_adrs.length).toBe(1);
    expect(parsed.blocking_invariants).toContain('[adr-001] Never use synchronous pbkdf2Sync');
    expect(typeof parsed.risk_score).toBe('number');
    expect(Array.isArray(parsed.excerpts)).toBe(true);
    db.close();
  });

  it('should execute bathynaut_dive returning communities, top_god_nodes, bridge_nodes, and top_flows', () => {
    const db = initDatabase(dbPath);
    upsertNode(db, { id: 'fn:god', depth_zone: 'epipelagic', kind: 'function', name: 'godFn', file_path: 'src/god.ts', pagerank_score: 0.9, is_bridge: 1 });
    db.prepare('INSERT INTO communities (id, name, cohesion, size, dominant_language, description) VALUES (0, ?, 0.85, 5, ?, ?)').run('Auth Core', 'typescript', 'Core cluster');
    db.prepare('INSERT INTO flows (id, name, entrypoint_id, terminal_ids_json, node_path_json, depth, crosses_communities, criticality_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'flow:godFn',
      'godFn -> worker',
      'fn:god',
      JSON.stringify(['fn:god']),
      JSON.stringify(['fn:god']),
      2,
      1,
      0.85
    );

    const res = handleDive(db, {});
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.communities.length).toBe(1);
    expect(parsed.top_god_nodes.length).toBe(1);
    expect(parsed.bridge_nodes.length).toBe(1);
    expect(parsed.top_flows.length).toBe(1);
    db.close();
  });

  it('should execute bathynaut_path finding shortest path with edge relation and confidence details', () => {
    const db = initDatabase(dbPath);
    upsertNode(db, { id: 'nodeA', depth_zone: 'epipelagic', kind: 'function', name: 'funcA', file_path: 'a.ts' });
    upsertNode(db, { id: 'nodeB', depth_zone: 'epipelagic', kind: 'function', name: 'funcB', file_path: 'b.ts' });
    upsertNode(db, { id: 'nodeC', depth_zone: 'abyssal', kind: 'adr', name: 'adrC', file_path: 'c.md' });

    upsertEdge(db, { source_id: 'nodeA', target_id: 'nodeB', relation: 'calls', confidence: 'EXTRACTED' });
    upsertEdge(db, { source_id: 'nodeB', target_id: 'nodeC', relation: 'governed_by', confidence: 'INFERRED' });

    const res = handlePath(db, { from: 'funcA', to: 'adrC' });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.hops).toBe(2);
    expect(parsed.path).toEqual(['nodeA', 'nodeB', 'nodeC']);
    expect(parsed.edges.length).toBe(2);
    expect(parsed.edges[0]).toMatchObject({ from: 'nodeA', to: 'nodeB', relation: 'calls', confidence: 'EXTRACTED' });
    db.close();
  });

  it('should execute bathynaut_log_adr with immediate auto-interlinking, invariants, and bathynaut_recall RRF', () => {
    const db = initDatabase(dbPath);
    const memoryRoot = path.join(tmpDir, '.bathynaut', 'memory');

    // Insert code node before ADR to verify immediate auto-interlinking
    upsertNode(db, {
      id: 'src/api/rate.ts#checkQuota',
      depth_zone: 'epipelagic',
      kind: 'function',
      name: 'checkQuota',
      file_path: 'src/api/rate.ts'
    });

    const logRes = handleLogAdr(db, memoryRoot, {
      title: 'Rate Limit Token Bucket',
      category: 'decisions',
      context: 'Prevent overload on public API',
      decision: 'Use Redis Token Bucket algorithm in function `checkQuota()`',
      applies_to: ['src/api/*'],
      symbols: ['checkQuota'],
      invariants: ['Every public route must call checkQuota'],
      enforcement: 'blocking'
    });

    const logged = JSON.parse(logRes.content[0].text);
    expect(logged.success).toBe(true);
    expect(fs.existsSync(logged.file_path)).toBe(true);
    expect(logged.interlinked_edges).toBeGreaterThanOrEqual(1);

    // Verify sonar immediately sees the new ADR governing src/api/rate.ts
    const sonarRes = handleSonar(db, { files: ['src/api/rate.ts'], token_budget: 2000 });
    const sonarData = JSON.parse(sonarRes.content[0].text);
    expect(sonarData.governing_adrs.some((a: any) => a.id === logged.adr_id)).toBe(true);
    expect(sonarData.blocking_invariants).toContain(`[${logged.adr_id}] Every public route must call checkQuota`);

    const recallRes = handleRecall(db, { query: 'Token Bucket', limit: 5, token_budget: 1500 });
    const recalled = JSON.parse(recallRes.content[0].text);
    expect(recalled.count).toBeGreaterThanOrEqual(1);
    expect(recalled.results[0].name).toBe('Rate Limit Token Bucket');
    expect(recalled.matches[0].name).toBe('Rate Limit Token Bucket');
    db.close();
  });

  it('should execute bathynaut_checkpoint and bathynaut_lint (stale_adrs, untested_god_nodes, pending_raw_files)', () => {
    const db = initDatabase(dbPath);
    const memoryRoot = path.join(tmpDir, '.bathynaut', 'memory');
    const rawDir = path.join(memoryRoot, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'postmortem-draft.md'), '# Raw draft', 'utf-8');

    const cpRes = handleCheckpoint(memoryRoot, {
      summary: 'Completed MCP layer',
      active_tasks: ['Run E2E tests'],
      decisions: ['Use stdio transport']
    });
    const cp = JSON.parse(cpRes.content[0].text);
    expect(cp.success).toBe(true);

    upsertNode(db, {
      id: 'adr-stale',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'Stale ADR',
      file_path: 'adr-stale.md',
      status: 'stale'
    });
    upsertNode(db, {
      id: 'src/core.ts#godUntested',
      depth_zone: 'epipelagic',
      kind: 'function',
      name: 'godUntested',
      file_path: 'src/core.ts',
      pagerank_score: 0.45
    });

    const lintRes = handleLint(db, memoryRoot);
    const lint = JSON.parse(lintRes.content[0].text);
    expect(lint.stale_adrs.some((a: any) => a.id === 'adr-stale')).toBe(true);
    expect(lint.untested_god_nodes.some((n: any) => n.name === 'godUntested')).toBe(true);
    expect(lint.pending_raw_files).toContain('postmortem-draft.md');
    db.close();
  });
});
