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
    // Simula um repositorio Git real
    fs.mkdirSync(path.join(tmpRepo, '.git', 'hooks'), { recursive: true });

    await runInitCommand(tmpRepo);

    // 1. Rules & Context Includes
    const agentsMd = fs.readFileSync(path.join(tmpRepo, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('@[Contexto Ativo](.bathynaut/memory/activeContext.md)');
    expect(agentsMd).toContain('@[Indice da Wiki](.bathynaut/memory/index.md)');

    const geminiMd = fs.readFileSync(path.join(tmpRepo, 'GEMINI.md'), 'utf-8');
    expect(geminiMd).toContain('@[Contexto Ativo](.bathynaut/memory/activeContext.md)');

    const agyModularRule = fs.readFileSync(path.join(tmpRepo, '.agents', 'rules', 'bathynaut.md'), 'utf-8');
    expect(agyModularRule).toContain('trigger: always_on');
    expect(agyModularRule).toContain('@[Contexto Ativo](.bathynaut/memory/activeContext.md)');

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
    expect(vscodeMcp.servers.bathynaut.args).toContain(tmpRepo);

    const claudeProjectMcp = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.mcp.json'), 'utf-8'));
    expect(claudeProjectMcp.mcpServers.bathynaut.type).toBe('stdio');
    expect(claudeProjectMcp.mcpServers.bathynaut.args).toContain(tmpRepo);

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
    expect(agyHooks.hooks.SessionStart.length).toBeGreaterThan(0);
    expect(agyHooks.hooks.PreToolUse.length).toBeGreaterThan(0);
    expect(agyHooks.hooks.PreToolUse[0].matcher).toBe('edit_file|write_file');

    const claudeSettings = JSON.parse(fs.readFileSync(path.join(tmpRepo, '.claude', 'settings.json'), 'utf-8'));
    expect(claudeSettings.hooks.SessionStart.length).toBeGreaterThan(0);
    expect(claudeSettings.hooks.PreToolUse[0].matcher).toBe('Edit|Write|MultiEdit');

    // 5. Testa avaliacao real do Hook Guard (SessionStart + PreToolUse com ADR blocking)
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

    const sessionGuard = evaluateHookGuard(tmpRepo, 'SessionStart');
    expect(sessionGuard.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(sessionGuard.hookSpecificOutput?.additionalContext).toContain('Bathynaut Session Context');

    const preToolGuard = evaluateHookGuard(tmpRepo, 'PreToolUse', {
      tool_name: 'edit_file',
      tool_input: { Path: path.join(tmpRepo, 'src', 'payment.ts') }
    });
    expect(preToolGuard.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(preToolGuard.hookSpecificOutput?.additionalContext).toContain('[BLOCKING] adr-001-idempotency-key');
    expect(preToolGuard.hookSpecificOutput?.additionalContext).toContain(
      'Nunca processar cobranca sem idempotencyKey validada'
    );

    // 6. Disconnect deve limpar regras, hooks e skills de agentes preservando o cofre .bathynaut/memory
    runDisconnectCommand(tmpRepo);
    expect(fs.existsSync(path.join(tmpRepo, '.cursor', 'rules', 'bathynaut.mdc'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'rules', 'bathynaut.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.agents', 'skills', 'bathynaut-map-project'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRepo, '.bathynaut', 'memory', 'wiki'))).toBe(true);
  });
});
