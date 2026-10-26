import { describe, it, expect } from 'vitest';
import { parseZettelkastenNote } from '../src/parsers/markdown/zettelkasten.js';

describe('Zettelkasten Markdown Parser', () => {
  it('should parse an ADR with frontmatter, applies_to and inline typed edges', () => {
    const rawMarkdown = `---
id: adr-001-rbac
title: Modelo de Autorizacao RBAC
category: decisions
status: active
applies_to:
  - "src/routes/auth*"
  - "src/lib/supabase*"
supersedes: adr-000-antigo
---

# ADR-001: Modelo de Autorizacao RBAC

## Contexto
Necessidade de isolar credenciais.

## Decisao
Usar requireSupabaseAuth sem persistencia local.

mitigates:: [[incident-vazamento-sessao-ssr]]
depends_on:: [[adr-002-crypto]]
`;

    const parsed = parseZettelkastenNote('memory/wiki/decisions/adr-001.md', rawMarkdown);

    expect(parsed.node.id).toBe('adr-001-rbac');
    expect(parsed.node.kind).toBe('adr');
    expect(parsed.node.depth_zone).toBe('abyssal');
    expect(parsed.appliesTo).toContain('src/routes/auth*');
    expect(parsed.appliesTo).toContain('src/lib/supabase*');

    const edgeRelations = parsed.edges.map(e => ({ target: e.target_id, rel: e.relation }));
    expect(edgeRelations).toContainEqual({ target: 'adr-000-antigo', rel: 'supersedes' });
    expect(edgeRelations).toContainEqual({ target: 'incident-vazamento-sessao-ssr', rel: 'mitigates' });
    expect(edgeRelations).toContainEqual({ target: 'adr-002-crypto', rel: 'depends_on' });
  });

  it('should infer category from directory name when not in frontmatter', () => {
    const rawMarkdown = `# Um Incidente Sem Frontmatter
Descricao do problema ocorrido.
`;
    const parsed = parseZettelkastenNote('memory/wiki/incidents/inc-99.md', rawMarkdown);
    expect(parsed.node.id).toBe('inc-99');
    expect(parsed.node.kind).toBe('incident');
  });
});
