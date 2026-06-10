import { describe, it, expect } from 'vitest';
import { addHookEntry } from '../../lib/posttool-hook.mjs';

const SCRIPT = '/home/me/anchor/hooks/post-push-reminder.sh';

describe('addHookEntry', () => {
  it('adds hooks structure to empty settings', () => {
    const { settings, changed } = addHookEntry({}, SCRIPT);
    expect(changed).toBe(true);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0]).toEqual({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: SCRIPT }],
    });
  });
  it('preserves existing unrelated hooks (additive)', () => {
    const existing = {
      hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/other.sh' }] }] },
      model: 'opus',
    };
    const { settings } = addHookEntry(existing, SCRIPT);
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.model).toBe('opus');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('/other.sh');
  });
  it('is idempotent', () => {
    const once = addHookEntry({}, SCRIPT).settings;
    const { settings, changed } = addHookEntry(once, SCRIPT);
    expect(changed).toBe(false);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });
  it('does not mutate the input object', () => {
    const input = {};
    addHookEntry(input, SCRIPT);
    expect(input).toEqual({});
  });
});
