import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectRules, loadRulesProse, gatherRules } from '../../lib/rules.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-rules-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const RULES = [
  { id: 'sql', rule: 'Parameterize SQL', scope: 'src/db/**', severity: 'high' },
  { id: 'any', rule: 'No TODO', severity: 'low' },
];

describe('selectRules', () => {
  it('selects scoped rules matching changed paths plus unscoped (match-all) rules', () => {
    expect(selectRules(RULES, ['src/db/users.ts']).map((r) => r.id).sort())
      .toEqual(['any', 'sql']);
  });
  it('an unscoped rule matches even when the scoped rule does not', () => {
    expect(selectRules(RULES, ['src/ui/button.tsx']).map((r) => r.id))
      .toEqual(['any']);
  });
  it('strips a leading ./ from changed paths before matching', () => {
    expect(selectRules(RULES, ['./src/db/users.ts']).map((r) => r.id).sort())
      .toEqual(['any', 'sql']);
  });
  it('null rules → []', () => {
    expect(selectRules(null, ['src/db/users.ts'])).toEqual([]);
  });
  it('undefined rules → []', () => {
    expect(selectRules(undefined, ['src/db/users.ts'])).toEqual([]);
  });
  it('DEFENSIVE: an uncompilable scope does not throw and is simply not selected', () => {
    const rules = [
      { id: 'bad', rule: 'Broken', scope: '[', severity: 'high' },
      { id: 'any', rule: 'No TODO', severity: 'low' },
    ];
    expect(() => selectRules(rules, ['src/db/users.ts'])).not.toThrow();
    expect(selectRules(rules, ['src/db/users.ts']).map((r) => r.id)).toEqual(['any']);
  });
});

describe('loadRulesProse', () => {
  it('returns null when .anchor/rules.md is absent', () => {
    expect(loadRulesProse(dir)).toBeNull();
  });
  it('returns the file contents when present', () => {
    mkdirSync(join(dir, '.anchor'), { recursive: true });
    writeFileSync(join(dir, '.anchor', 'rules.md'), '# House rules\nBe kind.\n');
    expect(loadRulesProse(dir)).toBe('# House rules\nBe kind.\n');
  });
});

describe('gatherRules', () => {
  it('returns { prose, rules } with prose from the file and scope-filtered rules', () => {
    mkdirSync(join(dir, '.anchor'), { recursive: true });
    writeFileSync(join(dir, '.anchor', 'rules.md'), 'prose content');
    const result = gatherRules({
      repoDir: dir,
      configRules: RULES,
      changedPaths: ['src/db/users.ts'],
    });
    expect(result.prose).toBe('prose content');
    expect(result.rules.map((r) => r.id).sort()).toEqual(['any', 'sql']);
  });
  it('prose is null when rules.md is absent and rules are still filtered', () => {
    const result = gatherRules({
      repoDir: dir,
      configRules: RULES,
      changedPaths: ['src/ui/button.tsx'],
    });
    expect(result.prose).toBeNull();
    expect(result.rules.map((r) => r.id)).toEqual(['any']);
  });
});
