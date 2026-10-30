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
          description: 'Radar Acustico Pre-Edicao v0.2 SOTA: Retorna blast radius de chamadas AST, fluxos de execucao, risk score, testes de cobertura, blocking invariants e ADRs/incidentes em 1 chamada com empacotamento por token_budget.',
          inputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, description: 'Arquivos a serem modificados' },
              git_diff: { type: 'string', description: 'Ref Git opcional (ex: "HEAD", "main") para detectar mudancas automaticamente' },
              token_budget: { type: 'number', default: 2500, description: 'Orcamento maximo de tokens' },
              project_path: { type: 'string', description: 'Caminho opcional do repositorio (multi-project routing)' }
            }
          }
        },
        {
          name: 'bathynaut_dive',
          description: 'Visao Macro Topologica v0.2: Explora comunidades funcionais (com metrica de coesao), God Nodes, Bridge Nodes e Execution Flows criticos.',
          inputSchema: {
            type: 'object',
            properties: {
              community_id: { type: 'number', description: 'ID da comunidade opcional' },
              query: { type: 'string', description: 'Busca textual de modulo' },
              project_path: { type: 'string', description: 'Caminho opcional do repositorio' }
            }
          }
        },
        {
          name: 'bathynaut_path',
          description: 'Rastreamento Acustico de Caminho: Encontra o menor caminho direcionado conectando dois componentes ou funcoes com relacoes e confianca.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Origem (ID ou nome do simbolo)' },
              to: { type: 'string', description: 'Destino (ID ou nome do simbolo)' },
              project_path: { type: 'string', description: 'Caminho opcional do repositorio' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'bathynaut_recall',
          description: 'Memoria Causal Hybrid RRF (FTS5 BM25 + Tokenizacao de Identificadores + PageRank + Backlinks 1-Hop): Busca em decisoes (ADRs), incidentes, padroes, entidades, arquitetura e codigo.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Termo, simbolo ou pergunta de busca' },
              limit: { type: 'number', default: 10 },
              token_budget: { type: 'number', default: 2000 },
              project_path: { type: 'string', description: 'Caminho opcional do repositorio' }
            },
            required: ['query']
          }
        },
        {
          name: 'bathynaut_log_adr',
          description: 'Persistencia Cognitiva CoALA + Auto-Interlinking Imediato: Registra uma nota atomica (decisions, incidents, patterns, entities, architecture) com enforcement, invariantes e simbolos.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Titulo da nota/decisao' },
              category: { type: 'string', enum: ['decisions', 'incidents', 'patterns', 'entities', 'architecture'], default: 'decisions' },
              context: { type: 'string', description: 'Contexto e motivacao' },
              decision: { type: 'string', description: 'Decisao tomada ou especificacao' },
              enforcement: { type: 'string', enum: ['blocking', 'warning', 'advisory'], default: 'advisory' },
              invariants: { type: 'array', items: { type: 'string' }, description: 'Lista de invariantes verificaveis' },
              applies_to: { type: 'array', items: { type: 'string' }, description: 'Globs de escopo de arquivos' },
              symbols: { type: 'array', items: { type: 'string' }, description: 'Simbolos de codigo ancorados' },
              supersedes: { type: 'string', description: 'ID da ADR substituida' },
              mitigates: { type: 'string', description: 'ID do incidente mitigado' },
              caused_by: { type: 'string', description: 'ID da causa raiz' },
              depends_on: { type: 'string', description: 'ID de dependencia' },
              implements: { type: 'string', description: 'ID de padrao/arquitetura implementado' },
              tensions_with: { type: 'string', description: 'ID de nota com tensao/trade-off' },
              verified_by: { type: 'string', description: 'ID de teste verificador' },
              project_path: { type: 'string', description: 'Caminho opcional do repositorio' }
            },
            required: ['title', 'context', 'decision']
          }
        },
        {
          name: 'bathynaut_checkpoint',
          description: 'Memoria Episodica de Sessao: Congela o estado mental quente da sessao em activeContext.md.',
          inputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Resumo do turno' },
              active_tasks: { type: 'array', items: { type: 'string' }, description: 'Proximas tarefas' },
              decisions: { type: 'array', items: { type: 'string' }, description: 'Decisoes tomadas' }
            },
            required: ['summary', 'active_tasks']
          }
        },
        {
          name: 'bathynaut_lint',
          description: 'Auditoria 5D de Saude do Grafo: Detecta nos orfaos, arestas quebradas, Stale ADRs (codigo alterado), God Nodes sem testes e arquivos brutos pendentes em raw/.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Caminho opcional do repositorio' }
            }
          }
        }
      ]
    };
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const rawProjectPath = (args as any)?.project_path as string | undefined;

    let activeDb = defaultDb;
    let activeMemoryRoot = defaultMemoryRoot;
    let activeProjectRoot = defaultProjectRoot;

    if (rawProjectPath) {
      const ctx = pool.getContext(rawProjectPath);
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
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  });

  return server;
}

export async function runServerStdio(db: Database, memoryRoot: string, projectRoot: string = process.cwd()) {
  const server = createMCPServer(db, memoryRoot, projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
