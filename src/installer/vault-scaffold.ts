import fs from 'node:fs';
import path from 'node:path';

export function scaffoldMemoryVault(projectRoot: string): string {
  const memoryDir = path.join(projectRoot, '.bathynaut', 'memory');
  const wikiDir = path.join(memoryDir, 'wiki');
  const obsidianDir = path.join(memoryDir, '.obsidian');

  const categories = ['decisions', 'incidents', 'patterns', 'entities'];
  for (const cat of categories) {
    fs.mkdirSync(path.join(wikiDir, cat), { recursive: true });
  }
  fs.mkdirSync(path.join(memoryDir, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'templates'), { recursive: true });
  fs.mkdirSync(obsidianDir, { recursive: true });

  // Initial activeContext.md
  const activeContextPath = path.join(memoryDir, 'activeContext.md');
  if (!fs.existsSync(activeContextPath)) {
    fs.writeFileSync(activeContextPath, `# Estado Ativo da Sessao (Bathynaut)
> Inicializado em: ${new Date().toISOString()}

## Resumo do Projeto
Repositorio equipado com o harness de memoria e sonar Bathynaut.

## Proximas Tarefas Ativas
- [ ] Explorar arquitetura com bathynaut_dive
- [ ] Mapear regras criticas no Zettelkasten
`, 'utf-8');
  }

  // Initial index.md
  const indexPath = path.join(memoryDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `# Mapa Mestre de Conteudo (MOC) — Bathynaut
> Gerado automaticamente. Vault Zettelkasten conectado a AST.

## DECISIONS (0)
_Nenhuma decisao registrada._

## INCIDENTS (0)
_Nenhum incidente registrado._
`, 'utf-8');
  }

  // Obsidian graph settings
  fs.writeFileSync(path.join(obsidianDir, 'app.json'), JSON.stringify({ showLineNumber: true, livePreview: true }, null, 2), 'utf-8');
  fs.writeFileSync(path.join(obsidianDir, 'graph.json'), JSON.stringify({
    "collapse-filter": false,
    "search": "",
    "colorGroups": [
      { "query": "tag:#decision", "color": { "a": 1, "rgb": 16752640 } },
      { "query": "tag:#incident", "color": { "a": 1, "rgb": 16733284 } }
    ]
  }, null, 2), 'utf-8');

  return memoryDir;
}
