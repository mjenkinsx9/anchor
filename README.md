# Anchor

Personal code review for Claude Code. A `/anchor` slash command + skill backed
by small deterministic scripts. The LLM is your active Claude Code session —
no API keys, no servers, no per-call cost.

## Install

```bash
git clone <this-repo> && cd anchor
make install        # pnpm install + symlinks + Claude Code push reminder
```

Then in any repo, inside Claude Code:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Targets: `(none)` uncommitted · `--staged` · `main..feature` · `pr 123` ·
`pr <url>` · `@path/to/file`.

Optional per-repo push reminder: `cd <repo> && make -f <anchor>/Makefile install-hook`.

## Layout

- `skill/SKILL.md` — the review + init workflows Claude follows
- `commands/anchor.md` — the `/anchor` slash command
- `bin/anchor.mjs`, `lib/` — deterministic scripts (diff, context, learn, status, doctor)
- `.anchor/` (in *your* repo, gitignored) — config, learnings, codebase map, archived reviews

## Develop

```bash
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
```

Manual checklist: `tests/manual/SMOKE.md`. Design spec:
`docs/superpowers/specs/2026-06-09-anchor-design.md`.
