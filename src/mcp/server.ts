import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from 'better-sqlite3';
import { ProjectContextPool } from '../storage/pool.js';
import { ensureFreshGraph } from '../storage/incremental-sync.js';
import { handleSonar, SonarSchema } from './tools/sonar.js';
import { handleDive, DiveSchema } from './tools/dive.js';
import { handlePath, PathSchema } from './tools/path.js';
import { handleRecall, RecallSchema } from './tools/recall.js';
import { handleLogAdr, LogAdrSchema } from './tools/log-adr.js';
import { handleCheckpoint, CheckpointSchema } from './tools/checkpoint.js';
import { handleLint, LintSchema } from './tools/lint.js';

export function createMCPServer(
  defaultDb: Database,
  defaultMemoryRoot: string,
  defaultProjectRoot: string = process.cwd()
): Server {
  const pool = new ProjectContextPool(8);

  const server = new Server(
    { name: 'bathynaut', version: '0.2.0' },
    { capabilities: { tools: {} } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'bathynaut_sonar',
          description: 'Pre-Edit Acoustic Radar v0.2 SOTA: Returns AST call blast radius, execution flows, risk score, test coverage, blocking invariants, and governing ADRs/incidents in 1 call within token_budget.',
          inputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, description: 'Target files to be modified or analyzed' },
              git_diff: { type: 'string', description: 'Optional Git ref (e.g., "HEAD", "main") to detect changed lines automatically' },
              token_budget: { type: 'number', default: 2500, description: 'Maximum token budget for returned excerpts' },
              project_path: { type: 'string', description: 'Optional repository path (for multi-project routing)' }
            }
          }
        },
        {
          name: 'bathynaut_dive',
          description: 'Macro Topological View v0.2: Explores functional Louvain communities (with cohesion score), God Nodes, Bridge Nodes, critical Execution Flows, surprising_connections, and knowledge_gaps.',
          inputSchema: {
            type: 'object',
            properties: {
              community_id: { type: 'number', description: 'Optional community ID to inspect' },
              query: { type: 'string', description: 'Optional search query for subsystems' },
              rename_symbol: { type: 'string', description: 'Optional symbol name/ID to preview cross-file rename impact' },
              new_name: { type: 'string', description: 'Desired new name for rename_symbol preview' },
              project_path: { type: 'string', description: 'Optional repository path' }
            }
          }
        },
        {
          name: 'bathynaut_path',
          description: 'Acoustic Pathfinding: Finds the shortest directed/bidirectional path connecting two components, functions, or Zettelkasten notes with edge relations and confidence tiers.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source node ID or symbol name' },
              to: { type: 'string', description: 'Target node ID or symbol name' },
              project_path: { type: 'string', description: 'Optional repository path' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'bathynaut_recall',
          description: 'Hybrid RRF Causal Memory (FTS5 BM25 + Identifier Splitting + PageRank + 1-Hop Backlinks): Searches across decisions (ADRs), incidents, patterns, entities, architecture, and code, or batch-reads by IDs.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query, symbol, or natural language question' },
              ids: { type: 'array', items: { type: 'string' }, description: 'Direct batch read of specific note/symbol IDs' },
              category: { type: 'string', enum: ['decisions', 'incidents', 'patterns', 'entities', 'architecture'], description: 'Optional CoALA category filter' },
              include_superseded: { type: 'boolean', default: true, description: 'Include superseded/deprecated notes in results' },
              cross_repo: { type: 'boolean', default: false, description: 'Federated search across all registered Bathynaut repositories' },
              limit: { type: 'number', default: 10 },
              token_budget: { type: 'number', default: 2000 },
              project_path: { type: 'string', description: 'Optional repository path' }
            }
          }
        },
        {
          name: 'bathynaut_log_adr',
          description: 'CoALA Cognitive Persistence + Immediate Auto-Interlinking: Compiles an atomic note (decisions, incidents, patterns, entities, architecture) with enforcement, invariants, symbols, sources, and typed edges.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional declarative kebab-case ID (e.g., adr-001-auth-jwt)' },
              title: { type: 'string', description: 'Note or decision title' },
              summary: { type: 'string', description: 'Short summary (up to 180 chars) for index.md' },
              category: { type: 'string', enum: ['decisions', 'incidents', 'patterns', 'entities', 'architecture'], default: 'decisions' },
              context: { type: 'string', description: 'Context and motivation' },
              decision: { type: 'string', description: 'Decision taken or technical specification' },
              body_markdown: { type: 'string', description: 'Optional full Markdown body (alternative to context + decision)' },
              enforcement: { type: 'string', enum: ['blocking', 'warning', 'advisory'], default: 'advisory' },
              invariants: { type: 'array', items: { type: 'string' }, description: 'List of verifiable invariants' },
              applies_to: { type: 'array', items: { type: 'string' }, description: 'File scope glob patterns' },
              symbols: { type: 'array', items: { type: 'string' }, description: 'Explicitly anchored code symbols' },
              sources: { type: 'array', items: { type: 'string' }, description: 'Raw source files in raw/ compiled by this note' },
              edges: { type: 'object', description: 'Typed semantic edge arrays (supersedes, mitigates, caused_by, depends_on, implements, tensions_with, verified_by)' },
              supersedes: { type: 'string', description: 'ID of superseded ADR' },
              mitigates: { type: 'string', description: 'ID of mitigated incident' },
              caused_by: { type: 'string', description: 'ID of root cause' },
              depends_on: { type: 'string', description: 'ID of dependency' },
              implements: { type: 'string', description: 'ID of implemented pattern/architecture' },
              tensions_with: { type: 'string', description: 'ID of note with architectural tension/trade-off' },
              verified_by: { type: 'string', description: 'ID of verifying test suite' },
              project_path: { type: 'string', description: 'Optional repository path' }
            },
            required: ['title']
          }
        },
        {
          name: 'bathynaut_checkpoint',
          description: 'Episodic Session Memory: Freezes the hot working state of the current session in activeContext.md.',
          inputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Summary of session progress' },
              active_tasks: { type: 'array', items: { type: 'string' }, description: 'Next active tasks' },
              decisions: { type: 'array', items: { type: 'string' }, description: 'Decisions made during the turn' },
              project_path: { type: 'string', description: 'Optional repository path' }
            },
            required: ['summary', 'active_tasks']
          }
        },
        {
          name: 'bathynaut_lint',
          description: '5D Graph Health Audit: Detects orphan nodes, broken edges, Stale ADRs (governed code modified), untested God Nodes, and uncompiled raw files in raw/.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Optional repository path' }
            }
          }
        }
      ]
    };
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const rawArgs = args as Record<string, any>;

    // Infer workspace hint from project_path, workspace_hint, or any absolute path in files/file_paths/sources/applies_to
    const pathCandidates: string[] = [
      ...(Array.isArray(rawArgs.files) ? rawArgs.files : []),
      ...(Array.isArray(rawArgs.file_paths) ? rawArgs.file_paths : []),
      ...(Array.isArray(rawArgs.sources) ? rawArgs.sources : []),
      ...(Array.isArray(rawArgs.applies_to) ? rawArgs.applies_to : [])
    ];
    const absCandidate = pathCandidates.find(p => typeof p === 'string' && path.isAbsolute(p));
    const inferredHint = (rawArgs.project_path || rawArgs.workspace_hint || absCandidate) as string | undefined;

    let activeDb = defaultDb;
    let activeMemoryRoot = defaultMemoryRoot;
    let activeProjectRoot = defaultProjectRoot;

    if (inferredHint) {
      const ctx = pool.getContext(inferredHint);
      activeDb = ctx.db;
      activeMemoryRoot = ctx.memoryRoot;
      activeProjectRoot = ctx.projectRoot;
      await ensureFreshGraph(activeProjectRoot, activeDb, activeMemoryRoot);
    }

    switch (name) {
      case 'bathynaut_sonar':
        return handleSonar(activeDb, SonarSchema.parse(args), activeProjectRoot);
      case 'bathynaut_dive':
        return handleDive(activeDb, DiveSchema.parse(args));
      case 'bathynaut_path':
        return handlePath(activeDb, PathSchema.parse(args));
      case 'bathynaut_recall':
        return handleRecall(activeDb, RecallSchema.parse(args));
      case 'bathynaut_log_adr':
        return handleLogAdr(activeDb, activeMemoryRoot, LogAdrSchema.parse(args));
      case 'bathynaut_checkpoint':
        return handleCheckpoint(activeMemoryRoot, CheckpointSchema.parse(args));
      case 'bathynaut_lint':
        LintSchema.parse(args);
        return handleLint(activeDb, activeMemoryRoot);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

export async function runServerStdio(db: Database, memoryRoot: string, projectRoot: string = process.cwd()) {
  const server = createMCPServer(db, memoryRoot, projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
