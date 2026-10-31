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
  const rootHintLine = normRoot ? [`- Workspace Root (\`project_path\`): \`${normRoot}\` (always pass \`project_path: "${normRoot}"\` in Bathynaut MCP calls)`] : [];

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

  // 2. Antigravity Modular Rule (.agents/rules/bathynaut.md)
  if (normalized.endsWith('.agents/rules/bathynaut.md')) {
    return [
      '---',
      'trigger: always_on',
      'description: Bathynaut Cognitive Architecture & Pre-Edit Sonar Protocol',
      '---',
      '',
      '<!-- BATHYNAUT:START -->',
      ...CORE_PROTOCOL_LINES,
      '',
      '### Immediate Session Context (Progressive Disclosure):',
      ...rootHintLine,
      `- Active Session State: @[Active Session Context](${memPrefix}/activeContext.md)`,
      `- Map of Content (MOC): @[Wiki Index](${memPrefix}/index.md)`,
      '<!-- BATHYNAUT:END -->'
    ].join('\n');
  }

  // 3. Antigravity / Gemini Root Files (GEMINI.md, AGENTS.md, .agents/GEMINI.md)
  if (baseName === 'GEMINI.md' || baseName === 'AGENTS.md') {
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

  // 4. Claude Code (CLAUDE.md supports @path native includes)
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

  // 5. Generic Markdown Rules (.cursorrules, .windsurfrules, copilot-instructions.md)
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

    // Strip legacy Triad headers if migrating from ZK-Wiki + CRG + Graphify
    existing = existing
      .replace(/# Antigravity Knowledge Graph Integration \(Graphify, Code-Review-Graph & ZK-Wiki\)[\s\S]*?(?=<!-- BATHYNAUT:START -->|$)/g, '')
      .replace(/# Protocolo SOTA de Memória Agêntica \(ZK-Wiki \+ CRG \+ Graphify\)[\s\S]*?(?=<!-- BATHYNAUT:START -->|$)/g, '')
      .trim();

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
 * Injects non-blocking Agent Lifecycle Hooks (SessionStart & PreToolUse) into
 * Antigravity (.agents/hooks.json), Claude Code (.claude/settings.json),
 * Cursor (.cursor/hooks.json), and Gemini CLI (.gemini/settings.json).
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

    const normalizedRoot = projectRoot.replace(/\\/g, '/');
    const runner = serverBinPath
      ? `node "${serverBinPath.replace(/\\/g, '/')}"`
      : 'npx --no-install bathynaut';

    const sessionStartCmd = `${runner} hook-guard --event SessionStart -d "${normalizedRoot}"`;
    const preToolCmd = `${runner} hook-guard --event PreToolUse -d "${normalizedRoot}"`;

    if (agentName === 'cursor') {
      if (!config.version) config.version = 1;
      if (!config.hooks) config.hooks = {};
      const existingList: any[] = Array.isArray(config.hooks.beforeShellExecution)
        ? config.hooks.beforeShellExecution.filter((h: any) => !String(h?.command || '').includes('hook-guard'))
        : [];
      existingList.push({
        command: preToolCmd,
        timeout: 5
      });
      config.hooks.beforeShellExecution = existingList;
    } else {
      if (!config.hooks) config.hooks = {};

      const matcher =
        agentName === 'antigravity'
          ? 'edit_file|write_file'
          : agentName === 'gemini-cli'
            ? 'write_file|replace'
            : 'Edit|Write|MultiEdit';

      const existingSession: any[] = Array.isArray(config.hooks.SessionStart)
        ? config.hooks.SessionStart.filter(
            (entry: any) => !entry?.hooks?.some((h: any) => String(h?.command || '').includes('hook-guard'))
          )
        : [];
      existingSession.push({
        matcher: '',
        hooks: [{ type: 'command', command: sessionStartCmd, timeout: 5 }]
      });
      config.hooks.SessionStart = existingSession;

      const existingPreTool: any[] = Array.isArray(config.hooks.PreToolUse)
        ? config.hooks.PreToolUse.filter(
            (entry: any) => !entry?.hooks?.some((h: any) => String(h?.command || '').includes('hook-guard'))
          )
        : [];
      existingPreTool.push({
        matcher,
        hooks: [{ type: 'command', command: preToolCmd, timeout: 5 }]
      });
      config.hooks.PreToolUse = existingPreTool;
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
    if (!config?.hooks) return false;

    let modified = false;
    for (const eventKey of ['SessionStart', 'PreToolUse', 'PostToolUse', 'beforeShellExecution']) {
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

    if (modified) {
      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
