import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { calculateBlastRadius } from '../../graph/blast-radius.js';
import { getGitDiffRanges } from '../../graph/git-diff.js';
import { packWithinTokenBudget, PackableExcerptItem } from '../../storage/token-packer.js';

export const SonarSchema = z.object({
  files: z.array(z.string()).default([]).describe('Lista de caminhos de arquivos que serao editados ou analisados'),
  file_paths: z.array(z.string()).optional().describe('Alias para files (compatibilidade com wiki_context_for_files)'),
  git_diff: z.string().optional().describe('Ref Git opcional (ex: "HEAD", "main") para extrair arquivos e linhas alteradas automaticamente'),
  token_budget: z.number().default(2500).describe('Orcamento maximo de tokens para os trechos de codigo e ADRs retornados'),
  project_path: z.string().optional().describe('Caminho opcional do repositorio (para roteamento multi-projeto)'),
  workspace_hint: z.string().optional().describe('Alias para project_path')
});

export function handleSonar(
  db: Database,
  args: z.infer<typeof SonarSchema>,
  projectRoot: string = process.cwd()
) {
  const changedLineRanges = args.git_diff
    ? getGitDiffRanges(projectRoot, args.git_diff)
    : undefined;

  const diffFiles = changedLineRanges ? Object.keys(changedLineRanges) : [];
  const inputFiles = [...(args.files || []), ...(args.file_paths || [])];
  const targetFiles = Array.from(new Set([...inputFiles, ...diffFiles]));

  const blast = calculateBlastRadius(db, targetFiles, { changedLineRanges });

  // Build packable excerpts prioritized by Blocking ADRs -> Entrypoint/Target Code -> Callers
  const packableItems: PackableExcerptItem[] = [];

  for (const adr of blast.governing_adrs) {
    const priority = adr.enforcement === 'blocking' ? 100 : adr.enforcement === 'warning' ? 85 : 70;
    packableItems.push({
      id: adr.id,
      title: `[ADR:${adr.enforcement.toUpperCase()}] ${adr.title}`,
      citation: adr.id,
      snippet: adr.invariants.length > 0
        ? `${adr.summary}\nInvariantes:\n- ${adr.invariants.join('\n- ')}`
        : adr.summary,
      priority
    });
  }

  for (const node of blast.affected_nodes) {
    if (node.code_excerpt || node.signature) {
      const isTarget = targetFiles.some(tf => node.file_path.endsWith(tf.replace(/\\/g, '/')));
      const citation = node.line_start && node.line_end
        ? `${node.file_path}:${node.line_start}-${node.line_end}`
        : node.file_path || node.id;
      packableItems.push({
        id: node.id,
        title: `${node.kind} ${node.name}`,
        citation,
        signature: node.signature,
        snippet: node.code_excerpt || node.signature || '',
        priority: isTarget ? 60 : 40
      });
    }
  }

  const packed = packWithinTokenBudget(packableItems, args.token_budget ?? 2500);

  const formattedBlockingInvariants = blast.blocking_invariants.map(
    b => `[${b.adr_id}] ${b.invariant}`
  );

  const responsePayload = {
    target_files: blast.entry_files,
    entry_files: blast.entry_files,
    affected_files: blast.affected_files,
    risk_score: blast.risk_score,
    risk_level: blast.risk_level,
    blocking_invariants: formattedBlockingInvariants,
    blocking_invariant_details: blast.blocking_invariants,
    governing_adrs: blast.governing_adrs,
    known_incidents: blast.known_incidents,
    covering_tests: blast.covering_tests,
    untested_functions: blast.untested_functions,
    affected_flows: blast.affected_flows,
    affected_nodes: blast.affected_nodes,
    token_budget: packed.tokenBudget,
    used_tokens: packed.usedTokens,
    excerpts: packed.included
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(responsePayload, null, 2)
      }
    ]
  };
}
