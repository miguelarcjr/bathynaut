import fs from 'node:fs';
import path from 'node:path';

const SKILL_TEMPLATES: Record<string, string> = {
  'bathynaut-map-project': `---
name: bathynaut-map-project
description: Mapeia os 6 dominios criticos do projeto usando Bathynaut (Sonar AST + Topologia Louvain + Zettelkasten CoALA) e compila notas atomicas com arestas causais.
---

# Mapeamento Profundo de Dominio (Bathynaut 6-Domain Protocol)

1. Execute \`bathynaut_dive({})\` para identificar as Comunidades Louvain, God Nodes, Bridge Nodes, Execution Flows, \`surprising_connections\` e \`knowledge_gaps\`.
2. Inspecione os **6 Dominios Criticos**:
   - **Seguranca, Autenticacao & Sessao**
   - **Entidades & Ciclo de Vida de Dominio**
   - **Invariantes de Negocio & Politicas**
   - **Integracoes Externas, Financas & Webhooks**
   - **Hotspots Operacionais (God Nodes)**
   - **Resiliencia, Mocks & Testes**
3. Para cada ` + '`knowledge_gap`' + ` ou invariante descoberto, invoque \`bathynaut_log_adr\` preenchendo \`id\` declarativo, \`category\` (\`decisions\`, \`patterns\`, \`entities\`, \`incidents\`, \`architecture\`), \`applies_to\`, \`symbols\`, \`invariants\`, \`enforcement\` e o objeto \`edges\` (\`depends_on\`, \`implements\`, \`mitigates\`, \`tensions_with\`).
4. Finalize executando \`bathynaut_lint({})\` e \`bathynaut_checkpoint\`.
`,
  'bathynaut-wiki-lint': `---
name: bathynaut-wiki-lint
description: Audita a saude 5D do grafo Bathynaut (orphan_active_notes, dangling_links, stale_adrs, untested_god_nodes, uncompiled_raw_sources).
---

# Workflow de Higienizacao do Grafo (Librarian Pass)

1. Chame \`bathynaut_lint({})\`.
2. Para cada item em \`dangling_links\`: corrija o ID ou compile a nota faltante via \`bathynaut_log_adr\`.
3. Para cada item em \`orphan_active_notes\`: leia a nota com \`bathynaut_recall({ ids: [id] })\` e recompile-a com \`bathynaut_log_adr({ id, ... })\` adicionando arestas \`edges\` (\`depends_on\`, \`implements\`, \`mitigates\`).
4. Para cada item em \`stale_adrs\`: inspecione o codigo alterado com \`bathynaut_sonar\` e atualize a ADR correspondente.
5. Para cada arquivo em \`uncompiled_raw_sources\`: leia o documento bruto em \`raw/\` e compile-o via \`bathynaut_log_adr({ ..., sources: [rawFile] })\`.
`
};

export function scaffoldCognitiveSkills(projectRoot: string): string[] {
  const created: string[] = [];
  const baseSkillsDir = path.join(projectRoot, '.bathynaut', 'skills');

  for (const [skillName, content] of Object.entries(SKILL_TEMPLATES)) {
    const skillDir = path.join(baseSkillsDir, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      fs.writeFileSync(skillPath, content, 'utf-8');
      created.push(skillPath);
    }
  }

  return created;
}
