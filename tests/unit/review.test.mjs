import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { saveReview, listReviews, showReview } from '../../lib/review.mjs';
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
