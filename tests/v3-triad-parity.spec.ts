import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { initDatabase } from '../src/storage/db.js';
import { upsertNode, upsertEdge } from '../src/storage/queries.js';
import { handleLogAdr } from '../src/mcp/tools/log-adr.js';
import { handleRecall } from '../src/mcp/tools/recall.js';
import { handleLint } from '../src/mcp/tools/lint.js';
import { handleDive } from '../src/mcp/tools/dive.js';
import {
  detectSurprisingConnections,
  detectKnowledgeGaps,
  findLargeFunctions,
  previewSymbolRename
} from '../src/graph/insights.js';

describe('Bathynaut v0.3 SOTA — Full ZK-Wiki + CRG + Graphify Triad Parity', () => {
  let tmpDir: string;
  let dbPath: string;
  let memoryRoot: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bathynaut-v3-'));
    dbPath = path.join(tmpDir, 'ocean.db');
    memoryRoot = path.join(tmpDir, '.bathynaut', 'memory');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('deve suportar id declarativo, edges em array, sources e mutacao fisica do arquivo .md antigo em supersedes (paridade zk-wiki-mcp)', () => {
    const db = initDatabase(dbPath);
    const rawDir = path.join(memoryRoot, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'rfc-001.md'), '# RFC 001 Bruto', 'utf-8');
    fs.writeFileSync(path.join(rawDir, 'rfc-002-pendente.md'), '# RFC 002 Pendente', 'utf-8');

    // 1. Compila ADR-001 inicial com ID declarativo
    const res1 = handleLogAdr(db, memoryRoot, {
      id: 'adr-001-session-cookies',
      category: 'decisions',
      title: 'Autenticacao via Session Cookies',
      summary: 'Uso de cookies de sessao tradicionais no backend.',
      context: 'Precisavamos de sessao rapida.',
      decision: 'Usar cookies de sessao.',
      applies_to: ['src/auth/**'],
      sources: ['raw/rfc-001.md']
    });
    const data1 = JSON.parse(res1.content[0].text);
    expect(data1.adr_id).toBe('adr-001-session-cookies');
    expect(fs.existsSync(data1.file_path)).toBe(true);

    // 2. Compila ADR-002 substituindo (supersedes) ADR-001 via objeto edges
    const res2 = handleLogAdr(db, memoryRoot, {
      id: 'adr-002-stateless-jwt',
      category: 'decisions',
      title: 'Migracao para Stateless JWT',
      summary: 'Substitui cookies por JWT assinado Ed25519.',
      context: 'Escalabilidade horizontal.',
      decision: 'Adotar JWT Ed25519.',
      applies_to: ['src/auth/**'],
      edges: {
        supersedes: ['adr-001-session-cookies'],
        mitigates: ['inc-001-session-leak'],
        tensions_with: ['pat-001-local-cache']
      }
    });
    const data2 = JSON.parse(res2.content[0].text);
    expect(data2.superseded_marked).toContain('adr-001-session-cookies');

    // Verifica se o arquivo fisico da ADR-001 no disco teve seu YAML frontmatter atualizado!
    const oldFileRaw = fs.readFileSync(data1.file_path, 'utf-8');
    const parsedOld = matter(oldFileRaw);
    expect(parsedOld.data.status).toBe('superseded');
    expect(parsedOld.data.superseded_by).toBe('adr-002-stateless-jwt');

    // 3. Verifica se o lint diferencia raw/ compilado (rfc-001.md) de raw/ nao compilado (rfc-002-pendente.md)
    const lintRes = handleLint(db, memoryRoot);
    const lintData = JSON.parse(lintRes.content[0].text);
    expect(lintData.uncompiled_raw_sources).toContain('raw/rfc-002-pendente.md');
    expect(lintData.uncompiled_raw_sources).not.toContain('raw/rfc-001.md');

    db.close();
  });

  it('deve suportar leitura direta em lote por ids (wiki_read_compiled parity) e filtros category/include_superseded no bathynaut_recall', () => {
    const db = initDatabase(dbPath);

    handleLogAdr(db, memoryRoot, {
      id: 'pat-001-zod-validation',
      category: 'patterns',
      title: 'Validacao Estrita com Zod nas Fronteiras',
      summary: 'Todo payload externo deve passar por schema Zod.',
      context: 'Seguranca de tipos em runtime.',
      decision: 'Usar `.safeParse()` em todos os handlers.'
    });

    handleLogAdr(db, memoryRoot, {
      id: 'inc-001-null-pointer',
      category: 'incidents',
      title: 'Crash por Payload Sem Validacao',
      summary: 'Incidente causado por ausencia de schema no webhook.',
      context: 'Webhook recebeu payload malformado.',
      decision: 'Mitigado pelo padrao Zod.',
      edges: {
        mitigates: ['pat-001-zod-validation']
      }
    });

    // Leitura direta por IDs (sem precisar de query textual)
    const readRes = handleRecall(db, {
      ids: ['pat-001-zod-validation', 'inc-001-null-pointer'],
      limit: 10,
      token_budget: 2000
    });
    const readData = JSON.parse(readRes.content[0].text);
    expect(readData.count).toBe(2);
    const patNode = readData.results.find((r: any) => r.id === 'pat-001-zod-validation');
    expect(patNode).toBeDefined();
    expect(patNode.body_markdown).toContain('Usar `.safeParse()`');
    expect(patNode.backlinks.some((b: any) => b.source_id === 'inc-001-null-pointer')).toBe(true);

    // Busca filtrada por category: 'incidents'
    const filteredRes = handleRecall(db, {
      query: 'Validacao',
      category: 'incidents',
      limit: 10,
      token_budget: 2000
    });
    const filteredData = JSON.parse(filteredRes.content[0].text);
    expect(filteredData.results.every((r: any) => r.kind === 'incident')).toBe(true);

    db.close();
  });

  it('deve detectar Surprising Connections (Architectural Drift), Knowledge Gaps, Large Functions e Preview de Rename Cross-File', () => {
    const db = initDatabase(dbPath);

    // Comunidade 0 (UI) e Comunidade 1 (Database)
    db.prepare('INSERT INTO communities (id, name, cohesion, size, dominant_language, description) VALUES (0, ?, 0.9, 5, ?, ?)').run('UI Layer', 'typescript', 'Componentes visuais');
    db.prepare('INSERT INTO communities (id, name, cohesion, size, dominant_language, description) VALUES (1, ?, 0.85, 5, ?, ?)').run('Database Layer', 'typescript', 'Camada SQL');

    upsertNode(db, {
      id: 'src/ui/Button.tsx#renderButton',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'renderButton',
      file_path: 'src/ui/Button.tsx',
      line_start: 1,
      line_end: 85, // > 50 lines -> Large Function!
      community_id: 0,
      pagerank_score: 0.3
    });

    upsertNode(db, {
      id: 'src/db/rawSql.ts#executeRawDrop',
      depth_zone: 'twilight',
      kind: 'function',
      name: 'executeRawDrop',
      file_path: 'src/db/rawSql.ts',
      line_start: 10,
      line_end: 25,
      community_id: 1,
      pagerank_score: 0.4
    });

    // Aresta surpreendente: UI chamando funcao interna de DB diretamente!
    upsertEdge(db, {
      source_id: 'src/ui/Button.tsx#renderButton',
      target_id: 'src/db/rawSql.ts#executeRawDrop',
      relation: 'calls',
      confidence: 'EXTRACTED',
      context_snippet: 'executeRawDrop()'
    });

    // Comunidade 0 tem uma ADR, mas Comunidade 1 nao tem nenhuma ADR (Knowledge Gap!)
    upsertNode(db, {
      id: 'adr-ui-001',
      depth_zone: 'abyssal',
      kind: 'adr',
      name: 'Regras de UI',
      file_path: 'adr-ui-001.md'
    });
    upsertEdge(db, {
      source_id: 'src/ui/Button.tsx#renderButton',
      target_id: 'adr-ui-001',
      relation: 'governed_by'
    });

    const surprising = detectSurprisingConnections(db);
    expect(surprising.length).toBeGreaterThanOrEqual(1);
    expect(surprising[0].source_community).toBe('UI Layer');
    expect(surprising[0].target_community).toBe('Database Layer');

    const gaps = detectKnowledgeGaps(db);
    expect(gaps.some(g => g.community_name === 'Database Layer')).toBe(true);
    expect(gaps.some(g => g.community_name === 'UI Layer')).toBe(false);

    const largeFns = findLargeFunctions(db, 50);
    expect(largeFns.length).toBe(1);
    expect(largeFns[0].name).toBe('renderButton');
    expect(largeFns[0].line_count).toBe(85);

    const renamePlan = previewSymbolRename(db, 'executeRawDrop', 'safeExecuteQuery');
    expect(renamePlan.symbol_id).toBe('src/db/rawSql.ts#executeRawDrop');
    expect(renamePlan.new_name).toBe('safeExecuteQuery');
    expect(renamePlan.affected_callers.length).toBe(1);
    expect(renamePlan.affected_callers[0].file_path).toBe('src/ui/Button.tsx');

    // Verifica se bathynaut_dive tambem expoe surprising_connections e knowledge_gaps
    const diveRes = handleDive(db, {});
    const diveData = JSON.parse(diveRes.content[0].text);
    expect(diveData.surprising_connections.length).toBeGreaterThanOrEqual(1);
    expect(diveData.knowledge_gaps.length).toBeGreaterThanOrEqual(1);

    db.close();
  });
});

