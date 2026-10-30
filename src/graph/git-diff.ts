import { execFileSync } from 'node:child_process';

/**
 * Parses unified diff output (`git diff --unified=0`) into a dictionary mapping
 * normalized relative file paths to arrays of `[startLine, endLine]` tuples.
 */
export function parseUnifiedDiffOutput(diffOutput: string): Record<string, Array<[number, number]>> {
  const fileRanges: Record<string, Array<[number, number]>> = {};
  if (!diffOutput) return fileRanges;

  let currentFile: string | null = null;
  const lines = diffOutput.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length).trim().replace(/\\/g, '/');
      if (!fileRanges[currentFile]) {
        fileRanges[currentFile] = [];
      }
    } else if (line.startsWith('@@ ') && currentFile) {
      // Example: @@ -10,0 +11,5 @@ or @@ -15 +15 @@
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        const startLine = parseInt(match[1], 10);
        const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const endLine = count > 0 ? startLine + count - 1 : startLine;
        fileRanges[currentFile].push([startLine, endLine]);
      }
    }
  }

  return fileRanges;
}

/**
 * Runs `git diff --unified=0` in `projectRoot` and returns changed files and line ranges.
 */
export function getGitDiffRanges(
  projectRoot: string,
  baseRef = 'HEAD'
): Record<string, Array<[number, number]>> {
  if (!/^[A-Za-z0-9_.~^/@{}\-]+$/.test(baseRef)) {
    return {};
  }
  try {
    const out = execFileSync('git', ['diff', '--unified=0', baseRef, '--'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    });
    return parseUnifiedDiffOutput(out);
  } catch {
    return {};
  }
}

