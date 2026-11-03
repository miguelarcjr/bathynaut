import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../src/storage/db.js';
import {
  upsertNode,
  upsertEdge,
  getNodeById,
  searchNodesFTS,
  getOutgoingEdges,
  getIncomingEdges,
  tokenizeIdentifier,
  upsertFileState,
  getFileState,
  deleteNodesByFilePath,
  upsertFlow,
  getFlowsForNode
} from '../src/storage/queries.js';
import { ProjectContextPool, resolveProjectRoot } from '../src/storage/pool.js';
import { Database } from 'better-sqlite3';

describe('Bathynaut Storage Engine v0.2', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize all v0.2 tables (nodes, edges, communities, file_state, flows, flow_memberships, nodes_fts)', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('nodes');
    expect(tableNames).toContain('edges');
    expect(tableNames).toContain('communities');
    expect(tableNames).toContain('file_state');
    expect(tableNames).toContain('flows');
    expect(tableNames).toContain('flow_memberships');
    expect(tableNames).toContain('nodes_fts');
  });

  it('should tokenize camelCase, PascalCase, snake_case and kebab-case identifiers for FTS5', () => {
    const tokens = tokenizeIdentifier('calculateBlastRadius_v2-auth');
    expect(tokens).toContain('calculate');
    expect(tokens).toContain('blast');
    expect(tokens).toContain('radius');
    expect(tokens).toContain('auth');
  });

  it('should insert and retrieve enriched v0.2 code node and ADR node with invariants and enforcement', () => {
    upsertNode(db, {
      id: 'fn:src/lib/auth.ts:requireSupabaseAuth',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'requireSupabaseAuth',
      qualified_name: 'auth.requireSupabaseAuth',
      file_path: 'src/lib/auth.ts',
      line_start: 10,
      line_end: 35,
      signature: 'export async function requireSupabaseAuth(req: Request): Promise<Session>',
      docstring: 'Valida token JWT do Supabase no header Authorization',
      code_excerpt: 'export async function requireSupabaseAuth(req: Request) {\n  const token = req.headers.authorization;\n}',
      content_hash: 'sha256-abc123',
      is_exported: 1,
      is_entrypoint: 1,
      summary: 'Middleware de autenticacao e sessao efemera'
    });

    upsertNode(db, {
      id: 'adr-001-rbac',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'ADR-001: Isolamento de Sessao SSR',
      summary: 'Garante que tokens nao vazem entre requisicoes SSR',
      enforcement: 'blocking',
      invariants_json: JSON.stringify(['Nunca reutilizar cliente Supabase global em SSR']),
      symbols_json: JSON.stringify(['requireSupabaseAuth']),
      body_markdown: '# Decisao de Seguranca'
    });

    const fnNode = getNodeById(db, 'fn:src/lib/auth.ts:requireSupabaseAuth');
    expect(fnNode).toBeDefined();
    expect(fnNode?.signature).toContain('requireSupabaseAuth(req: Request)');
    expect(fnNode?.docstring).toContain('Valida token JWT');
    expect(fnNode?.content_hash).toBe('sha256-abc123');
    expect(fnNode?.is_exported).toBe(1);

    const adrNode = getNodeById(db, 'adr-001-rbac');
    expect(adrNode).toBeDefined();
    expect(adrNode?.enforcement).toBe('blocking');
    expect(JSON.parse(adrNode?.invariants_json || '[]')).toContain('Nunca reutilizar cliente Supabase global em SSR');
  });

  it('should find camelCase function names using natural language search via tokenized_identifiers', () => {
    upsertNode(db, {
      id: 'fn:src/sonar.ts:calculateBlastRadius',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'calculateBlastRadius',
      summary: 'Executa travessia BFS'
    });

    const results = searchNodesFTS(db, 'blast radius');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('fn:src/sonar.ts:calculateBlastRadius');
  });

  it('should track file_state and delete nodes by file_path cleanly', () => {
    upsertFileState(db, {
      file_path: 'src/auth.ts',
      mtime_ms: 1700000000,
      sha256: 'hash-1',
      byte_size: 512,
      kind: 'code'
    });

    const state = getFileState(db, 'src/auth.ts');
    expect(state).toBeDefined();
    expect(state?.sha256).toBe('hash-1');

    upsertNode(db, {
      id: 'fn:src/auth.ts:login',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'login',
      file_path: 'src/auth.ts',
      summary: 'Login fn'
    });

    deleteNodesByFilePath(db, 'src/auth.ts');
    expect(getNodeById(db, 'fn:src/auth.ts:login')).toBeUndefined();
  });

  it('should persist and query execution flows', () => {
    upsertFlow(db, {
      id: 'flow:login',
      name: 'POST /login -> verifyPassword',
      entrypoint_id: 'fn:src/routes.ts:loginHandler',
      terminal_ids_json: JSON.stringify(['fn:src/crypto.ts:verifyPassword']),
      node_path_json: JSON.stringify(['fn:src/routes.ts:loginHandler', 'fn:src/crypto.ts:verifyPassword']),
      depth: 2,
      crosses_communities: 1,
      criticality_score: 0.85
    });

    const flows = getFlowsForNode(db, 'fn:src/crypto.ts:verifyPassword');
    expect(flows.length).toBe(1);
    expect(flows[0].id).toBe('flow:login');
    expect(flows[0].criticality_score).toBe(0.85);
  });

  it('should resolve Dual-Vault (.agents/memory or .bathynaut/memory) in ProjectContextPool', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bathynaut-pool-'));
    try {
      const agentsVault = path.join(tmpDir, '.agents', 'memory', 'wiki', 'decisions');
      fs.mkdirSync(agentsVault, { recursive: true });
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const sampleFile = path.join(srcDir, 'index.ts');
      fs.writeFileSync(sampleFile, 'export const x = 1;');

      const resolvedRoot = resolveProjectRoot(sampleFile);
      expect(resolvedRoot).toBe(tmpDir);

      const pool = new ProjectContextPool();
      const ctx = pool.getContext(sampleFile);
      expect(ctx.projectRoot).toBe(tmpDir);
      expect(ctx.memoryRoot).toBe(path.join(tmpDir, '.agents', 'memory'));
      expect(ctx.vaultKind).toBe('agents-memory');
      pool.closeAll();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
