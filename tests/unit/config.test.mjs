import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, loadConfig, ensureGitignore } from '../../lib/config.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-config-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeConfig(yamlText) {
  mkdirSync(join(dir, '.anchor'), { recursive: true });
  writeFileSync(join(dir, '.anchor', 'config.yaml'), yamlText);
}

describe('loadConfig', () => {
  it('missing file → all defaults, no warnings', () => {
    const { config, warnings } = loadConfig(dir);
    expect(config).toEqual(DEFAULTS);
    expect(warnings).toEqual([]);
  });
  it('merges user values over defaults', () => {
    writeConfig('min_severity: high\nmax_findings: 10\n');
    const { config } = loadConfig(dir);
    expect(config.min_severity).toBe('high');
    expect(config.max_findings).toBe(10);
    expect(config.strictness).toBe(2); // untouched default
  });
  it('deep-merges output options', () => {
    writeConfig('output:\n  color: never\n');
    const { config } = loadConfig(dir);
    expect(config.output.color).toBe('never');
    expect(config.output.show_whats_good).toBe(true);
  });
  it('invalid YAML → defaults + warning naming the file', () => {
    writeConfig('ignore: [unclosed\n');
    const { config, warnings } = loadConfig(dir);
    expect(config).toEqual(DEFAULTS);
    expect(warnings[0]).toContain('.anchor/config.yaml is invalid YAML');
  });
  it('strictness outside 1-3 → warning + default 2', () => {
    writeConfig('strictness: 9\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.strictness).toBe(2);
    expect(warnings[0]).toContain('strictness must be 1, 2, or 3');
  });
  it('valid strictness 3 accepted', () => {
    writeConfig('strictness: 3\n');
    expect(loadConfig(dir).config.strictness).toBe(3);
  });
  it('ignore as a string → warning + default list (not silently broken)', () => {
    writeConfig('ignore: "src/**"\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.ignore).toEqual(DEFAULTS.ignore);
    expect(warnings[0]).toContain('ignore must be a list');
  });
  it('numeric string max_diff_lines → warning + default (avoids broken comparisons)', () => {
    writeConfig('max_diff_lines: "2000"\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.max_diff_lines).toBe(15000);
    expect(warnings[0]).toContain('max_diff_lines must be an integer');
  });
  it('does not alias DEFAULTS arrays', () => {
    const { config } = loadConfig(dir);
    config.ignore.push('mutated');
    expect(DEFAULTS.ignore).not.toContain('mutated');
    expect(loadConfig(dir).config.ignore).not.toContain('mutated');
  });
  it('invalid min_severity → warning + default low', () => {
    writeConfig('min_severity: huge\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.min_severity).toBe('low');
    expect(warnings[0]).toContain('min_severity must be one of');
  });
  it('unknown category → warning + drops the bad entry', () => {
    writeConfig('categories:\n  - logic\n  - bogus\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.categories).toEqual(['logic']);
    expect(warnings[0]).toContain('unknown categor');
  });
  it('all-invalid categories → falls back to defaults, not an empty list', () => {
    writeConfig('categories:\n  - bogus1\n  - bogus2\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.categories).toEqual(DEFAULTS.categories); // not [] — would disable all findings
    expect(warnings.some((w) => w.includes('all categories were invalid'))).toBe(true);
  });
  it('invalid output.color → warning + default auto', () => {
    writeConfig('output:\n  color: rainbow\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.output.color).toBe('auto');
    expect(warnings[0]).toContain('output.color');
  });
  it('out-of-range integer → warning + default (e.g. max_files: 0)', () => {
    writeConfig('max_files: 0\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.max_files).toBe(100);
    expect(warnings[0]).toContain('max_files must be between');
  });
  it('min_confidence above range → warning + default', () => {
    writeConfig('min_confidence: 9\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.min_confidence).toBe(2);
    expect(warnings[0]).toContain('min_confidence must be between');
  });
  it('non-object output → warning + defaults', () => {
    writeConfig('output: "loud"\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.output).toEqual(DEFAULTS.output);
    expect(warnings[0]).toContain('output must be a mapping');
  });
  it('default ignore covers build output dirs (matches init/context)', () => {
    const { config } = loadConfig(dir);
    expect(config.ignore).toEqual(expect.arrayContaining(['**/dist/**', '**/build/**', '**/coverage/**']));
  });
  it('exposes protected_categories defaults; non-list → default', () => {
    expect(loadConfig(dir).config.protected_categories).toEqual(
      expect.arrayContaining(['security', 'data-loss', 'crash']));
    writeConfig('protected_categories: nope\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.protected_categories).toEqual(DEFAULTS.protected_categories);
    expect(warnings[0]).toContain('protected_categories must be a list');
  });
});

describe('ensureGitignore', () => {
  it('creates .gitignore with the anchor block', () => {
    const { added } = ensureGitignore(dir);
    expect(added).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content).toContain('.anchor/reviews/');
    expect(content).toContain('.anchor/learnings.md');
  });
  it('is idempotent', () => {
    ensureGitignore(dir);
    const first = readFileSync(join(dir, '.gitignore'), 'utf8');
    const { added } = ensureGitignore(dir);
    expect(added).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(first);
  });
  it('appends only missing lines to an existing .gitignore', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.anchor/config.yaml\n');
    ensureGitignore(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content.match(/\.anchor\/config\.yaml/g)).toHaveLength(1);
    expect(content).toContain('.anchor/reviews/');
  });
  it('trailing whitespace on an existing entry does not defeat dedup', () => {
    writeFileSync(join(dir, '.gitignore'), '.anchor/config.yaml   \n.anchor/reviews/\t\n');
    ensureGitignore(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content.match(/\.anchor\/config\.yaml/g)).toHaveLength(1);
    expect(content.match(/\.anchor\/reviews\//g)).toHaveLength(1);
  });
  it('leaves a .gitignore untouched when all patterns exist under a custom header (no orphan comment)', () => {
    // A repo that numbered/renamed the section header still ignores every .anchor/ path.
    // Anchor must not re-append its bare "# Anchor (personal code review state)" comment
    // just because that exact header string is absent (the orphan-comment churn bug).
    const custom = [
      '# -----------------------------------------------------------------------------',
      '# 17. Anchor (personal code review state)',
      '# -----------------------------------------------------------------------------',
      '.anchor/config.yaml',
      '.anchor/codebase-map.md',
      '.anchor/codebase-graph.md',
      '.anchor/learnings.md',
      '.anchor/reviews/',
      '',
    ].join('\n');
    writeFileSync(join(dir, '.gitignore'), custom);
    const { added } = ensureGitignore(dir);
    expect(added).toBe(false);                                            // all patterns present → nothing to add
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(custom);   // file byte-identical — no orphan header appended
  });
  it('emits the header comment exactly once when it appends genuinely missing patterns', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    const { added } = ensureGitignore(dir);
    expect(added).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content.match(/# Anchor \(personal code review state\)/g)).toHaveLength(1);
    expect(content).toContain('.anchor/reviews/');
  });
});
