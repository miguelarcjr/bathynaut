import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { injectRulesFile, injectMCPConfig } from '../src/installer/injector.js';
import { scaffoldMemoryVault } from '../src/installer/vault-scaffold.js';

describe('Bathynaut Multi-Agent Auto-Installer & Vault Scaffolder', () => {
  const testRoot = path.resolve('tests/temp-project');

  beforeEach(() => {
    if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('should scaffold complete .bathynaut/memory Karpathy-compliant vault', () => {
    const memoryDir = scaffoldMemoryVault(testRoot);
    expect(fs.existsSync(memoryDir)).toBe(true);
    expect(fs.existsSync(path.join(memoryDir, 'wiki', 'decisions'))).toBe(true);
    expect(fs.existsSync(path.join(memoryDir, 'activeContext.md'))).toBe(true);
    expect(fs.existsSync(path.join(memoryDir, '.obsidian', 'graph.json'))).toBe(true);
  });

  it('should inject protocol rules into CLAUDE.md/AGENTS.md idempotently', () => {
    const rulesPath = path.join(testRoot, 'CLAUDE.md');
    fs.writeFileSync(rulesPath, '# Regras Antigas\nCustom user stuff\n', 'utf-8');

    injectRulesFile(rulesPath);
    let content = fs.readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('Custom user stuff');
    expect(content).toContain('<!-- BATHYNAUT:START -->');
    expect(content).toContain('Bathynaut Oceanic Navigation Protocol');

    // Run again - must be idempotent (no duplicate blocks)
    injectRulesFile(rulesPath);
    content = fs.readFileSync(rulesPath, 'utf-8');
    const matches = content.match(/<!-- BATHYNAUT:START -->/g);
    expect(matches?.length).toBe(1);
  });

  it('should inject MCP configuration into config JSON without clobbering existing servers', () => {
    const configPath = path.join(testRoot, 'mcp.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        existingServer: { command: 'other' }
      }
    }), 'utf-8');

    injectMCPConfig(configPath, 'dist/cli/main.js');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.mcpServers.existingServer).toBeDefined();
    expect(config.mcpServers.bathynaut).toBeDefined();
    expect(config.mcpServers.bathynaut.command).toBe('node');
  });
});
