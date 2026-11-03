import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectInstalledAgents } from '../../installer/detector.js';
import { injectRulesFile, injectMCPConfig, injectAgentHooks } from '../../installer/injector.js';
import { scaffoldMemoryVault } from '../../installer/vault-scaffold.js';
import { scaffoldCognitiveSkills } from '../../installer/skills-scaffold.js';
import { runHooksCommand } from './hooks.js';
import { runMapCommand } from './map.js';

export async function runInitCommand(projectRoot: string): Promise<void> {
  console.log('🌊 [Bathynaut] Initializing code graph & memory vault (v0.2.0)...');

  // 1. Scaffold Memory Vault + Multi-Agent Cognitive Skills
  const memoryDir = scaffoldMemoryVault(projectRoot);
  scaffoldCognitiveSkills(projectRoot);
  console.log(`🗄️ CoALA Zettelkasten vault initialized at: ${memoryDir}`);

  // 2. Detect Agents and Inject Rules, MCP Configs & Lifecycle Hooks (with safe backups in .bathynaut/backups)
  const agents = detectInstalledAgents(projectRoot);
  const binPath = fileURLToPath(new URL('../main.js', import.meta.url));

  for (const ag of agents) {
    console.log(`🤖 Configuring agent harness: ${ag.name}`);
    if (ag.rulesPath) {
      injectRulesFile(ag.rulesPath, projectRoot);
    }
    if (ag.extraRulesPaths) {
      for (const extraRule of ag.extraRulesPaths) {
        injectRulesFile(extraRule, projectRoot);
      }
    }
    if (ag.configPath) {
      injectMCPConfig(ag.configPath, binPath, projectRoot, ag.mcpFormat || 'mcpServers');
    }
    if (ag.extraConfigPaths) {
      for (const extraCfg of ag.extraConfigPaths) {
        injectMCPConfig(extraCfg, binPath, projectRoot, ag.mcpFormat || 'mcpServers');
      }
    }
    if (ag.hooksConfigPath) {
      injectAgentHooks(ag.hooksConfigPath, ag.name, projectRoot, binPath);
    }
  }

  // 3. Install Git Hooks (if .git exists)
  runHooksCommand(projectRoot, 'install', binPath);

  // 4. Initial Map
  await runMapCommand(projectRoot);

  console.log('\n🎉 Bathynaut initialized successfully in 1 command!');
  console.log('Open your editor (Antigravity, Claude Code, Cursor, Windsurf, Copilot, or OpenCode) and start pair-programming with deep sonar.');
}
