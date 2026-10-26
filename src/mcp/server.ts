import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from 'better-sqlite3';
import { handleSonar, SonarSchema } from './tools/sonar.js';
import { handleDive, DiveSchema } from './tools/dive.js';
import { handlePath, PathSchema } from './tools/path.js';
import { handleRecall, RecallSchema } from './tools/recall.js';
import { handleLogAdr, LogAdrSchema } from './tools/log-adr.js';
import { handleCheckpoint, CheckpointSchema } from './tools/checkpoint.js';
import { handleLint } from './tools/lint.js';

export function createMCPServer(db: Database, memoryRoot: string): Server {
  const server = new Server(
    { name: 'bathynaut', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'bathynaut_sonar',
          description: 'Radar Acustico Pre-Edicao: Retorna blast radius de chamadas AST, testes de cobertura e ADRs/incidentes que governam os arquivos em 1 chamada.',
          inputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, description: 'Arquivos a serem modificados' }
            },
            required: ['files']
          }
        },
        {
          name: 'bathynaut_dive',
          description: 'Visao Macro Topologica: Explora comunidades funcionais (Leiden/Louvain) e identifica os God Nodes do repositorio.',
          inputSchema: {
            type: 'object',
            properties: {
              community_id: { type: 'number', description: 'ID da comunidade opcional' },
              query: { type: 'string', description: 'Busca textual de modulo' }
            }
          }
        },
        {
          name: 'bathynaut_path',
          description: 'Rastreamento Acustico de Caminho: Encontra o menor caminho direcionado conectando dois componentes ou funcoes.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Origem' },
              to: { type: 'string', description: 'Destino' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'bathynaut_recall',
          description: 'Memoria Causal FTS5 BM25: Busca full-text instantanea em decisoes passadas (ADRs), postmortems e modelos de dominio.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Termo de busca' },
              limit: { type: 'number', default: 10 }
            },
            required: ['query']
          }
        },
        {
          name: 'bathynaut_log_adr',
          description: 'Persistencia de Invariantes: Registra uma nova decisao de arquitetura (ADR) de forma atomica no Zettelkasten e atualiza o banco.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Titulo da decisao' },
              context: { type: 'string', description: 'Contexto e motivacao' },
              decision: { type: 'string', description: 'Decisao tomada' },
              applies_to: { type: 'array', items: { type: 'string' }, description: 'Globs de escopo' },
              supersedes: { type: 'string', description: 'ID da ADR substituida' },
              mitigates: { type: 'string', description: 'ID do incidente mitigado' }
            },
            required: ['title', 'context', 'decision']
          }
        },
        {
          name: 'bathynaut_checkpoint',
          description: 'Memoria de Sessao: Congela o estado mental quente da sessao em activeContext.md.',
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
          description: 'Auditoria de Saude do Grafo: Detecta nos orfaos, arestas quebradas e integridade do ecossistema.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case 'bathynaut_sonar':
        return handleSonar(db, SonarSchema.parse(args));
      case 'bathynaut_dive':
        return handleDive(db, DiveSchema.parse(args));
      case 'bathynaut_path':
        return handlePath(db, PathSchema.parse(args));
      case 'bathynaut_recall':
        return handleRecall(db, RecallSchema.parse(args));
      case 'bathynaut_log_adr':
        return handleLogAdr(db, memoryRoot, LogAdrSchema.parse(args));
      case 'bathynaut_checkpoint':
        return handleCheckpoint(memoryRoot, CheckpointSchema.parse(args));
      case 'bathynaut_lint':
        return handleLint(db);
      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  });

  return server;
}

export async function runServerStdio(db: Database, memoryRoot: string) {
  const server = createMCPServer(db, memoryRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
