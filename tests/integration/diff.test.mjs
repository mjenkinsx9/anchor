import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { getDiff } from '../../lib/diff.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/a.ts': 'const a = 1;\nexport default a;\n',
  'src/b.ts': 'export const b = 2;\n',
});
afterAll(() => repo.cleanup());

describe('getDiff local modes', () => {
  it('uncommitted: detects working-tree edits vs HEAD', () => {
    writeFileSync(join(repo.dir, 'src/a.ts'), 'const a = 42;\nexport default a;\n');
    const d = getDiff([], { cwd: repo.dir });
    expect(d.mode).toBe('uncommitted');
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(d.stats.fileCount).toBe(1);
    expect(d.files[0].added).toBeGreaterThan(0);
  });
  it('staged: only staged changes', () => {
    repo.git('add', 'src/a.ts');
    writeFileSync(join(repo.dir, 'src/b.ts'), 'export const b = 3;\n'); // unstaged
    const d = getDiff(['--staged'], { cwd: repo.dir });
    expect(d.mode).toBe('staged');
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });
  it('ref-diff between branches', () => {
    commitAll(repo.dir, 'wip changes');
    repo.git('checkout', '-b', 'feature');
    writeFiles(repo.dir, { 'src/c.ts': 'export const c = 9;\n' });
    commitAll(repo.dir, 'add c');
    const d = getDiff(['main..feature'], { cwd: repo.dir });
    expect(d.mode).toBe('ref-diff');
    expect(d.ref1).toBe('main');
    expect(d.ref2).toBe('feature');
    expect(d.files.map((f) => f.path)).toEqual(['src/c.ts']);
  });
  it('file mode returns whole file as one hunk', () => {
    const d = getDiff(['@src/a.ts'], { cwd: repo.dir });
    expect(d.mode).toBe('file');
    expect(d.files[0].hunks).toHaveLength(1);
    expect(d.files[0].hunks[0].body).toContain('const a = 42;');
  });
  it('file mode on a missing file throws', () => {
    expect(() => getDiff(['@nope.ts'], { cwd: repo.dir })).toThrow(/file not found/);
  });
  it('bad ref surfaces git stderr', () => {
    expect(() => getDiff(['nope..alsonope'], { cwd: repo.dir })).toThrow(/git diff failed/);
  });
  it('uncommitted: includes brand-new untracked files', () => {
    writeFiles(repo.dir, { 'src/brand-new.ts': 'export const fresh = 1;\n' });
    const d = getDiff([], { cwd: repo.dir });
    expect(d.files.map((f) => f.path)).toContain('src/brand-new.ts');
    // the intent-to-add marker must be cleaned up afterwards:
    const status = repo.git('status', '--porcelain');
    expect(status).toContain('?? src/brand-new.ts');
    repo.git('clean', '-f', 'src/brand-new.ts');
  });
  it('file mode counts lines without trailing-newline inflation', () => {
    writeFiles(repo.dir, { 'three.txt': 'a\nb\nc\n' });
    const d = getDiff(['@three.txt'], { cwd: repo.dir });
    expect(d.files[0].added).toBe(3);
    repo.git('clean', '-f', 'three.txt');
  });
  it('uncommitted on a zero-commit repo throws a friendly error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anchor-empty-'));
    spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
    try {
      expect(() => getDiff([], { cwd: dir })).toThrow(/no commits yet/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
