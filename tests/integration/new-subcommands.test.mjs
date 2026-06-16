import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');

// A repo with code (for refs) + a README we can change uncommitted (for --from-diff,
// kept .md so no analyzer matches → deterministic empty analyze result regardless of
// what tools happen to be installed on the host).
const repo = makeFixtureRepo({
  'src/a.ts': 'export function helper() { return 1; }\n',
  'src/b.ts': "import { helper } from './a';\nexport const y = helper();\n",
  'README.md': '# project\n',
});
writeFileSync(join(repo.dir, 'README.md'), '# project\nchanged line\n'); // uncommitted change
afterAll(() => repo.cleanup());

function anchor(args, cwd = repo.dir) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('anchor refs', () => {
  it('finds references to a symbol', () => {
    const r = anchor(['refs', 'helper']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.symbol).toBe('helper');
    expect(out.references.map((x) => x.file)).toEqual(expect.arrayContaining(['src/a.ts', 'src/b.ts']));
  });
  it('errors with a helpful message when no symbol is given', () => {
    const r = anchor(['refs']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/refs needs a symbol/);
  });
});

describe('anchor analyze (async dispatch)', () => {
  it('returns valid JSON with tools/findings arrays and exits 0', () => {
    const r = anchor(['analyze', '--from-diff', 'uncommitted']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.tools)).toBe(true);
    expect(Array.isArray(out.findings)).toBe(true);
    // only README.md changed → no analyzer matches → nothing ran, no findings
    expect(out.findings).toEqual([]);
    expect(out.tools).toEqual([]);
  });
});

describe('anchor rules', () => {
  it('returns prose + scoped rules (empty by default)', () => {
    const r = anchor(['rules', '--from-diff', 'uncommitted']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toEqual({ prose: null, rules: [] });
  });
});

describe('anchor context --staged', () => {
  it('resolves staged changes (not only --from-diff)', () => {
    const r2 = makeFixtureRepo({
      'src/util.ts': 'export const x = 1;\n',
      'src/consumer.ts': "import { x } from './util';\nexport const y = x;\n",
    });
    try {
      writeFileSync(join(r2.dir, 'src/consumer.ts'), "import { x } from './util';\nexport const y = x + 1;\n");
      r2.git('add', 'src/consumer.ts');
      const r = anchor(['context', '--staged'], r2.dir);
      expect(r.status).toBe(0);
      // staged change to consumer.ts → its importee util.ts is found (was empty before the fix)
      expect(JSON.parse(r.stdout).files.map((f) => f.path)).toContain('src/util.ts');
    } finally { r2.cleanup(); }
  });
});

describe('anchor learn list --from-diff (scoped)', () => {
  it('returns only learnings whose scope matches the changed files', () => {
    anchor(['learn', 'add', 'DB pattern', '--reason', 'x', '--scope', 'src/db/**']);
    anchor(['learn', 'add', 'Global pattern', '--reason', 'y']); // scope **
    // Only README.md changed → the src/db-scoped learning is filtered out.
    const r = anchor(['learn', 'list', '--from-diff', 'uncommitted']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.patterns.map((p) => p.heading)).toEqual(['Global pattern']);
  });
});
