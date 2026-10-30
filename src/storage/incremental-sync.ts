import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Database } from 'better-sqlite3';
import {
  getAllFileStates,
  upsertFileState,
  deleteFileState,
  deleteNodesByFilePath,
  upsertNode,
  upsertEdge,
  getAllNodes,
  getAllEdges
} from './queries.js';
import { parseSourceCode } from '../parsers/ast/extractors.js';
import { linkSymbolsAndImports } from '../parsers/ast/symbol-linker.js';
import { interlinkCodeWithADRs } from '../parsers/ast/interlink.js';
import { parseZettelkastenNote, ParsedZettelNote } from '../parsers/markdown/zettelkasten.js';
import { computeScopeSharingEdges, generateMOCIndex } from '../parsers/markdown/scanner.js';
import { buildGraphFromDatabase } from '../graph/builder.js';
import { detectAndPersistCommunities } from '../graph/communities.js';
import { computeGodNodes } from '../graph/pagerank.js';
import { detectAndPersistFlows } from '../graph/flows.js';

export interface SyncStats {
  syncedFiles: number;
  deletedFiles: number;
  staleAdrsCount: number;
  durationMs: number;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function collectProjectFiles(
  projectRoot: string,
  memoryRoot: string
): Array<{ absPath: string; relPath: string; mtimeMs: number; size: number; kind: 'code' | 'markdown' }> {
  const discovered: Array<{ absPath: string; relPath: string; mtimeMs: number; size: number; kind: 'code' | 'markdown' }> = [];
  const normMemoryRoot = path.resolve(memoryRoot);

  // 1. Walk code files
  function walkCode(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build' && e.name !== 'coverage') {
          walkCode(full);
        }
      } else if (e.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/i.test(e.name)) {
        try {
          const stat = fs.statSync(full);
          const relPath = path.relative(projectRoot, full).replace(/\\/g, '/');
          discovered.push({
            absPath: full,
            relPath,
            mtimeMs: Math.floor(stat.mtimeMs),
            size: stat.size,
            kind: 'code'
          });
        } catch {}
      }
    }
  }

  // 2. Walk markdown vault files
  function walkVault(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'raw' && e.name !== 'templates') {
          walkVault(full);
        }
      } else if (e.isFile() && e.name.endsWith('.md')) {
        if (e.name === 'activeContext.md' || e.name === 'index.md') continue;
        try {
          const stat = fs.statSync(full);
          const relPath = path.relative(projectRoot, full).replace(/\\/g, '/');
          discovered.push({
            absPath: full,
            relPath,
            mtimeMs: Math.floor(stat.mtimeMs),
            size: stat.size,
            kind: 'markdown'
          });
        } catch {}
      }
    }
  }

  walkCode(projectRoot);
  if (fs.existsSync(normMemoryRoot)) {
    walkVault(normMemoryRoot);
  }

  return discovered;
}

/**
 * Just-in-Time Incremental Synchronizer (< 50ms when unchanged).
 * Compares filesystem `mtimeMs` and `SHA-256` against `file_state`.
 * Re-parses only modified/added files, detects Stale ADRs when governed code changes,
 * and re-links symbols, communities, PageRank, and Execution Flows.
 */
export async function ensureFreshGraph(
  projectRoot: string,
  db: Database,
  memoryRoot: string,
  options: { force?: boolean } = {}
): Promise<SyncStats> {
  const startTime = Date.now();
  const existingStates = getAllFileStates(db);
  const stateByPath = new Map(existingStates.map(s => [s.file_path.replace(/\\/g, '/'), s]));

  const currentFiles = collectProjectFiles(projectRoot, memoryRoot);
  const currentPathsSet = new Set(currentFiles.map(f => f.relPath));

  // Identify deleted files
  const deletedPaths: string[] = [];
  for (const oldPath of stateByPath.keys()) {
    if (!currentPathsSet.has(oldPath)) {
      deletedPaths.push(oldPath);
    }
  }

  // Identify changed or added files
  const filesToSync: Array<{
    absPath: string;
    relPath: string;
    mtimeMs: number;
    size: number;
    kind: 'code' | 'markdown';
    content: string;
    hash: string;
  }> = [];

  for (const file of currentFiles) {
    const prev = stateByPath.get(file.relPath);
    if (!options.force && prev && prev.mtime_ms === file.mtimeMs && prev.byte_size === file.size) {
      continue; // Unchanged fast path (zero file read!)
    }

    try {
      const content = fs.readFileSync(file.absPath, 'utf-8');
      const hash = sha256(content);
      if (!options.force && prev && prev.sha256 === hash) {
        // Content hash identical; just update mtime_ms
        upsertFileState(db, {
          file_path: file.relPath,
          mtime_ms: file.mtimeMs,
          sha256: hash,
          byte_size: file.size,
          kind: file.kind
        });
        continue;
      }

      filesToSync.push({
        ...file,
        content,
        hash
      });
    } catch {}
  }

  // Fast exit if nothing changed
  if (filesToSync.length === 0 && deletedPaths.length === 0) {
    return {
      syncedFiles: 0,
      deletedFiles: 0,
      staleAdrsCount: 0,
      durationMs: Date.now() - startTime
    };
  }

  // Track previous content_hashes and governed_by edges to detect Stale ADRs
  const previousNodeHashes = new Map<string, string>();
  const previousGovernedAdrs = new Map<string, string[]>();

  if (existingStates.length > 0) {
    for (const f of filesToSync) {
      if (f.kind !== 'code') continue;
      const oldNodes = db.prepare('SELECT id, content_hash FROM nodes WHERE file_path = ?').all(f.relPath) as Array<{ id: string; content_hash: string | null }>;
      for (const n of oldNodes) {
        if (n.content_hash) {
          previousNodeHashes.set(n.id, n.content_hash);
        }
        const govEdges = db.prepare("SELECT target_id FROM edges WHERE source_id = ? AND relation = 'governed_by'").all(n.id) as Array<{ target_id: string }>;
        if (govEdges.length > 0) {
          previousGovernedAdrs.set(n.id, govEdges.map(g => g.target_id));
        }
      }
    }
  }

  // 1. Remove deleted files
  for (const delPath of deletedPaths) {
    deleteNodesByFilePath(db, delPath);
    deleteFileState(db, delPath);
  }

  // 2. Parse and upsert modified files
  const staleAdrSet = new Set<string>();
  const staleNodeAdrPairs: Array<{ nodeId: string; adrId: string }> = [];

  for (const file of filesToSync) {
    deleteNodesByFilePath(db, file.relPath);

    if (file.kind === 'markdown') {
      const parsed = parseZettelkastenNote(file.relPath, file.content);
      upsertNode(db, parsed.node);
      for (const edge of parsed.edges) {
        upsertEdge(db, edge);
        if (edge.relation === 'supersedes') {
          db.prepare("UPDATE nodes SET status = 'superseded' WHERE id = ?").run(edge.target_id);
        }
      }
    } else {
      const ast = await parseSourceCode(file.relPath, file.content);
      for (const n of ast.nodes) {
        upsertNode(db, n);
        const oldHash = previousNodeHashes.get(n.id);
        if (oldHash && n.content_hash && oldHash !== n.content_hash) {
          const govAdrs = previousGovernedAdrs.get(n.id) || [];
          for (const adrId of govAdrs) {
            staleAdrSet.add(adrId);
            staleNodeAdrPairs.push({ nodeId: n.id, adrId });
          }
        }
      }
      for (const ed of ast.edges) {
        upsertEdge(db, ed);
      }
    }

    upsertFileState(db, {
      file_path: file.relPath,
      mtime_ms: file.mtimeMs,
      sha256: file.hash,
      byte_size: file.size,
      kind: file.kind
    });
  }

  // 3. Re-run Two-Pass Symbol & Import Linker across current graph state
  const allNodes = getAllNodes(db);
  const rawEdges = getAllEdges(db);
  const linkedEdges = linkSymbolsAndImports(allNodes, rawEdges);

  // Replace unresolved raw call/import edges with linked edges
  db.prepare("DELETE FROM edges WHERE relation IN ('calls', 'imports', 'tests_for')").run();
  for (const ed of linkedEdges) {
    if (ed.relation === 'calls' || ed.relation === 'imports' || ed.relation === 'tests_for') {
      upsertEdge(db, ed);
    }
  }

  // 4. Re-run Triple Code-ADR Interlinking & Scope Sharing
  const currentMarkdownFiles = currentFiles.filter(f => f.kind === 'markdown');
  const allParsedNotes: ParsedZettelNote[] = [];
  for (const mf of currentMarkdownFiles) {
    try {
      const raw = fs.readFileSync(mf.absPath, 'utf-8');
      allParsedNotes.push(parseZettelkastenNote(mf.relPath, raw));
    } catch {}
  }

  const codeNodes = allNodes.filter(n => n.depth_zone === 'twilight');
  const interlinkEdges = interlinkCodeWithADRs(codeNodes, allParsedNotes);
  for (const ed of interlinkEdges) {
    upsertEdge(db, ed);
  }

  const sharedScopeEdges = computeScopeSharingEdges(allParsedNotes);
  for (const ed of sharedScopeEdges) {
    upsertEdge(db, ed);
  }

  // Apply needs_review = 1 for Stale ADRs whose governed code changed
  for (const pair of staleNodeAdrPairs) {
    db.prepare(`
      UPDATE edges SET needs_review = 1
      WHERE source_id = ? AND target_id = ? AND relation = 'governed_by'
    `).run(pair.nodeId, pair.adrId);
  }

  // 5. Recompute Topology, Communities, PageRank & Execution Flows
  const graph = buildGraphFromDatabase(db);
  detectAndPersistCommunities(graph, db);
  computeGodNodes(graph, db);
  detectAndPersistFlows(db);
  generateMOCIndex(memoryRoot, db);

  return {
    syncedFiles: filesToSync.length,
    deletedFiles: deletedPaths.length,
    staleAdrsCount: staleAdrSet.size,
    durationMs: Date.now() - startTime
  };
}
