import fs from 'node:fs/promises';
import path from 'node:path';
import { parseZettelkastenNote, ParsedZettelNote } from './zettelkasten.js';

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
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'raw') {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const parsed = parseZettelkastenNote(fullPath, content);
          results.push(parsed);
        } catch (err) {
          // ignore corrupted or unreadable markdown files
        }
      }
    }
  }

  await walk(vaultDir);
  return results;
}
