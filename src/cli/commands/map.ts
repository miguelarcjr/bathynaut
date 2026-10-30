import path from 'node:path';
import { getDatabasePath, initDatabase } from '../../storage/db.js';
import { resolveMemoryVault, registerProjectInGlobalRegistry } from '../../storage/pool.js';
import { ensureFreshGraph } from '../../storage/incremental-sync.js';
import { exportExplorerHTML } from '../../explorer/exporter.js';
import { generateCommunityArchitectureNotes } from '../../graph/insights.js';
import { generateMOCIndex } from '../../parsers/markdown/scanner.js';

export async function runMapCommand(projectRoot: string, options: { force?: boolean } = {}): Promise<void> {
  const dbPath = getDatabasePath(projectRoot);
  const db = initDatabase(dbPath);
  const { memoryRoot, vaultKind } = resolveMemoryVault(projectRoot);
  console.log(`🌊 [Bathynaut v0.2 SOTA] Mapping depths in: ${projectRoot} (Vault: ${vaultKind})`);

  try {
    const syncStats = await ensureFreshGraph(projectRoot, db, memoryRoot, { force: options.force ?? true });
    const autoArchCount = generateCommunityArchitectureNotes(memoryRoot, db);
    if (autoArchCount > 0) {
      generateMOCIndex(memoryRoot, db);
    }
    registerProjectInGlobalRegistry(projectRoot, memoryRoot);

    const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
    const edgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;
    const commCount = (db.prepare('SELECT COUNT(*) as c FROM communities').get() as { c: number }).c;
    const flowCount = (db.prepare('SELECT COUNT(*) as c FROM flows').get() as { c: number }).c;

    console.log(`⚡ Synced ${syncStats.syncedFiles} files in ${syncStats.durationMs}ms`);
    console.log(`🔗 Unified Graph: ${nodeCount} nodes | ${edgeCount} edges | ${commCount} communities | ${flowCount} execution flows`);
    if (syncStats.staleAdrsCount > 0) {
      console.log(`⚠️ Warning: ${syncStats.staleAdrsCount} ADR(s) flagged for review (governed code modified)`);
    }

    const outHtml = path.join(projectRoot, '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, outHtml);
    console.log(`📊 D3.js Ocean Canvas exported to: ${outHtml}`);
    console.log('✅ SOTA mapping completed successfully!');
  } finally {
    db.close();
  }
}
