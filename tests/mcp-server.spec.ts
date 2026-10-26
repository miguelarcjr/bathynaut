import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { handleSonar } from '../src/mcp/tools/sonar.js';
import { handleDive } from '../src/mcp/tools/dive.js';
import { handlePath } from '../src/mcp/tools/path.js';
import { handleRecall } from '../src/mcp/tools/recall.js';
import { handleLogAdr } from '../src/mcp/tools/log-adr.js';
import { handleCheckpoint } from '../src/mcp/tools/checkpoint.js';
import { handleLint } from '../src/mcp/tools/lint.js';

describe('The Oceanic 7 MCP Tools', () => {
  let db: Database;
  const tempMemory = path.resolve('tests/temp-memory');

  beforeEach(() => {
    db = initDatabase(':memory:');
    if (!fs.existsSync(tempMemory)) fs.mkdirSync(tempMemory, { recursive: true });

    upsertNode(db, { id: 'fn:auth:login', depth_zone: 'twilight', kind: 'function', name: 'login', file_path: 'src/auth.ts', summary: 'Login Auth' });
    upsertNode(db, { id: 'fn:auth:token', depth_zone: 'twilight', kind: 'function', name: 'token', file_path: 'src/token.ts', summary: 'Token helper' });
    upsertEdge(db, { source_id: 'fn:auth:login', target_id: 'fn:auth:token', relation: 'calls' });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempMemory)) {
      fs.rmSync(tempMemory, { recursive: true, force: true });
    }
  });

  it('bathynaut_sonar should return blast radius and callers', () => {
    const res = handleSonar(db, { files: ['src/token.ts'] });
    const data = JSON.parse(res.content[0].text);
    expect(data.affected_files).toContain('src/auth.ts');
  });

  it('bathynaut_dive should return community macro overview', () => {
    const res = handleDive(db, {});
    const data = JSON.parse(res.content[0].text);
    expect(data.communities).toBeDefined();
  });

  it('bathynaut_path should find acoustic shortest path', () => {
    const res = handlePath(db, { from: 'fn:auth:login', to: 'fn:auth:token' });
    const data = JSON.parse(res.content[0].text);
    expect(data.hops).toBe(1);
    expect(data.path).toEqual(['fn:auth:login', 'fn:auth:token']);
  });

  it('bathynaut_recall should search with FTS5 BM25', () => {
    const res = handleRecall(db, { query: 'Login Auth', limit: 5 });
    const data = JSON.parse(res.content[0].text);
    expect(data.count).toBeGreaterThan(0);
    expect(data.matches[0].id).toBe('fn:auth:login');
  });

  it('bathynaut_log_adr should create physical markdown file and update database', () => {
    const res = handleLogAdr(db, tempMemory, {
      title: 'Isolamento de Cache',
      context: 'Evitar vazamento de tokens',
      decision: 'Nao usar cache global',
      applies_to: ['src/token*']
    });
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(fs.existsSync(data.file_path)).toBe(true);
  });

  it('bathynaut_checkpoint should serialize active session state', () => {
    const res = handleCheckpoint(tempMemory, {
      summary: 'Implementado motor MCP',
      active_tasks: ['Subir testes', 'Validar release']
    });
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(fs.existsSync(data.checkpoint_file)).toBe(true);
  });

  it('bathynaut_lint should report health of graph', () => {
    const res = handleLint(db);
    const data = JSON.parse(res.content[0].text);
    expect(data.total_nodes).toBeGreaterThan(0);
    expect(data.status).toBeDefined();
  });
});
