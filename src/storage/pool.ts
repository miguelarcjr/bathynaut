import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Database } from 'better-sqlite3';
import { getDatabasePath, initDatabase } from './db.js';

export interface ProjectContext {
  projectRoot: string;
  memoryRoot: string;
  vaultKind: 'bathynaut' | 'agents-memory';
  dbPath: string;
  db: Database;
  lastAccessedAt: number;
}

/**
 * Walks up the directory tree from a hint path (file or directory) to find the project root.
 * Checks for `.bathynaut`, `.agents/memory`, or `.git`.
 */
export function resolveProjectRoot(hintPath?: string): string {
  let startDir = hintPath ? path.resolve(hintPath) : process.cwd();
  try {
    if (fs.existsSync(startDir) && fs.statSync(startDir).isFile()) {
      startDir = path.dirname(startDir);
    }
  } catch {
    startDir = path.dirname(startDir);
  }

  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (
      fs.existsSync(path.join(curr, '.bathynaut')) ||
      fs.existsSync(path.join(curr, '.agents', 'memory')) ||
      fs.existsSync(path.join(curr, '.git'))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }

  return startDir;
}

/**
 * Resolves the memory vault directory for a project root.
 * Supports Dual-Vault:
 * 1. If `.bathynaut/memory` exists, uses `.bathynaut/memory`.
 * 2. If `.agents/memory` exists, adopts `.agents/memory`.
 * 3. Otherwise defaults to `.bathynaut/memory`.
 */
export function resolveMemoryVault(projectRoot: string): {
  memoryRoot: string;
  vaultKind: 'bathynaut' | 'agents-memory';
} {
  const bathynautMemory = path.join(projectRoot, '.bathynaut', 'memory');
  const agentsMemory = path.join(projectRoot, '.agents', 'memory');

  if (fs.existsSync(path.join(bathynautMemory, 'wiki'))) {
    return { memoryRoot: bathynautMemory, vaultKind: 'bathynaut' };
  }
  if (fs.existsSync(agentsMemory)) {
    return { memoryRoot: agentsMemory, vaultKind: 'agents-memory' };
  }
  return { memoryRoot: bathynautMemory, vaultKind: 'bathynaut' };
}

export function registerProjectInGlobalRegistry(projectRoot: string, memoryRoot: string): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  try {
    const registryDir = path.join(os.homedir(), '.bathynaut');
    fs.mkdirSync(registryDir, { recursive: true });
    const registryPath = path.join(registryDir, 'registry.json');
    let data: { projects: Array<{ path: string; memoryRoot: string; updatedAt: string }> } = { projects: [] };
    if (fs.existsSync(registryPath)) {
      data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      if (!Array.isArray(data.projects)) data.projects = [];
    }
    const normalizedRoot = path.resolve(projectRoot);
    const existingIdx = data.projects.findIndex(p => path.resolve(p.path) === normalizedRoot);
    const entry = {
      path: normalizedRoot,
      memoryRoot: path.resolve(memoryRoot),
      updatedAt: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      data.projects[existingIdx] = entry;
    } else {
      data.projects.push(entry);
    }
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Non-fatal if home dir is read-only
  }
}

export class ProjectContextPool {
  private pool = new Map<string, ProjectContext>();
  private maxCapacity: number;

  constructor(maxCapacity = 8) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  getContext(hintPath?: string): ProjectContext {
    const projectRoot = resolveProjectRoot(hintPath);
    const existing = this.pool.get(projectRoot);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      return existing;
    }

    // Evict LRU if at capacity
    if (this.pool.size >= this.maxCapacity) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.pool.entries()) {
        if (v.lastAccessedAt < oldestTime) {
          oldestTime = v.lastAccessedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const evicted = this.pool.get(oldestKey);
        try { evicted?.db.close(); } catch {}
        this.pool.delete(oldestKey);
      }
    }

    const { memoryRoot, vaultKind } = resolveMemoryVault(projectRoot);
    const dbPath = getDatabasePath(projectRoot);
    const db = initDatabase(dbPath);
    registerProjectInGlobalRegistry(projectRoot, memoryRoot);

    const ctx: ProjectContext = {
      projectRoot,
      memoryRoot,
      vaultKind,
      dbPath,
      db,
      lastAccessedAt: Date.now()
    };
    this.pool.set(projectRoot, ctx);
    return ctx;
  }

  closeAll(): void {
    for (const ctx of this.pool.values()) {
      try { ctx.db.close(); } catch {}
    }
    this.pool.clear();
  }
}
