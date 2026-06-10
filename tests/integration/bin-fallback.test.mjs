import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The plugin cache is a copy of the repo WITHOUT node_modules. bin/anchor.mjs
// must still work there by falling back to the committed dist/ bundle.
describe('bin/anchor.mjs without node_modules (plugin-cache layout)', () => {
  let cache;
  beforeAll(() => {
    cache = mkdtempSync(join(tmpdir(), 'anchor-plugincache-'));
    for (const entry of ['bin', 'lib', 'dist', 'package.json']) {
      cpSync(join(ROOT, entry), join(cache, entry), { recursive: true });
    }
  });
  afterAll(() => rmSync(cache, { recursive: true, force: true }));

  it('runs config validate via the dist fallback', () => {
    const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
    try {
      const r = spawnSync('node', [join(cache, 'bin', 'anchor.mjs'), 'config', 'validate'], {
        cwd: repo.dir,
        encoding: 'utf8',
      });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).valid).toBe(true);
    } finally {
      repo.cleanup();
    }
  });

  it('reports CLI errors normally (exit 1, no module-resolution noise)', () => {
    const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
    try {
      const r = spawnSync('node', [join(cache, 'bin', 'anchor.mjs'), 'learn', 'bogus'], {
        cwd: repo.dir,
        encoding: 'utf8',
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('anchor: learn needs add|list|remove');
      expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    } finally {
      repo.cleanup();
    }
  });
});
