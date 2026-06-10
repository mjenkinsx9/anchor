import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(ROOT, 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

function anchor(args, cwd = repo.dir) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}
const hookPath = () => join(repo.dir, '.git', 'hooks', 'pre-push');

describe('anchor hook install/uninstall', () => {
  it('installs into the current repo and is idempotent-guarded', () => {
    const r1 = anchor(['hook', 'install']);
    expect(r1.status).toBe(0);
    expect(JSON.parse(r1.stdout).installed).toBe(true);
    expect(existsSync(hookPath())).toBe(true);
    const r2 = anchor(['hook', 'install']); // already exists, no --force
    expect(r2.status).not.toBe(0);
    expect(r2.stderr).toContain('already exists');
    const r3 = anchor(['hook', 'install', '--force']);
    expect(r3.status).toBe(0);
  });

  it('installed script prints the reminder and exits 0', () => {
    const r = spawnSync('bash', [hookPath(), 'origin', 'git@github.com:me/repo.git'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[anchor]');
    expect(r.stdout).toContain('/anchor review');
    expect(r.stdout).toContain('/anchor status');
  });

  it('installed script is silent when ANCHOR_NO_REMIND=1', () => {
    const r = spawnSync('bash', [hookPath(), 'origin', 'url'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
      env: { ...process.env, ANCHOR_NO_REMIND: '1' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('a real git push triggers it without blocking', () => {
    const remote = mkdtempSync(join(tmpdir(), 'anchor-remote-'));
    spawnSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
    const r = spawnSync('git', ['push', '--dry-run', remote, 'main'], {
      cwd: repo.dir, encoding: 'utf8',
    });
    rmSync(remote, { recursive: true, force: true });
    expect(r.status).toBe(0); // push not blocked
    expect(r.stdout + r.stderr).toContain('[anchor]');
  });

  it('uninstall removes the hook', () => {
    const r = anchor(['hook', 'uninstall']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).removed).toBe(true);
    expect(existsSync(hookPath())).toBe(false);
  });

  it('bails outside a git repo', () => {
    const out = mkdtempSync(join(tmpdir(), 'anchor-norepo-'));
    const r = anchor(['hook', 'install'], out);
    rmSync(out, { recursive: true, force: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('must be run from inside a git repo');
  });

  it('uninstall refuses to delete a non-anchor pre-push hook', () => {
    const customContent = '#!/bin/sh\necho mine\n';
    writeFileSync(hookPath(), customContent, { mode: 0o755 });
    try {
      const r = anchor(['hook', 'uninstall']);
      expect(r.status).not.toBe(0);
      expect(existsSync(hookPath())).toBe(true);
      expect(readFileSync(hookPath(), 'utf8')).toBe(customContent);
    } finally {
      rmSync(hookPath(), { force: true });
    }
  });

  it('uninstall reports cleanly when no hook installed', () => {
    rmSync(hookPath(), { force: true });
    const r = anchor(['hook', 'uninstall']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).message).toContain('no pre-push hook installed');
  });

  it('--force overwrite of a non-executable file leaves an executable hook', () => {
    writeFileSync(hookPath(), '#!/bin/sh\necho stale\n', { mode: 0o644 });
    try {
      const r = anchor(['hook', 'install', '--force']);
      expect(r.status).toBe(0);
      expect(statSync(hookPath()).mode & 0o111).not.toBe(0);
    } finally {
      rmSync(hookPath(), { force: true });
    }
  });

  it('uninstall recognizes any hook carrying the anchor marker (v0.1.0 compat)', () => {
    writeFileSync(hookPath(), '#!/usr/bin/env bash\n# Anchor pre-push reminder. Git invokes this when `git push` runs.\nexit 0\n', { mode: 0o755 });
    const r = anchor(['hook', 'uninstall']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).removed).toBe(true);
    expect(existsSync(hookPath())).toBe(false);
  });

  it('bare `hook` reports install status instead of erroring', () => {
    const fresh = makeFixtureRepo({ 'b.txt': 'y\n' });
    try {
      const r0 = anchor(['hook'], fresh.dir);
      expect(r0.status).toBe(0);
      expect(JSON.parse(r0.stdout).installed).toBe(false);
      expect(anchor(['hook', 'install'], fresh.dir).status).toBe(0);
      const r1 = anchor(['hook'], fresh.dir);
      expect(r1.status).toBe(0);
      expect(JSON.parse(r1.stdout).installed).toBe(true);
    } finally {
      fresh.cleanup();
    }
  });
});
