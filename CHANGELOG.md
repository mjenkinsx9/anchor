# Changelog

## v0.2.0 — 2026-06-10

Formal Claude Code plugin.

- Installable via a personal marketplace: `/plugin marketplace add mjenkinsx9/claude-plugins`,
  `/plugin install anchor@claude-plugins`
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
