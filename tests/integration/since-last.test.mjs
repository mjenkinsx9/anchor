import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { sinceLastRange } from '../../lib/diff.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');

describe('sinceLastRange', () => {
  it('no prior SHA → fallback', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      expect(sinceLastRange(repo.dir, undefined)).toMatchObject({ mode: 'fallback' });
      expect(sinceLastRange(repo.dir, null).reason).toMatch(/no prior review/i);
    } finally { repo.cleanup(); }
  });

  it('reachable ancestor SHA → range <sha>..HEAD', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      const sha = repo.git('rev-parse', '--short', 'HEAD').trim();
      writeFiles(repo.dir, { 'b.ts': 'export const b = 2;\n' });
      commitAll(repo.dir, 'second');
      expect(sinceLastRange(repo.dir, sha)).toEqual({ mode: 'range', range: `${sha}..HEAD` });
    } finally { repo.cleanup(); }
  });

  it('unreachable SHA (rebased/pruned) → fallback with a reason', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      const r = sinceLastRange(repo.dir, 'deadbeef');
      expect(r.mode).toBe('fallback');
      expect(r.reason).toMatch(/unreachable/i);
    } finally { repo.cleanup(); }
  });

  it('non-ancestor SHA (divergent history) → fallback', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      // sibling branch with a commit that is NOT an ancestor of main's HEAD
      repo.git('checkout', '-b', 'side');
      writeFiles(repo.dir, { 'side.ts': 'export const s = 1;\n' });
      commitAll(repo.dir, 'side commit');
      const sideSha = repo.git('rev-parse', '--short', 'HEAD').trim();
      repo.git('checkout', 'main');
      writeFiles(repo.dir, { 'main2.ts': 'export const m = 1;\n' });
      commitAll(repo.dir, 'main advance');
      expect(sinceLastRange(repo.dir, sideSha)).toMatchObject({ mode: 'fallback' });
    } finally { repo.cleanup(); }
  });
});

function anchor(args, cwd, input) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8', input });
}

describe('anchor diff --since-last (CLI)', () => {
  it('no prior review → falls back to the full diff with a warning', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      writeFileSync(join(repo.dir, 'a.ts'), 'export const a = 2;\n'); // uncommitted
      const r = anchor(['diff', '--since-last'], repo.dir);
      expect(r.status).toBe(0);
      const d = JSON.parse(r.stdout);
      expect(d.sinceLast).toMatchObject({ applied: false });
      expect(d.files.map((f) => f.path)).toContain('a.ts'); // full working diff
      expect(r.stderr).toMatch(/since-last fell back/i);
    } finally { repo.cleanup(); }
  });

  it('prior review present → range diff since that SHA', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      // Archive a review while HEAD is the first commit → frontmatter sha == that commit.
      anchor(['review', 'save'], repo.dir, '# prior review\nbody\n');
      writeFiles(repo.dir, { 'b.ts': 'export const b = 2;\n' });
      // Stage ONLY b.ts. `review save` created an untracked .gitignore (via ensureGitignore);
      // a `git add -A` would commit it into this commit and pollute the <sha>..HEAD range.
      // The review file itself lands under the now-ignored .anchor/reviews/.
      repo.git('add', 'b.ts');
      repo.git('commit', '-m', 'add b after the review');
      const r = anchor(['diff', '--since-last'], repo.dir);
      expect(r.status).toBe(0);
      const d = JSON.parse(r.stdout);
      expect(d.sinceLast).toMatchObject({ applied: true });
      expect(d.files.map((f) => f.path)).toEqual(['b.ts']); // only what changed since the review
    } finally { repo.cleanup(); }
  });
});
