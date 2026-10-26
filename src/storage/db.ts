import DatabaseConstructor, { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getDatabasePath(projectRoot: string): string {
  const bathynautDir = path.join(projectRoot, '.bathynaut');
  if (!fs.existsSync(bathynautDir)) {
    fs.mkdirSync(bathynautDir, { recursive: true });
  }
  return path.join(bathynautDir, 'ocean.db');
}

export function initDatabase(dbPath: string): Database {
  const db = new DatabaseConstructor(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load and apply unified schema
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  let schemaSql = '';
  if (fs.existsSync(schemaPath)) {
    schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  } else {
    // Fallback if bundled
    schemaSql = `
      CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          depth_zone TEXT NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          file_path TEXT,
          line_start INTEGER,
          line_end INTEGER,
          community_id INTEGER,
          pagerank_score REAL DEFAULT 0.0,
          summary TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          applies_to_json TEXT DEFAULT '[]',
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
          PRIMARY KEY (source_id, target_id, relation)
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
      CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
      CREATE INDEX IF NOT EXISTS idx_nodes_community ON nodes(community_id);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, relation);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, relation);

      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          id,
          name,
          summary,
          body_markdown,
          tokenize='porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS communities (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          cohesion REAL NOT NULL DEFAULT 0.0,
          size INTEGER NOT NULL DEFAULT 0,
          dominant_language TEXT,
          description TEXT
      );
    `;
  }
  db.exec(schemaSql);
  return db;
}
