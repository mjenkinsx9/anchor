import { spawnSync } from 'node:child_process';

/** Run a command synchronously. Never throws; missing binary → code 127. */
export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
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
