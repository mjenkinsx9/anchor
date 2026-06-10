import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLearnings, addLearning, removeLearning } from '../../lib/learn.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-learn-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const FILE = () => join(dir, '.anchor', 'learnings.md');

describe('addLearning', () => {
  it('creates the file on first add (spec: silent creation)', () => {
    const r = addLearning(dir, 'Missing docstrings on private methods', 'project style');
    expect(r.added).toBe(true);
    expect(existsSync(FILE())).toBe(true);
    const text = readFileSync(FILE(), 'utf8');
    expect(text).toContain('### Missing docstrings on private methods');
    expect(text).toContain('<!-- reason: project style -->');
  });
  it('dedupes case-insensitively', () => {
    addLearning(dir, 'Use == for string equality');
    const r = addLearning(dir, 'USE == FOR STRING EQUALITY');
    expect(r.added).toBe(false);
    expect(r.deduped).toBe(true);
    expect(listLearnings(dir).patterns).toHaveLength(1);
  });
  it('throws on empty pattern', () => {
    expect(() => addLearning(dir, '')).toThrow(/pattern cannot be empty/);
    expect(() => addLearning(dir, '   ')).toThrow(/pattern cannot be empty/);
  });
});

describe('listLearnings', () => {
  it('empty when no file', () => {
    expect(listLearnings(dir).patterns).toEqual([]);
  });
  it('returns headings and reasons', () => {
    addLearning(dir, 'Pattern A', 'why A');
    addLearning(dir, 'Pattern B');
    const { patterns } = listLearnings(dir);
    expect(patterns).toEqual([
      { heading: 'Pattern A', reason: 'why A' },
      { heading: 'Pattern B', reason: null },
    ]);
  });
});

describe('removeLearning', () => {
  it('removes by case-insensitive substring', () => {
    addLearning(dir, 'Unused parameters in event handlers', 'interface contract');
    addLearning(dir, 'Pattern B');
    const r = removeLearning(dir, 'unused parameters');
    expect(r.removed).toBe(1);
    const { patterns } = listLearnings(dir);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].heading).toBe('Pattern B');
  });
  it('returns removed: 0 when nothing matches', () => {
    addLearning(dir, 'Pattern A');
    expect(removeLearning(dir, 'zzz').removed).toBe(0);
  });
});
