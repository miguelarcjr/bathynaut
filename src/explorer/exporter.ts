import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllNodes, getAllEdges } from '../storage/queries.js';

export function exportExplorerHTML(db: Database, outputPath: string): string {
  const nodes = getAllNodes(db);
  const edges = getAllEdges(db);
  let communities: any[] = [];
  let flows: any[] = [];
  try {
    communities = db.prepare('SELECT * FROM communities ORDER BY size DESC').all();
    flows = db.prepare('SELECT * FROM flows ORDER BY criticality_score DESC LIMIT 20').all();
  } catch {}

  const nodeIds = new Set(nodes.map(n => n.id));

  const payload = {
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      depth_zone: n.depth_zone,
      file_path: n.file_path,
      line_start: n.line_start,
      line_end: n.line_end,
      signature: n.signature,
      code_excerpt: n.code_excerpt,
      community_id: n.community_id,
      pagerank_score: n.pagerank_score,
      is_bridge: n.is_bridge,
      enforcement: n.enforcement,
      invariants_json: n.invariants_json,
      status: n.status,
      summary: n.summary,
      body_markdown: n.body_markdown
    })),
    edges: edges
      .filter(e => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
      .map(e => ({
        source: e.source_id,
        target: e.target_id,
        relation: e.relation,
        confidence: e.confidence,
        needs_review: e.needs_review
      })),
    communities,
    flows
  };

  let templateContent = '';
  const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template.html');
  if (fs.existsSync(templatePath)) {
    templateContent = fs.readFileSync(templatePath, 'utf-8');
  } else {
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
