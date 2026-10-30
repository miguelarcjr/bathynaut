# Especificação Técnica e Arquitetural: Bathynaut v0.2 SOTA
## O Motor Cognitivo Unificado (AST + Topologia + Memória Causal CoALA/Zettelkasten)

---

- **Projeto**: `bathynaut` (`d:\projetos\bathynaut`)
- **Versão Alvo**: `0.2.0`
- **Data**: 30 de Outubro de 2026
- **Status**: Aprovado para Implementação
- **Referências Competitivas Superadas**: `code-review-graph`, `graphify`, `graphicle`, `zk-wiki-mcp`

---

## 1. Visão Geral e Diagnóstico do v0.1

O **Bathynaut v0.2** evolui o protótipo inicial (v0.1) para um motor SOTA (State-of-the-Art) de produção capaz de substituir simultaneamente três servidores MCP separados (`code-review-graph`, `graphify` e `zk-wiki`) e superar o `graphicle` em economia de tokens, precisão de *blast radius* e governança causal de código.

### Gargalos Resolvidos em Relação ao v0.1
1. **Resolução Determinística de Símbolos e Imports Pós-AST**: No v0.1, chamadas `calls` apontavam para `fn:<nome>` e imports para `import:<path>`, desconectadas dos nós reais `fn:<file>:<nome>` e `file:<file>`. O v0.2 introduz o **Two-Pass Symbol & Import Linker**.
2. **Sincronização Incremental Just-in-Time (< 50ms)**: No v0.1, o banco `.bathynaut/ocean.db` ficava defasado após edições até rodar `bathynaut map`. O v0.2 introduz rastreamento por `mtime_ms` + `SHA-256` que atualiza apenas os arquivos modificados automaticamente antes de qualquer chamada MCP.
3. **Roteamento Dinâmico Multi-Projeto + Dual-Vault**: Um único servidor MCP registrado na IDE resolve automaticamente a raiz de qualquer repositório via `project_path` ou `files`, mantendo um pool LRU de bancos SQLite e reconhecendo nativamente tanto `.bathynaut/memory/` quanto `.agents/memory/`.
4. **Ontologia Semântica Bidirecional Completa & Taxonomia CoALA**: Suporte às 8 famílias de arestas semânticas com *backlinks* reversos automáticos, ancoragem direta em símbolos de código (`symbols` e menções inline `` `func()` ``), invariantes executáveis (`invariants` + `enforcement: blocking | warning | advisory`) e detecção de *Stale ADR*.
5. **Excerpts Citados com Orçamento de Tokens & Busca Híbrida RRF**: Retorno de trechos reais de código com numeração exata de linhas (`file:start-end`), assinatura, docstring e rankeamento híbrido (BM25 com desmembramento `camelCase`/`snake_case` + PageRank + Expansão 1-Hop).
6. **Análise de `git diff`, Execution Flows e Risk Score Determinístico**: O `bathynaut_sonar` analisa tanto arquivos explícitos quanto mudanças locais no Git (`git diff`), mapeando fluxos de execução ponta a ponta, cobertura/gaps de testes e score de risco (`0.0` a `1.0`).

---

## 2. Arquitetura do Cérebro e Ontologia Zettelkasten (CoALA + MADR 4.0)

### 2.1 Estrutura de Diretórios (Dual-Vault: `.bathynaut/memory/` ou `.agents/memory/`)

```text
<memory_root>/
├── activeContext.md          # WORKING MEMORY: Estado quente da sessão atual, hipótese ativa e próximas tarefas
├── index.md                  # MAP OF CONTENT (MOC): Índice mestre gerado automaticamente com contadores, status e alertas
├── raw/                      # BUFFER DE ENTRADA: Documentos brutos aguardando compilação atômica
├── wiki/
│   ├── decisions/            # SEMANTIC MEMORY (Causal): ADRs (MADR 4.0 com invariantes e trade-offs)
│   ├── entities/             # SEMANTIC MEMORY (Domínio): Modelos de domínio, regras de negócio e integrações
│   ├── architecture/         # SEMANTIC MEMORY (Macro): Fronteiras de módulos e topologia de subsistemas
│   ├── patterns/             # PROCEDURAL MEMORY: Convenções de código, playbooks e anti-patterns proibidos
│   └── incidents/            # EPISODIC MEMORY: Post-mortems de bugs, causas-raiz e mitigações aplicadas
└── .obsidian/
    ├── app.json
    └── graph.json            # Grupos de cores por categoria (Decisions, Incidents, Patterns, Entities, Architecture)
```

### 2.2 Especificação do Frontmatter YAML (Notas Atômicas)

```yaml
---
id: adr-001-autenticacao-jwt
title: "Autenticação Stateless com JWT e Refresh Token Rotativo"
summary: "Uso de JWT curto (15m) + Refresh Token em cookie HttpOnly com rotação e detecção de reuso."
category: decisions          # decisions | incidents | patterns | entities | architecture
status: active               # active | proposed | deprecated | superseded
enforcement: blocking        # blocking | warning | advisory
updated_at: "2026-10-30"
applies_to:
  - "src/auth/**"
  - "src/middleware/jwt.ts"
symbols:
  - "verifyAccessToken"
  - "rotateRefreshToken"
invariants:
  - "NUNCA armazenar refresh tokens em texto puro no banco; usar hash SHA-256."
  - "Reuso de refresh token já invalidado DEVE revogar toda a família de tokens do usuário."
sources:
  - "docs/specs/auth-security.md"
edges:
  supersedes: ["adr-000-sessao-cookie"]
  mitigates: ["inc-001-roubo-sessao-xss"]
  implements: ["pattern-token-rotation"]
  depends_on: []
  tensions_with: ["pattern-stateless-pure"]
  caused_by: []
  verified_by: ["tests/auth/token-rotation.spec.ts"]
---
```

### 2.3 Ontologia de Arestas Semânticas e Backlinks Inversos

As arestas podem ser declaradas no bloco YAML `edges:` ou inline no corpo Markdown via `relacao:: [[id-alvo]]`:

| Aresta Direta (`source -> target`) | Label Inverso Automático (`target <- source`) | Peso no Grafo | Significado Semântico |
| :--- | :--- | :---: | :--- |
| `supersedes` | `superseded_by` | `1.0` | Substitui e deprecia automaticamente a nota alvo (`status = 'superseded'`). |
| `mitigates` | `mitigated_by` | `1.0` | Conecta uma decisão/padrão ao incidente (`incident`) que ela previne ou corrige. |
| `caused_by` | `caused_incident` | `1.0` | Conecta um incidente à decisão, componente ou falha que originou o problema. |
| `depends_on` | `required_by` | `0.9` | Dependência arquitetural ou conceitual direta. |
| `implements` | `implemented_by` | `0.9` | Conecta uma decisão ou módulo ao padrão (`pattern`) que ela concretiza. |
| `tensions_with` | `tensions_with` | `0.8` | Explicita *trade-offs*, tensões de design ou alternativas mutuamente exclusivas. |
| `verified_by` | `verifies` | `0.9` | Conecta uma regra/ADR ao teste ou suíte que valida seu invariante. |
| `mentions` | `mentioned_in` | `0.5` | Extraída automaticamente de wikilinks comuns `[[id-alvo]]` no corpo do texto. |
| `shares_scope_with` | `shares_scope_with` | `0.4` | Inferida automaticamente quando duas notas possuem globs `applies_to` ou `symbols` sobrepostos. |
| `governed_by` | `governs` | `1.0` | Conecta nós físicos de código (arquivos/funções/classes) às notas da Wiki via `applies_to`, `symbols` ou menções `` `simbolo()` ``. |

---

## 3. Schema Relacional e FTS5 Unificado (`ocean.db` v2)

Localização padrão: `.bathynaut/ocean.db` (com WAL habilitado e `synchronous = NORMAL`).

```sql
CREATE TABLE IF NOT EXISTS file_state (
  file_path TEXT PRIMARY KEY,
  mtime_ms INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('code', 'markdown')),
  last_synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  depth_zone TEXT NOT NULL CHECK(depth_zone IN ('sunlight', 'twilight', 'abyssal')),
  kind TEXT NOT NULL CHECK(kind IN (
    'community', 'file', 'function', 'class', 'interface', 'test', 'entrypoint',
    'adr', 'incident', 'pattern', 'entity', 'architecture'
  )),
  name TEXT NOT NULL,
  qualified_name TEXT,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  signature TEXT,
  docstring TEXT,
  code_excerpt TEXT,
  content_hash TEXT,
  is_exported INTEGER DEFAULT 0,
  is_entrypoint INTEGER DEFAULT 0,
  community_id INTEGER,
  pagerank_score REAL DEFAULT 0.0,
  in_degree INTEGER DEFAULT 0,
  out_degree INTEGER DEFAULT 0,
  is_bridge INTEGER DEFAULT 0,
  summary TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'proposed', 'deprecated', 'superseded', 'stale')),
  enforcement TEXT DEFAULT 'advisory' CHECK(enforcement IN ('blocking', 'warning', 'advisory')),
  applies_to_json TEXT DEFAULT '[]',
  symbols_json TEXT DEFAULT '[]',
  invariants_json TEXT DEFAULT '[]',
  sources_json TEXT DEFAULT '[]',
  body_markdown TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id UNINDEXED,
  name,
  tokenized_identifiers,
  signature,
  summary,
  docstring,
  body_markdown,
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'EXTRACTED' CHECK(confidence IN ('EXTRACTED', 'INFERRED', 'AMBIGUOUS')),
  weight REAL DEFAULT 1.0,
  context_snippet TEXT,
  needs_review INTEGER DEFAULT 0,
  PRIMARY KEY (source_id, target_id, relation)
);

CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cohesion REAL DEFAULT 0.0,
  size INTEGER DEFAULT 0,
  dominant_path TEXT,
  god_node_id TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entrypoint_id TEXT NOT NULL,
  terminal_ids_json TEXT NOT NULL,
  node_path_json TEXT NOT NULL,
  depth INTEGER NOT NULL,
  crosses_communities INTEGER DEFAULT 0,
  criticality_score REAL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS flow_memberships (
  flow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  PRIMARY KEY (flow_id, node_id)
);
```

---

## 4. Pipeline de Indexação, Symbol Linker e Fluxos

### 4.1 Extração AST Rica (`src/parsers/ast/extractors.ts`)
Para cada arquivo suportado (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.rs`):
1. **Funções, Métodos, Arrow Functions, Classes e Interfaces**:
   - Extrai `signature` (primeira linha da declaração sem o corpo `{...}`), `docstring` (comentários imediatamente anteriores à linha da declaração), `code_excerpt` (limitado a até 40 linhas ou 1.600 caracteres para controle de armazenamento) e `content_hash` (`SHA-256` do código do símbolo).
   - Detecta `is_exported` (presença de `export` no pai/declaração ou convenção pública).
   - Detecta `kind = 'test'` se o arquivo for `.test.`/`.spec.` ou o bloco for `describe`/`it`/`test`/`test_*`.
   - Detecta `is_entrypoint = 1` para handlers de rotas (`app.get`, `router.post`), CLI commands (`program.command`), funções `main`/`handler` ou funções exportadas de `index.ts`/`server.ts`/`main.ts`.
2. **Imports e Chamadas Brutas**:
   - Registra imports com metadados dos símbolos importados e o specifier bruto (`./storage/db.js`, `@/utils/hash`).
   - Registra chamadas com o nome do símbolo chamado e receptor opcional (`db.prepare` -> `prepare`, receptor `db`).

### 4.2 Two-Pass Symbol & Import Linker (`src/parsers/ast/symbol-linker.ts`)
Executado após a extração AST dos arquivos:
1. **Passada 1 — Resolução de Caminhos de Import (`resolveImportTarget`)**:
   - Resolve caminhos relativos (`./foo.js` -> `src/foo.ts`, `../bar` -> `src/bar/index.ts`) e aliases comuns (`@/` -> `src/`), convertendo a aresta `file:A -> imports -> import:./foo.js` para `file:A -> imports -> file:src/foo.ts` (`confidence: 'EXTRACTED'`).
2. **Passada 2 — Resolução de Chamadas entre Funções (`resolveCallTarget`)**:
   - Para cada chamada `callerNode -> calls -> rawCalleeName`:
     - **Regra 1 (Escopo Local)**: Existe uma função/método `rawCalleeName` definida no mesmo arquivo? Conecta a `fn:<same_file>:<rawCalleeName>` (`EXTRACTED`).
     - **Regra 2 (Import Explícito)**: O arquivo do caller importa `rawCalleeName` (ou importa o módulo `M`) de `file:B`, e `file:B` define `fn:B:rawCalleeName`? Conecta a `fn:B:rawCalleeName` (`EXTRACTED`).
     - **Regra 3 (Definição Exportada Única)**: Existe exatamente 1 símbolo exportado com `name === rawCalleeName` em todo o repositório? Conecta a ele com `confidence: 'INFERRED'`.
     - **Regra 4 (Múltiplos Candidatos no Mesmo Subdiretório)**: Prioriza o candidato no mesmo diretório/módulo com `confidence: 'AMBIGUOUS'`.

### 4.3 Ancoragem Tripla Código <-> Zettelkasten (`src/parsers/ast/interlink.ts`)
Uma nota Zettelkasten (ADR, Incidente, Padrão, Entidade) é conectada aos nós de código por 3 mecanismos:
1. **Globs `applies_to`**: Conecta todos os arquivos e funções cujo `file_path` casa com o glob (`governed_by`, `EXTRACTED`).
2. **Lista explícita `symbols`**: Conecta funções/classes cujo `name` ou `qualified_name` está listado no campo `symbols:` do YAML (`governed_by`, `EXTRACTED`).
3. **Menções Inline no Corpo Markdown (`doc_links`)**: Procura expressões entre crases `` `nomeFuncao` `` ou `` `Classe.metodo()` `` no corpo da nota; se corresponder a um símbolo real do AST, cria a aresta `governed_by` (`INFERRED`).
4. **Co-escopo entre Notas (`shares_scope_with`)**: Se duas notas ativas governam um mesmo arquivo ou símbolo, cria uma aresta `shares_scope_with` entre elas.

### 4.4 Detecção de Fluxos de Execução (`src/graph/flows.ts`)
- Identifica todos os nós de código marcados como `is_entrypoint = 1` ou funções públicas com `in_degree === 0` e `out_degree > 0`.
- Executa BFS forward pelas arestas `calls` até profundidade máxima 6, montando caminhos de execução (`flows`) e preenchendo `flow_memberships`.
- Calcula `criticality_score` (0.0 a 1.0) combinando: comprimento do fluxo, número de comunidades atravessadas (`crosses_communities`) e presença de termos sensíveis (`auth`, `token`, `payment`, `db`, `sql`, `secret`, `webhook`, `crypto`, `permission`).

---

## 5. Sincronização Incremental Just-in-Time & Multi-Project Pool

### 5.1 `ProjectContextPool` (`src/storage/pool.ts`)
- Resolve a raiz do projeto a partir de `project_path`, `files[0]` ou `process.cwd()` procurando na ordem:
  1. Diretório contendo `.bathynaut/`
  2. Diretório contendo `.agents/memory/`
  3. Diretório contendo `.git`
- Determina automaticamente o `memoryRoot`:
  - Se `.bathynaut/memory/wiki` existir -> usa `.bathynaut/memory`
  - Se `.agents/memory/wiki` existir -> usa `.agents/memory`
  - Caso contrário -> inicializa `.bathynaut/memory`
- Mantém até 8 contextos abertos em LRU (`Map<projectRoot, ProjectContext>`) e registra o projeto em `~/.bathynaut/registry.json`.

### 5.2 `ensureFreshGraph(ctx, targetFiles?)` (`src/storage/incremental-sync.ts`)
Chamado automaticamente no início de qualquer tool MCP de leitura:
1. Varre rapidamente os `mtime_ms` dos arquivos de código e markdown do projeto (respeitando `.gitignore` e ignorando `node_modules`, `dist`, `.git`, `.bathynaut/ocean.db`).
2. Se nenhum arquivo tiver `mtime_ms` diferente da tabela `file_state` e nenhum arquivo foi adicionado/removido -> **retorna em < 5ms** (zero I/O de leitura de conteúdo).
3. Para arquivos com `mtime_ms` alterado -> calcula `SHA-256`. Se igual ao salvo, apenas atualiza `mtime_ms`.
4. Se houver arquivos realmente modificados/adicionados/removidos:
   - Se for a primeira indexação (banco vazio), executa o pipeline completo.
   - Se for um delta:
     - Verifica se funções governadas por ADRs mudaram de `content_hash`; em caso positivo, marca `needs_review = 1` na aresta `governed_by`.
     - Atualiza os nós e arestas dos arquivos modificados, re-executa o `Symbol & Import Linker`, atualiza comunidades/PageRank/Flows e atualiza `file_state`.

---

## 6. Especificação das 7 Ferramentas MCP Oceânicas v0.2

Todas as ferramentas aceitam `project_path?: string` opcional para roteamento explícito multi-workspace.

| Ferramenta | Novidades no v0.2 SOTA |
| :--- | :--- |
| **`bathynaut_sonar`** | Aceita `files?: string[]`, `git_diff?: boolean`, `base_ref?: string`, `token_budget?: number` (default 2500). Retorna: (1) **Blocking Invariants** no topo, (2) **Risk Score & Rating** (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), (3) **Changed/Target Functions** com excerpts citados (`file:start-end`), (4) **Downstream Callers** inter-arquivos resolvidos, (5) **Affected Execution Flows**, (6) **Covering Tests & Untested Gaps**, (7) **Governing ADRs, Incidents & Stale Warnings**. |
| **`bathynaut_dive`** | Retorna as comunidades Louvain/Leiden com métrica de **Coesão (`cohesion`)**, os **Top God Nodes (PageRank)**, **Bridge Nodes** (acoplamento entre módulos), **Hub Nodes** e os **Top Execution Flows** mais críticos da arquitetura. |
| **`bathynaut_path`** | Encontra o menor caminho direcionado ou bidirecional entre quaisquer dois símbolos, arquivos ou ADRs, retornando cada salto com o tipo de aresta (`calls`, `imports`, `governed_by`, `mitigates`), nível de confiança (`EXTRACTED`/`INFERRED`) e citação de linha. |
| **`bathynaut_recall`** | **Busca Híbrida RRF (BM25 + PageRank + Expansão 1-Hop)** com desmembramento de `camelCase`/`snake_case` e `token_budget`. Retorna nós de código e notas Zettelkasten com **Backlinks Inversos** (`superseded_by`, `mitigated_by`, `required_by`), avisos de depreciação e excerpts citados. |
| **`bathynaut_log_adr`** | Compila notas atômicas em qualquer categoria (`decisions`, `incidents`, `patterns`, `entities`, `architecture`) com validação Zod, `invariants`, `enforcement`, `symbols`, `applies_to` e todas as arestas semânticas. **Executa o Interlinker e regenera o `index.md` imediatamente na mesma chamada.** |
| **`bathynaut_checkpoint`** | Persiste a Working Memory (`activeContext.md`) mantendo histórico compacto das últimas sessões, tarefas pendentes e ADRs recém-criadas. |
| **`bathynaut_lint`** | Diagnóstico profundo em 5 dimensões: (1) Notas órfãs, (2) Wikilinks `[[id]]` quebrados, (3) **Stale ADRs** (onde o código governado mudou após a criação da ADR), (4) **Untested God Nodes** (funções centrais sem cobertura de testes), e (5) Documentos em `raw/` pendentes de compilação. |

---

## 7. CLI Expandida (`bin/bathynaut.js`)

- `bathynaut init`: Auto-detecta IDEs (Claude Code, Cursor, Antigravity, Windsurf, VS Code, Copilot), cria/adota o Vault, injeta regras idempotentes (`<!-- BATHYNAUT:START -->`), instala opcionalmente Git Hooks (`post-commit`, `post-merge`), executa o mapeamento inicial e registra no `~/.bathynaut/registry.json`.
- `bathynaut map`: Executa indexação incremental (ou completa com `--force`), exibe estatísticas de AST, comunidades, fluxos, links resolvidos e exporta `bathynaut.html`.
- `bathynaut review [--base <ref>]`: Analisa o `git diff` atual no terminal, exibindo o *Risk Score*, funções impactadas, fluxos afetados, gaps de teste e invariantes de ADRs aplicáveis.
- `bathynaut lint`: Executa a auditoria completa de saúde do grafo e da Wiki no terminal.
- `bathynaut disconnect`: Remove de forma limpa e segura todas as configurações, hooks e blocos injetados pelo `init` usando backups `.bathynaut-bak`.
- `bathynaut explorer`: Exporta o dashboard visual interativo D3.js (`bathynaut.html`) com filtro por zonas de profundidade, comunidades, fluxos e arestas semânticas.
- `bathynaut serve`: Inicia o servidor MCP Stdio com `ProjectContextPool` e Auto-Sync Just-in-Time.

---

## 8. Estratégia de Testes e Verificação Determinística

A suíte Vitest (`tests/`) validará cada subsistema com testes determinísticos:
1. **`tests/symbol-linker.spec.ts`**: Verifica que chamadas entre arquivos distintos (`a.ts` -> `import { fn } from './b.js'` -> `fn()`) criam arestas reais `fn:a.ts:caller -> calls -> fn:b.ts:fn` e que `calculateBlastRadius` atravessa múltiplos arquivos e encontra os testes (`.spec.ts`) que cobrem a função.
2. **`tests/zettelkasten-ontology.spec.ts`**: Verifica todas as 8 famílias de arestas semânticas (`tensions_with`, `caused_by`, `verified_by`, `mentions`, `shares_scope_with`, etc.), backlinks inversos, `invariants`, `enforcement`, ancoragem por `symbols` e menções inline `` `func()` ``.
3. **`tests/incremental-sync.spec.ts`**: Verifica que editar 1 arquivo atualiza apenas aquele arquivo via `ensureFreshGraph` em tempo sub-50ms e marca `needs_review = 1` (Stale ADR) nas ADRs que governam a função alterada.
4. **`tests/rrf-and-sonar.spec.ts`**: Verifica a busca híbrida RRF (incluindo busca em linguagem natural encontrando identificadores `camelCase`), empacotamento por `token_budget` com citações `file:line_start-line_end`, cálculo de Execution Flows e `git diff` Risk Scoring.
5. **`tests/e2e-workflow.spec.ts`**: Fluxo E2E completo (`init` -> `map` -> `MCP tools` -> `review` -> `lint` -> `disconnect`).

