import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { detectInstalledAgents } from '../../installer/detector.js';
import { injectAgentHooks, removeAgentHooks } from '../../installer/injector.js';
import { initDatabase, getDatabasePath } from '../../storage/db.js';
import { resolveMemoryVault } from '../../storage/pool.js';

const GIT_HOOK_NAMES = ['post-merge', 'post-commit', 'post-checkout'] as const;

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
        const hookScript = `#!/bin/sh
# BATHYNAUT-HOOK: Auto-sync graph after git ${hookName}
npx --no-install bathynaut map -d "${normalizedRoot}" >/dev/null 2>&1 || true
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
  hookSpecificOutput?: {
    hookEventName: 'SessionStart' | 'PreToolUse';
    additionalContext: string;
  };
}

/**
 * Ultra-fast (<15ms) Agent Lifecycle Hook evaluator for SessionStart and PreToolUse.
 * Never throws or blocks execution with non-zero exit code (fail-open design).
 */
export function evaluateHookGuard(
  projectRoot: string,
  event: 'SessionStart' | 'PreToolUse',
  payload: Record<string, any> = {}
): HookGuardResult {
  try {
    const dbPath = getDatabasePath(projectRoot);
    const { memoryRoot } = resolveMemoryVault(projectRoot);

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
          lines.push(`Active Graph: ${nodeCount} nodes, ${edgeCount} edges (${staleCount} ADRs flagged for review).`);
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
        'Protocol Reminder: Before editing any code files, invoke `bathynaut_sonar({ files: [...] })`.'
      );

      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: lines.join('\n')
        }
      };
    }

    if (event === 'PreToolUse') {
      if (!fs.existsSync(dbPath)) return {};
      const toolInput = payload?.tool_input || payload?.input || payload || {};
      const rawPaths: string[] = [];

      for (const key of ['file_path', 'path', 'TargetFile', 'Path']) {
        if (typeof toolInput[key] === 'string' && toolInput[key].trim()) {
          rawPaths.push(toolInput[key].trim());
        }
      }
      if (Array.isArray(toolInput.files)) {
        for (const f of toolInput.files) {
          if (typeof f === 'string') rawPaths.push(f);
        }
      }

      if (rawPaths.length === 0) return {};

      const relPaths = rawPaths.map(p => {
        const norm = p.replace(/\\/g, '/');
        const rootNorm = projectRoot.replace(/\\/g, '/');
        return norm.startsWith(rootNorm + '/') ? norm.slice(rootNorm.length + 1) : norm;
      });

      const db = initDatabase(dbPath);
      try {
        const adrs = db
          .prepare(
            `SELECT id, name, kind, enforcement, invariants_json, applies_to_json, summary
             FROM nodes
             WHERE depth_zone = 'abyssal' AND (status IS NULL OR status = 'active')`
          )
          .all() as any[];

        const matchedAdrs: any[] = [];
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
            matchedAdrs.push(adr);
          }
        }

        if (matchedAdrs.length === 0) return {};

        const warnings: string[] = [
          `⚠️ [Bathynaut Sonar Guard] Active invariants governing ${relPaths.join(', ')}:`
        ];
        for (const adr of matchedAdrs) {
          let invs: string[] = [];
          try {
            invs = adr.invariants_json ? JSON.parse(adr.invariants_json) : [];
          } catch {}
          const badge = String(adr.enforcement || 'advisory').toUpperCase();
          warnings.push(
            `- [${badge}] ${adr.id} (${adr.name}): ${invs.length > 0 ? invs.join(' | ') : adr.summary || ''}`
          );
        }

        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: warnings.join('\n')
          }
        };
      } finally {
        db.close();
      }
    }

    return {};
  } catch {
    return {};
  }
}
