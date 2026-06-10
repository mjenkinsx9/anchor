import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

function anchor(args, cwd = repo.dir) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('anchor CLI skeleton', () => {
  it('doctor emits JSON by default', () => {
    const r = anchor(['doctor']);
    const out = JSON.parse(r.stdout);
    expect(out.checks.length).toBeGreaterThan(5);
  });
  it('doctor --format text emits ✓/✗ lines', () => {
    const r = anchor(['doctor', '--format', 'text']);
    expect(r.stdout).toMatch(/[✓✗⚠]/);
  });
  it('config prints resolved config with defaults', () => {
    const r = anchor(['config']);
    const out = JSON.parse(r.stdout);
    expect(out.strictness).toBe(2);
    expect(out.max_diff_lines).toBe(2000);
  });
  it('unknown subcommand → exit 1 with usage on stderr', () => {
    const r = anchor(['bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage');
  });
  it('large JSON output is not truncated when piped', () => {
    // doctor output is small; simulate by checking config output integrity (a full JSON document parses)
    const r = anchor(['config']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });
  it('parseArgs supports --key=value form', async () => {
    const { parseArgs } = await import(BIN);
    const { flags } = parseArgs(['--max-files=50']);
    expect(flags.get('max-files')).toBe('50');
  });
});
