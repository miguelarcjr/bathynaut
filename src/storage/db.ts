import type { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function getDatabasePath(projectRoot: string): string {
  const bathynautDir = path.join(projectRoot, '.bathynaut');
  if (!fs.existsSync(bathynautDir)) {
    fs.mkdirSync(bathynautDir, { recursive: true });
  }
  return path.join(bathynautDir, 'ocean.db');
}

/**
 * Creates a better-sqlite3 compatible Database instance.
 * Uses better-sqlite3 if the native binary matches the active Node ABI;
 * otherwise seamlessly falls back to Node's built-in `node:sqlite` (DatabaseSync)
 * with zero C++/node-gyp compilation requirements!
 */
function createDatabaseInstance(dbPath: string): Database {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    return new BetterSqlite3(dbPath);
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    const rawDb = new DatabaseSync(dbPath);

    const normalizeNamedParams = (args: any[]) => {
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
        const obj = args[0];
        const mapped: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (k.startsWith('@') || k.startsWith(':') || k.startsWith('$')) {
            mapped[k] = v;
          } else {
            mapped[`@${k}`] = v;
          }
        }
        return [mapped];
      }
      return args;
    };

    const cloneRow = (row: any) => (row && typeof row === 'object' ? { ...row } : row);

    const adapter: any = {
      exec(sql: string) {
        rawDb.exec(sql);
        return adapter;
      },
      pragma(pragmaStr: string) {
        try {
          rawDb.exec(`PRAGMA ${pragmaStr}`);
        } catch {}
        return adapter;
      },
      prepare(sql: string) {
        const stmt = rawDb.prepare(sql);
        return {
          run(...args: any[]) {
            return stmt.run(...normalizeNamedParams(args));
          },
          get(...args: any[]) {
            const row = stmt.get(...normalizeNamedParams(args));
            return cloneRow(row);
          },
          all(...args: any[]) {
            const rows = stmt.all(...normalizeNamedParams(args));
            return Array.isArray(rows) ? rows.map(cloneRow) : [];
          }
        };
      },
      close() {
        rawDb.close();
      }
    };

    return adapter as Database;
  }
}

const FALLBACK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS file_state (
    file_path TEXT PRIMARY KEY,
    mtime_ms INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'code',
    last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    depth_zone TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    signature TEXT,
    docstring TEXT,
    code_excerpt TEXT,
    content_hash TEXT,
    is_exported INTEGER DEFAULT 0,
    is_entrypoint INTEGER DEFAULT 0,
    community_id INTEGER,
    pagerank_score REAL DEFAULT 0.0,
    in_degree INTEGER DEFAULT 0,
    out_degree INTEGER DEFAULT 0,
    is_bridge INTEGER DEFAULT 0,
    summary TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    enforcement TEXT DEFAULT 'advisory',
    applies_to_json TEXT DEFAULT '[]',
    symbols_json TEXT DEFAULT '[]',
    invariants_json TEXT DEFAULT '[]',
    sources_json TEXT DEFAULT '[]',
    body_markdown TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edges (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    confidence TEXT DEFAULT 'EXTRACTED',
    weight REAL DEFAULT 1.0,
    context_snippet TEXT,
    needs_review INTEGER DEFAULT 0,
    PRIMARY KEY (source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_community ON nodes(community_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, relation);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, relation);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id,
    name,
    tokenized_identifiers,
    signature,
    summary,
    docstring,
    body_markdown,
    tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS communities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    cohesion REAL NOT NULL DEFAULT 0.0,
    size INTEGER NOT NULL DEFAULT 0,
    dominant_language TEXT,
    god_node_id TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS flows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entrypoint_id TEXT NOT NULL,
    terminal_ids_json TEXT NOT NULL DEFAULT '[]',
    node_path_json TEXT NOT NULL DEFAULT '[]',
    depth INTEGER NOT NULL DEFAULT 1,
    crosses_communities INTEGER NOT NULL DEFAULT 0,
    criticality_score REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS flow_memberships (
    flow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    PRIMARY KEY (flow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_memberships_node ON flow_memberships(node_id);
`;

function migrateDatabaseIfNeeded(db: Database): void {
  const nodeCols = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  const existingNodeCols = new Set(nodeCols.map(c => c.name));

  const newCols: Array<[string, string]> = [
    ['qualified_name', 'TEXT'],
    ['signature', 'TEXT'],
    ['docstring', 'TEXT'],
    ['code_excerpt', 'TEXT'],
    ['content_hash', 'TEXT'],
    ['is_exported', 'INTEGER DEFAULT 0'],
    ['is_entrypoint', 'INTEGER DEFAULT 0'],
    ['in_degree', 'INTEGER DEFAULT 0'],
    ['out_degree', 'INTEGER DEFAULT 0'],
    ['is_bridge', 'INTEGER DEFAULT 0'],
    ['enforcement', "TEXT DEFAULT 'advisory'"],
    ['symbols_json', "TEXT DEFAULT '[]'"],
    ['invariants_json', "TEXT DEFAULT '[]'"],
    ['sources_json', "TEXT DEFAULT '[]'"]
  ];

  for (const [col, typeDef] of newCols) {
    if (!existingNodeCols.has(col)) {
      try {
        db.exec(`ALTER TABLE nodes ADD COLUMN ${col} ${typeDef}`);
      } catch {}
    }
  }

  const edgeCols = db.prepare('PRAGMA table_info(edges)').all() as Array<{ name: string }>;
  const existingEdgeCols = new Set(edgeCols.map(c => c.name));
  if (!existingEdgeCols.has('needs_review')) {
    try {
      db.exec('ALTER TABLE edges ADD COLUMN needs_review INTEGER DEFAULT 0');
    } catch {}
  }

  const commCols = db.prepare('PRAGMA table_info(communities)').all() as Array<{ name: string }>;
  const existingCommCols = new Set(commCols.map(c => c.name));
  if (!existingCommCols.has('god_node_id')) {
    try {
      db.exec('ALTER TABLE communities ADD COLUMN god_node_id TEXT');
    } catch {}
  }

  const ftsCols = db.prepare('PRAGMA table_info(nodes_fts)').all() as Array<{ name: string }>;
  const existingFtsCols = new Set(ftsCols.map(c => c.name));
  if (existingFtsCols.size > 0 && !existingFtsCols.has('tokenized_identifiers')) {
    try {
      db.exec('DROP TABLE IF EXISTS nodes_fts');
      db.exec(`
        CREATE VIRTUAL TABLE nodes_fts USING fts5(
          id,
          name,
          tokenized_identifiers,
          signature,
          summary,
          docstring,
          body_markdown,
          tokenize='porter unicode61'
        );
      `);
    } catch {}
  }
}

export function initDatabase(dbPath: string): Database {
  const db = createDatabaseInstance(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = OFF');

  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const schemaSql = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, 'utf-8')
    : FALLBACK_SCHEMA_SQL;

  db.exec(schemaSql);
  migrateDatabaseIfNeeded(db);
  return db;
}
