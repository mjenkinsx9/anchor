# Anchor on OpenCode — documented gap, not a shipped port

OpenCode does **not** have an Agent Skills primitive, and its plugins are not
declared with a JSON manifest. Per the [OpenCode plugin docs](https://opencode.ai/docs/plugins/),
a plugin is a **JavaScript/TypeScript module** placed in `.opencode/plugins/`
(project) or `~/.config/opencode/plugins/` (global), or published to npm and
listed under `"plugin"` in `opencode.json`. Each module exports a function that
receives a context (`project`, `directory`, `worktree`, `client`, `$`) and
returns a hooks object (`tool.execute.before`, `session.created`, etc.). Custom
behaviour is exposed as **tools** (description + Zod schema + `execute`), not as
a `SKILL.md` that the host model reads and follows.

Anchor's portable core is exactly that `SKILL.md` — a set of instructions the
host LLM session reads and executes, calling the deterministic CLI
(`dist/anchor.mjs`) for data gathering. OpenCode has nowhere to load those
instructions, so pointing a manifest at `skills/` (the approach used for every
other harness here) does not apply.

## What a real OpenCode port would require

A faithful port is tractable but is genuine new code, not packaging:

1. **A plugin module** (`.opencode/plugins/anchor.ts` or an npm package) that
   exports the OpenCode plugin function.
2. **Custom tools** wrapping the CLI subcommands — e.g. an `anchor_diff`,
   `anchor_context`, `anchor_init`, `anchor_learn` tool, each shelling out to
   `node dist/anchor.mjs <subcommand>` via the provided `$` helper and returning
   the JSON.
3. **Orchestration prompt injection.** The review *reasoning* currently lives in
   `SKILL.md` and is run by the host model. On OpenCode that workflow has to be
   re-expressed — either as a system/context prompt the plugin appends
   (`tui.prompt.append` / a context file) or as a higher-level `anchor_review`
   tool that returns the assembled context block for the model to reason over.
4. **CLI path resolution** without Claude Code's "Base directory for this skill"
   convention (see `docs/portability.md`); the plugin knows its own module path,
   so it can resolve `dist/anchor.mjs` directly.

None of the above is faked here. Until it is written and tested against a real
OpenCode install, Anchor does not claim OpenCode support.
