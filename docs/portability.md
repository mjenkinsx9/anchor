# Cross-harness portability notes

Anchor ships one portable core — the Agent Skill at
`skills/anchor-review/SKILL.md` — plus a thin per-harness manifest. The skill is
the only component **every** harness loads. The `/anchor` command and the
push-reminder hook are Claude-Code-native and only some harnesses pick them up,
because command and hook **formats differ between harnesses**. Nothing is
duplicated or rewritten; the manifests just point at the shared directories.

The table below is what actually **loads/runs**, not just what the manifest
declares (several harnesses auto-discover default directories):

| Harness            | Manifest                        | Skill | `/anchor` cmd | Push hook |
|--------------------|---------------------------------|:-----:|:-------------:|:---------:|
| Claude Code        | `.claude-plugin/plugin.json`    | ✓ | ✓ | ✓ |
| GitHub Copilot CLI | *(none — Claude fallback)*      | ✓ | ✓ | ⚠️ unverified |
| OpenAI Codex       | `.codex-plugin/plugin.json`     | ✓ | — | ✓ |
| Cursor             | `.cursor-plugin/plugin.json`    | ✓ | ✓ | 🟡 native |
| Gemini CLI         | `gemini-extension.json`         | ✓ | — | ✗ |

### Command (`/anchor`)

- **Claude / Cursor** declare `"commands": "./commands/"` and load the markdown
  command directly.
- **Copilot** has no default `commands` path (unlike `skills`/`agents`), so the
  canonical `.claude-plugin/plugin.json` declares `"commands": "./commands/"` —
  harmless for Claude (the key points into the default folder) and it registers
  `/anchor` for Copilot's fallback read.
- **Codex** has no `commands` field in its documented manifest schema.
- **Gemini** commands are TOML files (`commands/*.toml`), not the markdown
  `commands/anchor.md` we ship, so `/anchor` does not register. Gemini is
  effectively **skill-only**.

### Push-reminder hook

The shared root `hooks/hooks.json` is Claude-format: `PostToolUse` + the nested
`{ "hooks": [ … ] }` shape + `${CLAUDE_PLUGIN_ROOT}` (script:
`hooks/post-push-reminder.sh`). Hook event names **and** the stdout→context
protocol differ per harness, so a single file can't serve all of them. Handling,
all checked against current docs:

- **Codex** — auto-discovers the root file (*"you do not need a `hooks` entry …
  Codex checks that default file automatically"*) and is Claude-hook compatible
  (*"also sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility
  with existing plugin hooks"*, same nested PascalCase schema), so the hook is
  **expected to run**.
- **Copilot** — documents `${PLUGIN_ROOT}` for hook commands and does not
  publish its `hooks.json` schema or a `${CLAUDE_PLUGIN_ROOT}` compat alias on
  the reference page, so whether our hook runs is **unverified** (marked ⚠️).
- **Cursor** — different schema (camelCase events, `${CURSOR_PLUGIN_ROOT}`), and
  its auto-discovery scans `rules/`/`skills/`/`agents/`/`commands/` (**not**
  `hooks/`). So Anchor ships a **Cursor-native** hook —
  `hooks/cursor-hooks.json` (event `afterShellExecution`, command
  `${CURSOR_PLUGIN_ROOT}/hooks/push-reminder-cursor.sh`) wired via the
  `.cursor-plugin/plugin.json` `hooks` field. The script self-filters on
  `git push` and honours `ANCHOR_NO_REMIND`. **Caveat:** Cursor does not publish
  the hook stdin shape or how it surfaces hook stdout, so the reminder is emitted
  as plain text on a best-effort basis and is **not yet runtime-verified** (🟡) —
  the wiring follows the documented schema, but confirm on a live Cursor install.
- **Gemini** — *does* auto-discover the root file (*"Define hooks in a
  `hooks/hooks.json` file … hooks are not defined in the `gemini-extension.json`
  manifest"*), which means it can't be pointed at a Gemini-specific file, and it
  uses `AfterTool`/`BeforeTool` events (not `PostToolUse`) plus a path variable
  and output protocol that the reference page does **not** publish for hooks. So
  the shared Claude-format file is discovered but dead (✗), and a Gemini-native
  hook can't be authored faithfully from the docs (it would collide with the
  Claude file at the same path, and its command path-var + context-injection
  format are unknown). Not shipped; Gemini stays skill-only.

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
