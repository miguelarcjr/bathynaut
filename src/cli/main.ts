#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { getDatabasePath, initDatabase } from '../storage/db.js';
import { runServerStdio } from '../mcp/server.js';
import { runInitCommand } from './commands/init.js';
import { runMapCommand } from './commands/map.js';
import { exportExplorerHTML } from '../explorer/exporter.js';
import { handleLint } from '../mcp/tools/lint.js';

const program = new Command();

program
  .name('bathynaut')
  .description('The Unified Oceanic Cognitive Architecture & Memory Harness for AI Coding Agents')
  .version('0.1.0');

program
  .command('init')
  .description('Inicializa o cofre de memoria, detecta editores e injeta regras e MCP')
  .action(async () => {
    await runInitCommand(process.cwd());
  });

program
  .command('map')
  .description('Executa varredura profunda de AST e Zettelkasten gerando ocean.db')
  .action(async () => {
    await runMapCommand(process.cwd());
  });

program
  .command('explorer')
  .description('Exporta o dashboard visual interativo D3.js bathynaut.html')
  .action(() => {
    const db = initDatabase(getDatabasePath(process.cwd()));
    const out = path.join(process.cwd(), '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, out);
    console.log(`🌊 Visualizador exportado em: ${out}`);
  });

program
  .command('lint')
  .description('Audita a saude do grafo de conhecimento (nos orfaos e links)')
  .action(() => {
    const db = initDatabase(getDatabasePath(process.cwd()));
    const report = handleLint(db);
    console.log(report.content[0].text);
  });

program
  .command('serve')
  .description('Inicia o servidor MCP Stdio para conexao com Claude Code, Cursor, etc.')
  .action(async () => {
    const root = process.cwd();
    const db = initDatabase(getDatabasePath(root));
    const memory = path.join(root, '.bathynaut', 'memory');
    await runServerStdio(db, memory);
  });

program.parse(process.argv);
