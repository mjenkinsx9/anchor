import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Strip ambient GIT_* vars (GIT_DIR, GIT_WORK_TREE, …) so fixtures can't
// be poisoned by the caller's git environment.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
);

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: cleanEnv });
  if (r.status !== 0 || r.signal) {
    throw new Error(`git ${args.join(' ')} failed (signal=${r.signal ?? 'none'}): ${r.stderr}`);
  }
  return r.stdout;
}

/** Create a temp git repo with `files` ({relPath: content}) committed on main. */
export function makeFixtureRepo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-fixture-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'initial commit', '--allow-empty');
  return {
    dir,
    git: (...args) => git(dir, ...args),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

export function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', message);
}
