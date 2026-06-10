import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
});
