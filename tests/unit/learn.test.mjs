import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLearnings, addLearning, removeLearning, selectLearnings } from '../../lib/learn.mjs';

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
  it('returns headings and reasons (with default meta)', () => {
    addLearning(dir, 'Pattern A', 'why A');
    addLearning(dir, 'Pattern B');
    const { patterns } = listLearnings(dir);
    expect(patterns).toEqual([
      { heading: 'Pattern A', reason: 'why A', scope: '**', category: null, action: 'suppress' },
      { heading: 'Pattern B', reason: null, scope: '**', category: null, action: 'suppress' },
    ]);
  });
});

describe('scoped learnings (meta)', () => {
  it('round-trips a scoped learning and defaults legacy entries to global scope', () => {
    addLearning(dir, 'Missing docstrings', 'team style', { scope: 'src/lib/**', category: 'docs', action: 'suppress' });
    const [p] = listLearnings(dir).patterns;
    expect(p.scope).toBe('src/lib/**');
    expect(p.category).toBe('docs');
    expect(p.action).toBe('suppress');
    // survives a rewrite cycle
    addLearning(dir, 'Another');
    const again = listLearnings(dir).patterns.find((x) => x.heading === 'Missing docstrings');
    expect(again.scope).toBe('src/lib/**');
  });
  it('legacy entries (no meta) are re-serialized WITHOUT a meta line', () => {
    addLearning(dir, 'old pattern', 'why');
    // force a rewrite by adding another entry
    addLearning(dir, 'second');
    const text = readFileSync(FILE(), 'utf8');
    expect(text).not.toContain('<!-- meta:');
    expect(text).toContain('### old pattern');
  });
  it('selectLearnings filters by scope; unscoped apply everywhere', () => {
    addLearning(dir, 'db rule', 'x', { scope: 'src/db/**' });
    addLearning(dir, 'global rule', 'y'); // scope '**'
    const { patterns } = listLearnings(dir);
    expect(selectLearnings(patterns, ['src/db/users.ts']).map((p) => p.heading).sort())
      .toEqual(['db rule', 'global rule']);
    expect(selectLearnings(patterns, ['src/ui/button.tsx']).map((p) => p.heading)).toEqual(['global rule']);
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
  it('removeLearning on a repo with no learnings file', () => {
    expect(removeLearning(dir, 'anything').removed).toBe(0);
    expect(existsSync(FILE())).toBe(false);
  });
});

describe('sanitization', () => {
  it('sanitizes --> and newlines in reasons (would corrupt the file format)', () => {
    addLearning(dir, 'Arrow pattern', 'old --> new\nmigration');
    const { patterns } = listLearnings(dir);
    expect(patterns[0].reason).toBe('old → new migration');
    // survives a rewrite cycle
    addLearning(dir, 'Other');
    expect(listLearnings(dir).patterns[0].reason).toBe('old → new migration');
  });
  it('sanitizes newlines in headings', () => {
    addLearning(dir, 'Multi\nline heading');
    expect(listLearnings(dir).patterns[0].heading).toBe('Multi line heading');
  });
});
