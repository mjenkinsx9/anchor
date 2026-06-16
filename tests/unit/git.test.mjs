import { describe, it, expect, afterAll } from 'vitest';
import { runCmd, runGit, isGitRepo, repoRoot, shortHead, hasCmd } from '../../lib/git.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';

const repo = makeFixtureRepo({ 'a.txt': 'hello\n' });
afterAll(() => repo.cleanup());

describe('runCmd', () => {
  it('captures stdout and exit code', () => {
    const r = runCmd('echo', ['hi']);
    expect(r.stdout.trim()).toBe('hi');
    expect(r.code).toBe(0);
  });
  it('returns code 127 for missing binaries instead of throwing', () => {
    const r = runCmd('definitely-not-a-real-binary-xyz', []);
    expect(r.code).toBe(127);
  });
  it('applies a timeout and reports a clean timeout code/message', () => {
    const start = Date.now();
    const r = runCmd('sh', ['-c', 'sleep 5'], { defaultTimeout: 200 });
    expect(Date.now() - start).toBeLessThan(3000); // killed well before 5s
    expect(r.code).toBe(124); // GNU timeout convention, distinct from 127
    expect(r.stderr).toMatch(/timed out/);
  });
});

describe('git helpers', () => {
  it('runGit runs in the given cwd', () => {
    const r = runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.dir });
    expect(r.stdout.trim()).toBe('true');
  });
  it('isGitRepo true inside, false outside', () => {
    expect(isGitRepo(repo.dir)).toBe(true);
    expect(isGitRepo(tmpdir())).toBe(false);
  });
  it('repoRoot resolves the fixture root', () => {
    // realpath both sides: macOS/Linux tmpdirs may be symlinked
    expect(realpathSync(repoRoot(repo.dir))).toBe(realpathSync(repo.dir));
  });
  it('shortHead returns a short sha', () => {
    expect(shortHead(repo.dir)).toMatch(/^[0-9a-f]{6,12}$/);
  });
  it('returns true for installed commands, false for missing ones', () => {
    expect(hasCmd('git')).toBe(true);
    expect(hasCmd('definitely-not-a-real-binary-xyz')).toBe(false);
  });
});
