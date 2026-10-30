import { initDatabase, getDatabasePath } from '../../storage/db.js';
import { resolveMemoryVault } from '../../storage/pool.js';
import { ensureFreshGraph } from '../../storage/incremental-sync.js';
import { handleSonar } from '../../mcp/tools/sonar.js';

export interface ReviewCommandOptions {
  baseRef?: string;
  tokenBudget?: number;
  json?: boolean;
}

export async function runReviewCommand(
  projectRoot: string,
  targetFiles: string[] = [],
  options: ReviewCommandOptions = {}
): Promise<any> {
  const dbPath = getDatabasePath(projectRoot);
  const db = initDatabase(dbPath);
  const { memoryRoot } = resolveMemoryVault(projectRoot);

  try {
    await ensureFreshGraph(projectRoot, db, memoryRoot);

    const gitDiffRef = targetFiles.length === 0 ? (options.baseRef || 'HEAD') : options.baseRef;
    const res = handleSonar(
      db,
      {
        files: targetFiles,
        git_diff: gitDiffRef,
        token_budget: options.tokenBudget ?? 2500
      },
      projectRoot
    );

    const report = JSON.parse(res.content[0].text);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\n🚨 [Bathynaut Review] Risk Level: ${report.risk_level} (Score: ${report.risk_score})`);
      console.log(`   • Target Files (${report.target_files.length}): ${report.target_files.join(', ') || 'none'}`);
      console.log(`   • Blast Radius (${report.affected_nodes.length} symbols across ${report.affected_files.length} files)`);
      console.log(`   • Affected Execution Flows: ${report.affected_flows.length}`);
      console.log(`   • Covering Tests (${report.covering_tests.length}): ${report.covering_tests.join(', ') || 'NONE'}`);
      if (report.untested_functions.length > 0) {
        console.log(`   ⚠️ Untested Functions (${report.untested_functions.length}): ${report.untested_functions.map((u: any) => u.name).join(', ')}`);
      }
      if (report.blocking_invariants.length > 0) {
        console.log(`   🛑 Active Blocking Invariants:`);
        for (const inv of report.blocking_invariants) {
          console.log(`      - ${inv}`);
        }
      }
    }

    return report;
  } finally {
    db.close();
  }
}
