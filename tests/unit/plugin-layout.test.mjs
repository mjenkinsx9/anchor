import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, basename } from 'node:path';
import { parseFrontmatter } from '../../lib/frontmatter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('plugin layout', () => {
  // Commands and skills share one namespace in Claude Code: a command named
  // "anchor" and a skill named "anchor" both register as anchor:anchor, and
  // the Skill tool resolves the command — so the SKILL.md never loads.
  it('no skill name collides with a command name', () => {
    const commandNames = readdirSync(join(ROOT, 'commands'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'));
    const skillNames = readdirSync(join(ROOT, 'skills')).map((dir) => {
      const { data } = parseFrontmatter(readFileSync(join(ROOT, 'skills', dir, 'SKILL.md'), 'utf8'));
      return data.name ?? dir;
    });
    for (const name of skillNames) {
      expect(commandNames, `skill "${name}" collides with commands/${name}.md`).not.toContain(name);
    }
  });

  it('each skill frontmatter name matches its directory', () => {
    for (const dir of readdirSync(join(ROOT, 'skills'))) {
      const { data } = parseFrontmatter(readFileSync(join(ROOT, 'skills', dir, 'SKILL.md'), 'utf8'));
      expect(data.name).toBe(dir);
    }
  });

  it('the command tells Claude to invoke a skill that actually exists', () => {
    const command = readFileSync(join(ROOT, 'commands', 'anchor.md'), 'utf8');
    const referenced = command.match(/Invoke the `([a-z0-9-]+)` skill/)?.[1];
    expect(referenced, 'commands/anchor.md must reference a skill by name').toBeTruthy();
    expect(readdirSync(join(ROOT, 'skills'))).toContain(referenced);
  });
});
