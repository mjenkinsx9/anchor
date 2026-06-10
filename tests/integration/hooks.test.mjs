import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'hooks', 'pre-push');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('hooks/pre-push', () => {
  it('prints the reminder and exits 0', () => {
    const r = spawnSync('bash', [HOOK, 'origin', 'git@github.com:me/repo.git'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[anchor]');
    expect(r.stdout).toContain('/anchor review');
    expect(r.stdout).toContain('/anchor status');
  });
  it('is silent when ANCHOR_NO_REMIND=1', () => {
    const r = spawnSync('bash', [HOOK, 'origin', 'url'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
      env: { ...process.env, ANCHOR_NO_REMIND: '1' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
  it('a real git push triggers it without blocking', () => {
    // a bare repo as the remote — pushing to a non-bare checkout is refused by git
    const remote = mkdtempSync(join(tmpdir(), 'anchor-remote-'));
    spawnSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
    copyFileSync(HOOK, join(repo.dir, '.git', 'hooks', 'pre-push'));
    chmodSync(join(repo.dir, '.git', 'hooks', 'pre-push'), 0o755);
    const r = spawnSync('git', ['push', '--dry-run', remote, 'main'], {
      cwd: repo.dir, encoding: 'utf8',
    });
    rmSync(remote, { recursive: true, force: true });
    rmSync(join(repo.dir, '.git', 'hooks', 'pre-push'), { force: true });
    expect(r.status).toBe(0); // push not blocked
    expect(r.stdout + r.stderr).toContain('[anchor]');
  });
});

describe('make install-hook / uninstall-hook', () => {
  function make(target, cwd, extra = []) {
    return spawnSync('make', ['-f', join(ROOT, 'Makefile'), target, ...extra], { cwd, encoding: 'utf8' });
  }
  it('installs into the current repo and is idempotent-guarded', () => {
    const r1 = make('install-hook', repo.dir);
    expect(r1.status).toBe(0);
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-push'))).toBe(true);
    const r2 = make('install-hook', repo.dir); // already exists, no FORCE
    expect(r2.status).not.toBe(0);
    expect(r2.stdout + r2.stderr).toContain('already exists');
    const r3 = make('install-hook', repo.dir, ['FORCE=1']);
    expect(r3.status).toBe(0);
  });
  it('uninstall removes the hook', () => {
    const r = make('uninstall-hook', repo.dir);
    expect(r.status).toBe(0);
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-push'))).toBe(false);
  });
  it('bails outside a git repo', () => {
    const r = make('install-hook', '/tmp');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('must be run from inside a git repo');
  });
  it('uninstall-hook refuses to delete a non-anchor pre-push hook', () => {
    const hookPath = join(repo.dir, '.git', 'hooks', 'pre-push');
    const customContent = '#!/bin/sh\necho mine\n';
    writeFileSync(hookPath, customContent, { mode: 0o755 });
    try {
      const r = make('uninstall-hook', repo.dir);
      expect(r.status).not.toBe(0);
      expect(existsSync(hookPath)).toBe(true);
      expect(readFileSync(hookPath, 'utf8')).toBe(customContent);
    } finally {
      rmSync(hookPath, { force: true });
    }
  });
  it('uninstall-hook reports cleanly when no hook installed', () => {
    const hookPath = join(repo.dir, '.git', 'hooks', 'pre-push');
    rmSync(hookPath, { force: true }); // ensure absent
    const r = make('uninstall-hook', repo.dir);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain('no pre-push hook installed');
  });
});
