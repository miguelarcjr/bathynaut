import fs from 'node:fs';
import path from 'node:path';
import { COALA_CATEGORIES } from '../parsers/markdown/zettelkasten.js';

export function scaffoldMemoryVault(projectRoot: string): string {
  const existingAgentsVault = path.join(projectRoot, '.agents', 'memory');
  const memoryDir = fs.existsSync(existingAgentsVault)
    ? existingAgentsVault
    : path.join(projectRoot, '.bathynaut', 'memory');

  const wikiDir = path.join(memoryDir, 'wiki');
  const obsidianDir = path.join(memoryDir, '.obsidian');

  for (const cat of COALA_CATEGORIES) {
    fs.mkdirSync(path.join(wikiDir, cat), { recursive: true });
  }
  fs.mkdirSync(path.join(memoryDir, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'templates'), { recursive: true });
  fs.mkdirSync(obsidianDir, { recursive: true });

  const activeContextPath = path.join(memoryDir, 'activeContext.md');
  if (!fs.existsSync(activeContextPath)) {
    fs.writeFileSync(activeContextPath, `# Active Session Context (Bathynaut v0.2 SOTA)
> Initialized at: ${new Date().toISOString()}

## Project Summary
Repository equipped with the Bathynaut cognitive harness (AST Call Graph + Louvain/PageRank Topology + CoALA Zettelkasten Memory).

## Next Active Tasks
- [ ] Explore macro topology with bathynaut_dive
- [ ] Inspect pre-edit blast radius with bathynaut_sonar
`, 'utf-8');
  }

  const indexPath = path.join(memoryDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `# Master Map of Content (MOC) — Bathynaut SOTA
> Auto-generated. CoALA Zettelkasten Vault interlinked with AST.

## DECISIONS (0)
_No notes recorded in this category yet._

## INCIDENTS (0)
_No notes recorded in this category yet._

## PATTERNS (0)
_No notes recorded in this category yet._

## ENTITIES (0)
_No notes recorded in this category yet._

## ARCHITECTURE (0)
_No notes recorded in this category yet._
`, 'utf-8');
  }

  fs.writeFileSync(path.join(obsidianDir, 'app.json'), JSON.stringify({ showLineNumber: true, livePreview: true }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(obsidianDir, 'graph.json'), JSON.stringify({
    'collapse-filter': false,
    'search': '',
    'colorGroups': [
      { query: 'path:wiki/decisions', color: { a: 1, rgb: 37695 } },
      { query: 'path:wiki/incidents', color: { a: 1, rgb: 16724787 } },
      { query: 'path:wiki/patterns', color: { a: 1, rgb: 1109504 } },
      { query: 'path:wiki/entities', color: { a: 1, rgb: 11163135 } },
      { query: 'path:wiki/architecture', color: { a: 1, rgb: 16755200 } }
    ]
  }, null, 2), 'utf-8');

  return memoryDir;
}
