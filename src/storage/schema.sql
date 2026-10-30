-- Bathynaut v0.2 SOTA Unified Relational Schema

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
