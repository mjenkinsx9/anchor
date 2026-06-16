import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import {
  resolveBin,
  selectAnalyzers,
  runAnalyzers,
  ANALYZERS,
} from '../../lib/analyzers.mjs';

const fakeLint = {
  name: 'fakelint',
  bin: 'true',
  exts: ['.ts'],
  command: () => [],
  parse: () => [],
};

describe('selectAnalyzers', () => {
  it('selects analyzers whose exts intersect the changed files', () => {
    expect(selectAnalyzers([fakeLint], ['a.ts'])).toEqual([fakeLint]);
  });

  it('selects none when no extension matches', () => {
    expect(selectAnalyzers([fakeLint], ['a.py'])).toEqual([]);
  });
});

describe('runAnalyzers', () => {
  it('normalizes absolute finding paths to repo-relative and flags changed', async () => {
    const repo = makeFixtureRepo();
    try {
      const abs = join(repo.dir, 'src', 'a.ts');
      const analyzer = {
        name: 'fakelint',
        bin: 'true',
        exts: ['.ts'],
        command: () => [],
        parse: () => [
          { rule: 'X1', file: abs, line: 3, severity: 'high', message: 'boom' },
        ],
      };
      const res = await runAnalyzers([analyzer], {
        repoDir: repo.dir,
        files: ['src/a.ts'],
        exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      });

      expect(res.tools).toEqual([{ name: 'fakelint', ran: true, fileCount: 1 }]);
      expect(res.findings).toHaveLength(1);
      const f = res.findings[0];
      expect(isAbsolute(f.file)).toBe(false);
      expect(f.file).toBe('src/a.ts');
      expect(f.changed).toBe(true);
      expect(f.tool).toBe('fakelint');
      expect(f.rule).toBe('X1');
      expect(res.truncated).toBeUndefined();
    } finally {
      repo.cleanup();
    }
  });

  it('marks changed:false for a finding outside the changed set', async () => {
    const repo = makeFixtureRepo();
    try {
      const abs = join(repo.dir, 'src', 'other.ts');
      const analyzer = {
        name: 'fakelint',
        bin: 'true',
        exts: ['.ts'],
        command: () => [],
        parse: () => [
          { rule: 'X1', file: abs, line: 3, severity: 'high', message: 'boom' },
        ],
      };
      const res = await runAnalyzers([analyzer], {
        repoDir: repo.dir,
        files: ['src/a.ts'],
        exec: async () => ({ stdout: '', stderr: '', code: 0 }),
      });
      expect(res.findings[0].changed).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  it('reports a missing analyzer as not-installed without throwing', async () => {
    const repo = makeFixtureRepo();
    try {
      const analyzer = {
        name: 'ghost',
        bin: 'definitely-not-real-xyz',
        exts: ['.ts'],
        command: () => [],
        parse: () => [{ rule: 'X', file: 'a.ts', line: 1, severity: 'high', message: 'm' }],
      };
      const res = await runAnalyzers([analyzer], {
        repoDir: repo.dir,
        files: ['a.ts'],
      });
      expect(res.tools).toEqual([
        { name: 'ghost', ran: false, fileCount: 0, reason: 'not installed' },
      ]);
      expect(res.findings).toEqual([]);
    } finally {
      repo.cleanup();
    }
  });
});

describe('resolveBin', () => {
  it('prefers a project-local node_modules/.bin entry over global lookup', () => {
    const repo = makeFixtureRepo();
    try {
      const binDir = join(repo.dir, 'node_modules', '.bin');
      mkdirSync(binDir, { recursive: true });
      const planted = join(binDir, 'eslint');
      writeFileSync(planted, '#!/bin/sh\n');
      expect(resolveBin(repo.dir, 'eslint')).toBe(planted);
    } finally {
      repo.cleanup();
    }
  });

  it('returns null for a guaranteed-absent bin with no node_modules', () => {
    const repo = makeFixtureRepo();
    try {
      expect(resolveBin(repo.dir, 'definitely-not-real-xyz')).toBe(null);
    } finally {
      repo.cleanup();
    }
  });
});

describe('eslint parse', () => {
  it('parses real eslint JSON output into findings', () => {
    const eslint = ANALYZERS.find((a) => a.name === 'eslint');
    const stdout = JSON.stringify([
      {
        filePath: '/repo/src/a.ts',
        messages: [
          { ruleId: 'no-unused-vars', line: 10, severity: 2, message: 'unused' },
          { ruleId: null, line: 5, severity: 1, message: 'warn' },
        ],
      },
    ]);
    const findings = eslint.parse(stdout, '');
    expect(findings).toEqual([
      {
        rule: 'no-unused-vars',
        file: '/repo/src/a.ts',
        line: 10,
        severity: 'high',
        message: 'unused',
      },
      {
        rule: 'eslint',
        file: '/repo/src/a.ts',
        line: 5,
        severity: 'medium',
        message: 'warn',
      },
    ]);
  });

  it('returns [] on unparseable eslint output', () => {
    const eslint = ANALYZERS.find((a) => a.name === 'eslint');
    expect(eslint.parse('not json', '')).toEqual([]);
  });
});
