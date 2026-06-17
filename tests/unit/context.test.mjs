import { describe, it, expect, afterAll } from 'vitest';
import { parseExports, findSiblings } from '../../lib/context.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

describe('parseExports', () => {
  it('captures JS/TS function, class, const/let/var, async, and default exports', () => {
    const src = [
      'export function alpha() {}',
      'export async function beta() {}',
      'export const gamma = 1;',
      'export let delta = 2;',
      'export class Epsilon {}',
      'export default function zeta() {}',
    ].join('\n');
    expect(parseExports(src, '.ts').sort()).toEqual(['Epsilon', 'alpha', 'beta', 'delta', 'gamma', 'zeta'].sort());
  });

  it('captures named re-exports including the exported-as name', () => {
    const src = "export { foo, bar as baz } from './x';\n";
    expect(parseExports(src, '.ts').sort()).toEqual(['baz', 'foo']);
  });

  it('captures top-level Python def/class', () => {
    const src = 'def handler_fn():\n    pass\nclass Widget:\n    pass\n';
    expect(parseExports(src, '.py').sort()).toEqual(['Widget', 'handler_fn']);
  });

  it('returns [] for unknown extensions', () => {
    expect(parseExports('export function x(){}', '.txt')).toEqual([]);
  });
});

describe('findSiblings', () => {
  const repo = makeFixtureRepo({
    'src/db/getUser.ts': 'export const u = 1;\n',
    'src/db/getUserProfile.ts': 'export const p = 1;\n',
    'src/db/getOrder.ts': 'export const o = 1;\n',
    'src/db/notes.md': '# notes\n',           // non-code, excluded
    'src/other/elsewhere.ts': 'export const e = 1;\n',
  });
  afterAll(() => repo.cleanup());

  it('ranks same-dir code files by shared filename-prefix, then alphabetically', () => {
    const sibs = findSiblings(repo.dir, 'src/db/getUser.ts', { max: 5 });
    expect(sibs).toEqual(['src/db/getUserProfile.ts', 'src/db/getOrder.ts']); // prefix 7 before 3; md excluded; self excluded; other dir excluded
  });

  it('honors the exclude set and the max cap', () => {
    const sibs = findSiblings(repo.dir, 'src/db/getUser.ts', { max: 1, exclude: new Set(['src/db/getUserProfile.ts']) });
    expect(sibs).toEqual(['src/db/getOrder.ts']);
  });

  it('returns [] for a directory with no other code files', () => {
    expect(findSiblings(repo.dir, 'src/other/elsewhere.ts', { max: 5 })).toEqual([]);
  });
});
