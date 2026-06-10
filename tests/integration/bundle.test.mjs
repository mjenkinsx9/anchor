import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist', 'anchor.mjs');

describe('dist/anchor.mjs bundle', () => {
  it('is fresh — rebuilding with the pinned esbuild reproduces the committed file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'anchor-bundle-'));
    const out = join(tmp, 'anchor.mjs');
    // Flags must match the "bundle" script in package.json — keep in sync.
    const r = spawnSync('pnpm', ['exec', 'esbuild', join(ROOT, 'bin', 'anchor.mjs'),
      '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`],
      { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const rebuilt = readFileSync(out, 'utf8');
    rmSync(tmp, { recursive: true, force: true });
    expect(readFileSync(DIST, 'utf8')).toBe(rebuilt);
  });

  it('runs standalone in a fixture repo (smoke: config validate + diff)', () => {
    const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
    try {
      const c = spawnSync('node', [DIST, 'config', 'validate'], { cwd: repo.dir, encoding: 'utf8' });
      expect(c.status).toBe(0);
      expect(JSON.parse(c.stdout).valid).toBe(true);
      const d = spawnSync('node', [DIST, 'diff'], { cwd: repo.dir, encoding: 'utf8' });
      expect(d.status).toBe(0);
      expect(JSON.parse(d.stdout).mode).toBe('uncommitted');
    } finally {
      repo.cleanup();
    }
  });
});
