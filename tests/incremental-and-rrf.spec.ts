import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../src/storage/db.js';
import { ensureFreshGraph } from '../src/storage/incremental-sync.js';
import { hybridSearchRRF } from '../src/storage/rrf-search.js';
import { packWithinTokenBudget } from '../src/storage/token-packer.js';
import { calculateBlastRadius } from '../src/graph/blast-radius.js';
import { Database } from 'better-sqlite3';

describe('Just-in-Time Incremental Sync, Stale ADR Detection, RRF Search & Token Packer', () => {
  let tmpDir: string;
  let memoryRoot: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bathynaut-inc-'));
    memoryRoot = path.join(tmpDir, '.bathynaut', 'memory');
    fs.mkdirSync(path.join(memoryRoot, 'wiki', 'decisions'), { recursive: true });
    fs.mkdirSync(path.join(memoryRoot, 'wiki', 'incidents'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

    db = initDatabase(path.join(tmpDir, '.bathynaut', 'ocean.db'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should perform initial sync, fast no-op sync when unchanged, and mark ADR as stale when governed function changes', async () => {
    const authFile = path.join(tmpDir, 'src', 'auth.ts');
    fs.writeFileSync(authFile, `
export function validateSessionToken(token: string): boolean {
  return token.startsWith('valid_');
}
`);

    const adrFile = path.join(memoryRoot, 'wiki', 'decisions', 'adr-001-session.md');
    fs.writeFileSync(adrFile, `---
id: adr-001-session
title: Validacao de Token de Sessao
category: decisions
enforcement: blocking
applies_to:
  - "src/auth.ts"
symbols:
  - "validateSessionToken"
invariants:
  - "Tokens devem iniciar com prefixo valid_"
---
# Validacao de Sessao
`);

    // 1. Initial sync
    const firstSync = await ensureFreshGraph(tmpDir, db, memoryRoot);
    expect(firstSync.syncedFiles).toBeGreaterThanOrEqual(2);

    // 2. Second sync with no changes -> 0 syncedFiles
    const noOpSync = await ensureFreshGraph(tmpDir, db, memoryRoot);
    expect(noOpSync.syncedFiles).toBe(0);

    // 3. Modify the governed function -> should sync only 1 file and flag ADR as stale (needs_review = 1)
    const futureTime = Date.now() + 5000;
    fs.writeFileSync(authFile, `
export function validateSessionToken(token: string): boolean {
  // Changed implementation!
  return token.length > 10;
}
`);
    fs.utimesSync(authFile, futureTime / 1000, futureTime / 1000);

    const deltaSync = await ensureFreshGraph(tmpDir, db, memoryRoot);
    expect(deltaSync.syncedFiles).toBe(1);
    expect(deltaSync.staleAdrsCount).toBeGreaterThanOrEqual(1);

    const blast = calculateBlastRadius(db, ['src/auth.ts']);
    const govAdr = blast.governing_adrs.find(a => a.id === 'adr-001-session');
    expect(govAdr?.stale_warning).toBe(true);
  });

  it('should rank results with Hybrid RRF (BM25 + PageRank + 1-Hop Backlinks) and surface deprecation warnings', async () => {
    fs.writeFileSync(path.join(tmpDir, 'src', 'payment.ts'), `
/**
 * Calcula taxas de transacao PIX no gateway Asaas
 */
export function calculatePixTransactionFee(amount: number): number {
  return amount * 0.01;
}
`);

    fs.writeFileSync(path.join(memoryRoot, 'wiki', 'decisions', 'adr-001-old.md'), `---
id: adr-001-old
title: Taxa Fixa Antiga
category: decisions
status: superseded
---
Taxa antiga.
`);

    fs.writeFileSync(path.join(memoryRoot, 'wiki', 'decisions', 'adr-002-new.md'), `---
id: adr-002-new
title: Nova Politica de Taxa PIX
category: decisions
status: active
supersedes: adr-001-old
---
Nova regra substituindo [[adr-001-old]].
`);

    await ensureFreshGraph(tmpDir, db, memoryRoot);

    const searchPix = hybridSearchRRF(db, 'pix transaction fee', { limit: 5 });
    expect(searchPix.results.length).toBeGreaterThan(0);
    expect(searchPix.results[0].node.name).toBe('calculatePixTransactionFee');

    const searchOldAdr = hybridSearchRRF(db, 'Taxa Fixa Antiga', { limit: 5 });
    const oldAdrMatch = searchOldAdr.results.find(r => r.node.id === 'adr-001-old');
    expect(oldAdrMatch).toBeDefined();
    expect(oldAdrMatch?.deprecation_warning).toContain('superseded');
    expect(oldAdrMatch?.backlinks.some(b => b.inverse_relation === 'superseded_by' && b.source_id === 'adr-002-new')).toBe(true);
  });

  it('should pack cited excerpts strictly within token_budget', () => {
    const items = [
      {
        id: 'fn:src/a.ts:fnA',
        title: 'fnA',
        citation: 'src/a.ts:10-25',
        snippet: 'export function fnA() {\n  return 1;\n}',
        priority: 1.0
      },
      {
        id: 'fn:src/b.ts:fnB',
        title: 'fnB',
        citation: 'src/b.ts:1-100',
        snippet: 'x'.repeat(4000), // ~1000 tokens
        priority: 0.5
      }
    ];

    const packed = packWithinTokenBudget(items, 150);
    expect(packed.included.length).toBe(1);
    expect(packed.included[0].id).toBe('fn:src/a.ts:fnA');
    expect(packed.truncatedCount).toBe(1);
    expect(packed.usedTokens).toBeLessThanOrEqual(150);
  });
});

