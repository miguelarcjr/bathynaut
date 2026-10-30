import Parser from 'web-tree-sitter';
import crypto from 'node:crypto';
import { NodeRecord, EdgeRecord } from '../../types.js';
import { createParserForFile } from './tree-sitter.js';

export interface ASTParseResult {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function extractLeadingComment(lines: string[], startRow: number): string | null {
  const commentLines: string[] = [];
  let row = startRow - 1;
  while (row >= 0) {
    const trimmed = lines[row]?.trim() || '';
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('"""') ||
      trimmed.startsWith("'''")
    ) {
      const cleaned = trimmed
        .replace(/^(\/*\*?|\*\/|\*|\/\/|#)\s?/, '')
        .trim();
      if (cleaned) commentLines.unshift(cleaned);
      if (trimmed.startsWith('/*')) break;
      row--;
    } else if (trimmed.startsWith('@')) {
      row--;
    } else {
      break;
    }
  }
  return commentLines.length > 0 ? commentLines.join(' ').slice(0, 400) : null;
}

function extractSignature(nodeText: string): string {
  const firstLine = nodeText.split(/\r?\n/)[0] || '';
  return firstLine.replace(/\s*\{.*$/, '').trim().slice(0, 240);
}

function isTestFilePath(filePath: string): boolean {
  return /\.(test|spec)\.[a-z0-9]+$/i.test(filePath) || /(^|\/)(tests?|__tests__)\//i.test(filePath.replace(/\\/g, '/'));
}

function detectEntrypoint(name: string, filePath: string, fullLineText: string): number {
  const normPath = filePath.replace(/\\/g, '/');
  if (/^(main|handler|lambda_handler|bootstrap|run|serve|createServer|createMCPServer)$/i.test(name)) {
    return 1;
  }
  if (/^(handle|on)[A-Z_]/.test(name) || /Handler$|Controller$|Route$/i.test(name)) {
    return 1;
  }
  if (/(^|\/)(main|index|server|cli|routes|app)\.[a-z]+$/i.test(normPath) && /^export\s+/.test(fullLineText.trim())) {
    return 1;
  }
  return 0;
}

export async function parseSourceCode(filePath: string, code: string): Promise<ASTParseResult> {
  const result: ASTParseResult = { nodes: [], edges: [] };
  const parserObj = await createParserForFile(filePath);
  if (!parserObj) return result;

  const { parser } = parserObj;
  const tree = parser.parse(code);
  const root = tree.rootNode;
  const lines = code.split(/\r?\n/);
  const normFile = filePath.replace(/\\/g, '/');
  const isTestFile = isTestFilePath(normFile);

  const fileNodeId = `file:${normFile}`;
  result.nodes.push({
    id: fileNodeId,
    depth_zone: 'twilight',
    kind: 'file',
    name: filePath,
    qualified_name: normFile,
    file_path: normFile,
    line_start: 1,
    line_end: lines.length,
    content_hash: sha256(code),
    summary: `Arquivo de codigo fonte (${parserObj.language})`
  });

  const seenSymbols = new Set<string>();

  function walk(node: Parser.SyntaxNode, currentParentFunction?: string, currentClassName?: string) {
    // 1. Class declarations
    if (node.type === 'class_declaration' || node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'type_identifier' || c.type === 'identifier');
      if (nameNode) {
        const className = nameNode.text;
        const classId = `class:${normFile}:${className}`;
        const startRow = node.startPosition.row;
        const endRow = node.endPosition.row;
        const fullDeclText = (node.parent?.type === 'export_statement' ? node.parent.text : node.text);
        const isExported = node.parent?.type === 'export_statement' || fullDeclText.trim().startsWith('export ') ? 1 : 0;
        const docstring = extractLeadingComment(lines, startRow);
        const signature = extractSignature(fullDeclText);
        const excerpt = lines.slice(startRow, Math.min(endRow + 1, startRow + 35)).join('\n').slice(0, 1600);

        if (!seenSymbols.has(classId)) {
          seenSymbols.add(classId);
          result.nodes.push({
            id: classId,
            depth_zone: 'twilight',
            kind: 'class',
            name: className,
            qualified_name: `${normFile}:${className}`,
            file_path: normFile,
            line_start: startRow + 1,
            line_end: endRow + 1,
            signature,
            docstring,
            code_excerpt: excerpt,
            content_hash: sha256(node.text),
            is_exported: isExported,
            is_entrypoint: 0,
            summary: docstring || `Classe ${className} (${signature})`
          });

          result.edges.push({
            source_id: fileNodeId,
            target_id: classId,
            relation: 'belongs_to',
            confidence: 'EXTRACTED',
            weight: 1.0
          });
        }

        currentClassName = className;
      }
    }

    // 2. Function / Method declarations
    if (
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'function_definition' ||
      node.type === 'arrow_function'
    ) {
      let funcName = '';
      const nameNode =
        node.childForFieldName('name') ||
        node.children.find(c => c.type === 'identifier' || c.type === 'property_identifier');
      if (nameNode) {
        funcName = nameNode.text;
      } else if (node.parent && node.parent.type === 'variable_declarator') {
        const varNameNode = node.parent.childForFieldName('name');
        if (varNameNode) funcName = varNameNode.text;
      }

      if (funcName) {
        const qualifiedFunc = currentClassName ? `${currentClassName}.${funcName}` : funcName;
        const funcId = `fn:${normFile}:${funcName}`;

        if (!seenSymbols.has(funcId)) {
          seenSymbols.add(funcId);
          const startRow = node.startPosition.row;
          const endRow = node.endPosition.row;

          // Check outer export statement if present
          const outerNode =
            node.parent?.type === 'export_statement'
              ? node.parent
              : node.parent?.parent?.parent?.type === 'export_statement'
                ? node.parent.parent.parent
                : node;
          const fullDeclText = outerNode.text;
          const isExported =
            outerNode.type === 'export_statement' ||
            fullDeclText.trim().startsWith('export ') ||
            node.type === 'method_definition'
              ? 1
              : 0;

          const docstring = extractLeadingComment(lines, outerNode.startPosition.row);
          const signature = extractSignature(fullDeclText);
          const excerpt = lines.slice(startRow, Math.min(endRow + 1, startRow + 35)).join('\n').slice(0, 1600);
          const isEntrypoint = isTestFile ? 0 : detectEntrypoint(funcName, normFile, fullDeclText);

          result.nodes.push({
            id: funcId,
            depth_zone: 'twilight',
            kind: isTestFile ? 'test' : 'function',
            name: funcName,
            qualified_name: `${normFile}:${qualifiedFunc}`,
            file_path: normFile,
            line_start: startRow + 1,
            line_end: endRow + 1,
            signature,
            docstring,
            code_excerpt: excerpt,
            content_hash: sha256(node.text),
            is_exported: isExported,
            is_entrypoint: isEntrypoint,
            summary: docstring || `Funcao ${funcName} em ${normFile} (${signature})`
          });

          result.edges.push({
            source_id: fileNodeId,
            target_id: funcId,
            relation: 'belongs_to',
            confidence: 'EXTRACTED',
            weight: 1.0
          });

          currentParentFunction = funcId;
        }
      }
    }

    // 3. Call expressions (CALLS)
    if (node.type === 'call_expression' || node.type === 'call') {
      const callee = node.childForFieldName('function') || node.children[0];
      if (callee) {
        let calledName = callee.text.trim();
        if (calledName.includes('.')) {
          const parts = calledName.split('.');
          calledName = parts[parts.length - 1].trim();
        }

        if (
          calledName &&
          calledName.length > 1 &&
          !calledName.startsWith('(') &&
          !/^(if|for|while|switch|catch|return|console|describe|it|test|expect|beforeEach|afterEach|beforeAll|afterAll)$/.test(calledName)
        ) {
          const callerId = currentParentFunction || fileNodeId;
          const targetCandidateId = `fn:${calledName}`;

          result.edges.push({
            source_id: callerId,
            target_id: targetCandidateId,
            relation: 'calls',
            confidence: 'EXTRACTED',
            weight: 1.0,
            context_snippet: node.text.slice(0, 120)
          });
        }
      }
    }

    // 4. Import statements (IMPORTS)
    if (node.type === 'import_statement' || node.type === 'import_declaration') {
      const sourceNode = node.childForFieldName('source') || node.children.find(c => c.type === 'string');
      if (sourceNode) {
        const importTarget = sourceNode.text.replace(/['"]/g, '').trim();
        result.edges.push({
          source_id: fileNodeId,
          target_id: `import:${importTarget}`,
          relation: 'imports',
          confidence: 'EXTRACTED',
          weight: 1.0,
          context_snippet: node.text.slice(0, 160)
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, currentParentFunction, currentClassName);
    }
  }

  walk(root);
  return result;
}
