import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({
  'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
  'src/b.ts': 'export const b = 1;\n',
});
afterAll(() => repo.cleanup());

function anchor(args, opts = {}) {
  return spawnSync('node', [BIN, ...args], { cwd: opts.cwd ?? repo.dir, encoding: 'utf8', input: opts.input });
}

describe('anchor CLI end-to-end', () => {
  it('diff: structured JSON for uncommitted changes', () => {
    writeFileSync(join(repo.dir, 'src/a.ts'), "import { b } from './b';\nexport const a = b + 1;\n");
    const r = anchor(['diff']);
    const d = JSON.parse(r.stdout);
    expect(d.mode).toBe('uncommitted');
    expect(d.files[0].path).toBe('src/a.ts');
  });
  it('diff: bails with hint when over max_diff_lines', () => {
    writeFileSync(join(repo.dir, 'src/big.ts'), 'export const big = [\n' + '1,\n'.repeat(3000) + '];\n');
    repo.git('add', '-A');
    const r = anchor(['diff']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/diff is [\d,]+ lines \(max is 2,?000\)/);
    repo.git('reset');
    repo.git('checkout', '--', '.');
    repo.git('clean', '-f', 'src/big.ts');
  });
  it('context: --from-diff finds related files', () => {
    writeFileSync(join(repo.dir, 'src/a.ts'), "import { b } from './b';\nexport const a = b + 2;\n");
    const r = anchor(['context', '--from-diff', '--max-files', '10']);
    const c = JSON.parse(r.stdout);
    expect(c.files.map((f) => f.path)).toContain('src/b.ts');
  });
  it('learn: add / list / remove round-trip + gitignore side-effect', () => {
    expect(anchor(['learn', 'add', 'Noise pattern X', '--reason', 'testing']).status).toBe(0);
    const list = JSON.parse(anchor(['learn', 'list']).stdout);
    expect(list.patterns[0].heading).toBe('Noise pattern X');
    expect(readFileSync(join(repo.dir, '.gitignore'), 'utf8')).toContain('.anchor/learnings.md');
    expect(JSON.parse(anchor(['learn', 'remove', 'noise pattern']).stdout).removed).toBe(1);
  });
  it('learn: duplicate add reports dedupe on stderr', () => {
    anchor(['learn', 'add', 'Dup pattern']);
    const r = anchor(['learn', 'add', 'Dup pattern']);
    expect(r.stderr).toContain('already in learnings');
  });
  it('review save: reads stdin, archives with frontmatter', () => {
    const r = anchor(['review', 'save'], { input: '# A review\nbody\n' });
    const { path } = JSON.parse(r.stdout);
    expect(existsSync(path)).toBe(true);
    const shown = anchor(['review', 'list']);
    expect(JSON.parse(shown.stdout).length).toBeGreaterThanOrEqual(1);
  });
  it('status: json and text', () => {
    const j = JSON.parse(anchor(['status']).stdout);
    expect(j).toHaveProperty('nextSuggestion');
    const t = anchor(['status', '--format', 'text']);
    expect(t.stdout).toContain('Anchor Status');
  });
  it('init: emits raw data payload', () => {
    const r = anchor(['init', '--no-prs']);
    const d = JSON.parse(r.stdout);
    expect(d.structure.fileCount).toBeGreaterThan(0);
    expect(d.dependencyGraph.modules.length).toBeGreaterThan(0);
  });
  it('bails outside a git repo', () => {
    const r = anchor(['diff'], { cwd: '/tmp' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git repository');
  });
  it('diff: stats reflect the ignore-filtered file set', () => {
    // Modify a tracked file so there is a real diff
    writeFileSync(join(repo.dir, 'src/a.ts'), "import { b } from './b';\nexport const a = b + 3;\n");
    // Create a file matching the default **/*.lock ignore pattern
    const lockFile = join(repo.dir, 'noise.lock');
    writeFileSync(lockFile, 'locked content\n');
    repo.git('add', '-N', 'noise.lock');
    try {
      const r = anchor(['diff']);
      expect(r.status).toBe(0);
      const d = JSON.parse(r.stdout);
      // The .lock file must not appear in files
      expect(d.files.map((f) => f.path)).not.toContain('noise.lock');
      // stats must match the filtered file list
      expect(d.stats.fileCount).toBe(d.files.length);
      const expectedAdded = d.files.reduce((s, f) => s + f.added, 0);
      expect(d.stats.totalAdded).toBe(expectedAdded);
    } finally {
      // Restore tracked file and remove the lock file so later tests are unaffected
      repo.git('restore', '--staged', '--', 'noise.lock');
      rmSync(lockFile, { force: true });
      repo.git('checkout', '--', 'src/a.ts');
    }
  });
  it('review save: custom path creates parent dirs', () => {
    const customPath = join(repo.dir, '.anchor', 'deep', 'nested', 'r.md');
    const r = anchor(['review', 'save', customPath], { input: '# Custom path review\nbody\n' });
    expect(r.status).toBe(0);
    expect(existsSync(customPath)).toBe(true);
  });
});
