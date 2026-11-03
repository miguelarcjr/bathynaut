import fs from 'node:fs';
import path from 'node:path';
import { MCPConfigFormat } from './detector.js';

const CORE_PROTOCOL_LINES = [
  '# Bathynaut Oceanic Navigation Protocol (3-Phase Cognitive Harness)',
  '',
  'This project uses **Bathynaut** as its unified cognitive architecture (AST Call Graph + Louvain/PageRank Topology + CoALA Zettelkasten Memory).',
  '',
  '### Mandatory Agent Invariants (3-Phase Protocol):',
  '1. **Phase 1: Pre-Edit Radar (Sonar)**: Before planning or editing any code file, call `bathynaut_sonar({ files: [...] })`.',
  '   - Inspect the AST call blast radius, execution flows (`affected_flows`), `risk_score`, and downstream `covering_tests`.',
  '   - Strictly obey all returned **`blocking_invariants`**, **active ADRs**, and **known incidents**. Notes with `status: superseded` are historical and must never be replicated.',
  '2. **Phase 2: Exploration & Discovery**:',
  '   - For macro architectural topology (Communities, God Nodes, Bridge Nodes, `surprising_connections`, and `knowledge_gaps`), call `bathynaut_dive({})`.',
  '   - To search decisions/patterns or batch-read specific notes by ID, call `bathynaut_recall({ query, ids, category })`.',
  '3. **Phase 3: Causal Persistence & Checkpoint**:',
  '   - Every new architectural decision, reusable pattern, or resolved incident must be compiled via `bathynaut_log_adr` (never edit `.bathynaut/memory/wiki/` manually) using typed semantic edges (`supersedes`, `mitigates`, `depends_on`, `implements`, `tensions_with`).',
  '   - At the end of any meaningful task, call `bathynaut_checkpoint` to persist the hot session state in `activeContext.md`.'
];

function resolveRelativeMemoryPrefix(projectRoot?: string): string {
  if (projectRoot && fs.existsSync(path.join(projectRoot, '.agents', 'memory', 'wiki'))) {
    return '.agents/memory';
  }
  return '.bathynaut/memory';
}

function buildRulesBlock(filePath: string, projectRoot?: string): string {
  const baseName = path.basename(filePath);
  const normalized = filePath.replace(/\\/g, '/');
  const memPrefix = resolveRelativeMemoryPrefix(projectRoot);
  const normRoot = projectRoot ? projectRoot.replace(/\\/g, '/') : undefined;
  const rootHintLine = normRoot
    ? [`- Workspace Root (\`project_path\`): \`${normRoot}\` (always pass \`project_path: "${normRoot}"\` in Bathynaut MCP calls)`]
    : [];

  // 1. Cursor Modern Rule (.cursor/rules/bathynaut.mdc)
  if (baseName.endsWith('.mdc')) {
    return [
      '---',
      'description: Bathynaut Cognitive Architecture & Pre-Edit Sonar Protocol',
      'globs: "**/*"',
      'alwaysApply: true',
      '---',
      '',
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      ...(rootHintLine.length > 0 ? ['', '### Immediate Session Context:', ...rootHintLine] : []),
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 2. Antigravity Modular Rule (.agents/rules/bathynaut.md) — lightweight pointer (avoids duplicating @[...] expansion from AGENTS.md)
  if (normalized.endsWith('.agents/rules/bathynaut.md')) {
    return [
      '---',
      'trigger: model_decision',
      'description: Bathynaut AST Sonar, Macro Topology & ADR Memory Protocol',
      '---',
      '',
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      '',
      '### Immediate Session Context:',
      ...rootHintLine,
      `- Active Session State: \`${memPrefix}/activeContext.md\``,
      `- Map of Content (MOC): \`${memPrefix}/index.md\``,
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 3. Root AGENTS.md (Primary rule with @[...] Progressive Disclosure inline expansion)
  if (baseName === 'AGENTS.md') {
    return [
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      '',
      '### Immediate Session Context:',
      ...rootHintLine,
      `- Active Session State: @[Active Session Context](${memPrefix}/activeContext.md)`,
      `- Map of Content (MOC): @[Wiki Index](${memPrefix}/index.md)`,
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 4. GEMINI.md (For Gemini CLI; uses path pointers so Antigravity does not inline activeContext.md twice alongside AGENTS.md)
  if (baseName === 'GEMINI.md') {
    return [
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      '',
      '### Immediate Session Context:',
      ...rootHintLine,
      `- Active Session State: \`${memPrefix}/activeContext.md\``,
      `- Map of Content (MOC): \`${memPrefix}/index.md\``,
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 5. Claude Code (CLAUDE.md supports @path native includes)
  if (baseName === 'CLAUDE.md') {
    return [
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      '',
      '### Immediate Session Context:',
      ...rootHintLine,
      `- Active Session State: @${memPrefix}/activeContext.md`,
      `- Map of Content (MOC): @${memPrefix}/index.md`,
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 6. Generic Markdown Rules (.cursorrules, .windsurfrules, copilot-instructions.md)
  return [
    '<!-- BATHYNAUT:START -->',
    ...CORE_PROTOCOL_LINES,
    ...(rootHintLine.length > 0 ? ['', '### Immediate Session Context:', ...rootHintLine] : []),
    '<!-- BATHYNAUT:END -->'
  ].join('\n');
}

function backupFileIfExists(filePath: string, projectRoot?: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const root = projectRoot || path.dirname(filePath);
    const backupDir = path.join(root, '.bathynaut', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const backupPath = path.join(backupDir, `${safeName}.bak`);
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
  } catch {}
}

export function injectRulesFile(filePath: string, projectRoot?: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const block = buildRulesBlock(filePath, projectRoot);

    const normalized = filePath.replace(/\\/g, '/');
    if (filePath.endsWith('.mdc') || normalized.endsWith('.agents/rules/bathynaut.md')) {
      backupFileIfExists(filePath, projectRoot);
      fs.writeFileSync(filePath, `${block.trim()}\n`, 'utf-8');
      return true;
    }

    let existing = '';
    if (fs.existsSync(filePath)) {
      backupFileIfExists(filePath, projectRoot);
      existing = fs.readFileSync(filePath, 'utf-8');
    }

    if (existing.includes('<!-- BATHYNAUT:START -->')) {
      const updated = existing.replace(
        /<!-- BATHYNAUT:START -->[\s\S]*?<!-- BATHYNAUT:END -->/g,
        block.trim()
      );
      fs.writeFileSync(filePath, `${updated.trim()}\n`, 'utf-8');
    } else {
      const updated = existing ? `${existing.trim()}\n\n${block.trim()}\n` : `${block.trim()}\n`;
      fs.writeFileSync(filePath, updated, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export function removeRulesFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;

    const normalized = filePath.replace(/\\/g, '/');
    if (filePath.endsWith('bathynaut.mdc') || normalized.endsWith('.agents/rules/bathynaut.md')) {
      fs.unlinkSync(filePath);
      return true;
    }

    const existing = fs.readFileSync(filePath, 'utf-8');
    if (!existing.includes('<!-- BATHYNAUT:START -->')) return false;

    const cleaned = existing
      .replace(/\n*<!-- BATHYNAUT:START -->[\s\S]*?<!-- BATHYNAUT:END -->\n*/g, '\n')
      .trim();

    if (cleaned.length === 0) {
      fs.unlinkSync(filePath);
    } else {
      fs.writeFileSync(filePath, `${cleaned}\n`, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export function injectMCPConfig(
  configPath: string,
  serverBinPath: string,
  projectRoot?: string,
  format: MCPConfigFormat = 'mcpServers'
): boolean {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let config: any = {};
    if (fs.existsSync(configPath)) {
      backupFileIfExists(configPath, projectRoot);
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        config = {};
      }
    }

    const normalizedBin = serverBinPath.replace(/\\/g, '/');
    const normalizedRoot = projectRoot ? projectRoot.replace(/\\/g, '/') : undefined;
    const args = normalizedRoot
      ? [normalizedBin, 'serve', '-d', normalizedRoot]
      : [normalizedBin, 'serve'];

    if (format === 'vscode-servers') {
      if (!config.servers) config.servers = {};
      config.servers['bathynaut'] = {
        type: 'stdio',
        command: 'node',
        args
      };
    } else if (format === 'opencode-mcp') {
      if (!config.mcp) config.mcp = {};
      config.mcp['bathynaut'] = {
        type: 'local',
        command: ['node', ...args],
        enabled: true
      };
    } else {
      if (!config.mcpServers) config.mcpServers = {};
      const entry: Record<string, any> = {
        command: 'node',
        args
      };
      if (path.basename(configPath) === '.mcp.json') {
        entry.type = 'stdio';
      }
      config.mcpServers['bathynaut'] = entry;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function removeMCPConfig(configPath: string): boolean {
  try {
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    let modified = false;

    if (config?.mcpServers?.bathynaut) {
      delete config.mcpServers.bathynaut;
      modified = true;
    }
    if (config?.servers?.bathynaut) {
      delete config.servers.bathynaut;
      modified = true;
    }
    if (config?.mcp?.bathynaut) {
      delete config.mcp.bathynaut;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Injects non-blocking Agent Lifecycle Hooks (SessionStart, PreInvocation/UserPromptSubmit, PreToolUse, PostToolUse)
 * using the native schema of each platform:
 * - Antigravity (.agents/hooks.json): top-level named hook "bathynaut-guard" with SessionStart, PreInvocation, PreToolUse, PostToolUse
 * - Claude Code (.claude/settings.json): top-level "hooks" with SessionStart, UserPromptSubmit, PreToolUse, PostToolUse
 * - Gemini CLI (.gemini/settings.json): top-level "hooks" with SessionStart, BeforeAgent, PreToolUse, PostToolUse
 * - Cursor (.cursor/hooks.json): version 1 "hooks" with beforeSubmitPrompt, beforeShellExecution, afterFileEdit
 */
export function injectAgentHooks(
  hooksConfigPath: string,
  agentName: string,
  projectRoot: string,
  serverBinPath?: string
): boolean {
  try {
    const dir = path.dirname(hooksConfigPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let config: any = {};
    if (fs.existsSync(hooksConfigPath)) {
      backupFileIfExists(hooksConfigPath, projectRoot);
      try {
        config = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf-8'));
      } catch {
        config = {};
      }
    }

    const fmtPath = (pStr: string) => {
      const norm = pStr.replace(/\\/g, '/');
      return agentName !== 'antigravity' && /\s/.test(norm) ? `"${norm}"` : norm;
    };
    const normalizedRoot = fmtPath(projectRoot);
    const runner = serverBinPath
      ? `node ${fmtPath(serverBinPath)}`
      : 'npx --no-install bathynaut';

    const sessionStartCmd = `${runner} hook-guard --agent ${agentName} --event SessionStart -d ${normalizedRoot}`;
    const preInvokeCmd = `${runner} hook-guard --agent ${agentName} --event PreInvocation -d ${normalizedRoot}`;
    const preToolCmd = `${runner} hook-guard --agent ${agentName} --event PreToolUse -d ${normalizedRoot}`;
    const postToolCmd = `${runner} hook-guard --agent ${agentName} --event PostToolUse -d ${normalizedRoot}`;

    if (agentName === 'antigravity') {
      if (config.hooks && !config['bathynaut-guard']) {
        delete config.hooks;
      }
      config['bathynaut-guard'] = {
        enabled: true,
        SessionStart: [
          { type: 'command', command: sessionStartCmd, timeout: 5 }
        ],
        PreInvocation: [
          { type: 'command', command: preInvokeCmd, timeout: 5 }
        ],
        PreToolUse: [
          {
            matcher: 'edit_file|write_file',
            hooks: [{ type: 'command', command: preToolCmd, timeout: 5 }]
          }
        ],
        PostToolUse: [
          {
            matcher: 'edit_file|write_file',
            hooks: [{ type: 'command', command: postToolCmd, timeout: 10 }]
          }
        ]
      };
    } else if (agentName === 'cursor') {
      if (!config.version) config.version = 1;
      if (!config.hooks) config.hooks = {};

      const filterNonBathynaut = (arr: any[]) =>
        Array.isArray(arr) ? arr.filter((h: any) => !String(h?.command || '').includes('hook-guard')) : [];

      config.hooks.beforeSubmitPrompt = [
        ...filterNonBathynaut(config.hooks.beforeSubmitPrompt),
        { command: preInvokeCmd, timeout: 5 }
      ];
      config.hooks.beforeShellExecution = [
        ...filterNonBathynaut(config.hooks.beforeShellExecution),
        { command: preToolCmd, timeout: 5 }
      ];
      config.hooks.afterFileEdit = [
        ...filterNonBathynaut(config.hooks.afterFileEdit),
        { command: postToolCmd, timeout: 10 }
      ];
    } else {
      // Claude Code (.claude/settings.json) & Gemini CLI (.gemini/settings.json)
      if (!config.hooks) config.hooks = {};

      const matcher = agentName === 'gemini-cli' ? 'write_file|replace' : 'Edit|Write|MultiEdit';
      const promptEventKey = agentName === 'gemini-cli' ? 'BeforeAgent' : 'UserPromptSubmit';

      const filterNonBathynautGroup = (arr: any[]) =>
        Array.isArray(arr)
          ? arr.filter((entry: any) => !entry?.hooks?.some((h: any) => String(h?.command || '').includes('hook-guard')))
          : [];

      config.hooks.SessionStart = [
        ...filterNonBathynautGroup(config.hooks.SessionStart),
        { matcher: '', hooks: [{ type: 'command', command: sessionStartCmd, timeout: 5 }] }
      ];
      config.hooks[promptEventKey] = [
        ...filterNonBathynautGroup(config.hooks[promptEventKey]),
        { matcher: '', hooks: [{ type: 'command', command: preInvokeCmd, timeout: 5 }] }
      ];
      config.hooks.PreToolUse = [
        ...filterNonBathynautGroup(config.hooks.PreToolUse),
        { matcher, hooks: [{ type: 'command', command: preToolCmd, timeout: 5 }] }
      ];
      config.hooks.PostToolUse = [
        ...filterNonBathynautGroup(config.hooks.PostToolUse),
        { matcher, hooks: [{ type: 'command', command: postToolCmd, timeout: 10 }] }
      ];
    }

    fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function removeAgentHooks(hooksConfigPath: string): boolean {
  try {
    if (!fs.existsSync(hooksConfigPath)) return false;
    const config = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf-8'));
    let modified = false;

    if (config['bathynaut-guard']) {
      delete config['bathynaut-guard'];
      modified = true;
    }

    if (config?.hooks) {
      for (const eventKey of [
        'SessionStart',
        'PreInvocation',
        'UserPromptSubmit',
        'BeforeAgent',
        'PreToolUse',
        'PostToolUse',
        'beforeSubmitPrompt',
        'beforeShellExecution',
        'afterFileEdit'
      ]) {
        if (Array.isArray(config.hooks[eventKey])) {
          const beforeLen = config.hooks[eventKey].length;
          config.hooks[eventKey] = config.hooks[eventKey].filter((entry: any) => {
            if (typeof entry?.command === 'string' && entry.command.includes('hook-guard')) return false;
            if (Array.isArray(entry?.hooks) && entry.hooks.some((h: any) => String(h?.command || '').includes('hook-guard'))) {
              return false;
            }
            return true;
          });
          if (config.hooks[eventKey].length !== beforeLen) {
            modified = true;
          }
          if (config.hooks[eventKey].length === 0) {
            delete config.hooks[eventKey];
          }
        }
      }
      if (Object.keys(config.hooks).length === 0) {
        delete config.hooks;
      }
    }

    if (modified) {
      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

