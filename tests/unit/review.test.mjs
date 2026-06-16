import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { saveReview, listReviews, showReview, extractReviewMeta } from '../../lib/review.mjs';
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
