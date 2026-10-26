import Parser from 'web-tree-sitter';
import { NodeRecord, EdgeRecord } from '../../types.js';
import { createParserForFile } from './tree-sitter.js';

export interface ASTParseResult {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

export async function parseSourceCode(filePath: string, code: string): Promise<ASTParseResult> {
  const result: ASTParseResult = { nodes: [], edges: [] };
  const parserObj = await createParserForFile(filePath);
  if (!parserObj) return result;

  const { parser } = parserObj;
  const tree = parser.parse(code);
  const root = tree.rootNode;

  // File node
  const fileNodeId = `file:${filePath.replace(/\\/g, '/')}`;
  result.nodes.push({
    id: fileNodeId,
    depth_zone: 'twilight',
    kind: 'file',
    name: filePath,
    file_path: filePath,
    summary: `Arquivo de codigo fonte (${parserObj.language})`
  });

  const seenFunctions = new Set<string>();

  function walk(node: Parser.SyntaxNode, currentParentFunction?: string) {
    // 1. Function / Method declarations
    if (
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'function_definition' ||
      node.type === 'arrow_function'
    ) {
      let funcName = '';
      const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'identifier' || c.type === 'property_identifier');
      if (nameNode) {
        funcName = nameNode.text;
      } else if (node.parent && node.parent.type === 'variable_declarator') {
        const varNameNode = node.parent.childForFieldName('name');
        if (varNameNode) funcName = varNameNode.text;
      }

      if (funcName && !seenFunctions.has(funcName)) {
        seenFunctions.add(funcName);
        const funcId = `fn:${filePath.replace(/\\/g, '/')}:${funcName}`;

        result.nodes.push({
          id: funcId,
          depth_zone: 'twilight',
          kind: 'function',
          name: funcName,
          file_path: filePath,
          line_start: node.startPosition.row + 1,
          line_end: node.endPosition.row + 1,
          summary: `Funcao ${funcName} em ${filePath}`
        });

        // Edge: File contains Function
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

    // 2. Class declarations
    if (node.type === 'class_declaration' || node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const className = nameNode.text;
        const classId = `class:${filePath.replace(/\\/g, '/')}:${className}`;

        result.nodes.push({
          id: classId,
          depth_zone: 'twilight',
          kind: 'class',
          name: className,
          file_path: filePath,
          line_start: node.startPosition.row + 1,
          line_end: node.endPosition.row + 1,
          summary: `Classe ${className} em ${filePath}`
        });

        result.edges.push({
          source_id: fileNodeId,
          target_id: classId,
          relation: 'belongs_to',
          confidence: 'EXTRACTED',
          weight: 1.0
        });
      }
    }

    // 3. Call expressions (CALLS)
    if (node.type === 'call_expression' || node.type === 'call') {
      const callee = node.childForFieldName('function') || node.children[0];
      if (callee) {
        let calledName = callee.text;
        // handle obj.method() -> method
        if (calledName.includes('.')) {
          const parts = calledName.split('.');
          calledName = parts[parts.length - 1];
        }

        if (calledName && calledName.length > 1 && !calledName.startsWith('(')) {
          const callerId = currentParentFunction || fileNodeId;
          const targetCandidateId = `fn:${calledName}`;

          result.edges.push({
            source_id: callerId,
            target_id: targetCandidateId,
            relation: 'calls',
            confidence: 'EXTRACTED',
            weight: 1.0,
            context_snippet: node.text.slice(0, 80)
          });
        }
      }
    }

    // 4. Import statements (IMPORTS)
    if (node.type === 'import_statement' || node.type === 'import_declaration') {
      const sourceNode = node.childForFieldName('source') || node.children.find(c => c.type === 'string');
      if (sourceNode) {
        const importTarget = sourceNode.text.replace(/['"]/g, '');
        result.edges.push({
          source_id: fileNodeId,
          target_id: `import:${importTarget}`,
          relation: 'imports',
          confidence: 'EXTRACTED',
          weight: 1.0,
          context_snippet: node.text.slice(0, 80)
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, currentParentFunction);
    }
  }

  walk(root);
  return result;
}
