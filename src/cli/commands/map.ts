import path from 'node:path';
import fs from 'node:fs';
import { getDatabasePath, initDatabase } from '../../storage/db.js';
import { parseSourceCode } from '../../parsers/ast/extractors.js';
import { scanMarkdownVault } from '../../parsers/markdown/scanner.js';
import { interlinkCodeWithADRs } from '../../parsers/ast/interlink.js';
import { upsertNode, upsertEdge } from '../../storage/queries.js';
import { buildGraphFromDatabase } from '../../graph/builder.js';
import { detectAndPersistCommunities } from '../../graph/communities.js';
import { computeGodNodes } from '../../graph/pagerank.js';
import { exportExplorerHTML } from '../../explorer/exporter.js';

export async function runMapCommand(projectRoot: string): Promise<void> {
  const dbPath = getDatabasePath(projectRoot);
  const db = initDatabase(dbPath);
  console.log(`🌊 [Bathynaut] Mapeando profundezas em: ${projectRoot}`);

  try {
    // 1. Scan and parse Zettelkasten Markdown notes
    const memoryRoot = path.join(projectRoot, '.bathynaut', 'memory');
    const adrNotes = await scanMarkdownVault(memoryRoot);
    console.log(`📖 Encontradas ${adrNotes.length} notas no cofre Zettelkasten`);

    for (const adr of adrNotes) {
      upsertNode(db, adr.node);
      for (const edge of adr.edges) {
        upsertEdge(db, edge);
      }
    }

    // 2. Scan and parse Code AST
    const allExtractedNodes: any[] = [];
    async function walkCode(dir: string) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist') {
            await walkCode(full);
          }
        } else if (e.isFile() && /\.(ts|tsx|js|jsx|py|go|rs)$/.test(e.name)) {
          try {
            const code = fs.readFileSync(full, 'utf-8');
            const relPath = path.relative(projectRoot, full).replace(/\\/g, '/');
            const ast = await parseSourceCode(relPath, code);
            for (const n of ast.nodes) {
              upsertNode(db, n);
              allExtractedNodes.push(n);
            }
            for (const ed of ast.edges) {
              upsertEdge(db, ed);
            }
          } catch {}
        }
      }
    }

    await walkCode(projectRoot);
    console.log(`⚡ Extraidos ${allExtractedNodes.length} nos de AST do codigo fonte`);

    // 3. Interlink Code to ADRs
    const interlinkEdges = interlinkCodeWithADRs(allExtractedNodes, adrNotes);
    for (const ed of interlinkEdges) {
      upsertEdge(db, ed);
    }
    console.log(`🔗 Conectadas ${interlinkEdges.length} arestas entre codigo fisico e ADRs`);

    // 4. Run Topology & Communities
    const graph = buildGraphFromDatabase(db);
    const communities = detectAndPersistCommunities(graph, db);
    const godNodes = computeGodNodes(graph, db);
    console.log(`🌐 Detectadas ${communities.length} comunidades topologicas e ${godNodes.length} God Nodes`);

    // 5. Export Explorer HTML
    const outHtml = path.join(projectRoot, '.bathynaut', 'bathynaut.html');
    exportExplorerHTML(db, outHtml);
    console.log(`📊 Dashboard D3.js exportado em: ${outHtml}`);
    console.log('✅ Mapeamento concluido com sucesso!');
  } finally {
    db.close();
  }
}
