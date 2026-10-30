import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { Database } from 'better-sqlite3';
import { EdgeRecord, NodeRecord } from '../../types.js';
import { parseZettelkastenNote, ParsedZettelNote, COALA_CATEGORIES } from './zettelkasten.js';

export async function scanMarkdownVault(vaultDir: string): Promise<ParsedZettelNote[]> {
  const results: ParsedZettelNote[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'raw' && entry.name !== 'templates') {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip root working memory & MOC index files
        if (entry.name === 'activeContext.md' || entry.name === 'index.md') {
          continue;
        }
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const parsed = parseZettelkastenNote(fullPath, content);
          results.push(parsed);
        } catch {
          // ignore unreadable markdown files
        }
      }
    }
  }

  await walk(vaultDir);
  return results;
}

/**
 * Infers `shares_scope_with` edges between notes that have overlapping `applies_to` globs or `symbols`.
 */
export function computeScopeSharingEdges(notes: ParsedZettelNote[]): EdgeRecord[] {
  const edges: EdgeRecord[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i];
      const b = notes[j];
      if (a.node.status === 'superseded' || b.node.status === 'superseded') continue;

      let sharedReason = '';

      // 1. Check shared symbols
      const sharedSym = a.symbols.find(s => b.symbols.includes(s));
      if (sharedSym) {
        sharedReason = `Simbolo compartilhado: ${sharedSym}`;
      }

      // 2. Check overlapping applies_to globs
      if (!sharedReason && a.appliesTo.length > 0 && b.appliesTo.length > 0) {
        for (const ga of a.appliesTo) {
          for (const gb of b.appliesTo) {
            const normA = ga.replace(/\\/g, '/');
            const normB = gb.replace(/\\/g, '/');
            const prefixA = normA.replace(/\*.*$/, '');
            const prefixB = normB.replace(/\*.*$/, '');
            if (
              normA === normB ||
              minimatch(normA, normB) ||
              minimatch(normB, normA) ||
              (prefixA.length > 3 && prefixB.length > 3 && (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)))
            ) {
              sharedReason = `Escopo sobreposto: ${ga} <-> ${gb}`;
              break;
            }
          }
          if (sharedReason) break;
        }
      }

      if (sharedReason) {
        const key = `${a.node.id}<->${b.node.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            source_id: a.node.id,
            target_id: b.node.id,
            relation: 'shares_scope_with',
            confidence: 'INFERRED',
            weight: 0.4,
            context_snippet: sharedReason
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Generates the Map of Content (MOC) `index.md` in the memory vault root.
 */
export function generateMOCIndex(memoryRoot: string, db: Database): void {
  try {
    fsSync.mkdirSync(memoryRoot, { recursive: true });
    const indexPath = path.join(memoryRoot, 'index.md');
    const abyssalNodes = db.prepare(`
      SELECT * FROM nodes
      WHERE depth_zone = 'abyssal'
      ORDER BY updated_at DESC, id ASC
    `).all() as NodeRecord[];

    const kindToCategory: Record<string, string> = {
      adr: 'DECISIONS',
      incident: 'INCIDENTS',
      pattern: 'PATTERNS',
      entity: 'ENTITIES',
      architecture: 'ARCHITECTURE'
    };

    const grouped: Record<string, NodeRecord[]> = {
      DECISIONS: [],
      INCIDENTS: [],
      PATTERNS: [],
      ENTITIES: [],
      ARCHITECTURE: []
    };

    for (const n of abyssalNodes) {
      const cat = kindToCategory[n.kind] || 'DECISIONS';
      grouped[cat].push(n);
    }

    const lines: string[] = [
      '# Mapa Mestre de Conteudo (MOC) — Bathynaut SOTA',
      `> Atualizado automaticamente em: ${new Date().toISOString().split('T')[0]} | Total de notas: ${abyssalNodes.length}`,
      ''
    ];

    for (const section of ['DECISIONS', 'INCIDENTS', 'PATTERNS', 'ENTITIES', 'ARCHITECTURE']) {
      const list = grouped[section] || [];
      lines.push(`## ${section} (${list.length})`);
      if (list.length === 0) {
        lines.push('_Nenhuma nota registrada nesta categoria._');
      } else {
        for (const item of list) {
          const badge = item.enforcement === 'blocking' ? ' `[BLOCKING]`' : '';
          const statusTag = item.status && item.status !== 'active' ? ` *(${item.status.toUpperCase()})*` : '';
          lines.push(`- **[[${item.id}|${item.name}]]**${badge}${statusTag} — ${item.summary}`);
        }
      }
      lines.push('');
    }

    fsSync.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
  } catch {
    // non-fatal if filesystem is read-only
  }
}
