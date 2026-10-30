# Bathynaut v0.2 SOTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o Bathynaut (`d:\projetos\bathynaut`) para a versão `0.2.0` SOTA, superando `code-review-graph`, `graphify` e `graphicle` com resolução determinística de símbolos/imports em 2 passadas, ontologia Zettelkasten CoALA completa (10 arestas bidirecionais + invariantes executáveis), sincronização incremental Just-in-Time (< 50ms), pool multi-projeto Dual-Vault, busca híbrida RRF com orçamento de tokens, rastreamento de Execution Flows e análise de risco de `git diff`.

**Architecture:** Motor unificado em TypeScript/Node.js sobre SQLite (`better-sqlite3` com WAL + FTS5), `web-tree-sitter` (WASM) para AST multi-linguagem e `graphology` para algoritmos topológicos (Louvain, PageRank, Shortest Path, Bridge/Hub detection, Execution Flows). Expõe as 7 Ferramentas Oceânicas de alta densidade via MCP Stdio com `ProjectContextPool` dinâmico e CLI completa (`init`, `map`, `review`, `lint`, `explorer`, `disconnect`, `serve`).

**Tech Stack:** TypeScript 5.6, Node.js >= 18, `better-sqlite3`, `web-tree-sitter`, `tree-sitter-wasms`, `graphology`, `@modelcontextprotocol/sdk`, `gray-matter`, `minimatch`, `zod`, `commander`, `vitest`.

## Global Constraints

- Manter 100% de compatibilidade com ESM (`"type": "module"`, imports com extensão `.js`).
- Preservar retrocompatibilidade com os testes existentes em `tests/` enquanto expande a cobertura para todos os novos subsistemas SOTA.
- Remover a constraint `FOREIGN KEY` estrita de `edges` que derrubava silenciosamente arestas antes da resolução do Linker, garantindo integridade via `Symbol & Import Linker`.
- Suportar nativamente **Dual-Vault**: reconhecer `.agents/memory/` (se existir no projeto) ou `.bathynaut/memory/` (padrão).
- Toda resposta de ferramenta MCP (`sonar`, `recall`, `dive`, `path`, `log_adr`, `checkpoint`, `lint`) deve sincronizar incrementalmente arquivos alterados via `ensureFreshGraph` antes de consultar o banco.

---

### Task 1: Schema SQLite v0.2, Migração Automática, Queries Estendidas & Multi-Project Pool

**Files:**
- Modify: `src/types.ts`
- Modify: `src/storage/schema.sql`
- Modify: `src/storage/db.ts`
- Modify: `src/storage/queries.ts`
- Create: `src/storage/pool.ts`
- Test: `tests/storage.spec.ts`

**Interfaces:**
- Produces:
  - Novos tipos em `src/types.ts`: `NodeKind`, `RelationType` (incluindo `tensions_with`, `caused_by`, `verified_by`, `mentions`, `shares_scope_with`), `ConfidenceTier` (`EXTRACTED` | `INFERRED` | `AMBIGUOUS`), `EnforcementLevel` (`blocking` | `warning` | `advisory`), `FileStateRecord`, `FlowRecord`, `BlastRadiusResult` v2.
  - Funções em `src/storage/queries.ts`: `upsertFileState`, `getFileState`, `deleteFileState`, `deleteNodesByFilePath`, `upsertFlow`, `getFlowsForNode`, `tokenizeIdentifier`.
  - Classe `ProjectContextPool` e helper `resolveProjectRoot(hintPath?: string)` em `src/storage/pool.ts`.

- [ ] **Step 1: Atualizar `tests/storage.spec.ts` com testes de schema v0.2, tokenização de identificadores, `file_state` e `ProjectContextPool` Dual-Vault**
- [ ] **Step 2: Rodar `npm test -- tests/storage.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar `src/types.ts`, `src/storage/schema.sql`, `src/storage/db.ts` (com migração idempotente de colunas), `src/storage/queries.ts` e `src/storage/pool.ts`**
- [ ] **Step 4: Rodar `npm test -- tests/storage.spec.ts` e verificar que todos passam**
- [ ] **Step 5: Commit `feat(storage): implementar schema v0.2, pool multi-projeto e dual-vault`**

---

### Task 2: Ontologia Zettelkasten CoALA SOTA (5 Categorias, 10 Arestas Bidirecionais, Invariantes & MOC Indexer)

**Files:**
- Modify: `src/parsers/markdown/edges.ts`
- Modify: `src/parsers/markdown/zettelkasten.ts`
- Modify: `src/parsers/markdown/scanner.ts`
- Modify: `src/installer/vault-scaffold.ts`
- Create: `tests/zettelkasten-ontology.spec.ts`

**Interfaces:**
- Consumes: `NodeRecord`, `EdgeRecord`, `RelationType`, `EnforcementLevel` de `src/types.ts`.
- Produces:
  - `INVERSE_RELATIONS: Record<string, string>` (`supersedes` -> `superseded_by`, `mitigates` -> `mitigated_by`, `caused_by` -> `caused_incident`, `depends_on` -> `required_by`, `implements` -> `implemented_by`, `verified_by` -> `verifies`, `mentions` -> `mentioned_in`, `tensions_with` -> `tensions_with`, `shares_scope_with` -> `shares_scope_with`, `governed_by` -> `governs`).
  - `extractTypedEdges(sourceId, frontmatter, body)` suportando frontmatter `edges: {...}`, campos diretos (`supersedes`, `depends_on`, `mitigates`, `tensions_with`, `caused_by`, `verified_by`, `implements`), inline `rel:: [[id]]` e wikilinks genéricos `[[id]]` como `mentions` (peso `0.5`).
  - `parseZettelkastenNote` extraindo `invariants`, `enforcement`, `symbols`, `sources`, e as 5 categorias CoALA (`decisions`, `incidents`, `patterns`, `entities`, `architecture`).
  - `computeScopeSharingEdges(notes)` e `generateMOCIndex(memoryRoot, db)` em `src/parsers/markdown/scanner.ts`.

- [ ] **Step 1: Criar `tests/zettelkasten-ontology.spec.ts` testando as 10 relações, backlinks inversos, invariantes, `enforcement`, `symbols`, `mentions` e geração do `index.md`**
- [ ] **Step 2: Rodar `npm test -- tests/zettelkasten-ontology.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar `src/parsers/markdown/edges.ts`, `src/parsers/markdown/zettelkasten.ts`, `src/parsers/markdown/scanner.ts` e atualizar `src/installer/vault-scaffold.ts`**
- [ ] **Step 4: Rodar `npm test -- tests/zettelkasten-ontology.spec.ts tests/markdown-parser.spec.ts` e verificar que todos passam**
- [ ] **Step 5: Commit `feat(memory): implementar ontologia coala sota, 10 arestas bidirecionais e invariantes`**

---

### Task 3: Extrator AST Profundo, Two-Pass Symbol & Import Linker e Ancoragem Tripla Código-Wiki

**Files:**
- Modify: `src/parsers/ast/extractors.ts`
- Create: `src/parsers/ast/symbol-linker.ts`
- Modify: `src/parsers/ast/interlink.ts`
- Create: `tests/symbol-linker.spec.ts`

**Interfaces:**
- Consumes: `NodeRecord`, `EdgeRecord` de `src/types.ts`, `ParsedZettelNote` de `src/parsers/markdown/zettelkasten.ts`.
- Produces:
  - `parseSourceCode(filePath, code)` extraindo `signature`, `docstring`, `code_excerpt`, `content_hash`, `is_exported`, `is_entrypoint`, `kind: 'test'` para blocos/arquivos de teste, além de metadados de imports e chamadas.
  - `linkSymbolsAndImports(nodes, rawEdges)` em `src/parsers/ast/symbol-linker.ts`: resolve `import:./path` para `file:resolvedPath` e resolve `calls` (`fn:calleeName`) para o `fn:targetFile:calleeName` correto via escopo local, imports do arquivo ou símbolo único exportado, marcando `EXTRACTED`, `INFERRED` ou `AMBIGUOUS` e criando arestas `tests_for` quando um arquivo de teste chama uma função de produção.
  - `interlinkCodeWithADRs(codeNodes, adrNotes)` em `src/parsers/ast/interlink.ts`: conecta por (1) globs `applies_to`, (2) lista `symbols` no frontmatter, e (3) menções entre crases `` `simbolo()` `` no corpo Markdown.

- [ ] **Step 1: Criar `tests/symbol-linker.spec.ts` testando resolução de imports e chamadas inter-arquivos, detecção de `tests_for`, extração de assinatura/docstring/excerpt e ancoragem tripla de ADRs**
- [ ] **Step 2: Rodar `npm test -- tests/symbol-linker.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar melhorias em `src/parsers/ast/extractors.ts`, criar `src/parsers/ast/symbol-linker.ts` e atualizar `src/parsers/ast/interlink.ts`**
- [ ] **Step 4: Rodar `npm test -- tests/symbol-linker.spec.ts tests/ast-parser.spec.ts` e verificar que todos passam**
- [ ] **Step 5: Commit `feat(ast): implementar two-pass symbol linker, extracao rica e ancoragem tripla`**

---

### Task 4: Topologia Avançada (Cohesion, Bridge/Hub Nodes), Execution Flows & Blast Radius v2 com Git Diff Risk Scoring

**Files:**
- Modify: `src/graph/communities.ts`
- Modify: `src/graph/pagerank.ts`
- Create: `src/graph/flows.ts`
- Create: `src/graph/git-diff.ts`
- Modify: `src/graph/blast-radius.ts`
- Modify: `tests/graph-topology.spec.ts`

**Interfaces:**
- Consumes: `Database` (`better-sqlite3`), `Graph` (`graphology`).
- Produces:
  - `computeTopologyMetrics(graph, db)` em `src/graph/pagerank.ts` (calcula PageRank, `in_degree`, `out_degree` e `is_bridge` para nós que ligam comunidades distintas).
  - `detectAndPersistFlows(db)` em `src/graph/flows.ts` (rastreia fluxos a partir de entrypoints, calcula `criticality_score` e grava em `flows` e `flow_memberships`).
  - `parseGitDiffRanges(projectRoot, baseRef?)` em `src/graph/git-diff.ts` (executa `git diff --unified=0` e retorna arquivos e intervalos de linhas modificadas).
  - `calculateBlastRadius(db, targetFiles, options?)` em `src/graph/blast-radius.ts` retornando: `blocking_invariants`, `risk_score`, `risk_level` (`LOW`|`MEDIUM`|`HIGH`|`CRITICAL`), `affected_files`, `affected_nodes` (com `signature`, `line_start`, `line_end`, `code_excerpt`), `affected_flows`, `covering_tests`, `untested_functions`, `governing_adrs` (com `stale_warning`), `known_incidents`.

- [ ] **Step 1: Expandir `tests/graph-topology.spec.ts` para testar Bridge/Hub nodes, Execution Flows, Blast Radius inter-arquivos, `untested_functions`, `blocking_invariants` e `risk_score`**
- [ ] **Step 2: Rodar `npm test -- tests/graph-topology.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar `src/graph/communities.ts`, `src/graph/pagerank.ts`, `src/graph/flows.ts`, `src/graph/git-diff.ts` e `src/graph/blast-radius.ts`**
- [ ] **Step 4: Rodar `npm test -- tests/graph-topology.spec.ts` e verificar que todos passam**
- [ ] **Step 5: Commit `feat(graph): implementar execution flows, bridge nodes e blast radius v2 com risk score`**

---

### Task 5: Sincronização Incremental Just-in-Time (< 50ms), Stale ADR Detection, Busca Híbrida RRF & Token Packer

**Files:**
- Create: `src/storage/incremental-sync.ts`
- Create: `src/storage/rrf-search.ts`
- Create: `src/storage/token-packer.ts`
- Modify: `src/cli/commands/map.ts`
- Create: `tests/incremental-and-rrf.spec.ts`

**Interfaces:**
- Produces:
  - `ensureFreshGraph(projectRoot, options?)` em `src/storage/incremental-sync.ts`: sincroniza incrementalmente arquivos de código e markdown baseando-se em `mtime_ms` e `sha256`, detecta *Stale ADRs* (`needs_review = 1` quando o `content_hash` de uma função governada muda) e retorna estatísticas do sync (`syncedFiles`, `deletedFiles`, `durationMs`, `staleAdrsCount`).
  - `hybridSearchRRF(db, query, options?)` em `src/storage/rrf-search.ts`: combina ranking FTS5 BM25 (com desmembramento de `camelCase`/`snake_case`) + PageRank + expansão 1-hop com backlinks reversos (`INVERSE_RELATIONS`) e avisos de depreciação (`superseded_by`).
  - `packWithinTokenBudget(items, tokenBudget)` em `src/storage/token-packer.ts`: formata resultados com citações verificáveis (`file:line_start-line_end`) respeitando estritamente o limite de tokens.

- [ ] **Step 1: Criar `tests/incremental-and-rrf.spec.ts` testando sync incremental sub-50ms, detecção de Stale ADR ao alterar função governada, busca RRF para camelCase e empacotamento por orçamento de tokens**
- [ ] **Step 2: Rodar `npm test -- tests/incremental-and-rrf.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar `src/storage/incremental-sync.ts`, `src/storage/rrf-search.ts`, `src/storage/token-packer.ts` e atualizar `src/cli/commands/map.ts`**
- [ ] **Step 4: Rodar `npm test -- tests/incremental-and-rrf.spec.ts` e verificar que todos passam**
- [ ] **Step 5: Commit `feat(engine): implementar incremental sync just-in-time, stale adr detection e busca rrf`**

---

### Task 6: Super-Ferramentas MCP v0.2, CLI (`review`, `disconnect`), Auto-Interlink no `log_adr` & Documentação `README.md`

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/tools/sonar.ts`
- Modify: `src/mcp/tools/dive.ts`
- Modify: `src/mcp/tools/path.ts`
- Modify: `src/mcp/tools/recall.ts`
- Modify: `src/mcp/tools/log-adr.ts`
- Modify: `src/mcp/tools/checkpoint.ts`
- Modify: `src/mcp/tools/lint.ts`
- Create: `src/cli/commands/review.ts`
- Create: `src/cli/commands/disconnect.ts`
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `tests/mcp-server.spec.ts`
- Modify: `tests/e2e-workflow.spec.ts`

**Interfaces:**
- Integra `ProjectContextPool` e `ensureFreshGraph` em todas as 7 ferramentas MCP (`bathynaut_sonar`, `bathynaut_dive`, `bathynaut_path`, `bathynaut_recall`, `bathynaut_log_adr`, `bathynaut_checkpoint`, `bathynaut_lint`).
- No `bathynaut_log_adr`: executa `interlinkCodeWithADRs` e `generateMOCIndex` imediatamente após criar a nota.
- No `bathynaut_lint`: reporta nós órfãos, wikilinks quebrados, *Stale ADRs*, *Untested God Nodes* e arquivos pendentes em `raw/`.
- Na CLI: adiciona `bathynaut review` e `bathynaut disconnect`.
- Atualiza `README.md` documentando toda a arquitetura v0.2 SOTA, comparativo de engenharia, ontologia CoALA/MADR e novos comandos.

- [ ] **Step 1: Atualizar `tests/mcp-server.spec.ts` e `tests/e2e-workflow.spec.ts` cobrindo auto-interlink imediato no `log_adr`, `sonar` com `git_diff` e `token_budget`, `lint` 5D, `review` e `disconnect`**
- [ ] **Step 2: Rodar `npm test -- tests/mcp-server.spec.ts tests/e2e-workflow.spec.ts` e verificar falha**
- [ ] **Step 3: Implementar todas as ferramentas MCP v0.2, comandos CLI (`review.ts`, `disconnect.ts`, `main.ts`), exportar no `src/index.ts` e atualizar `README.md`**
- [ ] **Step 4: Rodar `npm test` (suíte completa) e `npm run build` em `d:\projetos\bathynaut` garantindo 100% de aprovação**
- [ ] **Step 5: Commit `feat(bathynaut): lancar v0.2 sota com mcp just-in-time, review cli e readme atualizado`**
