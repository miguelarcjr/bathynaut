# 🌊 Bathynaut
### The Unified Oceanic Cognitive Architecture & Memory Harness for AI Coding Agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript: 5.6](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

> **Stop letting your AI agent drown in tokens.**
> Giving an agent a 1M token context window to explore a 100k-line codebase is like throwing someone into the Mariana Trench with just a snorkel. 
> 
> **Bathynaut** equips your agent with an indestructible deep-sea submersible: high-frequency AST sonar, topological macro mapping, and a Zettelkasten causal memory vault in a single zero-dependency TypeScript package.

---

## ⚡ Quick Start (In Any Repository in 3 Seconds)

```bash
npx bathynaut init
```

That's it. In less than 3 seconds, Bathynaut:
1. **Detects** your installed AI coding agents (Claude Code, Cursor, Antigravity, Windsurf, Copilot).
2. **Scaffolds** the `.bathynaut/memory/` Zettelkasten vault (with ADR templates and Obsidian Graph View settings).
3. **Injects** the 3-Phase Pair Programming Protocol into your agent rules files (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`).
4. **Configures** the official `bathynaut` MCP server.
5. **Parses** your codebase AST via `web-tree-sitter` (WASM), runs Louvain community clustering, and exports `bathynaut.html`.

---

## 🧭 The 3 Oceanic Depth Zones

```
  ☀️ SUNLIGHT ZONE (0m - 200m) • Macro Topology (Graphology)
     ├── Louvain Community Clusters (Functional Subsystems)
     ├── God Nodes (PageRank Centrality Hubs)
     └── Map of Content (MOC) Architecture Overview
     
  🌗 TWILIGHT ZONE (200m - 1,000m) • AST Sonar (Tree-sitter WASM)
     ├── Deterministic Call Graphs (CALLS, IMPORTS, INHERITS)
     ├── Downstream Blast Radius BFS Traversal
     └── Test Coverage Mapping (tests_for)
     
  🌑 ABYSSAL ZONE (> 1,000m) • Causal Zettelkasten Memory (SQLite FTS5)
     ├── Architecture Decision Records (ADRs) with typed edges
     ├── Historical Bug Post-Mortems & Mitigations
     └── Active Working Memory (activeContext.md)
```

---

## 🎯 The "Oceanic 7" MCP Toolset

Instead of polluting your system prompt with 30 micro-tools (wasting 10k tokens/turn), Bathynaut exposes 7 composite, high-density tools:

| Tool | Purpose |
| :--- | :--- |
| **`bathynaut_sonar`** | Pre-edit radar: returns caller blast radius, affected tests, and active ADRs/incidents in ~350 tokens. |
| **`bathynaut_dive`** | Macro topology: returns detected subsystems and top God Nodes. |
| **`bathynaut_path`** | Acoustic path: finds the shortest directed connection between any two symbols or concepts. |
| **`bathynaut_recall`** | Causal retrieval: SQLite FTS5 BM25 search across past decisions and postmortems. |
| **`bathynaut_log_adr`** | Atomic ADR writer: logs new technical decisions in Markdown, updating `supersedes` lineage. |
| **`bathynaut_checkpoint`** | Session memory: serializes hot active state into `activeContext.md`. |
| **`bathynaut_lint`** | Health checker: detects orphan nodes and broken documentation links. |

---

## 🛠️ CLI Commands

```bash
npx bathynaut init       # One-command full harness setup for all detected agents
npx bathynaut map        # Deep AST + Zettelkasten scan, updates .bathynaut/ocean.db
npx bathynaut explorer   # Opens the interactive D3.js deep-sea graph in your browser
npx bathynaut lint       # Audits knowledge graph integrity
npx bathynaut serve      # Runs the Stdio MCP server
```

---

## 🧠 Human-in-the-Loop via Obsidian

Your agent's causal memory is stored in plain Markdown in `.bathynaut/memory/`.
Open that directory directly in **Obsidian** to visually navigate your project's ADR graph, edit business rules, and audit decisions!

---

## 📄 License

MIT © Miguel Arc & Antigravity
