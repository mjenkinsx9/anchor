import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// Canonical source of truth for plugin metadata.
const canonical = read('.claude-plugin/plugin.json');
const pkg = read('package.json');

// Per-harness manifests that point at the shared skills/commands/hooks and must
// keep name/version/description in sync with the canonical manifest.
const harnessManifests = [
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  'gemini-extension.json',
];

describe('cross-harness manifest metadata', () => {
  // Tie the whole chain together: package.json ⟷ canonical ⟷ harness manifests.
  it('the canonical manifest version matches package.json', () => {
    expect(canonical.version).toBe(pkg.version);
  });

  for (const rel of harnessManifests) {
    describe(rel, () => {
      it('exists', () => {
        expect(existsSync(join(ROOT, rel)), `${rel} missing`).toBe(true);
      });

      it('keeps name/version/description in sync with .claude-plugin/plugin.json', () => {
        const m = read(rel);
        expect(m.name).toBe(canonical.name);
        expect(m.version).toBe(canonical.version);
        expect(m.description).toBe(canonical.description);
      });
    });
  }

  it('Codex manifest points skills at the shared ./skills/ directory', () => {
    expect(read('.codex-plugin/plugin.json').skills).toBe('./skills/');
  });

  it('Cursor manifest points skills/commands at the shared dirs and does not wire the Claude-format hooks', () => {
    const m = read('.cursor-plugin/plugin.json');
    expect(m.skills).toBe('./skills/');
    expect(m.commands).toBe('./commands/');
    // Cursor's hook schema (camelCase events, no ${CLAUDE_PLUGIN_ROOT}) is
    // incompatible with our Claude-format hooks/hooks.json — must stay unset.
    expect(m.hooks).toBeUndefined();
  });

  it('the referenced shared directories actually exist', () => {
    expect(existsSync(join(ROOT, 'skills', 'anchor-review', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(ROOT, 'commands', 'anchor.md'))).toBe(true);
    expect(existsSync(join(ROOT, 'hooks', 'hooks.json'))).toBe(true);
  });
});
