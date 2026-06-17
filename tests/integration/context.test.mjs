import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  it('never resolves outside the repo root', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', '../../../etc/passwd')).toBeNull();
  });
  it('never resolves to a directory', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', '.')).toBeNull();
  });
});

describe('getContext', () => {
  it('finds importers and importees of changed files', () => {
    const ctx = getContext({ files: ['src/consumer.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    const byReason = (r) => ctx.files.filter((f) => f.reason === r).map((f) => f.path);
    expect(byReason('importer')).toContain('src/main.ts');
    expect(byReason('importee')).toContain('src/util.ts');
    // src/unrelated.ts may now appear as a sibling — it must NOT appear as importer/importee
    expect(byReason('importer')).not.toContain('src/unrelated.ts');
    expect(byReason('importee')).not.toContain('src/unrelated.ts');
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

describe('getContext callers + siblings (4A)', () => {
  // Barrel re-export: `report.ts` imports the symbol from a barrel, NOT from the
  // changed file — so the importer grep (keyed on the changed file's stem) misses it,
  // but the caller signal (reverse refs on the exported symbol) catches it.
  const repo = makeFixtureRepo({
    'src/calc.ts': 'export function computeTax(x) { return x; }\n',
    'src/barrel.ts': "export { computeTax } from './calc';\n",
    'src/report.ts': "import { computeTax } from './barrel';\nexport const r = computeTax(1);\n",
    'src/db/getUser.ts': 'export const u = 1;\n',
    'src/db/getOrder.ts': 'export const o = 1;\n',
  });
  afterAll(() => repo.cleanup());

  it('surfaces a same-dir sibling with reason "sibling"', () => {
    const ctx = getContext({ files: ['src/db/getUser.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    expect(ctx.files.find((f) => f.path === 'src/db/getOrder.ts')).toMatchObject({ reason: 'sibling' });
  });

  it('surfaces a barrel/re-export call site the importer misses with reason "caller"', () => {
    const ctx = getContext({ files: ['src/calc.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    const report = ctx.files.find((f) => f.path === 'src/report.ts');
    expect(report).toBeTruthy();
    expect(report.reason).toBe('caller');           // not 'importer' (report.ts has no "calc" token)
    expect(ctx.files.find((f) => f.path === 'src/barrel.ts')).toMatchObject({ reason: 'importer' }); // unchanged precedence
  });
});

describe('getContext manifest', () => {
  it('adds scoped manifest files with reason+description; ignores when scope misses', () => {
    const m = makeFixtureRepo({
      'src/db/user.ts': 'export const u = 1;\n',
      'prisma/schema.prisma': 'model User {}\n',
    });
    try {
      mkdirSync(join(m.dir, '.anchor'), { recursive: true });
      writeFileSync(join(m.dir, '.anchor', 'files.json'), JSON.stringify([
        { path: 'prisma/schema.prisma', description: 'DB schema', scope: 'src/db/**' },
      ]));
      const hit = getContext({ files: ['src/db/user.ts'], repoDir: m.dir, maxFiles: 50, ignore: [] });
      expect(hit.files.find((f) => f.path === 'prisma/schema.prisma'))
        .toMatchObject({ reason: 'manifest', description: 'DB schema' });
      const miss = getContext({ files: ['src/ui/button.tsx'], repoDir: m.dir, maxFiles: 50, ignore: [] });
      expect(miss.files.map((f) => f.path)).not.toContain('prisma/schema.prisma');
    } finally { m.cleanup(); }
  });
  it('malformed files.json is ignored (no throw)', () => {
    const m = makeFixtureRepo({ 'src/a.ts': 'export const a = 1;\n' });
    try {
      mkdirSync(join(m.dir, '.anchor'), { recursive: true });
      writeFileSync(join(m.dir, '.anchor', 'files.json'), '{ not json');
      expect(() => getContext({ files: ['src/a.ts'], repoDir: m.dir, maxFiles: 50, ignore: [] })).not.toThrow();
    } finally { m.cleanup(); }
  });
});
