import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { PRE_PUSH_SCRIPT, MARKER } from './hook-script.mjs';

function gitDirOf(repoDir) {
  const gitDir = join(repoDir, '.git');
  try {
    if (statSync(gitDir).isDirectory()) return gitDir;
  } catch {}
  return null; // absent, or a worktree/submodule .git FILE — both unsupported
}

export function installHook(repoDir, { force = false } = {}) {
  const gitDir = gitDirOf(repoDir);
  if (!gitDir) {
    throw new Error('anchor: hook install must be run from inside a git repo (worktrees/submodules not supported).');
  }
  const hookPath = join(gitDir, 'hooks', 'pre-push');
  if (existsSync(hookPath) && !force) {
    throw new Error('anchor: .git/hooks/pre-push already exists. Re-run with --force to overwrite.');
  }
  mkdirSync(join(gitDir, 'hooks'), { recursive: true });
  writeFileSync(hookPath, PRE_PUSH_SCRIPT, { mode: 0o755 });
  chmodSync(hookPath, 0o755); // mode option is ignored if the file pre-existed (--force path)
  return { installed: true, path: hookPath };
}

export function hookStatus(repoDir) {
  const hookPath = join(repoDir, '.git', 'hooks', 'pre-push');
  if (!existsSync(hookPath)) return { installed: false, path: hookPath };
  const isAnchor = readFileSync(hookPath, 'utf8').includes(MARKER);
  return isAnchor
    ? { installed: true, path: hookPath }
    : { installed: false, path: hookPath, foreign: true }; // someone else's pre-push hook
}

export function uninstallHook(repoDir) {
  const hookPath = join(repoDir, '.git', 'hooks', 'pre-push');
  if (!existsSync(hookPath)) {
    return { removed: false, message: 'no pre-push hook installed' };
  }
  if (!readFileSync(hookPath, 'utf8').includes(MARKER)) {
    throw new Error("anchor: existing .git/hooks/pre-push is not Anchor's — leaving it alone");
  }
  rmSync(hookPath);
  return { removed: true, path: hookPath };
}
