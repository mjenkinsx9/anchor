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
});
