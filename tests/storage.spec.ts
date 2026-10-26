import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge, getNodeById, searchNodesFTS, getOutgoingEdges, getIncomingEdges } from '../src/storage/queries.js';
import { Database } from 'better-sqlite3';

describe('Bathynaut Storage Engine', () => {
  let db: Database;

  beforeEach(() => {
    // In-memory SQLite for fast testing
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize tables and FTS5 index properly', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('nodes');
    expect(tableNames).toContain('edges');
    expect(tableNames).toContain('communities');
    expect(tableNames).toContain('nodes_fts');
  });

  it('should insert and retrieve a code node and an ADR node', () => {
    upsertNode(db, {
      id: 'fn:requireSupabaseAuth',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'requireSupabaseAuth',
      file_path: 'src/lib/auth.ts',
      line_start: 10,
      line_end: 35,
      summary: 'Middleware de autenticacao e sessao efemera'
    });

    upsertNode(db, {
      id: 'adr:001-rbac',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'ADR-001: Isolamento de Sessao SSR',
      summary: 'Garante que tokens nao vazem entre requisicoes SSR',
      body_markdown: '# Decisao de Seguranca'
    });

    const fnNode = getNodeById(db, 'fn:requireSupabaseAuth');
    expect(fnNode).toBeDefined();
    expect(fnNode?.name).toBe('requireSupabaseAuth');
    expect(fnNode?.depth_zone).toBe('twilight');

    const adrNode = getNodeById(db, 'adr:001-rbac');
    expect(adrNode).toBeDefined();
    expect(adrNode?.kind).toBe('adr');
    expect(adrNode?.depth_zone).toBe('abyssal');
  });

  it('should create and query edges between code and ADRs', () => {
    upsertNode(db, {
      id: 'fn:requireSupabaseAuth',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'requireSupabaseAuth',
      summary: 'Auth middleware'
    });

    upsertNode(db, {
      id: 'adr:001-rbac',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'ADR-001',
      summary: 'Auth ADR'
    });

    upsertEdge(db, {
      source_id: 'fn:requireSupabaseAuth',
      target_id: 'adr:001-rbac',
      relation: 'governed_by',
      confidence: 'INFERRED'
    });

    const outgoing = getOutgoingEdges(db, 'fn:requireSupabaseAuth');
    expect(outgoing.length).toBe(1);
    expect(outgoing[0].target_id).toBe('adr:001-rbac');
    expect(outgoing[0].relation).toBe('governed_by');

    const incoming = getIncomingEdges(db, 'adr:001-rbac');
    expect(incoming.length).toBe(1);
    expect(incoming[0].source_id).toBe('fn:requireSupabaseAuth');
  });

  it('should perform fast FTS5 search across code and ADRs', () => {
    upsertNode(db, {
      id: 'fn:authenticateUser',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'authenticateUser',
      summary: 'Autentica o usuario via token JWT'
    });

    upsertNode(db, {
      id: 'adr:002-pagamentos',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'ADR-002: Gateway de Pagamentos',
      summary: 'Integracao com Asaas e Webhooks'
    });

    const authResults = searchNodesFTS(db, 'token JWT');
    expect(authResults.length).toBeGreaterThan(0);
    expect(authResults[0].id).toBe('fn:authenticateUser');

    const payResults = searchNodesFTS(db, 'Asaas Webhooks');
    expect(payResults.length).toBeGreaterThan(0);
    expect(payResults[0].id).toBe('adr:002-pagamentos');
  });
});
