import { describe, it, expect } from 'vitest';
import { isIgnored, filterIgnored, DEFAULT_IGNORE_DIRS } from '../../lib/ignore.mjs';

describe('isIgnored', () => {
  it('matches glob patterns', () => {
    expect(isIgnored('src/a.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(isIgnored('src/a.ts', ['**/*.test.ts'])).toBe(false);
  });
  it('matches directory globs', () => {
    expect(isIgnored('vendor/lib/x.js', ['vendor/**'])).toBe(true);
    expect(isIgnored('node_modules/pkg/index.js', ['node_modules/**'])).toBe(true);
  });
  it('matches dotfiles (dot: true)', () => {
    expect(isIgnored('.git/config', ['.git/**'])).toBe(true);
  });
  it('empty patterns ignore nothing', () => {
    expect(isIgnored('anything.ts', [])).toBe(false);
  });
});

describe('filterIgnored', () => {
  it('removes ignored paths', () => {
    const out = filterIgnored(['a.ts', 'a.test.ts', 'vendor/b.js'], ['**/*.test.ts', 'vendor/**']);
    expect(out).toEqual(['a.ts']);
  });
});

describe('DEFAULT_IGNORE_DIRS', () => {
  it('covers the standard noise dirs', () => {
    for (const dir of ['node_modules', 'dist', '.git', '.anchor']) {
      expect(isIgnored(`${dir}/x`, DEFAULT_IGNORE_DIRS)).toBe(true);
    }
  });
  it('matches deeply nested paths', () => {
    expect(isIgnored('dist/sub/deep/file.js', ['**/dist/**'])).toBe(true);
  });
  it('does not match files whose name merely starts with a dir name', () => {
    expect(isIgnored('node_modules.ts', DEFAULT_IGNORE_DIRS)).toBe(false);
  });
  it('normalizes ./-prefixed paths', () => {
    expect(isIgnored('./vendor/x.js', ['vendor/**'])).toBe(true);
  });
  it('matches nested node_modules in monorepos', () => {
    expect(isIgnored('packages/foo/node_modules/x.js', DEFAULT_IGNORE_DIRS)).toBe(true);
  });
});
