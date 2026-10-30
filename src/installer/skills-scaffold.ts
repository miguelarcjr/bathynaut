import fs from 'node:fs';
import path from 'node:path';

export const SKILL_TEMPLATES: Record<string, string> = {
  'bathynaut-map-project': `---
name: bathynaut-map-project
description: Maps, indexes, and documents the active project using Bathynaut (AST Sonar + Louvain/PageRank Topology + CoALA Zettelkasten). Scans all 6 critical software domains and compiles atomic notes with typed causal edges.
---

# Deep Domain Mapping (Bathynaut 6-Domain Protocol)

1. Call \`bathynaut_dive({})\` to identify Louvain Communities, God Nodes, Bridge Nodes, Execution Flows, \`surprising_connections\`, and \`knowledge_gaps\`.
2. Inspect the **6 Critical Software Domains**:
   - **Security, Authentication & Session Lifecycle**
   - **Domain Entities & State Machines**
   - **Business Invariants & Enforcement Policies**
   - **External Integrations, Payments & Webhooks**
   - **Operational Hotspots (God Nodes & Bridge Nodes)**
   - **Resilience, Error Handling & Test Coverage**
3. For each \`knowledge_gap\` or discovered invariant, call \`bathynaut_log_adr\` specifying a declarative \`id\`, \`category\` (\`decisions\`, \`patterns\`, \`entities\`, \`incidents\`, \`architecture\`), \`applies_to\`, \`symbols\`, \`invariants\`, \`enforcement\`, and the \`edges\` object (\`depends_on\`, \`implements\`, \`mitigates\`, \`tensions_with\`).
4. Conclude by running \`bathynaut_lint({})\` and \`bathynaut_checkpoint\`.
`,

  'bathynaut-wiki-compile': `---
name: bathynaut-wiki-compile
description: Compiles raw documents from .bathynaut/memory/raw/ (or .agents/memory/raw/) into interlinked atomic Zettelkasten notes using bathynaut_log_adr.
---

# Raw Source Compilation (Raw -> CoALA Zettelkasten)

1. Call \`bathynaut_lint({})\` and inspect the \`uncompiled_raw_sources\` list.
2. For each pending file in \`raw/\`:
   - Read the full content of the raw document.
   - Extract the architectural decisions, reusable patterns, domain entities, incidents, or subsystem designs.
   - Call \`bathynaut_log_adr\` passing a declarative \`id\`, \`category\`, \`applies_to\`, \`symbols\`, \`invariants\`, \`edges\`, and recording the source file in \`sources: ["raw/<file>.md"]\`.
3. If the new note replaces an older decision, pass \`edges: { supersedes: ["<old-id>"] }\` to automatically update the legacy note's YAML frontmatter (\`status: superseded\`).
4. Re-run \`bathynaut_lint({})\` to confirm \`uncompiled_raw_sources\` is now empty.
`,

  'bathynaut-wiki-lint': `---
name: bathynaut-wiki-lint
description: Audits 5D graph health in Bathynaut (orphan_active_notes, dangling_links, stale_adrs, untested_god_nodes, uncompiled_raw_sources) and resolves inconsistencies.
---

# Graph Hygiene Workflow (Librarian Pass)

1. Call \`bathynaut_lint({})\`.
2. For each item in \`dangling_links\`: fix the target ID or compile the missing note via \`bathynaut_log_adr\`.
3. For each item in \`orphan_active_notes\`: read the note with \`bathynaut_recall({ ids: [id] })\` and recompile it with \`bathynaut_log_adr({ id, ... })\` adding typed \`edges\` (\`depends_on\`, \`implements\`, \`mitigates\`).
4. For each item in \`stale_adrs\`: inspect the modified code with \`bathynaut_sonar\` and update the governing ADR accordingly.
5. For each file in \`uncompiled_raw_sources\`: read the raw document in \`raw/\` and compile it via \`bathynaut_log_adr({ ..., sources: [rawFile] })\`.
`,

  'bathynaut-session-checkpoint': `---
name: bathynaut-session-checkpoint
description: Saves the hot episodic session state to activeContext.md via bathynaut_checkpoint and compiles architectural learnings into the Wiki before ending or compacting context.
---

# Episodic Session Checkpoint

1. Review what was implemented, fixed, or decided during the current session.
2. If any architectural decision, reusable pattern, or bug root cause was discovered and is not yet in the Wiki, compile it first via \`bathynaut_log_adr\`.
3. Call \`bathynaut_checkpoint({ summary, active_tasks, decisions })\` to update \`activeContext.md\` with a clean, concise state for the next session.
`,

  'bathynaut-review-changes': `---
name: bathynaut-review-changes
description: Reviews local changes (git diff) or PRs by computing AST Blast Radius, Risk Score, affected execution flows, test coverage, and potential blocking_invariants violations.
---

# Graph-Guided Code Review (Delta & Blast Radius Review)

1. Call \`bathynaut_sonar({ git_diff: "HEAD", token_budget: 3000 })\` (or pass specific target files in \`files\`).
2. Critically evaluate the response:
   - **\`blocking_invariants\`**: Verify that no changed line violates mandatory invariants from ADRs governing the modified files.
   - **\`affected_nodes\` & \`affected_flows\`**: Verify that downstream callers in the AST call graph remain compatible with signature or behavior changes.
   - **\`covering_tests\`**: Identify which unit/integration tests cover the affected symbols and run them.
3. Present a structured review report with Risk Score, Verified Invariants, Downstream Impact, and Recommended Tests.
`,

  'bathynaut-refactor-safely': `---
name: bathynaut-refactor-safely
description: Plans and executes safe cross-file refactorings using Bathynaut's AST call graph, ADR invariants, and rename_symbol impact preview.
---

# Safe Refactoring with AST Sonar

1. Before moving, renaming, or modifying a symbol, call \`bathynaut_sonar({ files: [...] })\` to map all direct/indirect callers and \`blocking_invariants\`.
2. Call \`bathynaut_dive({ rename_symbol: "<oldName>", new_name: "<newName>" })\` to preview all cross-file call sites and governed ADRs affected by a rename.
3. Apply the refactoring while preserving the contracts required by active ADRs.
4. Run the tests listed in \`covering_tests\` and call \`bathynaut_lint({})\` afterward to verify no ADRs became \`stale\`.
`
};

export function scaffoldCognitiveSkills(projectRoot: string): string[] {
  const created: string[] = [];

  const targetDirs = [
    path.join(projectRoot, '.bathynaut', 'skills'),
    path.join(projectRoot, '.agents', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(projectRoot, '.cursor', 'skills')
  ];

  for (const baseSkillsDir of targetDirs) {
    for (const [skillName, content] of Object.entries(SKILL_TEMPLATES)) {
      const skillDir = path.join(baseSkillsDir, skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillPath, content, 'utf-8');
      created.push(skillPath);
    }
  }

  return created;
}

export function removeCognitiveSkills(projectRoot: string): number {
  let removedCount = 0;
  const agentSkillDirs = [
    path.join(projectRoot, '.agents', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(projectRoot, '.cursor', 'skills')
  ];

  for (const baseDir of agentSkillDirs) {
    if (!fs.existsSync(baseDir)) continue;
    for (const skillName of Object.keys(SKILL_TEMPLATES)) {
      const skillDir = path.join(baseDir, skillName);
      if (fs.existsSync(skillDir)) {
        try {
          fs.rmSync(skillDir, { recursive: true, force: true });
          removedCount++;
        } catch {}
      }
    }
  }

  return removedCount;
}
