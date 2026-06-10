import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../lib/frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('parses yaml frontmatter and body', () => {
    const { data, body } = parseFrontmatter('---\ndate: 2026-06-09\nsha: abc1234\n---\n\n# Review\n');
    expect(data.sha).toBe('abc1234');
    expect(body.trim()).toBe('# Review');
  });
  it('no frontmatter → empty data, full body', () => {
    const { data, body } = parseFrontmatter('# Just markdown\n');
    expect(data).toEqual({});
    expect(body).toBe('# Just markdown\n');
  });
  it('invalid yaml → empty data, full body (graceful)', () => {
    const text = '---\n: : bad: [\n---\nbody';
    const { data, body } = parseFrontmatter(text);
    expect(data).toEqual({});
    expect(body).toBe(text);
  });
  it('handles CRLF line endings', () => {
    const { data } = parseFrontmatter('---\r\nkey: value\r\n---\r\n\r\nbody');
    expect(data.key).toBe('value');
  });
  it('round-trips the review archiver shape', () => {
    const meta = { date: '2026-06-09', sha: 'abc1234', target: 'main..feature', score: 4, severities: { critical: 0, high: 1, medium: 0, low: 2 } };
    const { data } = parseFrontmatter(stringifyFrontmatter(meta, '# r\n'));
    expect(data).toEqual(meta);
    expect(typeof data.date).toBe('string');
  });
});

describe('stringifyFrontmatter', () => {
  it('round-trips', () => {
    const out = stringifyFrontmatter({ a: 1, list: ['x'] }, 'body text\n');
    const { data, body } = parseFrontmatter(out);
    expect(data).toEqual({ a: 1, list: ['x'] });
    expect(body.trim()).toBe('body text');
  });
});
