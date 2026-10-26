import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllNodes, getAllEdges } from '../storage/queries.js';

export function exportExplorerHTML(db: Database, outputPath: string): string {
  const nodes = getAllNodes(db);
  const edges = getAllEdges(db);

  const payload = {
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      depth_zone: n.depth_zone,
      file_path: n.file_path,
      summary: n.summary,
      body_markdown: n.body_markdown
    })),
    edges: edges.map(e => ({
      source: e.source_id,
      target: e.target_id,
      relation: e.relation
    }))
  };

  let templateContent = '';
  const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template.html');
  if (fs.existsSync(templatePath)) {
    templateContent = fs.readFileSync(templatePath, 'utf-8');
  } else {
    // fallback if bundled
    templateContent = '<html><body><h1>Bathynaut Explorer</h1></body></html>';
  }

  const outputHtml = templateContent.replace(
    '/*__BATHYNAUT_DATA__*/ { nodes: [], edges: [] }',
    JSON.stringify(payload)
  );

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, outputHtml, 'utf-8');
  return outputPath;
}
