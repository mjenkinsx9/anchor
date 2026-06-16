import { describe, it, expect } from 'vitest';
import { parseTarget, parseUnifiedDiff, applyBudget, withStats } from '../../lib/diff.mjs';

describe('parseTarget', () => {
  it('no args → uncommitted', () => {
    expect(parseTarget([])).toEqual({ mode: 'uncommitted' });
  });
  it('ref range → ref-diff', () => {
    expect(parseTarget(['main..feature/foo'])).toEqual({
      mode: 'ref-diff', ref1: 'main', ref2: 'feature/foo', range: 'main..feature/foo',
    });
  });
  it('three-dot range preserved', () => {
    expect(parseTarget(['main...dev']).range).toBe('main...dev');
  });
  it('pr number', () => {
    expect(parseTarget(['pr', '123'])).toEqual({ mode: 'pr', selector: '123' });
  });
  it('pr url', () => {
    const t = parseTarget(['pr', 'https://github.com/me/repo/pull/77']);
    expect(t.mode).toBe('pr');
    expect(t.selector).toBe('https://github.com/me/repo/pull/77');
  });
  it('@file → file mode', () => {
    expect(parseTarget(['@src/a.ts'])).toEqual({ mode: 'file', path: 'src/a.ts' });
  });
  it('unrecognized → throws', () => {
    expect(() => parseTarget(['wat'])).toThrow(/unrecognized target/);
  });
  it('accepts explicit uncommitted/staged words (round-trips the diff JSON mode)', () => {
    expect(parseTarget(['uncommitted'])).toEqual({ mode: 'uncommitted' });
    expect(parseTarget(['staged'])).toEqual({ mode: 'staged' });
  });
});

describe('parseUnifiedDiff', () => {
  const SAMPLE = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 111..222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' line1',
    '-line2',
    '+line2changed',
    '+line2b',
    ' line3',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    '',
  ].join('\n');

  it('parses files, hunks, and counts', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files).toHaveLength(2);
    const [a, gone] = files;
    expect(a.path).toBe('src/a.ts');
    expect(a.added).toBe(2);
    expect(a.removed).toBe(1);
    expect(a.hunks).toHaveLength(1);
    expect(a.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4 });
    expect(a.hunks[0].body).toContain('+line2changed');
  });
  it('uses the old path for deleted files', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].path).toBe('gone.txt');
    expect(files[1].removed).toBe(1);
  });
  it('hunk headers without explicit counts default to 1', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].hunks[0].oldLines).toBe(1);
    expect(files[1].hunks[0].newLines).toBe(0);
  });
  it('empty input → empty array', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
  it('emits a record for binary files', () => {
    const diff = [
      'diff --git a/logo.png b/logo.png',
      'index 111..222 100644',
      'Binary files a/logo.png and b/logo.png differ',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'logo.png', binary: true, hunks: [] });
  });
  it('emits a record for pure renames', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 100%',
      'rename from old.ts',
      'rename to new.ts',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'new.ts', renamedFrom: 'old.ts', hunks: [] });
  });
  it('emits a record for mode-change-only entries', () => {
    const diff = [
      'diff --git a/run.sh b/run.sh',
      'old mode 100644',
      'new mode 100755',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'run.sh', modeChange: true });
  });
  it('does not mistake body lines starting with --- or +++ for headers', () => {
    const diff = [
      'diff --git a/doc.md b/doc.md',
      '--- a/doc.md',
      '+++ b/doc.md',
      '@@ -1,3 +1,3 @@',
      ' context',
      '---removed dashes line',
      '+++added plus line',
      ' end',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].added).toBe(1);
    expect(files[0].removed).toBe(1);
    expect(files[0].hunks[0].body).toContain('---removed dashes line');
  });
  it('rename with content change attributes hunks to the new path', () => {
    const diff = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 90%',
      'rename from old.ts',
      'rename to new.ts',
      '--- a/old.ts',
      '+++ b/new.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('new.ts');
    expect(files[0].renamedFrom).toBe('old.ts');
  });
});

describe('applyBudget', () => {
  const mk = (files) => withStats({ mode: 'uncommitted', files });

  it('flags overBudget when change-lines exceed the budget', () => {
    const r = applyBudget(mk([{ path: 'a', added: 60, removed: 50, hunks: [] }]), { maxLines: 100, maxFiles: 100 });
    expect(r.overBudget).toBe(true);
    expect(r.budgetWarning).toMatch(/change-lines/);
    expect(r.files).toHaveLength(1); // diff still present — graceful, not dropped
  });

  it('flags overBudget when the file count exceeds the budget', () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}`, added: 1, removed: 0, hunks: [] }));
    const r = applyBudget(mk(files), { maxLines: 10000, maxFiles: 5 });
    expect(r.overBudget).toBe(true);
    expect(r.budgetWarning).toMatch(/files/);
  });

  it('does not flag a diff within budget', () => {
    const r = applyBudget(mk([{ path: 'a', added: 1, removed: 1, hunks: [] }]), { maxLines: 100, maxFiles: 100 });
    expect(r.overBudget).toBeUndefined();
    expect(r.budgetWarning).toBeUndefined();
  });

  it('--force suppresses the flag even when over budget', () => {
    const r = applyBudget(mk([{ path: 'a', added: 999, removed: 0, hunks: [] }]), { maxLines: 1, maxFiles: 1, force: true });
    expect(r.overBudget).toBeUndefined();
  });
});
