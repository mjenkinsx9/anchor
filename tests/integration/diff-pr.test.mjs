import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDiff } from '../../lib/diff.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
let mockDir;

const FAKE_DIFF = [
  'diff --git a/src/x.ts b/src/x.ts',
  '--- a/src/x.ts',
  '+++ b/src/x.ts',
  '@@ -1 +1,2 @@',
  ' keep',
  '+added',
  '',
].join('\\n');

beforeAll(() => {
  mockDir = mkdtempSync(join(tmpdir(), 'anchor-gh-mock-'));
  // fake gh: `gh --version` ok; `gh pr view ... --json` returns metadata; `gh pr diff N` prints a diff
  writeFileSync(join(mockDir, 'gh'), `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "gh version 2.0.0 (mock)"; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"number": 123, "url": "https://github.com/me/repo/pull/123"}'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "diff" ]; then
  printf '${FAKE_DIFF}'
  exit 0
fi
exit 1
`);
  chmodSync(join(mockDir, 'gh'), 0o755);
});
afterAll(() => {
  rmSync(mockDir, { recursive: true, force: true });
  repo.cleanup();
});

function mockEnv() {
  return { ...process.env, PATH: `${mockDir}:${process.env.PATH}` };
}

describe('getDiff PR mode', () => {
  it('parses gh pr diff output and attaches PR metadata', () => {
    const d = getDiff(['pr', '123'], { cwd: repo.dir, env: mockEnv() });
    expect(d.mode).toBe('pr');
    expect(d.prNumber).toBe('123');
    expect(d.prUrl).toBe('https://github.com/me/repo/pull/123');
    expect(d.files[0].path).toBe('src/x.ts');
    expect(d.files[0].added).toBe(1);
  });
  it('missing gh → clear install message', () => {
    const noGh = { ...process.env, PATH: '/nonexistent-bin-dir' };
    expect(() => getDiff(['pr', '123'], { cwd: repo.dir, env: noGh }))
      .toThrow(/PR mode requires the `gh` CLI/);
  });
});
