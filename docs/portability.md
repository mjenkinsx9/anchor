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

A `—` for commands/hooks means that harness's manifest does not wire those
components:

- **Codex** — its documented manifest fields are `name`/`version`/`description`/
  `skills`, so there is no commands or hooks key to set.
- **Cursor** — it *does* expose a `hooks` field, but its hook schema uses
  camelCase event names (`preToolUse`, `postToolUse`) and does not substitute
  `${CLAUDE_PLUGIN_ROOT}`. Our `hooks/hooks.json` is Claude-format (`PostToolUse`
  + `${CLAUDE_PLUGIN_ROOT}`), so wiring it into the Cursor manifest would point
  at a config Cursor cannot interpret. The push-reminder hook stays
  Claude/Copilot-only rather than being declared in a format the harness would
  misread.
- **Gemini** — `gemini-extension.json` has no `skills`/`commands`/`hooks` keys in
  its documented schema; skills are **auto-discovered** from the `skills/`
  directory (no manifest field required), and the Claude-format command/hooks
  files are not declared.

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
