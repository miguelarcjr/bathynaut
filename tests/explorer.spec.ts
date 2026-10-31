import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { exportExplorerHTML } from '../src/explorer/exporter.js';

describe('Deep-Sea Visual Explorer Exporter', () => {
  let db: Database;
  const testOut = path.resolve('tests/temp-out/bathynaut.html');

  beforeEach(() => {
    db = initDatabase(':memory:');
    upsertNode(db, { id: 'fn:test1', depth_zone: 'twilight', kind: 'function', name: 'myFunction', summary: 'Test function' });
    upsertNode(db, { id: 'adr:001', depth_zone: 'abyssal', kind: 'adr', name: 'ADR-001', summary: 'Architecture ADR' });
    upsertEdge(db, { source_id: 'fn:test1', target_id: 'adr:001', relation: 'governed_by' });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(path.dirname(testOut))) {
      fs.rmSync(path.dirname(testOut), { recursive: true, force: true });
    }
  });

  it('should export standalone bathynaut.html containing inlined graph payload', () => {
    const exportedPath = exportExplorerHTML(db, testOut);
    expect(fs.existsSync(exportedPath)).toBe(true);

    const html = fs.readFileSync(exportedPath, 'utf-8');
    expect(html).toContain('Bathynaut — Deep-Sea Knowledge Explorer');
    expect(html).toContain('myFunction');
    expect(html).toContain('ADR-001');
    expect(html).toContain('governed_by');
  });

  it('should safely escape </script> tags and $ replacement patterns inside code_excerpt', () => {
    upsertNode(db, {
      id: 'fn:xss-and-dollar',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'unsafeExcerpt',
      code_excerpt: `const html = "</script><script>alert('broken')</script>"; const rgx = "$& $' $\`";`
    });

    const exportedPath = exportExplorerHTML(db, testOut);
    const html = fs.readFileSync(exportedPath, 'utf-8');

    // Only 2 closing </script> tags should exist in the entire HTML (d3 script + main script)
    const closingScripts = html.match(/<\/script>/gi) || [];
    expect(closingScripts.length).toBe(2);
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain("$\\u0026 $' $`");
  });
});
