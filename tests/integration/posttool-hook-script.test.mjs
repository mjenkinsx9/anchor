import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'post-push-reminder.sh');

function runHook(toolInput, env = {}) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: toolInput }),
    env: { ...process.env, ...env },
  });
}

describe('hooks/post-push-reminder.sh', () => {
  it('emits additionalContext when the command is a git push', () => {
    const r = runHook({ command: 'git push origin main' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(out.hookSpecificOutput.additionalContext).toContain('/anchor review');
  });
  it('matches git push embedded in a compound command', () => {
    const r = runHook({ command: 'git add -A && git commit -m x && git push' });
    expect(JSON.parse(r.stdout).hookSpecificOutput).toBeTruthy();
  });
  it('stays silent for non-push commands', () => {
    const r = runHook({ command: 'git status' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
  it('stays silent when ANCHOR_NO_REMIND=1', () => {
    const r = runHook({ command: 'git push' }, { ANCHOR_NO_REMIND: '1' });
    expect(r.stdout.trim()).toBe('');
  });
  it('tolerates malformed stdin', () => {
    const r = spawnSync('bash', [SCRIPT], { encoding: 'utf8', input: 'not json{{' });
    expect(r.status).toBe(0);
  });
  it('stays silent for git pushup (not a git push)', () => {
    const r = runHook({ command: 'git pushup --force' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});
