# Anchor

Personal code review for Claude Code, packaged as a plugin. A `/anchor` slash
command + skill backed by small deterministic scripts. The LLM is your active
Claude Code session — no API keys, no servers, no per-call cost.

## Install

Inside Claude Code, on any machine:

```
/plugin marketplace add mjenkinsx9/claude-plugins
/plugin install anchor@claude-plugins
```

Then in any repo:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Targets: `(none)` uncommitted · `--staged` · `main..feature` · `pr 123` ·
`pr <url>` · `@path/to/file`.

Optional per-repo git push reminder: `/anchor hook install` (remove with
`/anchor hook uninstall`). The Claude Code push reminder hook is registered
automatically by the plugin. `ANCHOR_NO_REMIND=1` silences both.

Update: bump happens in this repo; machines pick it up with `/plugin update anchor`.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest
- `skills/anchor/SKILL.md` — the review + init workflows Claude follows
- `commands/anchor.md` — the `/anchor` slash command
- `hooks/hooks.json`, `hooks/post-push-reminder.sh` — PostToolUse push reminder
- `bin/anchor.mjs`, `lib/` — deterministic scripts (source)
- `dist/anchor.mjs` — committed single-file bundle the skill invokes
- `.anchor/` (in *your* repo, gitignored) — config, learnings, codebase map, archived reviews

## Develop

```bash
pnpm install
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
make bundle               # regenerate dist/anchor.mjs (required before release)
```

Release: bump `.claude-plugin/plugin.json` + `package.json` versions →
`make bundle` → suites green → update CHANGELOG → commit → `git tag vX.Y.Z` →
push with tags.

Manual checklist: `tests/manual/SMOKE.md`. Design specs:
`docs/superpowers/specs/`.
