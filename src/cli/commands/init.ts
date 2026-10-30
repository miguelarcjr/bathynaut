import path from 'node:path';
import { detectInstalledAgents } from '../../installer/detector.js';
import { injectRulesFile, injectMCPConfig, injectAgentHooks } from '../../installer/injector.js';
import { scaffoldMemoryVault } from '../../installer/vault-scaffold.js';
import { scaffoldCognitiveSkills } from '../../installer/skills-scaffold.js';
import { runHooksCommand } from './hooks.js';
import { runMapCommand } from './map.js';

export async function runInitCommand(projectRoot: string): Promise<void> {
  console.log('🌊 [Bathynaut] Inicializando Cognitive Architecture & Memory Harness v0.2 SOTA...');

  // 1. Scaffold Memory Vault & Multi-Agent Cognitive Skills (.agents/skills, .claude/skills, .cursor/skills)
  const memoryDir = scaffoldMemoryVault(projectRoot);
  scaffoldCognitiveSkills(projectRoot);
  console.log(`🗄️ Cofre Zettelkasten inicializado em: ${memoryDir}`);

  // 2. Detect Agents and Inject Rules, MCP Configs & Lifecycle Hooks (with safe backups in .bathynaut/backups)
  const agents = detectInstalledAgents(projectRoot);
  const binPath = path.resolve('dist/cli/main.js');

  for (const ag of agents) {
    console.log(`🤖 Configurando harness do agente: ${ag.name}`);
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

  console.log('\n🎉 Bathynaut inicializado com sucesso em 1 comando!');
  console.log('Abra o seu editor (Antigravity, Claude Code, Cursor, Windsurf, Copilot ou OpenCode) e comece a pair-programar com sonar profundo.');
}
