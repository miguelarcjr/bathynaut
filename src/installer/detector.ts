import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DetectedAgent {
  name: string;
  configPath: string;
  rulesPath?: string;
  skillsDir?: string;
}

export function detectInstalledAgents(projectRoot: string): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  const homeDir = os.homedir();

  // 1. Claude Code
  const claudeConfig = path.join(homeDir, '.claude.json');
  agents.push({
    name: 'claude-code',
    configPath: claudeConfig,
    rulesPath: path.join(projectRoot, 'CLAUDE.md'),
    skillsDir: path.join(projectRoot, '.claude', 'skills')
  });

  // 2. Cursor
  const cursorDir = path.join(projectRoot, '.cursor');
  agents.push({
    name: 'cursor',
    configPath: path.join(cursorDir, 'mcp.json'),
    rulesPath: path.join(projectRoot, '.cursorrules'),
    skillsDir: path.join(cursorDir, 'skills')
  });

  // 3. Antigravity / Gemini
  const antigravityConfig = path.join(homeDir, '.gemini', 'antigravity-ide', 'mcp_config.json');
  agents.push({
    name: 'antigravity',
    configPath: antigravityConfig,
    rulesPath: path.join(projectRoot, 'AGENTS.md'),
    skillsDir: path.join(projectRoot, '.agents', 'skills')
  });

  // 4. Windsurf
  const windsurfConfig = path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json');
  agents.push({
    name: 'windsurf',
    configPath: windsurfConfig,
    rulesPath: path.join(projectRoot, '.windsurfrules')
  });

  // 5. GitHub Copilot / VS Code
  agents.push({
    name: 'copilot',
    configPath: path.join(projectRoot, '.vscode', 'settings.json'),
    rulesPath: path.join(projectRoot, '.github', 'copilot-instructions.md')
  });

  return agents;
}
