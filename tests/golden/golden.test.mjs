/**
 * Golden-snapshot tests for deterministic review inputs.
 *
 * Each scenario builds an isolated fixture repo, commits a BASE state,
 * applies an uncommitted change, then snapshots the exact payload that the
 * review LLM would receive: { diff, context, learnings }.  These snapshots
 * catch regressions in diff parsing, context gathering, and learnings I/O
 * without invoking the LLM itself.
 *
 * Regenerating snapshots after an intentional behavior change:
 *   pnpm exec vitest run --update tests/golden
 *
 * Note: `pnpm test:golden -- -u` does NOT work — pnpm passes the flag after
 * a literal `--` separator that vitest ignores.  Use the command above instead.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { getDiff } from '../../lib/diff.mjs';
import { getContext } from '../../lib/context.mjs';
import { listLearnings, addLearning } from '../../lib/learn.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

/** Each scenario builds a repo, applies a change, and snapshots the
 *  deterministic review inputs (diff + context + learnings). */
const SCENARIOS = {
  'clean-refactor': (repo) => {
    writeFiles(repo.dir, { 'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n' });
  },
  'security-bug': (repo) => {
    writeFiles(repo.dir, {
      'src/auth.ts': "export function check(input, stored) {\n  return input.hash == stored.hash;\n}\n",
    });
  },
  'perf-issue': (repo) => {
    writeFiles(repo.dir, {
      'src/find.ts': 'export const find = (xs, ys) => xs.filter((x) => ys.includes(x));\n',
    });
  },
  'noisy-style': (repo) => {
    addLearning(repo.dir, 'Missing docstrings on private methods', 'project style');
    writeFiles(repo.dir, { 'src/helper.ts': 'function _internal() { return 1; }\nexport const h = _internal;\n' });
  },
};

const BASE = {
  '.gitignore': '.anchor/\n',
  'src/sum.ts': 'export function sum(a: number, b: number) {\n  return a + b;\n}\n',
  'src/auth.ts': 'export function check(input, stored) {\n  return false;\n}\n',
  'src/find.ts': 'export const find = (xs, ys) => xs;\n',
  'src/helper.ts': 'export const h = 1;\n',
  'src/app.ts': "import { sum } from './sum';\nimport { check } from './auth';\nexport default { sum, check };\n",
};

describe('golden review inputs', () => {
  for (const [name, apply] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const repo = makeFixtureRepo(BASE);
      try {
        apply(repo);
        const diff = getDiff([], { cwd: repo.dir });
        const context = getContext({
          files: diff.files.map((f) => f.path),
          repoDir: repo.dir,
          maxFiles: 50,
          ignore: [],
        });
        const learnings = listLearnings(repo.dir);
        const payload = { diff, context, learnings };
        await expect(JSON.stringify(payload, null, 2)).toMatchFileSnapshot(
          join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', `${name}.json`),
        );
      } finally {
        repo.cleanup();
      }
    });
  }
});
