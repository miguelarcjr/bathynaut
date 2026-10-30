import { detectInstalledAgents } from '../../installer/detector.js';
import { removeRulesFile, removeMCPConfig } from '../../installer/injector.js';

/**
 * Safely removes Bathynaut's injected rules (`<!-- BATHYNAUT:START/END -->`) and MCP server entry
 * while preserving the user's `.bathynaut/memory/` Zettelkasten vault and original instructions.
 */
export function runDisconnectCommand(projectRoot: string): void {
  console.log('🔌 [Bathynaut] Desconectando regras e configuracoes MCP (preservando o cofre de memoria)...');

  const agents = detectInstalledAgents(projectRoot);
  for (const ag of agents) {
    if (ag.rulesPath) {
      const removed = removeRulesFile(ag.rulesPath);
      if (removed) console.log(`   ✓ Bloco Bathynaut removido de: ${ag.rulesPath}`);
    }
    if (ag.configPath) {
      const removed = removeMCPConfig(ag.configPath);
      if (removed) console.log(`   ✓ Servidor MCP removido de: ${ag.configPath}`);
    }
  }

  console.log('✅ Bathynaut desconectado com seguranca. Seu cofre em .bathynaut/memory permanece intacto.');
}
