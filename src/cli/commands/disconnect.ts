import { detectInstalledAgents } from '../../installer/detector.js';
import { removeRulesFile, removeMCPConfig, removeAgentHooks } from '../../installer/injector.js';
import { removeCognitiveSkills } from '../../installer/skills-scaffold.js';
import { runHooksCommand } from './hooks.js';

/**
 * Safely removes Bathynaut's injected rules (`<!-- BATHYNAUT:START/END -->`),
 * MCP server entries, agent skills, and lifecycle hooks while preserving the user's
 * `.bathynaut/memory/` Zettelkasten vault and original instructions.
 */
export function runDisconnectCommand(projectRoot: string): void {
  console.log('🔌 [Bathynaut] Desconectando regras, hooks, skills e configuracoes MCP (preservando o cofre de memoria)...');

  const agents = detectInstalledAgents(projectRoot);
  for (const ag of agents) {
    if (ag.rulesPath) {
      const removed = removeRulesFile(ag.rulesPath);
      if (removed) console.log(`   ✓ Bloco Bathynaut removido de: ${ag.rulesPath}`);
    }
    if (ag.extraRulesPaths) {
      for (const extraRule of ag.extraRulesPaths) {
        const removed = removeRulesFile(extraRule);
        if (removed) console.log(`   ✓ Regra Bathynaut removida de: ${extraRule}`);
      }
    }
    if (ag.configPath) {
      const removed = removeMCPConfig(ag.configPath);
      if (removed) console.log(`   ✓ Servidor MCP removido de: ${ag.configPath}`);
    }
    if (ag.extraConfigPaths) {
      for (const extraCfg of ag.extraConfigPaths) {
        const removed = removeMCPConfig(extraCfg);
        if (removed) console.log(`   ✓ Servidor MCP removido de: ${extraCfg}`);
      }
    }
    if (ag.hooksConfigPath) {
      const removed = removeAgentHooks(ag.hooksConfigPath);
      if (removed) console.log(`   ✓ Lifecycle Hooks removidos de: ${ag.hooksConfigPath}`);
    }
  }

  runHooksCommand(projectRoot, 'uninstall');
  removeCognitiveSkills(projectRoot);

  console.log('✅ Bathynaut desconectado com seguranca. Seu cofre em .bathynaut/memory permanece intacto.');
}
