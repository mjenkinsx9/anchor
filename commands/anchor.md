---
description: >
  Run Anchor code review operations. Subcommands:
  init (build codebase map + graph on first install),
  diff (structured diff), context (related files), review (full review in chat),
  full (doctor + review + archive), learn (manage per-repo learnings),
  status (summarize repo + last review + git state),
  doctor (run diagnostics), hook (per-repo push reminder).
argument-hint: "[init|diff|context|review|learn|status|doctor|full|hook] [target]"
---

The user invoked Anchor with: $ARGUMENTS

Invoke the `anchor` skill (Skill tool) and follow its subcommand dispatch
table with these arguments. The skill knows how to locate the bundled anchor
CLI inside this plugin — do not assume an `anchor` command is on PATH.

Quick reference:
- `init [--refresh] [--depth N] [--no-prs] [--no-graph]` → init workflow
- `review [target]` → review workflow; `review --explain <sha>` / `full --explain <sha>`
  re-display an archived review (no new review)
- `full [target]` → doctor gate + review + auto-archive
- `diff` / `context` / `learn` / `status` / `doctor` / `hook` → run the matching
  CLI subcommand and show the result
- (no args) → review uncommitted changes
