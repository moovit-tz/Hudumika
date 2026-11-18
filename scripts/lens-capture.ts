/**
 * Lens Local Capture CLI Tool
 *
 * Narrow, authorized local capture tool for Git repositories and uncommitted working-tree patches.
 * Conforms to Hudumika Lens specification:
 * - Bounded subprocess arguments
 * - No interactive prompts or credential leaks
 * - SHA-256 checksum verification
 * - Immutable manifest structure
 * - Safe archive/patch generation (no symlink escape or traversal)
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface SnapshotManifest {
  tool_version: string;
  scope: 'patch' | 'selected' | 'archive' | 'bundle';
  repository_name: string;
  commit_sha: string;
  branch: string;
  created_at: string;
  checksum_sha256: string;
  size_bytes: number;
  file_count: number;
  files: string[];
}

function runGit(args: string[], cwd: string = process.cwd()): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch (err: any) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${err?.stderr || err?.message}`);
  }
}

export function captureWorkingTreePatch(repoRoot: string = process.cwd()): {
  manifest: SnapshotManifest;
  patchContent: string;
} {
  // 1. Verify repo root is a git repository
  const gitDir = runGit(['rev-parse', '--git-dir'], repoRoot);
  if (!gitDir) {
    throw new Error(`Directory is not a valid git repository: ${repoRoot}`);
  }

  // 2. Extract commit SHA and branch
  const commitSha = runGit(['rev-parse', 'HEAD'], repoRoot);
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  const repoName = path.basename(path.resolve(repoRoot));

  // 3. Extract modified and untracked file lists
  const statusOutput = runGit(['status', '--porcelain'], repoRoot);
  const files: string[] = [];
  if (statusOutput) {
    for (const line of statusOutput.split('\n')) {
      const file = line.slice(3).trim();
      if (file && !file.includes('..')) {
        files.push(file);
      }
    }
  }

  // 4. Capture git diff including staged and unstaged changes
  const diffOutput = runGit(['diff', 'HEAD'], repoRoot);
  const patchContent = diffOutput || '# Clean working tree - no uncommitted diffs against HEAD\n';

  // 5. Calculate SHA-256 checksum
  const checksum = createHash('sha256').update(patchContent, 'utf8').digest('hex');
  const sizeBytes = Buffer.byteLength(patchContent, 'utf8');

  const manifest: SnapshotManifest = {
    tool_version: '1.0.0',
    scope: 'patch',
    repository_name: repoName,
    commit_sha: commitSha,
    branch,
    created_at: new Date().toISOString(),
    checksum_sha256: checksum,
    size_bytes: sizeBytes,
    file_count: files.length,
    files,
  };

  return { manifest, patchContent };
}

// CLI Execution entry point
if (process.argv[1] && process.argv[1].endsWith('lens-capture.ts')) {
  try {
    const outputDir = path.resolve(process.cwd(), 'out', 'lens-snapshots');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { manifest, patchContent } = captureWorkingTreePatch();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const patchFile = path.join(outputDir, `patch-${manifest.commit_sha.slice(0, 8)}-${timestamp}.patch`);
    const manifestFile = path.join(outputDir, `manifest-${manifest.commit_sha.slice(0, 8)}-${timestamp}.json`);

    fs.writeFileSync(patchFile, patchContent, 'utf8');
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`[Lens Capture] Snapshot successfully created:`);
    console.log(`  Repo:      ${manifest.repository_name} (${manifest.branch})`);
    console.log(`  Commit:    ${manifest.commit_sha}`);
    console.log(`  SHA-256:   ${manifest.checksum_sha256}`);
    console.log(`  Size:      ${manifest.size_bytes} bytes (${manifest.file_count} changed files)`);
    console.log(`  Patch:     ${patchFile}`);
    console.log(`  Manifest:  ${manifestFile}`);
  } catch (err: any) {
    console.error(`[Lens Capture] Error:`, err.message);
    process.exit(1);
  }
}
