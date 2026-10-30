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
  console.log('🔌 [Bathynaut] Disconnecting rules, hooks, skills, and MCP configs (preserving memory vault)...');

  const agents = detectInstalledAgents(projectRoot);
  for (const ag of agents) {
    if (ag.rulesPath) {
      const removed = removeRulesFile(ag.rulesPath);
      if (removed) console.log(`   ✓ Removed Bathynaut block from: ${ag.rulesPath}`);
    }
    if (ag.extraRulesPaths) {
      for (const extraRule of ag.extraRulesPaths) {
        const removed = removeRulesFile(extraRule);
        if (removed) console.log(`   ✓ Removed Bathynaut rule from: ${extraRule}`);
      }
    }
    if (ag.configPath) {
      const removed = removeMCPConfig(ag.configPath);
      if (removed) console.log(`   ✓ Removed MCP server from: ${ag.configPath}`);
    }
    if (ag.extraConfigPaths) {
      for (const extraCfg of ag.extraConfigPaths) {
        const removed = removeMCPConfig(extraCfg);
        if (removed) console.log(`   ✓ Removed MCP server from: ${extraCfg}`);
      }
    }
    if (ag.hooksConfigPath) {
      const removed = removeAgentHooks(ag.hooksConfigPath);
      if (removed) console.log(`   ✓ Removed Lifecycle Hooks from: ${ag.hooksConfigPath}`);
    }
  }

  runHooksCommand(projectRoot, 'uninstall');
  removeCognitiveSkills(projectRoot);

  console.log('✅ Bathynaut safely disconnected. Your memory vault in .bathynaut/memory remains intact.');
}
