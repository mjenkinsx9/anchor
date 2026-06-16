import { describe, it, expect, afterAll } from 'vitest';
import { findRefs } from '../../lib/refs.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/a.ts': 'export function helper() { return 1; }\n',
  'src/b.ts': "import { helper } from './a';\nexport const y = helper();\n",
  'src/c.ts': 'const $foo = 42;\nexport const z = $foo + 1;\n',
});
afterAll(() => repo.cleanup());

describe('findRefs', () => {
  it('finds all references (definitions + calls) across code files', () => {
    const res = findRefs(repo.dir, 'helper');
    expect(res.symbol).toBe('helper');
    expect(res.references.map((x) => x.file)).toEqual(
      expect.arrayContaining(['src/a.ts', 'src/b.ts']),
    );
    expect(res.count).toBeGreaterThanOrEqual(2);
    expect(res.count).toBe(res.references.length);
    for (const ref of res.references) {
      expect(typeof ref.line).toBe('number');
      expect(Number.isInteger(ref.line)).toBe(true);
      expect(ref.line).toBeGreaterThan(0);
      expect(typeof ref.text).toBe('string');
      // text is trimmed: no leading/trailing whitespace
      expect(ref.text).toBe(ref.text.trim());
    }
  });

  it('throws on a non-identifier symbol', () => {
    expect(() => findRefs(repo.dir, 'a.b()')).toThrow(/valid identifier/);
    expect(() => findRefs(repo.dir, 'foo bar')).toThrow(/valid identifier/);
    expect(() => findRefs(repo.dir, '')).toThrow(/valid identifier/);
  });

  it('returns empty for an unknown symbol without throwing', () => {
    const res = findRefs(repo.dir, 'noSuchSymbolXyz');
    expect(res.count).toBe(0);
    expect(res.references).toEqual([]);
    expect(res.symbol).toBe('noSuchSymbolXyz');
  });

  it('escapes regex-special chars in valid identifiers (e.g. $foo)', () => {
    const res = findRefs(repo.dir, '$foo');
    expect(res.symbol).toBe('$foo');
    expect(res.references.map((x) => x.file)).toEqual(
      expect.arrayContaining(['src/c.ts']),
    );
    expect(res.count).toBeGreaterThanOrEqual(2);
  });
});
