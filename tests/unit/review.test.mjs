import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { saveReview, listReviews, showReview, extractReviewMeta, parseFindingBlocks, normalizeTitle, findingHash, priorFindings } from '../../lib/review.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('saveReview', () => {
  it('writes to .anchor/reviews/<date>-<sha>.md with frontmatter', () => {
    const { path } = saveReview(repo.dir, '# The review body\n', {
      target: 'main..feature', score: 4, severities: { critical: 0, high: 1, medium: 0, low: 2 },
    });
    expect(path).toMatch(/\.anchor\/reviews\/\d{4}-\d{2}-\d{2}-[0-9a-f]+\.md$/);
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('target: main..feature');
    expect(text).toContain('score: 4');
    expect(text).toContain('# The review body');
  });
  it('extracts score and severities from the rendered review body when meta omits them', () => {
    const body = [
      '  Anchor Review  ·  uncommitted  ·  abc1234',
      '',
      '  Confidence: 4 / 5',
      '  Reasoning:  Solid context.',
      '',
      '  🔴 CRITICAL  (1)',
      '  🟠 HIGH  (2)',
      '  🟡 MEDIUM  (0)',
      '  🟢 LOW  (3)',
      '',
    ].join('\n');
    const { path } = saveReview(repo.dir, body, { path: `${repo.dir}/.anchor/reviews/extracted.md`, sha: 'aaaa01', target: 'uncommitted' });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('score: 4');
    expect(text).toContain('critical: 1');
    expect(text).toContain('high: 2');
    expect(text).toContain('medium: 0');
    expect(text).toContain('low: 3');
  });
  it('explicit meta score/severities win over body extraction', () => {
    const body = '  Confidence: 2 / 5\n  🔴 CRITICAL  (9)\n';
    const { path } = saveReview(repo.dir, body, {
      path: `${repo.dir}/.anchor/reviews/meta-wins.md`, sha: 'aaaa02',
      score: 5, severities: { critical: 0, high: 0, medium: 0, low: 0 },
    });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('score: 5');
    expect(text).toContain('critical: 0');
  });
  it('body without the canonical markers falls back to null score and zero severities', () => {
    const { path } = saveReview(repo.dir, 'freeform notes, no render format\n', {
      path: `${repo.dir}/.anchor/reviews/freeform.md`, sha: 'aaaa03',
    });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('score: null');
    expect(text).toContain('critical: 0');
  });
  it('honors an explicit path override', () => {
    const { path } = saveReview(repo.dir, 'body', { path: `${repo.dir}/.anchor/reviews/custom.md`, date: '2020-01-01', sha: 'cafe99' });
    expect(path.endsWith('custom.md')).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(showReview(repo.dir, 'cafe99').content).toContain('body');
  });
});

describe('listReviews / showReview', () => {
  it('lists newest first with parsed metadata', () => {
    const all = listReviews(repo.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0]).toHaveProperty('date');
    expect(all[0]).toHaveProperty('sha');
    expect(all[0]).toHaveProperty('score');
  });
  it('shows a review by sha substring', () => {
    const all = listReviews(repo.dir);
    const auto = all.find((r) => /\d{4}-\d{2}-\d{2}-[0-9a-f]+\.md$/.test(r.file));
    const found = showReview(repo.dir, auto.sha);
    expect(found.content).toContain('review body');
  });
  it('returns null for unknown sha', () => {
    expect(showReview(repo.dir, 'ffffffff')).toBeNull();
  });
  it('empty list when no reviews dir', () => {
    const fresh = makeFixtureRepo({});
    expect(listReviews(fresh.dir)).toEqual([]);
    fresh.cleanup();
  });
  it('lists by frontmatter date, newest first', () => {
    const all = listReviews(repo.dir);
    const dates = all.map((r) => String(r.date));
    expect(dates).toEqual([...dates].sort().reverse());
  });
  it('short needles (<4 chars) never match', () => {
    expect(showReview(repo.dir, '06')).toBeNull();
  });
});

describe('extractReviewMeta', () => {
  it('prefers the machine-readable anchor:meta block over text scraping', () => {
    const content = `<!-- anchor:meta {"score":4,"severities":{"critical":1,"high":0,"medium":2,"low":0}} -->\n` +
      `Confidence: 1 / 5\n🔴 CRITICAL  (9)\n`; // text says 9/1, block says 1/4 — block wins
    const m = extractReviewMeta(content);
    expect(m.score).toBe(4);
    expect(m.severities.critical).toBe(1);
    expect(m.severities.medium).toBe(2);
  });
  it('falls back to text scraping when the block is malformed', () => {
    const content = `<!-- anchor:meta {not valid json} -->\nConfidence: 3 / 5\n🔴 CRITICAL  (2)\n`;
    const m = extractReviewMeta(content);
    expect(m.score).toBe(3);
    expect(m.severities.critical).toBe(2);
  });
  it('returns nulls for freeform content with neither block nor markers', () => {
    const m = extractReviewMeta('just some notes, no format\n');
    expect(m.score).toBeNull();
    expect(m.severities).toBeNull();
  });
});

describe('parseFindingBlocks', () => {
  const block = (o) => `<!-- anchor:finding ${JSON.stringify(o)} -->`;

  it('parses a single block with a nested fix spec', () => {
    const content = `intro\n${block({
      n: 1, file: 'src/a.ts', line: 10, severity: 'high', category: 'logic',
      title: 'Off-by-one in slice', fix: { edits: [{ file: 'src/a.ts', range: [10, 10], replacement: 'xs[i]' }], verify: 'vitest run tests/unit' },
    })}\nmore\n`;
    const out = parseFindingBlocks(content);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ file: 'src/a.ts', title: 'Off-by-one in slice', severity: 'high' });
    expect(out[0].fix.edits[0].range).toEqual([10, 10]);
    expect(out[0].fix.verify).toBe('vitest run tests/unit');
  });

  it('parses multiple blocks in document order', () => {
    const content = `${block({ n: 1, file: 'a.ts', title: 'First' })}\n${block({ n: 2, file: 'b.ts', title: 'Second' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['First', 'Second']);
  });

  it('skips a malformed-JSON block but keeps valid ones', () => {
    const content = `<!-- anchor:finding {not json} -->\n${block({ file: 'b.ts', title: 'Valid' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['Valid']);
  });

  it('skips a block missing file or title (the dedup identity)', () => {
    const content = `${block({ file: 'a.ts' })}\n${block({ title: 'no file' })}\n${block({ file: 'c.ts', title: 'ok' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['ok']);
  });

  it('returns [] when there are no blocks', () => {
    expect(parseFindingBlocks('plain review, no machine block\n')).toEqual([]);
  });
});

describe('finding dedup storage (4C)', () => {
  const block = (o) => `<!-- anchor:finding ${JSON.stringify(o)} -->`;

  it('normalizeTitle is lowercased, whitespace-collapsed, and digit-blind', () => {
    expect(normalizeTitle('  Off-by-one  at   line 42 ')).toBe('off-by-one at line #');
    expect(normalizeTitle('Drops write on row 7')).toBe('drops write on row #');           // canonical value
    expect(normalizeTitle('Drops write on row 7')).toBe(normalizeTitle('Drops write on row 1234'));
  });

  it('findingHash is stable and digit-blind across line shifts', () => {
    expect(findingHash('src/a.ts', 'Bug at line 10')).toBe(findingHash('src/a.ts', 'Bug at line 99'));
    expect(findingHash('src/a.ts', 'Bug')).not.toBe(findingHash('src/b.ts', 'Bug'));
    expect(findingHash('src/a.ts', 'X')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('saveReview stores finding_hashes + findings parsed from the body', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const body = `review\n${block({ n: 1, file: 'src/a.ts', line: 5, severity: 'high', title: 'Null deref on input' })}\n` +
        `${block({ n: 2, file: 'src/b.ts', line: 9, severity: 'critical', title: 'SQL injection' })}\n`;
      const { path } = saveReview(fresh.dir, body, { sha: 'dedup1', target: 'uncommitted' });
      const text = readFileSync(path, 'utf8');
      expect(text).toContain('finding_hashes:');
      expect(text).toContain(findingHash('src/a.ts', 'Null deref on input'));
      const [latest] = listReviews(fresh.dir);
      expect(latest.findings).toEqual([
        { file: 'src/a.ts', line: 5, title: 'Null deref on input' },
        { file: 'src/b.ts', line: 9, title: 'SQL injection' },
      ]);
      expect(latest.finding_hashes).toHaveLength(2);
    } finally { fresh.cleanup(); }
  });

  it('priorFindings returns the newest review findings, [] when none/freeform', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      expect(priorFindings(fresh.dir)).toEqual([]);
      saveReview(fresh.dir, `r\n${block({ file: 'src/a.ts', line: 1, title: 'First finding' })}\n`, { sha: 'pf0001', date: '2026-06-10' });
      saveReview(fresh.dir, 'freeform, no blocks\n', { sha: 'pf0002', date: '2026-06-12' });
      // newest (2026-06-12) is freeform → no findings
      expect(priorFindings(fresh.dir)).toEqual([]);
    } finally { fresh.cleanup(); }
  });

  it('back-compat: a review without blocks stores empty findings', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const { path } = saveReview(fresh.dir, 'plain body\n', { sha: 'bc0001' });
      const text = readFileSync(path, 'utf8');
      expect(text).toContain('findings: []');
      expect(listReviews(fresh.dir).find((r) => r.sha === 'bc0001').findings).toEqual([]);
    } finally { fresh.cleanup(); }
  });

  it('script-level net flags (never drops) a finding whose hash repeats the prior review', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      saveReview(fresh.dir, `r1\n${block({ file: 'src/a.ts', line: 5, title: 'Null deref on input' })}\n`, { sha: 'rep001', date: '2026-06-10' });
      const r2 = saveReview(fresh.dir,
        `r2\n${block({ file: 'src/a.ts', line: 8, title: 'Null deref on input' })}\n${block({ file: 'src/b.ts', line: 1, title: 'New issue' })}\n`,
        { sha: 'rep002', date: '2026-06-11' });
      // line 5 vs 8 → digit-blind identity matches the prior review; 'New issue' does not.
      expect(r2.repeated.map((f) => f.title)).toEqual(['Null deref on input']);
      const text = readFileSync(r2.path, 'utf8');
      expect(text).toContain('repeated_finding_hashes:');
      // non-destructive: both finding blocks remain in the saved body
      expect(parseFindingBlocks(text)).toHaveLength(2);
    } finally { fresh.cleanup(); }
  });

  it('first review (no prior) reports no repeats and adds no repeated_finding_hashes key', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const r = saveReview(fresh.dir, `r\n${block({ file: 'src/a.ts', line: 1, title: 'Only finding' })}\n`, { sha: 'rep000' });
      expect(r.repeated).toEqual([]);
      expect(readFileSync(r.path, 'utf8')).not.toContain('repeated_finding_hashes');
    } finally { fresh.cleanup(); }
  });
});
