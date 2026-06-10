---
name: anchor
description: >
  Run Anchor code review operations. Subcommands:
  init (build codebase map + graph on first install),
  diff (structured diff), context (related files), review (full review in chat),
  full (doctor + review + archive), learn (manage per-repo learnings),
  status (summarize repo + last review + git state),
  doctor (run diagnostics).
argument-hint: "[init|diff|context|review|learn|status|doctor|full] [target]"
---

The user invoked Anchor with: $ARGUMENTS

Parse the first whitespace-separated token as the subcommand. Pass the
remaining tokens as the subcommand's arguments.

Subcommand behavior:
- `init [--refresh] [--depth N] [--no-prs] [--no-graph]`
                      → read ~/.claude/skills/anchor/SKILL.md and follow
                        the init workflow. Builds/refreshes
                        .anchor/codebase-map.md and .anchor/codebase-graph.md.
- `diff [target]`     → run `anchor diff <target>`, show the result
- `context [target]`  → run `anchor context --from-diff <target>`, show the result
- `review [target]`   → read ~/.claude/skills/anchor/SKILL.md and follow
                        the full review workflow, present the review in chat
- `review --explain <sha>` / `full --explain <sha>`
                      → run `anchor review show <sha>` and re-display the
                        archived review (no new review is performed)
- `full [target]`     → first run `anchor doctor`; bail if any check fails.
                        Then run the full review workflow. Then auto-archive
                        the review to .anchor/reviews/<date>-<sha>.md. Show
                        diff summary, related files consulted, learnings
                        applied, then the review itself.
- `learn <add|list|remove> [args]` → run `anchor learn <sub> <args>`
- `status`            → run `anchor status --format text`, show the summary
- `doctor`            → run `anchor doctor --format text`, show the report
- (no args)           → default to `review` (uncommitted changes)
