import fs from 'node:fs';
import path from 'node:path';

/**
 * Installs or removes a fast Git pre-commit / post-merge hook for Bathynaut.
 */
export function runHooksCommand(projectRoot: string, action: 'install' | 'uninstall' = 'install'): boolean {
  const gitHooksDir = path.join(projectRoot, '.git', 'hooks');
  if (!fs.existsSync(path.join(projectRoot, '.git'))) {
    console.warn('⚠️ [Bathynaut] Diretorio .git nao encontrado neste projeto.');
    return false;
  }

  fs.mkdirSync(gitHooksDir, { recursive: true });
  const postMergePath = path.join(gitHooksDir, 'post-merge');

  if (action === 'uninstall') {
    if (fs.existsSync(postMergePath)) {
      const content = fs.readFileSync(postMergePath, 'utf-8');
      if (content.includes('# BATHYNAUT-HOOK')) {
        fs.unlinkSync(postMergePath);
        console.log('🔌 [Bathynaut] Git hook post-merge removido.');
        return true;
      }
    }
    return false;
  }

  const hookScript = `#!/bin/sh
# BATHYNAUT-HOOK: Auto-sync graph after git merge/pull
npx --no-install bathynaut map -d "${projectRoot.replace(/\\/g, '/')}" >/dev/null 2>&1 || true
`;

  fs.writeFileSync(postMergePath, hookScript, { encoding: 'utf-8', mode: 0o755 });
  console.log(`🪝 [Bathynaut] Git hook instalado em: ${postMergePath}`);
  return true;
}
