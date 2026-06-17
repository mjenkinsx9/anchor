import { describe, it, expect } from 'vitest';
import { extractAcceptanceCriteria } from '../../lib/issue.mjs';

describe('extractAcceptanceCriteria', () => {
  it('extracts checklist items (- [ ] / - [x]) anywhere', () => {
    const body = 'Intro text\n\n- [ ] Add login\n- [x] Hash passwords\n* [ ] Rate-limit\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['Add login', 'Hash passwords', 'Rate-limit']);
  });

  it('falls back to lines under an "Acceptance criteria" heading until the next heading', () => {
    const body = [
      '## Summary', 'does things', '',
      '## Acceptance Criteria', '- returns 200 on success', '- logs the request id', '',
      '## Notes', '- not a criterion',
    ].join('\n');
    expect(extractAcceptanceCriteria(body)).toEqual(['returns 200 on success', 'logs the request id']);
  });

  it('accepts a "Requirements" heading as the alias', () => {
    const body = '# Requirements\n1. Must validate input\n2. Must persist\n# Other\nignore me\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['Must validate input', 'Must persist']);
  });

  it('prefers checklist items over heading content when both exist', () => {
    const body = '## Acceptance Criteria\n- [ ] checkbox wins\nplain line loses\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['checkbox wins']);
  });

  it('returns [] when there is nothing to extract', () => {
    expect(extractAcceptanceCriteria('just a paragraph, no structure\n')).toEqual([]);
    expect(extractAcceptanceCriteria('')).toEqual([]);
    expect(extractAcceptanceCriteria(null)).toEqual([]);
  });
});
