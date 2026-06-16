import { spawnSync } from 'node:child_process';

/**
 * Run a command synchronously. Never throws.
 * Missing binary → code 127. Timeout → code 124 (GNU `timeout` convention) with a
 * clean message. An explicit `opts.timeout` wins; otherwise `opts.defaultTimeout`;
 * otherwise a 30s floor so a hung external tool can't wedge a review. Long-running
 * callers (e.g. `gh pr diff`) should pass an explicit larger `timeout`.
 */
export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout ?? opts.defaultTimeout ?? 30_000,
  });
  // On timeout Node sets BOTH error.code='ETIMEDOUT' and signal='SIGTERM' (status null);
  // detect via either so the behavior is robust across Node versions.
  const err = /** @type {any} */ (res.error);
  const timedOut = err?.code === 'ETIMEDOUT' || (res.error == null && res.signal != null && res.status == null);
  if (timedOut) return { stdout: res.stdout ?? '', stderr: `anchor: command timed out: ${cmd}`, code: 124 };
  if (res.error) return { stdout: '', stderr: String(res.error.message), code: 127 };
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    code: res.status ?? (res.signal ? 128 : 0),
  };
}

export function runGit(args, opts = {}) {
  return runCmd('git', args, opts);
}

export function isGitRepo(dir) {
  return runGit(['rev-parse', '--is-inside-work-tree'], { cwd: dir }).stdout.trim() === 'true';
}

export function repoRoot(dir) {
  const r = runGit(['rev-parse', '--show-toplevel'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}

export function shortHead(dir) {
  const r = runGit(['rev-parse', '--short', 'HEAD'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}

/** True if `cmd --version` exits 0 — the convention all our probed tools (git, gh, node) follow. */
export function hasCmd(cmd) {
  return runCmd(cmd, ['--version']).code === 0;
}

/** Escape regex metacharacters so a literal string is safe inside `git grep -E`. */
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
