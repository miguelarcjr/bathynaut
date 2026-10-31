import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type MCPConfigFormat = 'mcpServers' | 'vscode-servers' | 'opencode-mcp';

export interface DetectedAgent {
  name: string;
  configPath: string;
  extraConfigPaths?: string[];
  mcpFormat?: MCPConfigFormat;
  rulesPath?: string;
  extraRulesPaths?: string[];
  skillsDir?: string;
  hooksConfigPath?: string;
}

export function detectInstalledAgents(projectRoot: string): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
  const homeDir = isTestEnv ? path.join(projectRoot, '.bathynaut', 'test-home') : os.homedir();

  // 1. Antigravity (Google DeepMind)
  const agyExtraConfigs = [
    path.join(homeDir, '.gemini', 'antigravity-ide', 'mcp_config.json')
  ];
  const geminiGlobalCfg = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(geminiGlobalCfg)) {
    agyExtraConfigs.push(geminiGlobalCfg);
  }

  const agyExtraRules = [
    path.join(projectRoot, 'GEMINI.md'),
    path.join(projectRoot, '.agents', 'rules', 'bathynaut.md')
  ];
  const dotAgentsGemini = path.join(projectRoot, '.agents', 'GEMINI.md');
  if (fs.existsSync(dotAgentsGemini)) {
    agyExtraRules.push(dotAgentsGemini);
  }

  agents.push({
    name: 'antigravity',
    configPath: path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
    extraConfigPaths: agyExtraConfigs,
    mcpFormat: 'mcpServers',
    rulesPath: path.join(projectRoot, 'AGENTS.md'),
    extraRulesPaths: agyExtraRules,
    skillsDir: path.join(projectRoot, '.agents', 'skills'),
    hooksConfigPath: path.join(projectRoot, '.agents', 'hooks.json')
  });

  // 2. Claude Code (Anthropic)
  agents.push({
    name: 'claude-code',
    configPath: path.join(homeDir, '.claude.json'),
    extraConfigPaths: [
      path.join(projectRoot, '.mcp.json')
    ],
    mcpFormat: 'mcpServers',
    rulesPath: path.join(projectRoot, 'CLAUDE.md'),
    skillsDir: path.join(projectRoot, '.claude', 'skills'),
    hooksConfigPath: path.join(projectRoot, '.claude', 'settings.json')
  });

  // 3. Cursor
  const cursorDir = path.join(projectRoot, '.cursor');
  agents.push({
    name: 'cursor',
    configPath: path.join(cursorDir, 'mcp.json'),
    mcpFormat: 'mcpServers',
    rulesPath: path.join(projectRoot, '.cursorrules'),
    extraRulesPaths: [
      path.join(cursorDir, 'rules', 'bathynaut.mdc')
    ],
    skillsDir: path.join(cursorDir, 'skills'),
    hooksConfigPath: path.join(cursorDir, 'hooks.json')
  });

  // 4. Windsurf (Codeium)
  agents.push({
    name: 'windsurf',
    configPath: path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
    mcpFormat: 'mcpServers',
    rulesPath: path.join(projectRoot, '.windsurfrules')
  });

  // 5. GitHub Copilot (VS Code)
  agents.push({
    name: 'copilot',
    configPath: path.join(projectRoot, '.vscode', 'mcp.json'),
    mcpFormat: 'vscode-servers',
    rulesPath: path.join(projectRoot, '.github', 'copilot-instructions.md')
  });

  // 6. Gemini CLI
  agents.push({
    name: 'gemini-cli',
    configPath: path.join(projectRoot, '.gemini', 'settings.json'),
    mcpFormat: 'mcpServers',
    rulesPath: path.join(projectRoot, 'GEMINI.md'),
    hooksConfigPath: path.join(projectRoot, '.gemini', 'settings.json')
  });

  // 7. OpenCode
  agents.push({
    name: 'opencode',
    configPath: path.join(projectRoot, 'opencode.json'),
    mcpFormat: 'opencode-mcp',
    rulesPath: path.join(projectRoot, 'AGENTS.md')
  });

  return agents;
}
