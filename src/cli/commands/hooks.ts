import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { detectInstalledAgents } from '../../installer/detector.js';
import { injectAgentHooks, removeAgentHooks } from '../../installer/injector.js';
import { initDatabase, getDatabasePath } from '../../storage/db.js';
import { resolveMemoryVault } from '../../storage/pool.js';
import { ensureFreshGraph } from '../../storage/incremental-sync.js';

const GIT_HOOK_NAMES = ['post-merge', 'post-commit', 'post-checkout'] as const;

export type HookEventName = 'SessionStart' | 'PreInvocation' | 'PreToolUse' | 'PostToolUse';
export type HookAgentKind = 'antigravity' | 'claude-code' | 'cursor' | 'gemini-cli';

/**
 * Installs or removes both Git hooks (post-merge, post-commit, post-checkout)
 * and Agent Lifecycle Hooks (.agents/hooks.json, .claude/settings.json, .cursor/hooks.json, .gemini/settings.json).
 */
export function runHooksCommand(
  projectRoot: string,
  action: 'install' | 'uninstall' = 'install',
  serverBinPath?: string
): boolean {
  let anyChanged = false;

  // 1. Git Hooks (.git/hooks/post-merge, post-commit, post-checkout)
  const gitDir = path.join(projectRoot, '.git');
  if (fs.existsSync(gitDir)) {
    const gitHooksDir = path.join(gitDir, 'hooks');
    fs.mkdirSync(gitHooksDir, { recursive: true });

    for (const hookName of GIT_HOOK_NAMES) {
      const hookPath = path.join(gitHooksDir, hookName);
      if (action === 'uninstall') {
        if (fs.existsSync(hookPath)) {
          const content = fs.readFileSync(hookPath, 'utf-8');
          if (content.includes('# BATHYNAUT-HOOK')) {
            fs.unlinkSync(hookPath);
            anyChanged = true;
          }
        }
      } else {
        const normalizedRoot = projectRoot.replace(/\\/g, '/');
        const runner = serverBinPath
          ? `node "${serverBinPath.replace(/\\/g, '/')}"`
          : 'npx --no-install bathynaut';
        const hookScript = `#!/bin/sh
# BATHYNAUT-HOOK: Auto-sync graph after git ${hookName}
${runner} map -d "${normalizedRoot}" >/dev/null 2>&1 || true
`;
        fs.writeFileSync(hookPath, hookScript, { encoding: 'utf-8', mode: 0o755 });
        anyChanged = true;
      }
    }
  }

  // 2. Agent Lifecycle Hooks (Antigravity, Claude Code, Cursor, Gemini CLI)
  const agents = detectInstalledAgents(projectRoot);
  for (const ag of agents) {
    if (!ag.hooksConfigPath) continue;
    if (action === 'uninstall') {
      if (removeAgentHooks(ag.hooksConfigPath)) {
        anyChanged = true;
      }
    } else {
      if (injectAgentHooks(ag.hooksConfigPath, ag.name, projectRoot, serverBinPath)) {
        anyChanged = true;
      }
    }
  }

  return anyChanged;
}

export interface HookGuardResult {
  // Antigravity native contract fields
  decision?: 'allow' | 'deny' | 'ask' | 'force_ask';
  reason?: string;
  injectSteps?: Array<
    | { systemMessage: { systemMessage: string; metadata?: Record<string, any> } }
    | { ephemeralMessage: string }
    | { userMessage: string }
  >;
  // Cursor native contract fields
  permission?: 'allow' | 'deny' | 'ask';
  agentMessage?: string;
  additionalContext?: string;
  // Claude Code & Gemini CLI native contract fields (also retained for unified programmatic testing)
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    additionalContext: string;
  };
}

function extractTargetFilePaths(payload: Record<string, any>): string[] {
  const candidates: any[] = [
    payload?.toolCall?.args,
    payload?.tool_input,
    payload?.input,
    payload
  ].filter(Boolean);

  const rawPaths: string[] = [];
  for (const obj of candidates) {
    for (const key of ['Path', 'TargetFile', 'file_path', 'path', 'filePath']) {
      if (typeof obj[key] === 'string' && obj[key].trim()) {
        rawPaths.push(obj[key].trim());
      }
    }
    if (Array.isArray(obj.files)) {
      for (const f of obj.files) {
        if (typeof f === 'string' && f.trim()) rawPaths.push(f.trim());
      }
    }
  }

  return Array.from(new Set(rawPaths));
}

function formatOutputForAgent(
  agent: HookAgentKind,
  event: HookEventName,
  text: string
): HookGuardResult {
  if (!text) return {};

  if (agent === 'antigravity') {
    if (event === 'SessionStart') {
      return {
        injectSteps: [{ systemMessage: { systemMessage: text } }],
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text }
      };
    }
    if (event === 'PreInvocation') {
      return {
        injectSteps: [{ ephemeralMessage: text }],
        hookSpecificOutput: { hookEventName: 'PreInvocation', additionalContext: text }
      };
    }
    if (event === 'PreToolUse') {
      return {
        decision: 'allow',
        reason: text,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text }
      };
    }
    return {};
  }

  if (agent === 'cursor') {
    if (event === 'PreToolUse') {
      return {
        permission: 'allow',
        agentMessage: text,
        additionalContext: text,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text }
      };
    }
    return {
      additionalContext: text,
      hookSpecificOutput: { hookEventName: event, additionalContext: text }
    };
  }

  // Claude Code & Gemini CLI
  const claudeEventName =
    event === 'PreInvocation'
      ? agent === 'gemini-cli'
        ? 'BeforeAgent'
        : 'UserPromptSubmit'
      : event;

  return {
    hookSpecificOutput: {
      hookEventName: claudeEventName,
      ...(event === 'PreToolUse' ? { permissionDecision: 'allow' as const } : {}),
      additionalContext: text
    }
  };
}

/**
 * Multi-Agent Lifecycle Hook evaluator for SessionStart, PreInvocation, PreToolUse, and PostToolUse.
 * Never throws or blocks execution with non-zero exit code (fail-open design).
 */
export function evaluateHookGuard(
  projectRoot: string,
  event: HookEventName,
  payload: Record<string, any> = {},
  agent: HookAgentKind = 'antigravity'
): HookGuardResult {
  try {
    const dbPath = getDatabasePath(projectRoot);
    const { memoryRoot } = resolveMemoryVault(projectRoot);
    const normRoot = projectRoot.replace(/\\/g, '/');

    // 1. SessionStart: Inject graph summary + activeContext.md
    if (event === 'SessionStart') {
      const lines: string[] = ['🌊 [Bathynaut Session Context]'];
      if (fs.existsSync(dbPath)) {
        const db = initDatabase(dbPath);
        try {
          const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any)?.c ?? 0;
          const edgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as any)?.c ?? 0;
          const staleCount = (
            db.prepare("SELECT COUNT(DISTINCT target_id) as c FROM edges WHERE relation = 'governed_by' AND needs_review = 1").get() as any
          )?.c ?? 0;
          lines.push(`Active Graph (${normRoot}): ${nodeCount} nodes, ${edgeCount} edges (${staleCount} ADRs flagged for review).`);
        } finally {
          db.close();
        }
      }

      const activeContextPath = path.join(memoryRoot, 'activeContext.md');
      if (fs.existsSync(activeContextPath)) {
        const activeText = fs.readFileSync(activeContextPath, 'utf-8').trim();
        if (activeText) {
          lines.push(activeText.slice(0, 800));
        }
      }

      lines.push(
        `Protocol Reminder: Before editing any code files, invoke \`bathynaut_sonar({ files: [...], project_path: "${normRoot}" })\`.`
      );

      return formatOutputForAgent(agent, 'SessionStart', lines.join('\n'));
    }

    // 2. PreInvocation / UserPromptSubmit: Ephemeral turn-start reminder so the agent never forgets Bathynaut tools
    if (event === 'PreInvocation') {
      const invocationNum = payload?.invocationNum;
      // In Antigravity, only fire on the first step of a user turn (invocationNum === 1) so tool-call loops stay lean
      if (typeof invocationNum === 'number' && invocationNum > 1) {
        return {};
      }

      const reminder = [
        `[Bathynaut Radar] Active workspace: "${normRoot}".`,
        `- Before modifying code files, call \`bathynaut_sonar({ files: [...], project_path: "${normRoot}" })\` to inspect blast radius, callers, tests, and blocking invariants.`,
        `- For architecture/topology use \`bathynaut_dive({ project_path: "${normRoot}" })\`; for ADRs/incidents use \`bathynaut_recall({ query: "...", project_path: "${normRoot}" })\`.`
      ].join('\n');

      return formatOutputForAgent(agent, 'PreInvocation', reminder);
    }

    // 3. PreToolUse: Check governing ADRs/Invariants + live AST Blast Radius & Covering Tests
    if (event === 'PreToolUse') {
      if (!fs.existsSync(dbPath)) return {};
      const rawPaths = extractTargetFilePaths(payload);
      if (rawPaths.length === 0) return {};

      const relPaths = rawPaths.map(p => {
        const norm = p.replace(/\\/g, '/');
        return norm.toLowerCase().startsWith(normRoot.toLowerCase() + '/')
          ? norm.slice(normRoot.length + 1)
          : norm;
      });

      const db = initDatabase(dbPath);
      try {
        // A. Match ADRs by applies_to globs or governed_by edges
        const adrs = db
          .prepare(
            `SELECT id, name, kind, enforcement, invariants_json, applies_to_json, summary
             FROM nodes
             WHERE depth_zone = 'abyssal' AND (status IS NULL OR status = 'active')`
          )
          .all() as any[];

        const matchedAdrs = new Map<string, any>();
        for (const adr of adrs) {
          let globs: string[] = [];
          try {
            globs = adr.applies_to_json ? JSON.parse(adr.applies_to_json) : [];
          } catch {}
          if (!Array.isArray(globs) || globs.length === 0) continue;

          const isMatch = relPaths.some(rp =>
            globs.some(g => {
              const normG = g.replace(/\\/g, '/');
              try {
                return minimatch(rp, normG, { matchBase: true }) || rp.includes(normG.replace(/\*/g, ''));
              } catch {
                return rp.includes(normG.replace(/\*/g, ''));
              }
            })
          );
          if (isMatch) {
            matchedAdrs.set(adr.id, adr);
          }
        }

        // B. Inspect AST symbols in the target files + external callers + covering tests + direct governed_by edges
        let totalSymbols = 0;
        let externalCallers = 0;
        let coveringTests = 0;
        let bridgeNodes = 0;

        for (const rp of relPaths) {
          const fileNodes = db
            .prepare("SELECT id, name, is_bridge FROM nodes WHERE file_path = ? AND depth_zone = 'twilight'")
            .all(rp) as Array<{ id: string; name: string; is_bridge: number }>;

          totalSymbols += fileNodes.length;
          for (const fn of fileNodes) {
            if (fn.is_bridge === 1) bridgeNodes++;

            const callers = db
              .prepare(
                `SELECT COUNT(DISTINCT e.source_id) as c
                 FROM edges e
                 JOIN nodes sn ON sn.id = e.source_id
                 WHERE e.target_id = ? AND e.relation = 'calls' AND sn.file_path != ?`
              )
              .get(fn.id, rp) as { c: number } | undefined;
            externalCallers += callers?.c ?? 0;

            const tests = db
              .prepare("SELECT COUNT(DISTINCT source_id) as c FROM edges WHERE target_id = ? AND relation = 'tests_for'")
              .get(fn.id) as { c: number } | undefined;
            coveringTests += tests?.c ?? 0;

            const govRows = db
              .prepare(
                `SELECT n.id, n.name, n.kind, n.enforcement, n.invariants_json, n.summary
                 FROM edges e
                 JOIN nodes n ON n.id = e.target_id
                 WHERE e.source_id = ? AND e.relation = 'governed_by' AND (n.status IS NULL OR n.status = 'active')`
              )
              .all(fn.id) as any[];
            for (const g of govRows) {
              matchedAdrs.set(g.id, g);
            }
          }
        }

        if (matchedAdrs.size === 0 && externalCallers === 0 && bridgeNodes === 0) {
          return {};
        }

        const warnings: string[] = [
          `⚠️ [Bathynaut Sonar Guard] Impact & Invariants for ${relPaths.join(', ')}:`
        ];

        if (totalSymbols > 0) {
          warnings.push(
            `• AST Blast Radius: ${totalSymbols} symbol(s) in file | ${externalCallers} external caller(s) | ${coveringTests} covering test(s)${bridgeNodes > 0 ? ` | ${bridgeNodes} Bridge Node(s)` : ''}`
          );
        }

        for (const adr of matchedAdrs.values()) {
          let invs: string[] = [];
          try {
            invs = adr.invariants_json ? JSON.parse(adr.invariants_json) : [];
          } catch {}
          const badge = String(adr.enforcement || 'advisory').toUpperCase();
          warnings.push(
            `- [${badge}] ${adr.id} (${adr.name}): ${invs.length > 0 ? invs.join(' | ') : adr.summary || ''}`
          );
        }

        return formatOutputForAgent(agent, 'PreToolUse', warnings.join('\n'));
      } finally {
        db.close();
      }
    }

    return {};
  } catch {
    return {};
  }
}

/**
 * PostToolUse asynchronous incremental sync: updates ocean.db immediately when code/markdown files are edited.
 */
export async function evaluatePostToolSync(projectRoot: string): Promise<HookGuardResult> {
  try {
    const dbPath = getDatabasePath(projectRoot);
    if (!fs.existsSync(dbPath)) return {};
    const { memoryRoot } = resolveMemoryVault(projectRoot);
    const db = initDatabase(dbPath);
    try {
      await ensureFreshGraph(projectRoot, db, memoryRoot, { force: false });
    } finally {
      db.close();
    }
    return {};
  } catch {
    return {};
  }
}
