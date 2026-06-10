import { describe, it, expect } from 'vitest';
import { parseTarget, parseUnifiedDiff } from '../../lib/diff.mjs';

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
});
