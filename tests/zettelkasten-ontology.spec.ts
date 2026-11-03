import { describe, it, expect } from 'vitest';
import { parseZettelkastenNote } from '../src/parsers/markdown/zettelkasten.js';
import { INVERSE_RELATIONS } from '../src/parsers/markdown/edges.js';
import { computeScopeSharingEdges } from '../src/parsers/markdown/scanner.js';

describe('Zettelkasten CoALA Ontology & Semantic Edges', () => {
  it('should support all 5 CoALA categories (decisions, incidents, patterns, entities, architecture)', () => {
    const archMd = `---
id: arch-001-camadas
title: Fronteiras de Dominio Hexagonal
category: architecture
status: active
---
# Arquitetura em Camadas
`;
    const parsed = parseZettelkastenNote('memory/wiki/architecture/arch-001.md', archMd);
    expect(parsed.node.kind).toBe('architecture');
    expect(parsed.node.depth_zone).toBe('abyssal');
  });

  it('should extract YAML edges block, inline semantic edges (including tensions_with, caused_by, verified_by) and generic [[mentions]]', () => {
    const rawMd = `---
id: adr-010-webhooks
title: Seguranca de Webhooks Asaas
category: decisions
status: active
enforcement: blocking
applies_to:
  - "src/webhooks/**"
symbols:
  - "handleAsaasWebhook"
invariants:
  - "Sempre validar header asaas-access-token em tempo constante"
  - "Idempotencia obrigatoria por payment_id"
sources:
  - "docs/specs/payments.md"
edges:
  supersedes:
    - "adr-001-webhook-legado"
  tensions_with:
    - "pattern-fire-and-forget"
---

# Seguranca de Webhooks Asaas

Esta decisao implementa o padrao de assinatura HMAC e foi motivada por [[inc-005-fraude-webhook]].

- mitigates:: [[inc-005-fraude-webhook]]
- implements:: [[pattern-hmac-validation]]
- verified_by:: [[test-webhook-signature]]
- caused_by:: [[adr-001-webhook-legado]]
`;

    const parsed = parseZettelkastenNote('memory/wiki/decisions/adr-010-webhooks.md', rawMd);
    expect(parsed.node.enforcement).toBe('blocking');
    expect(parsed.invariants).toHaveLength(2);
    expect(parsed.symbols).toContain('handleAsaasWebhook');
    expect(parsed.sources).toContain('docs/specs/payments.md');

    const rels = parsed.edges.map(e => `${e.relation}->${e.target_id}`);
    expect(rels).toContain('supersedes->adr-001-webhook-legado');
    expect(rels).toContain('tensions_with->pattern-fire-and-forget');
    expect(rels).toContain('mitigates->inc-005-fraude-webhook');
    expect(rels).toContain('implements->pattern-hmac-validation');
    expect(rels).toContain('verified_by->test-webhook-signature');
    expect(rels).toContain('caused_by->adr-001-webhook-legado');
  });

  it('should extract generic [[wikilinks]] as mentions with weight 0.5 when not already matched by a typed relation on the same line', () => {
    const rawMd = `---
id: pat-01
title: Padrao de Cache
category: patterns
---
Consulte tambem [[ent-redis-cluster]] e [[adr-002-ttl]] para detalhes.
`;
    const parsed = parseZettelkastenNote('memory/wiki/patterns/pat-01.md', rawMd);
    const mentions = parsed.edges.filter(e => e.relation === 'mentions');
    expect(mentions.map(m => m.target_id)).toEqual(['ent-redis-cluster', 'adr-002-ttl']);
    expect(mentions[0].weight).toBe(0.5);
  });

  it('should provide inverse relation labels for bidirectional backlink navigation', () => {
    expect(INVERSE_RELATIONS.supersedes).toBe('superseded_by');
    expect(INVERSE_RELATIONS.mitigates).toBe('mitigated_by');
    expect(INVERSE_RELATIONS.caused_by).toBe('caused_incident');
    expect(INVERSE_RELATIONS.depends_on).toBe('required_by');
    expect(INVERSE_RELATIONS.implements).toBe('implemented_by');
    expect(INVERSE_RELATIONS.verified_by).toBe('verifies');
    expect(INVERSE_RELATIONS.mentions).toBe('mentioned_in');
    expect(INVERSE_RELATIONS.tensions_with).toBe('tensions_with');
    expect(INVERSE_RELATIONS.shares_scope_with).toBe('shares_scope_with');
  });

  it('should infer shares_scope_with edges when two notes share overlapping applies_to globs or symbols', () => {
    const n1 = parseZettelkastenNote('a.md', `---
id: adr-a
applies_to: ["src/auth/**"]
symbols: ["loginUser"]
---
A`);
    const n2 = parseZettelkastenNote('b.md', `---
id: adr-b
applies_to: ["src/auth/jwt.ts"]
symbols: ["loginUser"]
---
B`);
    const sharedEdges = computeScopeSharingEdges([n1, n2]);
    expect(sharedEdges.length).toBeGreaterThan(0);
    expect(sharedEdges[0].relation).toBe('shares_scope_with');
  });
});

