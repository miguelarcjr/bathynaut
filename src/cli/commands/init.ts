import path from 'node:path';
import { detectInstalledAgents } from '../../installer/detector.js';
import { injectRulesFile, injectMCPConfig } from '../../installer/injector.js';
import { scaffoldMemoryVault } from '../../installer/vault-scaffold.js';
import { runMapCommand } from './map.js';

export async function runInitCommand(projectRoot: string): Promise<void> {
  console.log('🌊 [Bathynaut] Inicializando Cognitive Architecture & Memory Harness v0.2 SOTA...');

  // 1. Scaffold Memory Vault
  const memoryDir = scaffoldMemoryVault(projectRoot);
  console.log(`🗄️ Cofre Zettelkasten inicializado em: ${memoryDir}`);

  // 2. Detect Agents and Inject (with safe backups in .bathynaut/backups)
  const agents = detectInstalledAgents(projectRoot);
  const binPath = path.resolve('dist/cli/main.js');

  for (const ag of agents) {
    console.log(`🤖 Configurando agente: ${ag.name}`);
    if (ag.rulesPath) {
      injectRulesFile(ag.rulesPath, projectRoot);
    }
    if (ag.configPath) {
      injectMCPConfig(ag.configPath, binPath, projectRoot);
    }
  }

  // 3. Initial Map
  await runMapCommand(projectRoot);

  console.log('\n🎉 Bathynaut v0.2 inicializado com sucesso em 1 comando!');
  console.log('Abra o seu editor (Claude Code, Cursor ou Antigravity) e comece a pair-programar com sonar profundo.');
}
