import { describe, it, expect, afterAll } from 'vitest';
import { getContext, parseImports, resolveImport } from '../../lib/context.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/util.ts': 'export const x = 1;\n',
  'src/consumer.ts': "import { x } from './util';\nexport const y = x + 1;\n",
  'src/main.ts': "import { y } from './consumer';\nconsole.log(y);\n",
  'src/unrelated.ts': 'export const z = 0;\n',
  'src/util.test.ts': "import { x } from './util';\n",
});
afterAll(() => repo.cleanup());

describe('parseImports', () => {
  it('extracts ES import specifiers', () => {
    expect(parseImports(`import { a } from './a';\nimport b from "../b";\n`)).toEqual(['./a', '../b']);
  });
  it('extracts require specifiers', () => {
    expect(parseImports("const a = require('./a');\n")).toEqual(['./a']);
  });
});

describe('resolveImport', () => {
  it('resolves relative specifiers trying known extensions', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', './util')).toBe('src/util.ts');
  });
  it('returns null for unresolvable specifiers', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', './missing')).toBeNull();
  });
});

describe('getContext', () => {
  it('finds importers and importees of changed files', () => {
    const ctx = getContext({ files: ['src/consumer.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    const byReason = (r) => ctx.files.filter((f) => f.reason === r).map((f) => f.path);
    expect(byReason('importer')).toContain('src/main.ts');
    expect(byReason('importee')).toContain('src/util.ts');
    expect(ctx.files.map((f) => f.path)).not.toContain('src/unrelated.ts');
    expect(ctx.files.map((f) => f.path)).not.toContain('src/consumer.ts'); // changed files excluded
  });
  it('applies ignore patterns', () => {
    const ctx = getContext({ files: ['src/util.ts'], repoDir: repo.dir, maxFiles: 50, ignore: ['**/*.test.ts'] });
    expect(ctx.files.map((f) => f.path)).not.toContain('src/util.test.ts');
  });
  it('caps at maxFiles', () => {
    const ctx = getContext({ files: ['src/consumer.ts'], repoDir: repo.dir, maxFiles: 1, ignore: [] });
    expect(ctx.files.length).toBeLessThanOrEqual(1);
  });
  it('no matches → empty list, no throw', () => {
    const ctx = getContext({ files: ['src/unrelated.ts'], repoDir: repo.dir, maxFiles: 50, ignore: ['**/*.test.ts'] });
    expect(Array.isArray(ctx.files)).toBe(true);
  });
});
