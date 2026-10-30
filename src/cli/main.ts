import { Command } from 'commander';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { runInitCommand } from './commands/init.js';
import { runMapCommand } from './commands/map.js';
import { runReviewCommand } from './commands/review.js';
import { runDisconnectCommand } from './commands/disconnect.js';
import { runHooksCommand, evaluateHookGuard } from './commands/hooks.js';
import { initDatabase, getDatabasePath } from '../storage/db.js';
import { resolveMemoryVault } from '../storage/pool.js';
import { runServerStdio } from '../mcp/server.js';
import { exportExplorerHTML } from '../explorer/exporter.js';
import { handleLint } from '../mcp/tools/lint.js';

const program = new Command();

program
  .name('bathynaut')
  .description('The Unified Oceanic Cognitive Architecture & Memory Harness for AI Coding Agents (v0.2 SOTA)')
  .version('0.2.0');

program
  .command('init')
  .description('Inicializa o cofre Zettelkasten CoALA, injeta regras/MCP/hooks/skills nos agentes detectados e mapeia o projeto')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action(async (opts) => {
    await runInitCommand(path.resolve(opts.dir));
  });

program
  .command('map')
  .description('Sincroniza incrementalmente AST + Zettelkasten, calcula comunidades, PageRank, fluxos e gera bathynaut.html')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .option('-f, --force', 'Forcar reindexacao completa de todos os arquivos', false)
  .action(async (opts) => {
    await runMapCommand(path.resolve(opts.dir), { force: opts.force });
  });

program
  .command('review [files...]')
  .description('Audita impacto pre-commit ou pre-PR (Blast Radius, Risk Score, Blocking Invariants e Cobertura de Testes)')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .option('-b, --base <ref>', 'Ref Git base para diff (ex: HEAD, main)', 'HEAD')
  .option('-t, --token-budget <tokens>', 'Orcamento maximo de tokens', '2500')
  .option('--json', 'Exibir saida em JSON puro', false)
  .action(async (files, opts) => {
    await runReviewCommand(path.resolve(opts.dir), files, {
      baseRef: opts.base,
      tokenBudget: parseInt(opts.tokenBudget, 10) || 2500,
      json: opts.json
    });
  });

program
  .command('serve')
  .description('Inicia o servidor MCP Bathynaut via stdio com suporte a roteamento multi-projeto e sync JIT')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action(async (opts) => {
    const projectRoot = path.resolve(opts.dir);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    const { memoryRoot } = resolveMemoryVault(projectRoot);
    await runServerStdio(db, memoryRoot, projectRoot);
  });

program
  .command('explore')
  .description('Exporta e abre o explorador visual interativo bathynaut.html no navegador')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action((opts) => {
    const projectRoot = path.resolve(opts.dir);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    const htmlPath = path.join(projectRoot, '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, htmlPath);
    db.close();
    console.log(`🌐 Abrindo Ocean Canvas Explorer: ${htmlPath}`);

    const platform = process.platform;
    if (platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', htmlPath]);
    } else if (platform === 'darwin') {
      execFile('open', [htmlPath]);
    } else {
      execFile('xdg-open', [htmlPath]);
    }
  });

program
  .command('doctor')
  .description('Executa auditoria 5D de saude do grafo (orfaos, arestas quebradas, Stale ADRs, God Nodes sem teste, raw/)')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action((opts) => {
    const projectRoot = path.resolve(opts.dir);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    const { memoryRoot } = resolveMemoryVault(projectRoot);
    const res = handleLint(db, memoryRoot);
    console.log(res.content[0].text);
    db.close();
  });

program
  .command('disconnect')
  .description('Remove as instrucoes injetadas, hooks, skills e a configuracao MCP preservando intacto o cofre .bathynaut/memory/')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action((opts) => {
    runDisconnectCommand(path.resolve(opts.dir));
  });

program
  .command('hooks [action]')
  .description('Instala ou remove hooks Git nativos e Agent Lifecycle Hooks (install | uninstall)')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .action((action = 'install', opts) => {
    runHooksCommand(path.resolve(opts.dir), action === 'uninstall' ? 'uninstall' : 'install');
  });

program
  .command('hook-guard')
  .description('Avaliador rapido (<15ms) de Lifecycle Hooks (SessionStart | PreToolUse) para Antigravity, Claude Code, Cursor e Gemini CLI')
  .option('-d, --dir <path>', 'Diretorio raiz do projeto', process.cwd())
  .option('-e, --event <event>', 'Evento do hook (SessionStart | PreToolUse)', 'SessionStart')
  .action(async (opts) => {
    const projectRoot = path.resolve(opts.dir);
    const event = opts.event === 'PreToolUse' ? 'PreToolUse' : 'SessionStart';

    let rawStdin = '';
    if (!process.stdin.isTTY) {
      rawStdin = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        const timer = setTimeout(() => resolve(Buffer.concat(chunks).toString('utf-8')), 40);
        process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        process.stdin.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        process.stdin.on('error', () => {
          clearTimeout(timer);
          resolve('');
        });
      });
    }

    let payload: Record<string, any> = {};
    if (rawStdin.trim()) {
      try {
        payload = JSON.parse(rawStdin);
      } catch {}
    }

    const out = evaluateHookGuard(projectRoot, event, payload);
    if (out.hookSpecificOutput) {
      process.stdout.write(JSON.stringify(out) + '\n');
    }
  });

program.parse();
