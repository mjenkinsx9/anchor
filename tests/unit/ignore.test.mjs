import { describe, it, expect } from 'vitest';
import { isIgnored, filterIgnored, matchesScope, isValidGlob, normalize, DEFAULT_IGNORE_DIRS } from '../../lib/ignore.mjs';

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

describe('matchesScope', () => {
  it('default (undefined) scope matches any changed path', () => {
    expect(matchesScope(undefined, ['src/anything.ts'])).toBe(true);
    expect(matchesScope('**', ['src/anything.ts'])).toBe(true);
  });
  it('a scoped glob matches only paths under it', () => {
    expect(matchesScope('src/db/**', ['src/db/users.ts'])).toBe(true);
    expect(matchesScope('src/db/**', ['src/ui/button.tsx'])).toBe(false);
  });
  it('normalizes a leading ./ on changed paths', () => {
    expect(matchesScope('src/db/**', ['./src/db/users.ts'])).toBe(true);
  });
  it('a non-string (uncompilable) scope is treated as no-match, never throws', () => {
    // minimatch throws on a non-string pattern (e.g. `scope: 123` from YAML).
    expect(() => matchesScope(/** @type {any} */ (123), ['src/a.ts'])).not.toThrow();
    expect(matchesScope(/** @type {any} */ (123), ['src/a.ts'])).toBe(false);
  });
});

describe('isValidGlob', () => {
  it('accepts string globs (minimatch tolerates odd-but-string patterns)', () => {
    expect(isValidGlob('src/**')).toBe(true);
    expect(isValidGlob('[')).toBe(true); // minimatch treats an unclosed bracket literally
  });
  it('rejects a non-string scope (minimatch throws on those)', () => {
    expect(isValidGlob(/** @type {any} */ (123))).toBe(false);
    expect(isValidGlob(/** @type {any} */ (null))).toBe(false);
  });
});

describe('normalize', () => {
  it('strips a single leading ./', () => {
    expect(normalize('./src/a.ts')).toBe('src/a.ts');
    expect(normalize('src/a.ts')).toBe('src/a.ts');
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
