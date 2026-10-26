import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter } from '../src/parsers/ast/tree-sitter.js';
import { parseSourceCode } from '../src/parsers/ast/extractors.js';
import { interlinkCodeWithADRs } from '../src/parsers/ast/interlink.js';
import { parseZettelkastenNote } from '../src/parsers/markdown/zettelkasten.js';

describe('Tree-Sitter WASM AST Engine & Interlinking', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  it('should parse TypeScript code and extract functions, calls, and imports', async () => {
    const tsCode = `
import { supabase } from './supabaseClient';

export async function requireSupabaseAuth(req: Request) {
  const token = req.headers.get('Authorization');
  return validateToken(token);
}

export class AuthService {
  async login(user: string) {
    return requireSupabaseAuth(user);
  }
}
`;

    const result = await parseSourceCode('src/routes/auth.ts', tsCode);

    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('src/routes/auth.ts');
    expect(nodeNames).toContain('requireSupabaseAuth');
    expect(nodeNames).toContain('AuthService');

    const callEdges = result.edges.filter(e => e.relation === 'calls');
    expect(callEdges.some(e => e.target_id.includes('validateToken'))).toBe(true);

    const importEdges = result.edges.filter(e => e.relation === 'imports');
    expect(importEdges.some(e => e.target_id.includes('./supabaseClient'))).toBe(true);
  });

  it('should interlink code nodes directly to ADRs via applies_to glob matching', async () => {
    const codeResult = await parseSourceCode('src/routes/auth.ts', 'export function requireSupabaseAuth() {}');
    
    const adrNote = parseZettelkastenNote('memory/wiki/decisions/adr-001.md', `---
id: adr-001-rbac
title: RBAC Security ADR
category: decisions
applies_to:
  - "src/routes/auth*"
---
Decisao sobre autorizacao.
`);

    const interlinkEdges = interlinkCodeWithADRs(codeResult.nodes, [adrNote]);

    expect(interlinkEdges.length).toBeGreaterThan(0);
    const governed = interlinkEdges.find(e => e.relation === 'governed_by');
    expect(governed).toBeDefined();
    expect(governed?.target_id).toBe('adr-001-rbac');
  });
});
