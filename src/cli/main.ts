import { Command } from 'commander';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { runInitCommand } from './commands/init.js';
import { runMapCommand } from './commands/map.js';
import { runReviewCommand } from './commands/review.js';
import { runDisconnectCommand } from './commands/disconnect.js';
import { runHooksCommand, evaluateHookGuard, evaluatePostToolSync, HookEventName, HookAgentKind } from './commands/hooks.js';
import { initDatabase, getDatabasePath } from '../storage/db.js';
import { resolveMemoryVault } from '../storage/pool.js';
import { runServerStdio } from '../mcp/server.js';
import { exportExplorerHTML } from '../explorer/exporter.js';
import { handleLint } from '../mcp/tools/lint.js';

const program = new Command();

program
  .name('bathynaut')
  .description('Local AST code graph, topological analyzer, and ADR/Zettelkasten memory server (MCP) for AI coding agents')
  .version('0.2.0');

program
  .command('init')
  .description('Initialize the CoALA Zettelkasten vault, inject rules/MCP/hooks/skills across detected agents, and map the project')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action(async (opts) => {
    await runInitCommand(path.resolve(opts.dir));
  });

program
  .command('map')
  .description('Incrementally sync AST + Zettelkasten, compute Louvain communities, PageRank, flows, and export bathynaut.html')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .option('-f, --force', 'Force full re-index of all files', false)
  .action(async (opts) => {
    await runMapCommand(path.resolve(opts.dir), { force: opts.force });
  });

program
  .command('review [files...]')
  .description('Audit pre-commit or pre-PR impact (Blast Radius, Risk Score, Blocking Invariants, and Test Coverage)')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .option('-b, --base <ref>', 'Base Git ref for diff (e.g., HEAD, main)', 'HEAD')
  .option('-t, --token-budget <tokens>', 'Maximum token budget', '2500')
  .option('--json', 'Output raw JSON report', false)
  .action(async (files, opts) => {
    await runReviewCommand(path.resolve(opts.dir), files, {
      baseRef: opts.base,
      tokenBudget: parseInt(opts.tokenBudget, 10) || 2500,
      json: opts.json
    });
  });

program
  .command('serve')
  .description('Start the Bathynaut MCP server over stdio with multi-project routing and JIT incremental sync')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action(async (opts) => {
    const projectRoot = path.resolve(opts.dir);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    const { memoryRoot } = resolveMemoryVault(projectRoot);
    await runServerStdio(db, memoryRoot, projectRoot);
  });

program
  .command('explore')
  .description('Export and open the interactive bathynaut.html visual explorer in your browser')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action((opts) => {
    const projectRoot = path.resolve(opts.dir);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    const htmlPath = path.join(projectRoot, '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, htmlPath);
    db.close();
    console.log(`🌐 Opening Ocean Canvas Explorer: ${htmlPath}`);

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
  .description('Run graph and memory lint diagnostics (orphans, broken edges, stale ADRs, untested God Nodes, pending raw/)')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
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
  .description('Remove injected rules, hooks, skills, and MCP configuration while keeping .bathynaut/memory/ intact')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action((opts) => {
    runDisconnectCommand(path.resolve(opts.dir));
  });

program
  .command('hooks [action]')
  .description('Install or remove native Git hooks and Agent Lifecycle Hooks (install | uninstall)')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action((action = 'install', opts) => {
    runHooksCommand(path.resolve(opts.dir), action === 'uninstall' ? 'uninstall' : 'install');
  });

program
  .command('hook-guard')
  .description('Multi-Agent Lifecycle Hook evaluator (SessionStart | PreInvocation | PreToolUse | PostToolUse)')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .option('-e, --event <event>', 'Hook event name (SessionStart | PreInvocation | PreToolUse | PostToolUse)', 'SessionStart')
  .option('-a, --agent <agent>', 'Target agent contract (antigravity | claude-code | cursor | gemini-cli)', 'antigravity')
  .action(async (opts) => {
    const cleanedDir = String(opts.dir || process.cwd()).replace(/^["']+|["']+$/g, '');
    let projectRoot = path.resolve(cleanedDir);
    if (path.basename(projectRoot) === '.agents') projectRoot = path.dirname(projectRoot);
    const validEvents: HookEventName[] = ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse'];
    const event: HookEventName = validEvents.includes(opts.event) ? opts.event : 'SessionStart';
    const agent: HookAgentKind = ['antigravity', 'claude-code', 'cursor', 'gemini-cli'].includes(opts.agent)
      ? opts.agent
      : 'antigravity';

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

    if (event === 'PostToolUse') {
      const out = await evaluatePostToolSync(projectRoot);
      process.stdout.write(JSON.stringify(out) + '\n');
      return;
    }

    const out = evaluateHookGuard(projectRoot, event, payload, agent);
    if (agent === 'antigravity') {
      const { hookSpecificOutput: _, ...agyPure } = out;
      if (Object.keys(agyPure).length > 0) {
        process.stdout.write(JSON.stringify(agyPure) + '\n');
      } else if (event === 'PreToolUse') {
        process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
      } else {
        process.stdout.write('{}\n');
      }
      return;
    }

    if (Object.keys(out).length > 0) {
      process.stdout.write(JSON.stringify(out) + '\n');
    }
  });

program.parse();
