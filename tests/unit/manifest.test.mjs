import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectManifest, loadManifest } from '../../lib/manifest.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-manifest-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeManifest(value) {
  mkdirSync(join(dir, '.anchor'), { recursive: true });
  writeFileSync(
    join(dir, '.anchor', 'files.json'),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}

describe('selectManifest', () => {
  const M = [{ path: 'prisma/schema.prisma', description: 'DB schema', scope: 'src/db/**' }];

  it('selects entries whose scope matches a changed path', () => {
    expect(selectManifest(M, ['src/db/x.ts'])).toHaveLength(1);
  });

  it('does not select entries whose scope misses every changed path', () => {
    expect(selectManifest(M, ['src/ui/y.tsx'])).toHaveLength(0);
  });

  it('default scope (none) matches any changed path', () => {
    const entries = [{ path: 'docs/ARCHITECTURE.md', description: 'arch notes' }];
    expect(selectManifest(entries, ['literally/anything.go'])).toHaveLength(1);
    expect(selectManifest(entries, ['a/b/c/d.rs'])).toHaveLength(1);
  });

  it('normalizes a leading ./ on changed paths before matching', () => {
    expect(selectManifest(M, ['./src/db/x.ts'])).toHaveLength(1);
  });

  it('is defensive: an invalid scope glob does not throw and is not selected', () => {
    const bad = [{ path: 'x', description: 'd', scope: '[' }];
    let result;
    expect(() => { result = selectManifest(bad, ['x']); }).not.toThrow();
    expect(result).toHaveLength(0);
  });

  it('handles nullish entries without throwing', () => {
    expect(selectManifest(null, ['a'])).toEqual([]);
    expect(selectManifest(undefined, ['a'])).toEqual([]);
  });
});

describe('loadManifest', () => {
  it('missing file → []', () => {
    expect(loadManifest(dir)).toEqual([]);
  });

  it('malformed JSON → []', () => {
    writeManifest('{not json');
    expect(loadManifest(dir)).toEqual([]);
  });

  it('a JSON object (not an array) → []', () => {
    writeManifest({ path: 'a' });
    expect(loadManifest(dir)).toEqual([]);
  });

  it('drops entries lacking a string path', () => {
    writeManifest([
      { path: 'keep.ts', description: 'kept', scope: 'src/**' },
      { description: 'no path' },
      { path: 123 },
      null,
    ]);
    const result = loadManifest(dir);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('keep.ts');
  });

  it('coerces a missing scope to ** and a missing description to ""', () => {
    writeManifest([{ path: 'only-path.ts' }]);
    const [entry] = loadManifest(dir);
    expect(entry).toEqual({ path: 'only-path.ts', description: '', scope: '**' });
  });

  it('coerces non-string scope/description to defaults', () => {
    writeManifest([{ path: 'p.ts', description: 42, scope: false }]);
    const [entry] = loadManifest(dir);
    expect(entry).toEqual({ path: 'p.ts', description: '', scope: '**' });
  });

  it('round-trips through selectManifest', () => {
    writeManifest([{ path: 'schema.prisma', description: 'db', scope: 'src/db/**' }]);
    const loaded = loadManifest(dir);
    expect(selectManifest(loaded, ['src/db/migrate.ts'])).toHaveLength(1);
    expect(selectManifest(loaded, ['src/web/page.tsx'])).toHaveLength(0);
  });
});
