import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter } from '../src/parsers/ast/tree-sitter.js';
import { parseSourceCode } from '../src/parsers/ast/extractors.js';
import { linkSymbolsAndImports } from '../src/parsers/ast/symbol-linker.js';
import { interlinkCodeWithADRs } from '../src/parsers/ast/interlink.js';
import { parseZettelkastenNote } from '../src/parsers/markdown/zettelkasten.js';

describe('Two-Pass Symbol & Import Linker and Triple ADR Anchoring', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  it('should extract signature, docstring, code_excerpt, content_hash and is_exported', async () => {
    const code = `
/**
 * Verifica a assinatura criptografica do token JWT.
 */
export async function verifyJwt(token: string, secret: string): Promise<boolean> {
  if (!token) return false;
  return token.startsWith(secret);
}
`;
    const parsed = await parseSourceCode('src/auth/jwt.ts', code);
    const fnNode = parsed.nodes.find(n => n.name === 'verifyJwt');
    expect(fnNode).toBeDefined();
    expect(fnNode?.signature).toContain('export async function verifyJwt(token: string, secret: string): Promise<boolean>');
    expect(fnNode?.docstring).toContain('Verifica a assinatura criptografica do token JWT');
    expect(fnNode?.code_excerpt).toContain('if (!token) return false;');
    expect(fnNode?.content_hash).toBeTruthy();
    expect(fnNode?.is_exported).toBe(1);
  });

  it('should resolve cross-file imports, function calls, and tests_for edges in Two-Pass Symbol Linker', async () => {
    const jwtFile = await parseSourceCode('src/auth/jwt.ts', `
export function verifyJwt(token: string): boolean {
  return Boolean(token);
}
`);

    const routeFile = await parseSourceCode('src/routes/login.ts', `
import { verifyJwt } from '../auth/jwt.js';

export async function loginHandler(req: any) {
  return verifyJwt(req.token);
}
`);

    const testFile = await parseSourceCode('tests/login.spec.ts', `
import { loginHandler } from '../src/routes/login.js';

export function testLoginFlow() {
  loginHandler({ token: 'abc' });
}
`);

    const allNodes = [...jwtFile.nodes, ...routeFile.nodes, ...testFile.nodes];
    const rawEdges = [...jwtFile.edges, ...routeFile.edges, ...testFile.edges];

    const linkedEdges = linkSymbolsAndImports(allNodes, rawEdges);

    // 1. Check file import resolution: file:src/routes/login.ts -> imports -> file:src/auth/jwt.ts
    const resolvedImport = linkedEdges.find(
      e => e.source_id === 'file:src/routes/login.ts' && e.relation === 'imports' && e.target_id === 'file:src/auth/jwt.ts'
    );
    expect(resolvedImport).toBeDefined();
    expect(resolvedImport?.confidence).toBe('EXTRACTED');

    // 2. Check cross-file function call resolution: fn:src/routes/login.ts:loginHandler -> calls -> fn:src/auth/jwt.ts:verifyJwt
    const resolvedCall = linkedEdges.find(
      e =>
        e.source_id === 'fn:src/routes/login.ts:loginHandler' &&
        e.relation === 'calls' &&
        e.target_id === 'fn:src/auth/jwt.ts:verifyJwt'
    );
    expect(resolvedCall).toBeDefined();
    expect(resolvedCall?.confidence).toBe('EXTRACTED');

    // 3. Check tests_for edge generated from test file calling loginHandler
    const testsForEdge = linkedEdges.find(
      e => e.relation === 'tests_for' && e.target_id === 'fn:src/routes/login.ts:loginHandler'
    );
    expect(testsForEdge).toBeDefined();
  });

  it('should anchor ADRs via symbols list and inline backtick mentions (`doc_links`) in addition to applies_to globs', async () => {
    const parsed = await parseSourceCode('src/payments/webhook.ts', `
export function validateAsaasSignature(payload: string, sig: string) {
  return sig.length > 0;
}

export function processInvoice(id: string) {
  return id;
}
`);

    const adrBySymbol = parseZettelkastenNote('memory/wiki/decisions/adr-01.md', `---
id: adr-01-sym
title: Assinatura de Webhook
symbols:
  - "validateAsaasSignature"
---
Regra sobre webhook.
`);

    const adrByInlineMention = parseZettelkastenNote('memory/wiki/incidents/inc-01.md', `---
id: inc-01-inline
title: Falha ao processar fatura
category: incidents
---
O incidente ocorreu dentro da funcao \`processInvoice()\` quando o id era nulo.
`);

    const edges = interlinkCodeWithADRs(parsed.nodes, [adrBySymbol, adrByInlineMention]);

    const symEdge = edges.find(
      e => e.source_id === 'fn:src/payments/webhook.ts:validateAsaasSignature' && e.target_id === 'adr-01-sym'
    );
    expect(symEdge).toBeDefined();
    expect(symEdge?.confidence).toBe('EXTRACTED');

    const inlineEdge = edges.find(
      e => e.source_id === 'fn:src/payments/webhook.ts:processInvoice' && e.target_id === 'inc-01-inline'
    );
    expect(inlineEdge).toBeDefined();
    expect(inlineEdge?.confidence).toBe('INFERRED');
  });
});
