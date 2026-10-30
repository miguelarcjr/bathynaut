<div align="center">

# 🌊 Bathynaut

### Arquitetura Cognitiva Oceânica Unificada, Grafo de Código & Memória Causal Zettelkasten para Agentes de IA

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.pt-BR.md"><b>Português (Brasil)</b></a>
</p>

<p align="center">
  <a href="https://github.com/miguelarc/bathynaut"><img src="https://img.shields.io/badge/version-0.2.0--SOTA-00d2ff?style=flat-square&labelColor=0a192f" alt="Version 0.2.0 SOTA"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square&labelColor=0a192f" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D18%20%7C%2022%2B%20native%20sqlite-10b981?style=flat-square&labelColor=0a192f" alt="Node >= 18"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.6-3b82f6?style=flat-square&labelColor=0a192f" alt="TypeScript 5.6"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Stdio%20Native-8b5cf6?style=flat-square&labelColor=0a192f" alt="MCP Compatible"></a>
  <img src="https://img.shields.io/badge/Custo%20de%20API-%240%20(100%25%20Local)-22c55e?style=flat-square&labelColor=0a192f" alt="Zero API Cost">
</p>

<p align="center">
  <strong>Pare de deixar seu agente de código se afogar em tokens ou sofrer amnésia arquitetural entre sessões.</strong><br>
  O Bathynaut unifica um <b>Grafo de Chamadas e Imports AST (Tree-sitter WASM)</b>, <b>Clusterização Topológica Louvain + PageRank</b> e um <b>Cofre de Memória Causal Zettelkasten CoALA</b> (ADRs, Incidentes, Padrões, Entidades e Invariantes) em <b>um único arquivo SQLite local (<code>ocean.db</code>)</b> e <b>um único servidor MCP</b>.
</p>

<p align="center">
  <sub>Funciona nativamente com <b>Antigravity</b> · <b>Claude Code</b> · <b>Cursor</b> · <b>Windsurf</b> · <b>GitHub Copilot</b> · <b>Gemini CLI</b> · <b>OpenCode</b> · <b>Codex</b></sub>
</p>

</div>

---

## 🤖 Deixe Seu Agente de IA Instalar e Configurar Tudo Sozinho (Zero-Touch)

Não quer configurar nada manualmente? Copie e cole o bloco abaixo diretamente no **Antigravity**, **Claude Code**, **Cursor**, **Windsurf**, **GitHub Copilot** ou **OpenCode**. O próprio agente instalará o Bathynaut, configurará o servidor MCP, os hooks, as regras e as skills, construirá o grafo AST + Zettelkasten e mapeará a arquitetura do seu projeto automaticamente:

<details open>
<summary><b>📋 Prompt de Auto-Configuração (Copie e Cole no seu Agente)</b></summary>

```markdown
Quero que você instale, configure e inicialize o **Bathynaut** (Unified Oceanic Cognitive Architecture & Memory Harness) neste repositório de forma 100% autônoma seguindo os passos abaixo:

1. **Inicialização em 1 Comando**:
   - Execute `npx bathynaut init -d "."` na raiz deste repositório (ou, caso estejamos usando um clone local do Bathynaut, faça o build com `npm run build` e execute `node <caminho-do-bathynaut>/dist/cli/main.js init -d "."`).

2. **Verificação da Infraestrutura Criada**:
   Confirme que o comando `init` gerou e configurou automaticamente:
   - O cofre Zettelkasten CoALA em `.bathynaut/memory/` (`activeContext.md`, `index.md`, `wiki/decisions`, `wiki/incidents`, `wiki/patterns`, `wiki/entities`, `wiki/architecture`, `raw/`).
   - O banco de grafo unificado `.bathynaut/ocean.db` e o explorador visual interativo `.bathynaut/bathynaut.html`.
   - As regras nativas com Context Includes (`AGENTS.md`, `GEMINI.md`, `.agents/rules/bathynaut.md`, `CLAUDE.md`, `.cursor/rules/bathynaut.mdc`).
   - As 6 Cognitive Skills em `.agents/skills/bathynaut-*`, `.claude/skills/bathynaut-*` e `.cursor/skills/bathynaut-*`.
   - Os Agent Lifecycle Hooks (`SessionStart` e `PreToolUse`) em `.agents/hooks.json`, `.claude/settings.json` e `.cursor/hooks.json`, além dos Git hooks (`post-merge`, `post-commit`, `post-checkout`).

3. **Auditoria de Saúde e Mapeamento Arquitetural Inicial**:
   - Execute `npx bathynaut doctor` (ou chame as tools MCP `bathynaut_lint({})` e `bathynaut_dive({})`) para inspecionar as Comunidades Louvain, os God Nodes (PageRank), os Execution Flows, as `surprising_connections` e os `knowledge_gaps`.
   - Liste todos os arquivos criados/modificados e me apresente um resumo executivo da topologia descoberta neste projeto.
```

</details>

---

## ⚡ Início Rápido (30 Segundos)

```bash
cd seu-projeto
npx bathynaut init
```

Em um único comando, o `bathynaut init`:
1. **Cria o Cofre Zettelkasten CoALA** (`.bathynaut/memory/` — ou adota automaticamente um cofre `.agents/memory/` já existente) com 5 categorias cognitivas e cores pré-configuradas para o Obsidian Graph View (`.obsidian/graph.json`).
2. **Detecta e Configura 7 Agentes de IA** (**Antigravity**, **Claude Code**, **Cursor**, **Windsurf**, **GitHub Copilot**, **Gemini CLI**, **OpenCode**), criando backups `.bak` seguros em `.bathynaut/backups/` antes de tocar qualquer arquivo.
3. **Instala 6 Skills Auto-Descobertas e Lifecycle Hooks** (`SessionStart` para injetar a memória quente da sessão e `PreToolUse` para proteger arquivos governados por ADRs `blocking`).
4. **Constrói o Grafo Unificado de Código + Memória (`ocean.db`)** via `web-tree-sitter` (WASM) com resolução de símbolos e imports cross-file em dois passos, rastreia **Execution Flows**, calcula **PageRank God Nodes** e **Coesão Louvain**, e exporta o explorador IDE de 3 colunas (`.bathynaut/bathynaut.html`).

---

## 🏆 Por que o Bathynaut? (Comparação com o Ecossistema)

| Capacidade | `zk-wiki-mcp` | `code-review-graph` | `graphify` | `graphicle` | **🌊 Bathynaut SOTA** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Runtime & Instalação Zero-Friction** | TypeScript | Python 3.10+ (`uv`/`pipx`) | Python 3.10+ | Binário Rust | **100% TypeScript / Node.js (`npx`, WASM + `better-sqlite3` / fallback `node:sqlite`)** |
| **Footprint de Tools MCP (Overhead de Prompt)** | 5 tools | 28 tools | 10 tools | 8 tools | **7 Tools Ortogonais de Alta Densidade (`sonar`, `dive`, `path`, `recall`, `log_adr`, `checkpoint`, `lint`)** |
| **Resolução AST Cross-File (Calls & Imports)** | ❌ Não | ✅ Forte | ⚠️ Parcial | ✅ Forte | **✅ Two-Pass Symbol & Import Linker (`EXTRACTED` / `INFERRED`)** |
| **Rastreamento de Execution Flows** | ❌ Não | ✅ `flows` | ❌ Não | ❌ Não | **✅ Execution Flows com Score de Criticidade + `flow_memberships`** |
| **Blast Radius por Linha de Git Diff + Risk Score** | ❌ Não | ✅ Sim | ⚠️ PR básico | ✅ Sim | **✅ Hunk Mapping `git diff --unified=0` + Risk Score `[0..1]` + Funções Sem Teste** |
| **Topologia Macro, Drift & Knowledge Gaps** | ❌ Não | ⚠️ Básico | ✅ Forte | ✅ Forte | **✅ Coesão Louvain + Bridge Nodes + `surprising_connections` + `knowledge_gaps`** |
| **Memória Causal (CoALA + Zettelkasten + ADRs)** | ✅ Forte (4 cats) | ❌ Não | ⚠️ Wiki plana | ⚠️ Notas planas | **✅ Cofre CoALA 5 Categorias + 10 Arestas Semânticas Bidirecionais + Dual-Vault** |
| **Mutação Física de `.md` em `supersedes`** | ✅ Sim | ❌ Não | ❌ Não | ❌ Não | **✅ Reescreve o `.md` Antigo no Disco (`status: superseded` + `superseded_by`) + SQLite** |
| **Upsert Declarativo (`id`), `sources` (`raw/`) & Batch `ids`** | ✅ Sim | ❌ Não | ❌ Não | ❌ Não | **✅ Paridade Total (`id`, `sources`, `uncompiled_raw_sources`, leitura em lote `ids`)** |
| **Invariantes Executáveis & Guardião `PreToolUse`** | ❌ Não | ❌ Não | ❌ Não | ❌ Não | **✅ `blocking \| warning \| advisory` + Hook Guard `PreToolUse` em `<15ms`** |
| **Tripla Ancoragem Código ↔ ADR & Stale ADR** | ⚠️ Só Glob | ❌ Não | ❌ Não | ⚠️ Só Símbolo | **✅ Globs `applies_to` + `symbols` Frontmatter + `` `backtick()` `` Inline + Flag SHA-256 Stale** |
| **Preview de Rename Cross-File & Large Functions** | ❌ Não | ✅ `refactor_tool` | ❌ Não | ❌ Não | **✅ Preview `rename_symbol` Cross-File + Detector de `large_functions`** |
| **Motor de Busca** | FTS5 BM25 | FTS5 | Substring | BM25 + RRF | **✅ Hybrid RRF (FTS5 BM25 + Identifier Splitting + PageRank + Backlinks + `cross_repo`)** |
| **Visual Debugger IDE 3-Colunas (`bathynaut.html`)** | ✅ 3-Colunas | ❌ Não | ⚠️ 1-Painel | ✅ Web App | **✅ IDE 3-Colunas (Simulador Sonar Glob + Partículas Animadas + Breadcrumbs + Health Modal)** |

---

## 🛠️ Referência da CLI

```bash
npx bathynaut init [-d <dir>]
npx bathynaut map [-d <dir>] [--force]
npx bathynaut review [files...] [-d <dir>] [--base HEAD] [--token-budget 2500] [--json]
npx bathynaut explore [-d <dir>]
npx bathynaut doctor [-d <dir>]
npx bathynaut hooks [install|uninstall] [-d <dir>]
npx bathynaut hook-guard --event <SessionStart|PreToolUse> [-d <dir>]
npx bathynaut disconnect [-d <dir>]
npx bathynaut serve [-d <dir>]
```

---

## 📄 Licença

MIT © Miguel Arc
