# Changelog

## v0.2.1 — 2026-06-10

Two install-breaking fixes found while field-testing v0.2.0.

- Skill renamed `anchor` → `anchor-review`: the skill and the `/anchor` command
  shared one name, so the Skill tool resolved the command instead of the skill
  and SKILL.md never loaded (Claude fell back to guessing plugin paths)
- `bin/anchor.mjs` is now a loader that runs `lib/cli.mjs` in dev checkouts and
  falls back to the bundled `dist/anchor.mjs` where node_modules is absent
  (plugin cache) — previously it crashed with ERR_MODULE_NOT_FOUND: js-yaml
- CLI body moved to `lib/cli.mjs` (new bundle entry); behavior unchanged
- New regression tests: plugin-layout name-collision check, bin fallback
  without node_modules

Plus three CLI papercuts from the same field test:

- `uncommitted` and `staged` are now valid target words, so the `mode` the
  diff JSON reports round-trips into `anchor context --from-diff <mode>`
- Bare `anchor learn` defaults to `learn list` instead of exiting 1
- Bare `anchor hook` reports install status (`{installed, path}`) instead of
  exiting 1

## v0.2.0 — 2026-06-10

Formal Claude Code plugin.

- Installable via a personal marketplace: `/plugin marketplace add mjenkinsx9/mjenkins-toolbox`,
  `/plugin install anchor@mjenkins-toolbox`
- Single-file bundled CLI (`dist/anchor.mjs`, esbuild) — no PATH symlink, no node_modules
- PostToolUse push reminder registered declaratively via `hooks/hooks.json`
  (settings.json installer removed)
- New `anchor hook install|uninstall` replaces `make install-hook`/`uninstall-hook`
- Doctor now checks the bundle + install mode instead of symlinks
- Symlink install (`make install`/`make link`) removed

## v0.1.0 — 2026-06-10

Initial release.

- `/anchor` slash command + skill: review, full, init, diff, context, learn, status, doctor
- Review workflow: severity-graded findings, 0–5 confidence, strictness prior,
  learnings suppression with always-on security carve-out, Context used footer
- PR mode: `gh pr diff` + PR/issue context + CI failure context
- `anchor init`: codebase map + grep-based module dependency graph
- Push reminders: git pre-push hook (opt-in per repo) + Claude Code PostToolUse hook
- Four test layers: unit, integration, golden input snapshots, manual smoke
