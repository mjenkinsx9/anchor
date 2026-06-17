import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = readFileSync(join(ROOT, 'skills', 'anchor-review', 'SKILL.md'), 'utf8');

// Guards the spec-required prose contract so a future edit can't silently drop it.
// Asserts stable identifiers/phrases (not full sentences) to stay non-brittle.
describe('SKILL.md Phase 4 contract', () => {
  it('4D: emits the anchor:finding block and documents the fix-spec discipline', () => {
    expect(SKILL).toContain('anchor:finding');
    expect(SKILL).toContain('no safe automatic fix');
    expect(SKILL).toContain('fix.verify');
  });
  it('4D: fix follow-up applies + verifies (no longer "never auto-apply")', () => {
    expect(SKILL).toMatch(/applies the finding's `fix\.edits` via the Edit tool/);
    expect(SKILL).not.toContain('propose a patch via the normal Edit workflow (never auto-apply)');
  });
  it('4C: documents --since-last and prior-findings suppression', () => {
    expect(SKILL).toContain('--since-last');
    expect(SKILL).toContain('prior findings');
    expect(SKILL).toMatch(/NOT in the current diff/);
  });
  it('4A: documents the grep-approximate caller/sibling limitation', () => {
    expect(SKILL).toContain('reason: "caller"');
    expect(SKILL).toContain('reason: "sibling"');
    expect(SKILL).toContain('grep-approximate');
  });
});
