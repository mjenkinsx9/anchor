import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getStatus, renderStatusText } from '../../lib/status.mjs';
import { saveReview } from '../../lib/review.mjs';
import { addLearning } from '../../lib/learn.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('getStatus', () => {
  it('minimal status when no .anchor dir', () => {
    const s = getStatus(repo.dir);
    expect(s.lastReview).toBeNull();
    expect(s.artifacts.codebaseMap).toBeNull();
    expect(s.artifacts.learnings.count).toBe(0);
    expect(s.git.clean).toBe(true);
    expect(typeof s.nextSuggestion).toBe('string');
  });
  it('reports last review, learnings, artifacts', () => {
    saveReview(repo.dir, '# review', {
      target: 'main..f', score: 4, severities: { critical: 0, high: 0, medium: 1, low: 2 },
    });
    addLearning(repo.dir, 'A pattern');
    mkdirSync(join(repo.dir, '.anchor'), { recursive: true });
    writeFileSync(join(repo.dir, '.anchor', 'codebase-map.md'),
      '---\nbuilt: 2026-06-08\nfileCount: 12\n---\n\n# Map\n');
    const s = getStatus(repo.dir);
    expect(s.lastReview.score).toBe(4);
    expect(s.lastReview.openFindings).toEqual({ critical: 0, high: 0, medium: 1, low: 2 });
    expect(s.artifacts.learnings.count).toBe(1);
    expect(s.artifacts.codebaseMap.fileCount).toBe(12);
    expect(s.artifacts.codebaseMap.built).toBe('2026-06-08');
  });
  it('detects a dirty working tree and suggests a review', () => {
    writeFileSync(join(repo.dir, 'a.txt'), 'changed\n');
    const s = getStatus(repo.dir);
    expect(s.git.clean).toBe(false);
    expect(s.nextSuggestion).toContain('/anchor review');
  });
});

describe('renderStatusText', () => {
  it('renders the headline sections', () => {
    const text = renderStatusText(getStatus(repo.dir));
    expect(text).toContain('Anchor Status');
    expect(text).toContain('Last review:');
    expect(text).toContain('Learnings:');
    expect(text).toContain('Next:');
  });
  it('shows "never" when there is no review', () => {
    const fresh = makeFixtureRepo({});
    const text = renderStatusText(getStatus(fresh.dir));
    expect(text).toContain('never');
    fresh.cleanup();
  });
});
