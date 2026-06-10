import { describe, it, expect, afterAll } from 'vitest';
import { runDoctor } from '../../lib/doctor.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import { tmpdir } from 'node:os';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('runDoctor', () => {
  it('returns a check for each diagnostic', () => {
    const { checks } = runDoctor({ cwd: repo.dir });
    const names = checks.map((c) => c.name);
    for (const expected of ['git', 'gh', 'repo', 'bundle', 'plugin install', 'config', 'claude code', 'node']) {
      expect(names).toContain(expected);
    }
  });
  it('git, repo, node pass in a fixture repo', () => {
    const { checks } = runDoctor({ cwd: repo.dir });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName.git.ok).toBe(true);
    expect(byName.repo.ok).toBe(true);
    expect(byName.node.ok).toBe(true);
  });
  it('repo check fails outside a git repo', () => {
    const { checks } = runDoctor({ cwd: tmpdir() });
    const repoCheck = checks.find((c) => c.name === 'repo');
    expect(repoCheck.ok).toBe(false);
    expect(repoCheck.level).toBe('error');
  });
  it('overall ok ignores warn-level failures', () => {
    const { ok, checks } = runDoctor({ cwd: repo.dir });
    const errorFails = checks.filter((c) => !c.ok && c.level === 'error');
    expect(ok).toBe(errorFails.length === 0);
  });
  it('every failing check has a fix hint', () => {
    const { checks } = runDoctor({ cwd: tmpdir() });
    for (const c of checks.filter((c) => !c.ok)) expect(c.fix).toBeTruthy();
  });
  it('overall ok is false when an error-level check fails', () => {
    const { ok } = runDoctor({ cwd: tmpdir() });
    expect(ok).toBe(false);
  });
});
