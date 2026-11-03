import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runInitCommand } from '../src/cli/commands/init.js';
import { runDisconnectCommand } from '../src/cli/commands/disconnect.js';
import { evaluateHookGuard } from '../src/cli/commands/hooks.js';
import { initDatabase, getDatabasePath } from '../src/storage/db.js';
import { handleLogAdr } from '../src/mcp/tools/log-adr.js';
import { resolveMemoryVault } from '../src/storage/pool.js';

describe('Universal Multi-Agent Harness Installer v2 (Hooks, Skills, Rules, MCP Configs)', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'bathynaut-harness-'));
    const srcDir = path.join(tmpRepo, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'payment.ts'),
      'export function processCharge(amount: number) { return amount > 0; }\n',
      'utf-8'
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    } catch {}
  });

  it('deve configurar Rules nativas (@[...] includes e .mdc), MCP Configs especificos por plataforma, 6 Skills e Lifecycle Hooks (SessionStart/PreToolUse)', async () => {
    // Simula um repositorio Git real + artefatos legados da Triade para testar auto-limpeza
    fs.mkdirSync(path.join(tmpRepo, '.git', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, '.agents', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, '.agents', 'rules', 'graphify.md'), '# Legacy Graphify', 'utf-8');
    fs.mkdirSync(path.join(tmpRepo, '.agents', 'skills', 'build-graph'), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, '.agents', 'skills', 'build-graph', 'SKILL.md'), '# Legacy CRG', 'utf-8');

    await runInitCommand(tmpRepo);

    // 0. Artefatos legados da Triade devem ter sido limpos
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'rules', 'graphify.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'skills', 'build-graph'))).toBe(false);

    // 1. Rules & Context Includes (AGENTS.md expande @[...], enquanto GEMINI.md e bathynaut.md evitam duplicacao)
    const agentsMd = fs.readFileSync(path.join(tmpRepo, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('@[Active Session Context](.bathynaut/memory/activeContext.md)');
    expect(agentsMd).toContain('@[Wiki Index](.bathynaut/memory/index.md)');

    const geminiMd = fs.readFileSync(path.join(tmpRepo, 'GEMINI.md'), 'utf-8');
    expect(geminiMd).toContain('.bathynaut/memory/activeContext.md');

    const agyModularRule = fs.readFileSync(path.join(tmpRepo, '.agents', 'rules', 'bathynaut.md'), 'utf-8');
    expect(agyModularRule).toContain('trigger: model_decision');
    expect(agyModularRule).toContain('.bathynaut/memory/activeContext.md');

    const claudeMd = fs.readFileSync(path.join(tmpRepo, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('@.bathynaut/memory/activeContext.md');

    const cursorMdc = fs.readFileSync(path.join(tmpRepo, '.cursor', 'rules', 'bathynaut.mdc'), 'utf-8');
    expect(cursorMdc).toContain('alwaysApply: true');
    expect(cursorMdc).toContain('globs: "**/*"');

    // 2. MCP Configs por plataforma + pinagem de -d <projectRoot>
    const vscodeMcp = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.vscode', 'mcp.json'), 'utf-8'));
    expect(vscodeMcp.servers.bathynaut).toBeDefined();
    expect(vscodeMcp.servers.bathynaut.type).toBe('stdio');
    expect(vscodeMcp.servers.bathynaut.args).toContain('-d');
    expect(vscodeMcp.servers.bathynaut.args).toContain(tmpRepo.replace(/\\/g, '/'));

    const claudeProjectMcp = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.mcp.json'), 'utf-8'));
    expect(claudeProjectMcp.mcpServers.bathynaut.type).toBe('stdio');
    expect(claudeProjectMcp.mcpServers.bathynaut.args).toContain(tmpRepo.replace(/\\/g, '/'));

    const openCodeMcp = JSON.parse(fs.readFileSync(path.join(tmpRepo, 'opencode.json'), 'utf-8'));
    expect(openCodeMcp.mcp.bathynaut.type).toBe('local');
    expect(openCodeMcp.mcp.bathynaut.enabled).toBe(true);

    // 3. Skills descobertas pelos agentes (.agents/skills, .claude/skills, .cursor/skills)
    const expectedSkills = [
      'bathynaut-map-project',
      'bathynaut-wiki-compile',
      'bathynaut-wiki-lint',
      'bathynaut-session-checkpoint',
      'bathynaut-review-changes',
      'bathynaut-refactor-safely'
    ];
    for (const skill of expectedSkills) {
      expect(fs.existsSync(path.join(tmpRepo, '.agents', 'skills', skill, 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpRepo, '.claude', 'skills', skill, 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpRepo, '.cursor', 'skills', skill, 'SKILL.md'))).toBe(true);
    }

    // 4. Git Hooks (post-merge, post-commit, post-checkout) & Agent Lifecycle Hooks
    expect(fs.existsSync(path.join(tmpRepo, '.git', 'hooks', 'post-merge'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRepo, '.git', 'hooks', 'post-commit'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRepo, '.git', 'hooks', 'post-checkout'))).toBe(true);

    const agyHooks = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.agents', 'hooks.json'), 'utf-8'));
    expect(agyHooks['bathynaut-guard']).toBeDefined();
    expect(agyHooks['bathynaut-guard'].SessionStart.length).toBeGreaterThan(0);
    expect(agyHooks['bathynaut-guard'].PreInvocation.length).toBeGreaterThan(0);
    expect(agyHooks['bathynaut-guard'].PreToolUse[0].matcher).toBe('edit_file|write_file');
    expect(agyHooks['bathynaut-guard'].PostToolUse[0].matcher).toBe('edit_file|write_file');

    const claudeSettings = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.claude', 'settings.json'), 'utf-8'));
    expect(claudeSettings.hooks.SessionStart.length).toBeGreaterThan(0);
    expect(claudeSettings.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
    expect(claudeSettings.hooks.PreToolUse[0].matcher).toBe('Edit|Write|MultiEdit');
    expect(claudeSettings.hooks.PostToolUse[0].matcher).toBe('Edit|Write|MultiEdit');

    const cursorHooks = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.cursor', 'hooks.json'), 'utf-8'));
    expect(cursorHooks.hooks.beforeSubmitPrompt.length).toBeGreaterThan(0);
    expect(cursorHooks.hooks.beforeShellExecution.length).toBeGreaterThan(0);
    expect(cursorHooks.hooks.afterFileEdit.length).toBeGreaterThan(0);

    // 5. Testa avaliacao real do Hook Guard (SessionStart + PreInvocation + PreToolUse com ADR blocking e Blast Radius)
    const db = initDatabase(getDatabasePath(tmpRepo));
    const { memoryRoot } = resolveMemoryVault(tmpRepo);
    handleLogAdr(db, memoryRoot, {
      id: 'adr-001-idempotency-key',
      category: 'decisions',
      title: 'Exigir Idempotency Key em Cobrancas',
      context: 'Evitar cobranca duplicada em retries.',
      decision: 'Toda chamada em payment.ts deve exigir idempotencyKey.',
      enforcement: 'blocking',
      invariants: ['Nunca processar cobranca sem idempotencyKey validada'],
      applies_to: ['src/payment.ts']
    });
    db.close();

    const sessionGuard = evaluateHookGuard(tmpRepo, 'SessionStart', {}, 'antigravity');
    expect(sessionGuard.injectSteps?.[0]).toHaveProperty('systemMessage');
    expect(sessionGuard.hookSpecificOutput?.additionalContext).toContain('Bathynaut Session Context');

    const preInvokeGuard = evaluateHookGuard(tmpRepo, 'PreInvocation', { invocationNum: 1 }, 'antigravity');
    expect(preInvokeGuard.injectSteps?.[0]).toHaveProperty('ephemeralMessage');
    expect(preInvokeGuard.hookSpecificOutput?.additionalContext).toContain('bathynaut_sonar');

    // Se invocationNum > 1, PreInvocation nao deve poluir passos intermediarios
    const preInvokeStep2 = evaluateHookGuard(tmpRepo, 'PreInvocation', { invocationNum: 2 }, 'antigravity');
    expect(preInvokeStep2.injectSteps).toBeUndefined();

    const preToolGuard = evaluateHookGuard(
      tmpRepo,
      'PreToolUse',
      {
        toolCall: { name: 'edit_file', args: { Path: path.join(tmpRepo, 'src', 'payment.ts') } }
      },
      'antigravity'
    );
    expect(preToolGuard.decision).toBe('allow');
    expect(preToolGuard.reason).toContain('AST Blast Radius:');
    expect(preToolGuard.reason).toContain('[BLOCKING] adr-001-idempotency-key');
    expect(preToolGuard.reason).toContain('Nunca processar cobranca sem idempotencyKey validada');

    const claudePreTool = evaluateHookGuard(
      tmpRepo,
      'PreToolUse',
      {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmpRepo, 'src', 'payment.ts') }
      },
      'claude-code'
    );
    expect(claudePreTool.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(claudePreTool.hookSpecificOutput?.additionalContext).toContain('[BLOCKING] adr-001-idempotency-key');

    // 6. Disconnect deve limpar regras, hooks e skills de agentes preservando o cofre .bathynaut/memory
    runDisconnectCommand(tmpRepo);
    expect(fs.existsSync(path.join(tmpRepo, '.cursor', 'rules', 'bathynaut.mdc'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'rules', 'bathynaut.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'skills', 'bathynaut-map-project'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.bathynaut', 'memory', 'wiki'))).toBe(true);
  });
});

