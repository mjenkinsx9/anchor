# Cross-harness portability notes

Anchor ships one portable core — the Agent Skill at
`skills/anchor-review/SKILL.md` — and a thin per-harness manifest that points at
the existing `skills/` (and, where supported, `commands/` and `hooks/`)
directories. The skills and commands are **not** duplicated or rewritten per
harness; each manifest just declares them.

| Harness          | Manifest added                | Skills | Commands | Hooks |
|------------------|-------------------------------|:------:|:--------:|:-----:|
| Claude Code      | `.claude-plugin/plugin.json`  | ✓ | ✓ | ✓ |
| GitHub Copilot CLI | *(none — uses Claude fallback)* | ✓ | ✓ | ✓ |
| OpenAI Codex     | `.codex-plugin/plugin.json`   | ✓ | — | — |
| Cursor           | `.cursor-plugin/plugin.json`  | ✓ | ✓ | — |
| Gemini CLI       | `gemini-extension.json`       | ✓ | — | — |

A `—` in the table means the component is **not declared in that harness's
manifest** — which is *not* the same as "the component never runs," because some
harnesses auto-discover default directories. The push-reminder hook
(`hooks/hooks.json`) is Claude-format: `PostToolUse` + the nested
`{ "hooks": [ … ] }` shape + `${CLAUDE_PLUGIN_ROOT}`. How each harness treats it:

- **Codex** — manifest fields are `name`/`version`/`description`/`skills`, so
  there is no hooks key to set, **but Codex auto-discovers the root file**:
  *"if your plugin stores hooks at `./hooks/hooks.json`, you do not need a
  `hooks` entry … Codex checks that default file automatically."* Codex is
  built for Claude-hook compatibility — it *"also sets `CLAUDE_PLUGIN_ROOT` and
  `CLAUDE_PLUGIN_DATA` for compatibility with existing plugin hooks"* and uses
  the same nested, PascalCase event schema — so the push reminder is **expected
  to run on Codex** despite not being in `.codex-plugin/plugin.json`. (Whether
  Codex recognizes the `PostToolUse` event specifically is not runtime-verified
  here; the format and variables are compatible.)
- **Cursor** — it *does* expose a `hooks` field, but its hook schema uses
  camelCase events (`preToolUse`/`postToolUse`) and `${CURSOR_PLUGIN_ROOT}`, not
  Claude's `PostToolUse` + `${CLAUDE_PLUGIN_ROOT}`. Cursor's auto-discovery scans
  `rules/`/`skills/`/`agents/`/`commands/` (**not** `hooks/`), so leaving the
  manifest `hooks` field unset keeps the incompatible Claude-format file from
  being wired — the push reminder simply does not run on Cursor.
- **Gemini** — `gemini-extension.json` has no `skills`/`commands`/`hooks` keys;
  skills are **auto-discovered** from `skills/` (no manifest field required).
  Gemini's handling of a root `hooks/hooks.json`, and its hook event/variable
  names, are not verified here, so Anchor makes no claim that the push reminder
  runs on Gemini.

## Known caveat: locating the bundled CLI on non-Claude harnesses

`SKILL.md` locates the deterministic CLI by reading the
`Base directory for this skill: <dir>` line that Claude Code prints when it loads
a skill, then running `node "<plugin-root>/dist/anchor.mjs"`. That base-directory
convention is **Claude Code's**. Harnesses that load `SKILL.md` but do not print
that line will hit the skill's built-in guard:

> If there is no base-directory line or `dist/anchor.mjs` does not exist, tell the
> user the anchor plugin install looks broken …

i.e. the skill degrades to a clear error instead of guessing a path. The
manifests in this repo are written to the **current** published schemas for each
harness, but only Claude Code's loader is runtime-verified here (`claude plugin
validate .`). On Codex, Cursor, and Gemini the SKILL.md will load, but
end-to-end CLI invocation depends on whether that harness surfaces an equivalent
skill base directory — verify against a real install before relying on it.
