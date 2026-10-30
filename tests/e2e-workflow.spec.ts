import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runInitCommand } from '../src/cli/commands/init.js';
import { runReviewCommand } from '../src/cli/commands/review.js';
import { runDisconnectCommand } from '../src/cli/commands/disconnect.js';
import { initDatabase, getDatabasePath } from '../src/storage/db.js';
import { handleSonar } from '../src/mcp/tools/sonar.js';
import { handleDive } from '../src/mcp/tools/dive.js';
import { handleRecall } from '../src/mcp/tools/recall.js';

describe('Bathynaut End-to-End Lifecycle v0.2 SOTA', () => {
  const e2eRoot = path.resolve('tests/temp-e2e-repo');

  beforeEach(() => {
    if (fs.existsSync(e2eRoot)) {
      try { fs.rmSync(e2eRoot, { recursive: true, force: true }); } catch {}
    }
    fs.mkdirSync(e2eRoot, { recursive: true });

    // Create sample source files
    const srcDir = path.join(e2eRoot, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'auth.ts'), `
import { db } from './db';
export function validateToken(t: string) { return !!t; }
export function requireAuth() { return validateToken('jwt'); }
`, 'utf-8');

    fs.writeFileSync(path.join(srcDir, 'db.ts'), 'export const db = {};', 'utf-8');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(e2eRoot)) fs.rmSync(e2eRoot, { recursive: true, force: true });
    } catch {}
  });

  it('should run init, map, build ocean.db, interlink nodes, answer sonar queries, run review and disconnect cleanly', async () => {
    // Pre-create a CLAUDE.md to verify backup & disconnect restoration
    const claudeMd = path.join(e2eRoot, 'CLAUDE.md');
    fs.writeFileSync(claudeMd, '# Regras Originais do Time\n', 'utf-8');

    // 1. Run init command on repo
    await runInitCommand(e2eRoot);

    // 2. Verify vault and db created
    const dbPath = getDatabasePath(e2eRoot);
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(path.join(e2eRoot, '.bathynaut', 'bathynaut.html'))).toBe(true);
    expect(fs.existsSync(path.join(e2eRoot, '.bathynaut', 'memory', 'activeContext.md'))).toBe(true);
    expect(fs.existsSync(path.join(e2eRoot, '.bathynaut', 'memory', 'index.md'))).toBe(true);

    // 3. Open database and verify nodes & edges
    const db = initDatabase(dbPath);
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables.length).toBeGreaterThanOrEqual(6);

      // 4. Test Sonar on src/auth.ts
      const sonarRes = handleSonar(db, { files: ['src/auth.ts'], token_budget: 2000 });
      const sonarData = JSON.parse(sonarRes.content[0].text);
      expect(sonarData.entry_files).toContain('src/auth.ts');
      expect(sonarData.affected_nodes.some((n: any) => n.name === 'requireAuth')).toBe(true);

      // 5. Test Dive macro view
      const diveRes = handleDive(db, {});
      const diveData = JSON.parse(diveRes.content[0].text);
      expect(diveData.top_god_nodes).toBeDefined();
      expect(diveData.top_flows).toBeDefined();

      // 6. Test Recall
      const recallRes = handleRecall(db, { query: 'validateToken', limit: 5, token_budget: 1500 });
      const recallData = JSON.parse(recallRes.content[0].text);
      expect(recallData.count).toBeGreaterThan(0);
    } finally {
      db.close();
    }

    // 7. Test Review command (non-blocking)
    const reviewReport = await runReviewCommand(e2eRoot, ['src/auth.ts']);
    expect(reviewReport.target_files).toContain('src/auth.ts');
    expect(typeof reviewReport.risk_score).toBe('number');

    // 8. Test Disconnect command (removes injected block from CLAUDE.md while preserving original text and vault)
    runDisconnectCommand(e2eRoot);
    const restoredClaude = fs.readFileSync(claudeMd, 'utf-8');
    expect(restoredClaude).toContain('# Regras Originais do Time');
    expect(restoredClaude).not.toContain('<!-- BATHYNAUT:START -->');
    expect(fs.existsSync(path.join(e2eRoot, '.bathynaut', 'memory', 'wiki'))).toBe(true);
  });
});
