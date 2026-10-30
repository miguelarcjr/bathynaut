import fs from 'node:fs';
import path from 'node:path';

export const SKILL_TEMPLATES: Record<string, string> = {
  'bathynaut-map-project': `---
name: bathynaut-map-project
description: Mapeia, indexa ou atualiza completamente o projeto ativo utilizando o Bathynaut (Sonar AST + Topologia Louvain/PageRank + Zettelkasten CoALA). Executa varredura dos 6 dominios criticos e compila notas atomicas com arestas causais tipadas.
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
3. Para cada \`knowledge_gap\` ou invariante descoberto, invoque \`bathynaut_log_adr\` preenchendo \`id\` declarativo, \`category\` (\`decisions\`, \`patterns\`, \`entities\`, \`incidents\`, \`architecture\`), \`applies_to\`, \`symbols\`, \`invariants\`, \`enforcement\` e o objeto \`edges\` (\`depends_on\`, \`implements\`, \`mitigates\`, \`tensions_with\`).
4. Finalize executando \`bathynaut_lint({})\` e \`bathynaut_checkpoint\`.
`,

  'bathynaut-wiki-compile': `---
name: bathynaut-wiki-compile
description: Compila documentos brutos da pasta .bathynaut/memory/raw/ (ou .agents/memory/raw/) em notas atomicas interligadas no Zettelkasten usando bathynaut_log_adr.
---

# Compilacao de Fontes Brutas (Raw -> Zettelkasten CoALA)

1. Execute \`bathynaut_lint({})\` e inspecione a lista \`uncompiled_raw_sources\`.
2. Para cada arquivo pendente em \`raw/\`:
   - Leia o conteudo integral do arquivo bruto.
   - Extraia as decisoes, padroes, entidades, incidentes ou arquitetura contidos nele.
   - Invoque \`bathynaut_log_adr\` passando \`id\` declarativo, \`category\`, \`applies_to\`, \`symbols\`, \`invariants\`, \`edges\` e registrando o arquivo original em \`sources: ["raw/<arquivo>.md"]\`.
3. Se a nova nota substituir uma decisao antiga, passe \`edges: { supersedes: ["<id-antigo>"] }\` para atualizar automaticamente o YAML frontmatter da nota legada (\`status: superseded\`).
4. Re-execute \`bathynaut_lint({})\` para confirmar que \`uncompiled_raw_sources\` ficou zerado.
`,

  'bathynaut-wiki-lint': `---
name: bathynaut-wiki-lint
description: Audita a saude 5D do grafo Bathynaut (orphan_active_notes, dangling_links, stale_adrs, untested_god_nodes, uncompiled_raw_sources) e corrige inconsistencias.
---

# Workflow de Higienizacao do Grafo (Librarian Pass)

1. Chame \`bathynaut_lint({})\`.
2. Para cada item em \`dangling_links\`: corrija o ID ou compile a nota faltante via \`bathynaut_log_adr\`.
3. Para cada item em \`orphan_active_notes\`: leia a nota com \`bathynaut_recall({ ids: [id] })\` e recompile-a com \`bathynaut_log_adr({ id, ... })\` adicionando arestas \`edges\` (\`depends_on\`, \`implements\`, \`mitigates\`).
4. Para cada item em \`stale_adrs\`: inspecione o codigo alterado com \`bathynaut_sonar\` e atualize a ADR correspondente.
5. Para cada arquivo em \`uncompiled_raw_sources\`: leia o documento bruto em \`raw/\` e compile-o via \`bathynaut_log_adr({ ..., sources: [rawFile] })\`.
`,

  'bathynaut-session-checkpoint': `---
name: bathynaut-session-checkpoint
description: Salva o estado quente da sessao em activeContext.md via bathynaut_checkpoint e compila aprendizados arquiteturais na Wiki antes de encerrar ou compactar o contexto.
---

# Checkpoint Episodico de Sessao

1. Revise o que foi implementado, corrigido ou decidido na sessao atual.
2. Se alguma decisao arquitetural, padrao reutilizavel ou causa-raiz de bug foi descoberta e ainda nao esta na Wiki, compile-a primeiro via \`bathynaut_log_adr\`.
3. Invoque \`bathynaut_checkpoint({ summary, active_tasks, decisions })\` para atualizar o arquivo \`activeContext.md\` com o estado quente enxuto para a proxima sessao.
`,

  'bathynaut-review-changes': `---
name: bathynaut-review-changes
description: Revisa alteracoes locais (git diff) ou PRs calculando Blast Radius AST, Risk Score, fluxos de execucao afetados, cobertura de testes e possiveis violacoes de blocking_invariants.
---

# Revisao de Codigo Guiada por Grafo (Delta & Blast Radius Review)

1. Chame \`bathynaut_sonar({ git_diff: "HEAD", token_budget: 3000 })\` (ou passe os arquivos alvo em \`files\`).
2. Analise criticamente o retorno:
   - **\`blocking_invariants\`**: Verifique se alguma linha alterada viola os invariantes obrigatorios das ADRs que governam os arquivos modificados.
   - **\`affected_nodes\` & \`affected_flows\`**: Verifique se os callers downstream no grafo de chamadas AST continuam compativeis com a mudanca de assinatura ou comportamento.
   - **\`covering_tests\`**: Identifique quais testes unitarios/integracao cobrem os simbolos afetados e execute-os.
3. Apresente um relatorio estruturado com Risk Score, Invariantes Verificados, Impacto Downstream e Testes Recomendados.
`,

  'bathynaut-refactor-safely': `---
name: bathynaut-refactor-safely
description: Planeja e executa refatoracoes seguras usando o grafo de chamadas AST, invariantes de ADRs e analise de impacto cross-file do Bathynaut.
---

# Refatoracao Segura com Sonar AST

1. Antes de mover, renomear ou alterar um simbolo, execute \`bathynaut_sonar({ files: [...] })\` para mapear todos os callers diretos e indiretos e os \`blocking_invariants\`.
2. Use \`bathynaut_dive({})\` para verificar se o simbolo e um **God Node** ou **Bridge Node** entre comunidades.
3. Aplique as alteracoes preservando os contratos exigidos pelas ADRs ativas.
4. Execute os testes mapeados em \`covering_tests\` e rode \`bathynaut_lint({})\` ao final para verificar se alguma ADR ficou \`stale\`.
`
};

export function scaffoldCognitiveSkills(projectRoot: string): string[] {
  const created: string[] = [];

  // Target skill directories discovered natively by Antigravity/Codex/OpenCode (.agents/skills),
  // Claude Code (.claude/skills), Cursor (.cursor/skills), plus canonical (.bathynaut/skills)
  const targetDirs = [
    path.join(projectRoot, '.bathynaut', 'skills'),
    path.join(projectRoot, '.agents', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(projectRoot, '.cursor', 'skills')
  ];

  for (const baseSkillsDir of targetDirs) {
    for (const [skillName, content] of Object.entries(SKILL_TEMPLATES)) {
      const skillDir = path.join(baseSkillsDir, skillName);
      fs.mkdirSync(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillPath, content, 'utf-8');
      created.push(skillPath);
    }
  }

  return created;
}

export function removeCognitiveSkills(projectRoot: string): number {
  let removedCount = 0;
  const agentSkillDirs = [
    path.join(projectRoot, '.agents', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(projectRoot, '.cursor', 'skills')
  ];

  for (const baseDir of agentSkillDirs) {
    if (!fs.existsSync(baseDir)) continue;
    for (const skillName of Object.keys(SKILL_TEMPLATES)) {
      const skillDir = path.join(baseDir, skillName);
      if (fs.existsSync(skillDir)) {
        try {
          fs.rmSync(skillDir, { recursive: true, force: true });
          removedCount++;
        } catch {}
      }
    }
  }

  return removedCount;
}
