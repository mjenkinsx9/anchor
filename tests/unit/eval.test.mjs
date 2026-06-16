import { describe, it, expect } from 'vitest';
import { parseFindings, scoreReview } from '../../lib/eval.mjs';

// A rendered review in the SKILL.md step-7 format.
const SAMPLE = `
────────────────────────────────────────────────────────────────
  🔴 CRITICAL  (1)
────────────────────────────────────────────────────────────────
  [1] src/auth.ts:2  ·  security
  Uses == for hash comparison, allowing type-juggling bypass.

────────────────────────────────────────────────────────────────
  🟡 MEDIUM  (1)
────────────────────────────────────────────────────────────────
  [2] src/find.ts:1  ·  perf
  O(n*m) includes() inside filter() — quadratic on large inputs.
`;

describe('parseFindings', () => {
  it('extracts file, line, category, and severity per finding', () => {
    const f = parseFindings(SAMPLE);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ n: 1, file: 'src/auth.ts', line: '2', category: 'security', severity: 'critical' });
    expect(f[1]).toMatchObject({ n: 2, file: 'src/find.ts', line: '1', category: 'perf', severity: 'medium' });
  });

  it('returns [] for a review with no findings', () => {
    expect(parseFindings('🟢 LOW  (0)\n  None.')).toEqual([]);
  });
});

describe('scoreReview', () => {
  it('full recall when all expected findings are present', () => {
    const s = scoreReview(
      { expected: [{ file: 'src/auth.ts', category: 'security' }, { file: 'src/find.ts', category: 'perf' }] },
      SAMPLE,
    );
    expect(s.recall).toBe(1);
    expect(s.missed).toHaveLength(0);
  });

  it('counts a missing expected finding', () => {
    const s = scoreReview({ expected: [{ file: 'src/missing.ts', category: 'logic' }] }, SAMPLE);
    expect(s.recall).toBe(0);
    expect(s.missed).toHaveLength(1);
  });

  it('flags a false positive on a known-clean file and lowers precision', () => {
    const s = scoreReview({ cleanFiles: ['src/auth.ts'] }, SAMPLE);
    expect(s.falsePositives).toHaveLength(1);
    expect(s.precision).toBeLessThan(1);
  });

  it('mustMention requires the keyword to appear in the review', () => {
    const hit = scoreReview({ expected: [{ file: 'src/auth.ts', category: 'security', mustMention: ['=='] }] }, SAMPLE);
    expect(hit.recall).toBe(1);
    const miss = scoreReview({ expected: [{ file: 'src/auth.ts', category: 'security', mustMention: ['SQL injection'] }] }, SAMPLE);
    expect(miss.recall).toBe(0);
  });

  it('category must match when specified', () => {
    const s = scoreReview({ expected: [{ file: 'src/auth.ts', category: 'perf' }] }, SAMPLE);
    expect(s.recall).toBe(0); // auth finding is security, not perf
  });
});
