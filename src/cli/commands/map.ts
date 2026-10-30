import path from 'node:path';
import { getDatabasePath, initDatabase } from '../../storage/db.js';
import { resolveMemoryVault, registerProjectInGlobalRegistry } from '../../storage/pool.js';
import { ensureFreshGraph } from '../../storage/incremental-sync.js';
import { exportExplorerHTML } from '../../explorer/exporter.js';

export async function runMapCommand(projectRoot: string, options: { force?: boolean } = {}): Promise<void> {
  const dbPath = getDatabasePath(projectRoot);
  const db = initDatabase(dbPath);
  const { memoryRoot, vaultKind } = resolveMemoryVault(projectRoot);
  console.log(`🌊 [Bathynaut v0.2 SOTA] Mapeando profundezas em: ${projectRoot} (Vault: ${vaultKind})`);

  try {
    const syncStats = await ensureFreshGraph(projectRoot, db, memoryRoot, { force: options.force ?? true });
    registerProjectInGlobalRegistry(projectRoot, memoryRoot);

    const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
    const edgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;
    const commCount = (db.prepare('SELECT COUNT(*) as c FROM communities').get() as { c: number }).c;
    const flowCount = (db.prepare('SELECT COUNT(*) as c FROM flows').get() as { c: number }).c;

    console.log(`⚡ Sincronizados ${syncStats.syncedFiles} arquivos em ${syncStats.durationMs}ms`);
    console.log(`🔗 Grafo Unificado: ${nodeCount} nos | ${edgeCount} arestas | ${commCount} comunidades | ${flowCount} fluxos de execucao`);
    if (syncStats.staleAdrsCount > 0) {
      console.log(`⚠️ Alerta: ${syncStats.staleAdrsCount} ADR(s) marcada(s) para revisao (codigo governado alterado)`);
    }

    const outHtml = path.join(projectRoot, '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, outHtml);
    console.log(`📊 Dashboard D3.js exportado em: ${outHtml}`);
    console.log('✅ Mapeamento SOTA concluido com sucesso!');
  } finally {
    db.close();
  }
}
