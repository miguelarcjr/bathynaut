import Parser from 'web-tree-sitter';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let isInitialized = false;
const languageCache = new Map<string, Parser.Language>();

export async function initTreeSitter(): Promise<void> {
  if (isInitialized) return;
  
  // Locate tree-sitter.wasm inside node_modules/web-tree-sitter
  let wasmPath = '';
  try {
    wasmPath = fileURLToPath(import.meta.resolve('web-tree-sitter/tree-sitter.wasm'));
  } catch {
    wasmPath = path.resolve('node_modules/web-tree-sitter/tree-sitter.wasm');
  }

  await Parser.init({
    locateFile() {
      return wasmPath;
    }
  });
  isInitialized = true;
}

export function getLanguageForFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    default:
      return null;
  }
}

export async function loadLanguage(langName: string): Promise<Parser.Language | null> {
  if (languageCache.has(langName)) {
    return languageCache.get(langName)!;
  }

  // Map to tree-sitter-wasms filename
  let wasmFileName = `tree-sitter-${langName}.wasm`;
  if (langName === 'typescript') wasmFileName = 'tree-sitter-typescript.wasm';
  if (langName === 'javascript') wasmFileName = 'tree-sitter-javascript.wasm';

  let langWasmPath = '';
  try {
    langWasmPath = fileURLToPath(import.meta.resolve(`tree-sitter-wasms/out/${wasmFileName}`));
  } catch {
    langWasmPath = path.resolve(`node_modules/tree-sitter-wasms/out/${wasmFileName}`);
  }

  if (!fs.existsSync(langWasmPath)) {
    return null;
  }

  const language = await Parser.Language.load(langWasmPath);
  languageCache.set(langName, language);
  return language;
}

export async function createParserForFile(filePath: string): Promise<{ parser: Parser; language: string } | null> {
  await initTreeSitter();
  const langName = getLanguageForFile(filePath);
  if (!langName) return null;

  const lang = await loadLanguage(langName);
  if (!lang) return null;

  const parser = new Parser();
  parser.setLanguage(lang);
  return { parser, language: langName };
}
