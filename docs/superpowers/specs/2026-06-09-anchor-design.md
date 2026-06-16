# Anchor — Design Spec

**Date:** 2026-06-09
**Status:** v1.6 — review pass: git hook corrected to `pre-push` (git has no post-push hook), Makefile target names fixed, non-goals reconciled with later additions
**Author:** Brainstorming session output (user + assistant)

---

## 1. Overview

**Anchor** is a personal, self-hosted, AI-driven code review tool. It runs as a Claude Code plugin: a slash command (`/anchor`) that dispatches to a set of subcommands (`init`, `diff`, `context`, `review`, `learn`, `status`, `doctor`, `full`), backed by a small set of TypeScript scripts that handle the deterministic picking-apart (diff parsing, context gathering, learnings CRUD, review archiving, repo status, diagnostics). The LLM that does the review reasoning is the one already running in the user's active Claude Code session — Anchor does not invoke any LLM directly, does not require an API key, and does not charge per-call (Anthropic is charging for headless `claude -p` starting 2026-06-15, so all LLM work happens in the active session). A gentle push reminder (git pre-push hook + Claude Code PostToolUse hook) prompts the user to run `/anchor review` when they push; the reminder never auto-runs the review.

Anchor is a personal tool, not a SaaS. No multi-user, no billing, no web dashboard, no Slack/Jira/Linear, no GitHub App, no agentic actions, no embeddings/AST/graph. Those features are part of the v1.4 commercial spec packet in `Anchor-Spec-Bundle/anchor-spec-packet-v1.4-complete/` and are explicitly out of scope for the personal MVP.

## 2. Goals & Non-Goals

### Goals
- Provide a single, fast, well-scoped code review for the user's own code changes
- Use the LLM the user is already paying for (Claude Code OAuth subscription)
- Respect the user's own project instructions (`CLAUDE.md`, `AGENTS.md`, `.anchor/instructions.md`)
- On first install, build a personal map of the codebase (structure, conventions, problem areas, module graph) that subsequent reviews use as context
- Learn from feedback over time (👍/👎 → `.anchor/learnings.md`)
- Produce a 0–5 confidence score with reasoning (per the v1.4 spec)
- Produce severity-tagged, category-tagged findings with file:line and suggested fixes
- Archive full reviews for later reference
- Provide at-a-glance repo + last-review + git state via `/anchor status`
- Remind the user to re-review when they push (gentle, not auto-run) via git pre-push + Claude Code PostToolUse hooks
- Be safe to install: no servers, no daemons, no system-level changes outside the repo (hooks are opt-in per repo)

### Non-Goals (explicitly)
- Multi-user / teams / organizations
- Billing, seats, SSO/SAML, audit logs
- Web dashboard / status pages
- Slack, Jira, Linear integrations (lightweight GitHub PR/issue context via `gh` *is* in scope — §7a Step 3b)
- GitHub App / GitLab webhook integration
- Embeddings, AST parsing, symbol-level code graphs (Anchor builds a lighter grep-based *module* dependency graph instead — §7b)
- Approvability / auto-approval
- "Fix It For Me"-style autonomous branch/PR creation (in-chat `fix finding N` proposals via Claude Code's normal diff workflow *are* in scope — §7a Step 8)
- IDE plugins / MCP server (we use Claude Code's built-in tools)
- Multiple LLM provider support (Claude only; uses whatever model is active in the user's Claude Code session)
- Online / cloud-hosted mode (everything runs locally)

## 3. Architecture

Anchor is **a git repo of markdown + TypeScript files**. There is no Anchor process, no Anchor server, no `npm` package. The repo contains:

- A **skill** (`skill/SKILL.md`) — auto-loaded by Claude Code when the user invokes the review workflow. It teaches Claude the full review pipeline.
- A **slash command** (`commands/anchor.md`) — exposes `/anchor` with subcommand dispatch via argument-hint.
- A **TypeScript CLI** (`bin/anchor.mjs` + `lib/*.mjs`) — handles the deterministic work the LLM should not do.
- **Hooks** (`hooks/pre-push`, `hooks/post-push-reminder.sh`) — gentle push reminder (git + Claude Code). Installed opt-in. (Git has no post-push hook; the git-side reminder uses `pre-push`, which fires when `git push` runs.)
- **Templates** (`templates/`) — default config.yaml, learnings.md seed, review format spec.
- **Examples** (`examples/`) — what a good vs. bad review looks like.
- **Tests** (`tests/`) — unit, integration, golden, and a manual smoke test.

When installed, the following symlinks exist (created by `make link`):

```
~/bin/anchor                            → <repo>/bin/anchor.mjs
~/.claude/skills/anchor/SKILL.md        → <repo>/skill/SKILL.md
~/.claude/commands/anchor.md            → <repo>/commands/anchor.md
```

`make install` also adds a Claude Code PostToolUse hook entry to `~/.claude/settings.json` (additive, idempotent). The git pre-push hook is opt-in per repo via `make install-hook` (run from inside the target repo).

The user runs `/anchor review` (or any other subcommand) in a Claude Code chat. Claude Code reads the slash command, dispatches based on the subcommand, and either:
- (for `diff`, `context`, `learn`, `status`, `doctor`, `init` data gathering) runs the corresponding `anchor` script via Bash and shows the result
- (for `review`, `full`, `init` synthesis) reads the skill at `~/.claude/skills/anchor/SKILL.md` and follows the relevant workflow

State lives inside the reviewed repo at `.anchor/` (gitignored by default). The Anchor repo itself contains no per-project state.

### Data flow

```
User types:  /anchor review main..feature/foo
                │
                ▼
Claude Code reads: ~/.claude/commands/anchor.md
                │
                ▼
Slash command body: parses $ARGUMENTS, sees "review", dispatches
                │
                ▼
Skill auto-loaded: ~/.claude/skills/anchor/SKILL.md
                │
                ▼
Skill workflow (executed by Claude using its built-in tools):
   1. Bash:  anchor diff main..feature/foo --json
   2. Bash:  anchor context --from-diff main..feature/foo --max-files 50
   3. Read:  .anchor/config.yaml
   4. Read:  .anchor/learnings.md
   5. Read:  CLAUDE.md, AGENTS.md, .anchor/instructions.md
   6. Read:  each related file's content
   7. Reason (LLM does the review, applying config + learnings + instructions)
   8. Write/Edit: render the review per format spec
                │
                ▼
User sees the review in chat. Replies:
   "mark finding 3 as noise"  →  Bash: anchor learn add "..."  (Learnings persisted)
   "save review"              →  Bash: anchor review save       (Archived to .anchor/reviews/)
   "fix finding 1"            →  Claude proposes a patch (uses Claude Code's normal diff workflow)
```

## 4. Slash Command & Subcommands

### `commands/anchor.md` (the `/anchor` slash command)

```markdown
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
- `init [--refresh] [--depth N] [--no-prs]`
                     → read ~/.claude/skills/anchor/SKILL.md and follow
                        the init workflow. Builds/refreshes
                        .anchor/codebase-map.md and .anchor/codebase-graph.md.
- `diff [target]`     → run `anchor diff <target>`, show the result
- `context [target]`  → run `anchor context <target>`, show the result
- `review [target]`   → read ~/.claude/skills/anchor/SKILL.md and follow
                        the full review workflow, present the review in chat
- `full [target]`     → first run `anchor doctor`; bail if any check fails.
                        Then run the full review workflow. Then auto-archive
                        the review to .anchor/reviews/<date>-<sha>.md. Show
                        diff summary, related files consulted, learnings
                        applied, then the review itself.
- `learn <add|list|remove> [args]` → run `anchor learn <sub> <args>`
- `status`            → run `anchor status`, show the repo + last review + git state summary
- `doctor`            → run `anchor doctor`, show the report
- (no args)           → default to `review` (uncommitted changes)
```

### Argument forms accepted by subcommands

| Subcommand | Arguments | Meaning |
|---|---|---|
| `init` | (none) | build `.anchor/codebase-map.md` and `.anchor/codebase-graph.md` (asks for confirmation if they already exist) |
| `init` | `--refresh` | rebuild the map and graph unconditionally |
| `init` | `--depth N` | analyze the last N commits and N PRs (default: 100 commits, 50 PRs) |
| `init` | `--no-prs` | skip the PR analysis (useful if no `gh` or no PRs) |
| `init` | `--no-graph` | build only the map, skip the dependency graph |
| `diff`, `context`, `review`, `full` | (none) | uncommitted + staged changes in cwd |
| `diff`, `context`, `review`, `full` | `--staged` | staged changes only |
| `diff`, `context`, `review`, `full` | `<ref1>..<ref2>` | diff between two git refs (e.g. `main..feature/foo`) |
| `diff`, `context`, `review`, `full` | `pr <number>` | PR by number in the current repo (or the repo at cwd) |
| `diff`, `context`, `review`, `full` | `pr <url>` | PR by full GitHub URL — works for any repo the user has access to, including forks and cross-org PRs |
| `diff`, `context`, `review`, `full` | `@<path>` | review a single file in full (no diff) |
| `review`, `full` | `--explain <sha>` | re-show a past review from `.anchor/reviews/` |
| `learn` | `add "<pattern>" [--reason "..."]` | append a learning |
| `learn` | `list` | show all learnings |
| `learn` | `remove "<substring>"` | remove a learning whose heading matches |
| `status` | (none) | summarize repo state, last review, and git status |
| `status` | `--json` | output the full status object as JSON |
| `doctor` | (none) | run diagnostics |

## 5. Per-Repo State & Config

### Directory layout (created on first run, gitignored)

```
<your-project>/
├── .anchor/
│   ├── config.yaml              # Per-repo config (gitignored)
│   ├── codebase-map.md          # Synthesized overview of the codebase (gitignored) — built by `anchor init`
│   ├── codebase-graph.md        # Module dependency graph (gitignored) — built by `anchor init`
│   ├── learnings.md             # Noise patterns (gitignored)
│   └── reviews/                 # Archived reviews (gitignored)
│       └── 2026-06-09-abc1234.md
└── .gitignore                   # Anchor adds .anchor/ entries on first run
```

`.gitignore` lines added idempotently on first run:

```
# Anchor (personal code review state)
.anchor/config.yaml
.anchor/codebase-map.md
.anchor/codebase-graph.md
.anchor/learnings.md
.anchor/reviews/
```

A user who wants to share the config or learnings with a team can manually remove those `.gitignore` lines. A future enhancement: a `share: true` flag in `config.yaml` to auto-remove the gitignore entries.

### `.anchor/config.yaml` schema

```yaml
# Anchor per-repo config. Personal, gitignored by default.

# Files/patterns to never review. Globs.
ignore:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/fixtures/**"
  - "**/*.lock"
  - "**/*.generated.*"
  - "**/migrations/**"
  - "vendor/**"
  - "node_modules/**"

# Findings below this severity are suppressed.
# One of: critical, high, medium, low. Default: low.
min_severity: low

# How aggressively the LLM should look for issues. This is a *prior* on
# what the reviewer is told to look for; min_severity above is a *post-hoc*
# filter on what gets surfaced. The two work together.
#   1 = verbose      — flag logic, style, naming, organization, doc quality,
#                      performance, security. Comment on minor things.
#   2 = balanced     — focus on bugs, security, performance, error handling.
#                      Comment on style only if it affects readability or
#                      maintainability. (default)
#   3 = critical-only — only flag bugs, security vulnerabilities, data loss
#                      risks, crashes. Skip style, naming, organization,
#                      optimization opportunities.
strictness: 2

# Maximum number of findings to surface per review. Default: 50.
max_findings: 50

# Categories to focus on. Default: all.
# Options: logic, security, perf, style, docs, tests
categories:
  - logic
  - security
  - perf

# Confidence score floor. Findings the LLM rates below this
# confidence are not surfaced. 0-5, default: 2.
min_confidence: 2

# Diff limits
max_diff_lines: 2000
max_files: 100

# Output options
output:
  show_whats_good: true
  show_diff_stats: true
  color: auto             # auto|always|never
```

### `.anchor/learnings.md` format

```markdown
# Anchor Learnings

<!--
This file is auto-managed by Anchor. Each entry is a "noise pattern" the
user has marked as not worth surfacing in future reviews. Edit by hand or
via `anchor learn add|remove`.

Format: one entry per H3 section. The body describes the pattern; the
optional `<!-- reason: ... -->` comment captures why it was marked.
-->

### Use `==` for string equality in this codebase
<!-- reason: legacy code, intentional, do not flag -->

### Missing docstrings on private methods
<!-- reason: project style, internal API -->

### Unused parameters in event handlers
<!-- reason: required by interface contract -->
```

The skill reads this file at review time, treats each `### …` heading as a "do not surface" rule, and includes them in the review prompt with phrasing like: "The user has previously marked these patterns as noise. Do not flag them in your review unless they create a real bug."

## 6. Custom Instructions Detection

The skill reads these files in order and concatenates them into the "context block" fed to the LLM. The first three are auto-detected; the last is Anchor-specific.

| File | Source | Precedence |
|---|---|---|
| `CLAUDE.md` (cwd and each parent up to repo root) | Claude Code standard | 1st |
| `AGENTS.md` (repo root) | cross-tool standard | 2nd |
| `.anchor/instructions.md` (repo root) | Anchor-specific | last (highest precedence) |

This mirrors Macroscope's custom correctness instructions, in a simpler shape. Anchor's custom instructions are **additive** — they extend the LLM's understanding of the project; they don't replace the LLM's default review behavior. If a file isn't present, it's skipped silently.

`.anchor/instructions.md` may have YAML frontmatter with `include` / `exclude` globs:

```markdown
---
include:
  - "**/*.ts"
  - "**/*.tsx"
exclude:
  - "**/*.test.ts"
---

**TypeScript rules for this repo:** strict mode, no `any`, prefer
`unknown` + type guards. Prefer functional components.
```

When the diff touches a file matching `include` and not matching `exclude`, those instructions are folded into the review prompt. Multiple instruction files in `.anchor/instructions.d/*.md` will stack (additive, not replacing).

## 7. Workflows (in `SKILL.md`)

`SKILL.md` defines two workflows: the **review workflow** (for `review` and `full`) and the **init workflow** (for `init`). The skill frontmatter declares both so the argument-hint is visible when the skill is loaded.

```markdown
---
name: anchor
description: >
  Anchor is a personal code review tool for Claude Code. Use this skill
  when the user runs /anchor to perform a code review, initialize a
  repo's codebase map, gather context for a diff, manage per-repo
  learnings, check repo status, or run diagnostics.
argument-hint: "[init|diff|context|review|learn|status|doctor|full] [target]"
---
```

### 7a. Review workflow

When the slash command dispatches to `review` (or `full`), Claude reads `skill/SKILL.md` and follows this workflow.

**Step 1 — Resolve the target.** Parse `$ARGUMENTS` to determine the review mode (uncommitted / staged / ref-diff / pr / file). Validate the target makes sense (e.g., `main..feature/foo` exists, `pr 123` is a real PR). If not, ask the user.

**Step 2 — Read project state.** Read these files directly with Claude Code's Read tool:
- `.anchor/config.yaml` (if present)
- `.anchor/codebase-map.md` (if present — built by `anchor init`, see §7b)
- `.anchor/codebase-graph.md` (if present — built by `anchor init`, see §7b)
- `.anchor/learnings.md` (if present)
- `CLAUDE.md` at cwd and each parent directory up to repo root
- `AGENTS.md` (if present at repo root)
- `.anchor/instructions.md` and any `.anchor/instructions.d/*.md` (if present, filtered by glob frontmatter)

If neither `codebase-map.md` nor `codebase-graph.md` is present, mention to the user: "Tip: run `/anchor init` to build a codebase map and dependency graph for richer reviews." (Don't refuse to review — the grep context still works.)

**Step 3 — Get the diff.** Run `anchor diff <target> --json` via Bash. Parse the structured output: `{ files: [{ path, hunks: [...], added, removed }] }`. Apply `ignore` patterns from config. Bail if diff exceeds `max_diff_lines` or `max_files`.

**Step 3b — Get PR/issue context (PR mode only).** If the target is a PR (`anchor review pr <N>`), fetch the PR body and any linked closing issues via:

```bash
gh pr view <N> --json title,body,closingIssues
```

Add the PR title + body + each linked issue's title + body to the context block. This lets the LLM verify the change actually addresses the stated requirements (acceptance criteria, scope, "fixes #N" intent). If `gh` is unavailable or the PR has no body / no linked issues, skip silently — never block the review on missing PR metadata. The PR context is opt-in: users can pass `--no-pr-context` to skip it.

**Step 3c — Get CI failure context (PR mode only).** If the target is a PR and the user hasn't passed `--no-ci-context`, fetch the PR's check status and any failed-run logs:

```bash
gh pr checks <N>                                  # list of checks + conclusions
gh run view <run-id> --log-failed                 # logs of the most recent failed run, if any
```

If any check failed, add the failed check name(s) + the relevant log lines (capped at ~2000 lines to keep the context block bounded) to the prompt under a clearly labeled `## CI failure context` section. This lets the LLM correlate CI failures back to the changed lines and surface "this test broke because of your change" findings the diff alone wouldn't show. If all checks pass, or the PR has no CI runs yet, skip silently. If `gh` is unavailable or `gh pr checks` errors, skip silently — never block the review.

**Step 4 — Get related files.** Run `anchor context --from-diff <target> --max-files 50` via Bash. Parse the output: `{ files: [{ path, reason: "importer" | "importee" | "definition" }] }`. Read each file's content with the Read tool (capped by `max_files` and a token budget).

**Step 5 — Build the context block.** Combine diff + related files + project instructions + learnings + config (+ PR body / linked issues, if PR mode; + CI failure logs, if PR mode and any checks failed) into a single context block to be reasoned over. The PR/issue and CI sections are added under clearly labeled `## PR/issue context` and `## CI failure context` sections so the LLM knows which part is "what was asked" vs "what the code does" vs "what CI is complaining about."

As the context block is assembled, the skill also maintains a **sources-used list**: an ordered list of every source consulted, with rough size hints. This list is later surfaced in the review's `Context used` footer (Step 7) so the user can verify the LLM had the right context. Sources to track:
- `.anchor/codebase-map.md` (if present)
- `.anchor/codebase-graph.md` (if present)
- `.anchor/config.yaml` (if present)
- `.anchor/learnings.md` (if present, with pattern count)
- `CLAUDE.md` and parent `CLAUDE.md` files (if present)
- `AGENTS.md` (if present)
- `.anchor/instructions.md` and `.anchor/instructions.d/*.md` (if present)
- Each related file (with reason: importer / importee / definition)
- PR body + each linked issue (PR mode)
- CI failure log lines (PR mode, capped at 2000)
- Any custom instruction file matched by glob frontmatter

If a source was attempted but failed to load (e.g., `gh` errored on PR metadata), note "(failed: <reason>)" instead of dropping silently — the user should see what the LLM didn't have.

**Step 6 — Reason and produce the review.** The LLM (Claude in the active session) reviews the diff in light of the context. It produces:
- A 0–5 confidence score with reasoning
- A list of findings, each tagged with severity, category, file:line, code snippet, explanation, and suggested fix
- A "what's good" section (if `output.show_whats_good: true`)
- A footer with interactive options

The LLM is told explicitly: "Be honest. If the code is clean, say so. Do not invent issues to fill quota. Respect the user's noise markings and the project's stated rules." The LLM is also told what strictness level to apply, drawn from `.anchor/config.yaml` → `strictness` (default 2 = balanced):
- `strictness: 1` (verbose) — "Look for everything: logic, style, naming, organization, doc quality, performance, security. Comment on minor things."
- `strictness: 2` (balanced) — "Focus on bugs, security, performance, error handling. Comment on style only if it affects readability or maintainability."
- `strictness: 3` (critical-only) — "Only flag bugs, security vulnerabilities, data loss risks, crashes. Skip style, naming, organization, optimization opportunities."

`strictness` is a *prior* (what the LLM is told to look for); `min_severity` is a *post-hoc* filter (what gets surfaced after the LLM generates the review). The two compose. A user on `strictness: 3` with `min_severity: high` will get a very quiet review — only the loudest correctness/security issues make it through.

In PR mode, it is also told: "If the diff is linked to a closing issue, verify the change addresses the stated acceptance criteria. Call out any criteria that appear unmet. If any CI check failed, correlate the failure back to the changed lines and call out which change likely caused it."

**Safety guardrail (always-on, never overridden by config or learnings).** The LLM is told: "Even when `strictness: 3` is set or `.anchor/learnings.md` would otherwise suppress a pattern, you must always surface CRITICAL and HIGH severity security and correctness issues. Personal preference is never a reason to silence a real bug. Concretely, this means you must always flag, regardless of noise markings: auth or authorization bypass; secret, credential, or token leak (hard-coded keys, logged passwords, exposed env vars); SQL injection, command injection, path traversal, XSS, SSRF; null or undefined deref on external or untrusted input; infinite loops or runaway resource use; unhandled promise rejection or swallowed error on the success path of an I/O operation; data loss or corruption (dropped writes, race conditions on shared state, missing transactions); insecure deserialization; missing input validation on a security-sensitive boundary. If a finding is in the carve-out, surface it — even if a learning says not to. If a learning pattern and a carve-out issue conflict, the carve-out wins."

**Step 7 — Render the review.** Output follows the format spec (Section 8). The render appends a `Context used` block (built from the sources-used list in Step 5) listing every source the LLM actually consulted, with failed sources noted. This makes the review reproducible and auditable — the user can verify the LLM had the right context, and if a finding seems off, the user can check whether a source was missing.

**Step 8 — Handle follow-ups.** The user can reply with:
- `mark finding N as noise` → Claude runs `anchor learn add "<pattern>"`
- `explain finding N` → Claude gives more context
- `fix finding N` → Claude proposes a patch (uses Claude Code's normal diff workflow, does not auto-apply)
- `fix all` → Claude walks through every finding in severity order (CRITICAL → LOW) and proposes a patch for each in turn
- `generate docstrings` → Claude adds docstrings (per language convention) to changed functions, classes, and exported symbols in the diff
- `generate tests` → Claude writes unit tests for the changed code paths, following the project's existing test style and framework
- `simplify` → Claude looks for opportunities to simplify the changed code (dead code, redundant conditionals, clearer naming, collapsed duplication) and proposes a refactor
- `save review` → Claude runs `anchor review save` (the script computes the `.anchor/reviews/<date>-<sha>.md` path itself; an optional `[path]` argument overrides it)

The three "generate" / "simplify" replies are post-review finishing touches — the LLM in the active session already has the diff + related files + project instructions in context, so no extra data gathering is needed. They use Claude Code's normal diff workflow, same as `fix finding N`.

For `/anchor full`, the workflow additionally:
- Runs `anchor doctor` first; bails if any check fails
- Auto-archives the review at the end (no need for the user to say "save review")
- Includes diff summary, related files consulted, and learnings applied in the output

### 7b. Init workflow

When the slash command dispatches to `init`, Claude reads the skill and follows this workflow. The init step runs once on first install (and can be re-run anytime) to build a personal map of the codebase that the review workflow reads at Step 2.

**Step 1 — Pre-flight.** Run `anchor init <flags> --json` via Bash. Parse the structured raw data:
- The directory tree (top-level dirs, file count, language mix)
- The dependency graph (per-file import list, derived from grep)
- Recent commits (last N, default 100) with stats
- Past PRs (last N, default 50) — only if `gh` is available and authenticated
- Hot files (most-frequently modified in the last N commits)

**Step 2 — Check existing state.** If `.anchor/codebase-map.md` or `.anchor/codebase-graph.md` already exist and `--refresh` was not passed, ask the user: "codebase-map.md and codebase-graph.md already exist. Refresh (overwrite), or skip?" Default: ask.

**Step 3 — Synthesize the codebase map.** The LLM (Claude in the active session) writes `.anchor/codebase-map.md` using the raw data from Step 1. The map should cover:
- **Structure**: top-level directories and what each one is for
- **Key modules**: the 5–15 most important files/modules and their responsibilities
- **Coding conventions**: patterns observed in commit history and the code itself (naming, error handling, test style, common idioms)
- **Problem areas**: files that change frequently, areas where bugs cluster, patterns the user has had to fix multiple times
- **Recurring feedback themes**: things past PRs have flagged (if PR data is available)

The skill instructs the LLM: "Write for your future self at review time. Be specific and concrete — name files, quote snippets. Skip generic platitudes ('the code uses TypeScript')."

**Step 4 — Build the dependency graph.** Write `.anchor/codebase-graph.md`:
- A tree/list of import relationships between the top-level modules
- For each module: what it imports, what imports it (its "callers")
- Hot files (most-modified) and critical files (most-imported) called out
- Rendered as a markdown tree or indented list, not a visual diagram (the LLM reads it as text)

**Step 5 — Confirm.** Print a summary to the user: "✓ Wrote .anchor/codebase-map.md (12 KB) and .anchor/codebase-graph.md (4 KB). Reviews will use these for richer context. Re-run `/anchor init --refresh` anytime to update."

**`/anchor init` argument forms:**
- `/anchor init` — first-time build, asks before overwriting
- `/anchor init --refresh` — rebuild unconditionally
- `/anchor init --depth 50` — analyze only the last 50 commits and 50 PRs
- `/anchor init --no-prs` — skip the PR analysis
- `/anchor init --no-graph` — build only the map, skip the dependency graph

`make install` does not auto-run init (init is per-repo and requires an active Claude Code session for the LLM synthesis step). The install message tells the user to run `/anchor init` in their repo.

### 7c. Push reminder

Anchor ships with a small **push-time hook** that fires on every `git push` and offers to run a review. It does NOT auto-run the review — it just prints a reminder. The user decides whether to act on it.

> **Why pre-push, not post-push:** git has no client-side `post-push` hook. The closest hook is `pre-push`, which git invokes when `git push` runs (just before the transfer). Anchor's hook prints the reminder and exits 0, so the push always proceeds — it never blocks or gates the push.

**Two flavors, installed differently:**

1. **Git pre-push hook** (always works) — installed per-repo via `make install-hook` (run from inside each repo you want it in). The Makefile copies `hooks/pre-push` to `.git/hooks/pre-push` and chmods it executable. Prints to the terminal:

   ```
   [anchor] Pushing to <remote>/<branch>.
     To review these commits after the push:  /anchor review @{u}..HEAD
     To review the PR (if any):               /anchor review pr <number>
     Or run /anchor status for a repo summary.
   ```

   (The hook reads `<remote>` and `<branch>` from the arguments and ref list git passes to `pre-push`.) Works whether or not Claude Code is open. Visible only in the terminal that ran the push. Cannot be installed by `make install` globally because Anchor doesn't know which repos the user wants it in.

2. **Claude Code PostToolUse hook** (in-context) — installed globally into `~/.claude/settings.json` by `make install`. Detects when the user runs `git push` *inside* Claude Code's Bash tool. Injects additional context that asks Claude to offer the review in-chat:

   > "The user just ran `git push`. Offer to run `/anchor review` on either (1) the latest commit, or (2) the PR if one was created/updated. Wait for their answer before invoking."

   Claude then prints the offer in the chat and waits for the user to respond. The user can say "yes, run it" or "no thanks" or pick a specific target.

The user can disable either hook:
- Git hook: `make uninstall-hook` (or just `rm .git/hooks/pre-push`)
- Claude Code hook: remove the entry from `~/.claude/settings.json`, or set `ANCHOR_NO_REMIND=1` in the environment — the hook script checks that variable first and exits silently if set

The hook script lives at `hooks/pre-push` in the Anchor repo and is copied to `.git/hooks/pre-push` by the Makefile. It's a tiny bash script (~15 lines) that prints the reminder and exits 0.

## 8. Output Format

```
────────────────────────────────────────────────────────────────
  Anchor Review  ·  main..feature/foo  ·  abc1234
  2026-06-09 14:32  ·  3 files changed, +47 / −12
────────────────────────────────────────────────────────────────

  Confidence: 3 / 5
  Reasoning:  Two medium-severity findings around error handling
              and one performance concern. Otherwise solid.

────────────────────────────────────────────────────────────────
  🔴 CRITICAL  (0)
────────────────────────────────────────────────────────────────
  None.

────────────────────────────────────────────────────────────────
  🟠 HIGH  (1)
────────────────────────────────────────────────────────────────

  src/auth/login.ts:42  ·  security
  ────────────────────────────────────────────────────────────
  The password comparison uses `==` instead of a constant-time
  compare, exposing the app to a timing attack.

  42 |   if (input.hash == stored.hash) {
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  Suggested fix:
  41 |   if (crypto.timingSafeEqual(
  42 |     Buffer.from(input.hash),
  43 |     Buffer.from(stored.hash)
  44 |   )) {

────────────────────────────────────────────────────────────────
  🟡 MEDIUM  (2)
────────────────────────────────────────────────────────────────

  src/api/users.ts:88  ·  logic
  ...

────────────────────────────────────────────────────────────────
  🟢 LOW  (0)
────────────────────────────────────────────────────────────────
  None.

────────────────────────────────────────────────────────────────
  ✨ What's good
────────────────────────────────────────────────────────────────
  • Tests cover the new error path in `login.test.ts`
  • Type narrowing is clean across the `User` union

────────────────────────────────────────────────────────────────
  Next steps
────────────────────────────────────────────────────────────────
  Reply with:
    "mark finding N as noise"    to suppress this pattern
    "explain finding N"          for more context
    "fix finding N"              to apply the suggested fix
    "fix all"                    to walk through every finding and patch in turn
    "generate docstrings"        to add docstrings to changed symbols
    "generate tests"             to write unit tests for the changed code
    "simplify"                   to propose a refactor of the changed code
    "save review"                to archive a copy in .anchor/reviews/
────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────
  Context used
────────────────────────────────────────────────────────────────
  .anchor/codebase-map.md
  .anchor/codebase-graph.md
  .anchor/config.yaml
  .anchor/learnings.md (7 patterns applied, 0 suppressed this review)
  CLAUDE.md, AGENTS.md
  Related files: 12 (8 importers, 4 importees)
  PR body + 2 linked issues
  CI: 1 failed check ("test:auth") — log lines 142-201
────────────────────────────────────────────────────────────────
```

The format is intentionally identical to what Greptile/CodeRabbit/Macroscope produce: severity-grouped findings with code snippets, a confidence score with reasoning, and clear next-step affordances. The 0–5 confidence score vocabulary comes from the v1.4 spec.

## 9. Scripts (TypeScript, in `bin/` and `lib/`)

### The `anchor` command surface

Pure Node ESM, with two small npm dependencies (`js-yaml`, `minimatch`). Installed by symlinking `bin/anchor.mjs` to a directory on `PATH` (e.g. `~/bin/anchor`).

```
anchor init [--refresh] [--depth N] [--no-prs] [--no-graph]   # Build codebase-map.md and codebase-graph.md

anchor diff [target]                    # Structured diff (default: uncommitted)
anchor diff main..feature/foo           # Diff between refs
anchor diff pr 123                      # PR diff via `gh pr diff`
anchor diff --json                      # Always emit JSON
anchor diff --format text               # Human-readable

anchor context <file> [--depth N]       # Related files for one file
anchor context --from-diff <target>     # Related files for all files in a diff
anchor context --max-files 50           # Cap result count

anchor learn list                       # Show all learnings
anchor learn add "<pattern>" [--reason "..."]   # Append a learning
anchor learn remove "<pattern>"         # Remove a learning
anchor learn --format text              # Human-readable, for prompt injection

anchor status                           # Summarize repo + last review + git state
anchor status --json                    # Output as JSON for piping

anchor review save [path]               # Archive current review
anchor review list                      # List archived reviews
anchor review show <sha>                # Re-display a past review

anchor config                           # Show resolved config (with defaults filled in)
anchor config validate                  # Validate .anchor/config.yaml

anchor doctor                           # Run diagnostics
```

All subcommands return JSON by default; `--format text` switches to human-readable.

### Repo layout for scripts

The `bin/anchor.mjs` and `lib/*.mjs` files are **plain ESM JavaScript** with optional JSDoc type annotations. They run directly with Node 18+ — no compilation step. The `tsconfig.json` is used only by `tsc --noEmit` for type checking (no build output, no `dist/`). The Makefile's `build` target runs `tsc --noEmit` to verify types but produces no files.

```
anchor/
├── package.json                        # bin entry + deps (js-yaml, minimatch)
├── tsconfig.json                       # For `tsc --noEmit` type checking only
├── Makefile                            # install / build (typecheck) / test / link / install-hook / uninstall-hook targets
├── bin/
│   ├── anchor.mjs                      # Subcommand dispatcher (ESM JS)
│   └── install-posttool-hook.mjs       # Adds PostToolUse hook to ~/.claude/settings.json (idempotent)
├── hooks/
│   ├── pre-push                        # Git pre-push hook (bash, ~15 lines; prints reminder, exits 0)
│   └── post-push-reminder.sh           # Claude Code PostToolUse hook (bash, detects git push)
├── lib/
│   ├── diff.mjs                        # git diff / gh pr diff → structured JSON
│   ├── context.mjs                     # git grep → related files
│   ├── learn.mjs                       # read/write .anchor/learnings.md
│   ├── review.mjs                      # save/archive a review
│   ├── init.mjs                        # gather raw data for codebase map + graph
│   ├── status.mjs                      # gather repo + last-review + git state
│   ├── config.mjs                      # .anchor/config.yaml loader + defaults
│   ├── doctor.mjs                      # diagnostics
│   ├── git.mjs                         # child_process wrappers
│   ├── ignore.mjs                      # glob matching
│   └── frontmatter.mjs                 # YAML frontmatter read/write
```

### `lib/diff.mjs` — diff parser

Inputs: target (uncommitted / staged / ref-diff / pr / file). Output: JSON
```
{
  mode: "ref-diff" | "uncommitted" | "staged" | "pr" | "file",
  ref1?: string, ref2?: string,
  prNumber?: string, prUrl?: string,
  files: [
    {
      path: string,
      added: number, removed: number,
      hunks: [
        { oldStart: number, oldLines: number, newStart: number, newLines: number, body: string }
      ]
    }
  ],
  stats: { totalAdded: number, totalRemoved: number, fileCount: number }
}
```

For PR mode:
1. Resolve the owner/repo (from the URL, or from `gh repo view` if only a number is given)
2. Get PR metadata with `gh pr view <number> --json headRefName,baseRefName,headRepositoryOwner,headRepository` to learn the head and base refs
3. Add the head repo as a remote if it's a fork (`gh repo view`), fetch the head ref
4. Run `git diff <baseRef>...<headRef>` to produce the structured diff
5. Fall back to `gh api repos/{owner}/{repo}/pulls/{number}/files` if `git diff` fails (e.g. fork not accessible)

### `lib/context.mjs` — context gatherer

For each file in the diff, finds direct importers/importees using `git grep -l "import.*<module>"` or equivalent. Dedupes. Returns:
```
{
  files: [
    { path: string, reason: "importer" | "importee" | "definition" }
  ]
}
```

Honors `max_files` cap from config. Applies `ignore` patterns.

### `lib/learn.mjs` — learnings manager

Functions: `list()`, `add(pattern, reason?)`, `remove(substring)`. Reads/writes `.anchor/learnings.md` with consistent formatting. Deduplicates on add (case-insensitive match on the heading). Validates that pattern is non-empty.

### `lib/review.mjs` — review archiver

Functions: `save(content)`, `list()`, `show(sha)`. Writes to `.anchor/reviews/<date>-<sha>.md` with YAML frontmatter (date, sha, target, confidence score, severity counts, target path). Lists and shows parse the frontmatter for display.

### `lib/config.mjs` — config loader

Reads `.anchor/config.yaml`, merges with defaults, returns a typed object. `validate()` checks types and surfaces errors with line numbers. Missing file → all defaults.

### `lib/init.mjs` — codebase map + graph data gatherer

Pure deterministic data gatherer. The LLM does the synthesis (writing the actual markdown files). This module just collects the raw data and emits it as JSON; the skill (LLM) reads the JSON and writes the markdown.

```
{
  structure: {
    topLevelDirs: [string],          // e.g. ["src", "tests", "docs", "scripts"]
    fileCount: number,
    languageMix: { ext: count },     // e.g. { ".ts": 142, ".md": 23 }
    notableFiles: [                  // 5–15 "important" files by heuristic
      { path, reason: "entrypoint" | "config" | "large" | "recently-changed" }
    ]
  },
  dependencyGraph: {
    modules: [
      {
        path: string,                // e.g. "src/auth"
        imports: [string],           // paths this module imports
        importedBy: [string]         // paths that import this module
      }
    ],
    hotFiles: [{ path, changeCount }],   // most-modified files in last N commits
    criticalFiles: [{ path, importCount }]  // most-imported files
  },
  history: {
    recentCommits: [
      { sha, date, author, subject, filesChanged: number }
    ],
    commitMessageStyle: {              // observed conventions
      conventionalCommits: boolean,
      avgSubjectLength: number,
      commonPrefixes: [string]
    }
  },
  pullRequests: {                       // only if --no-prs not set and gh available
    recent: [
      { number, title, author, state, reviewComments: number, additions: number, deletions: number }
    ],
    recurringThemes: [string]           // extracted by the LLM in a second pass
  }
}
```

Gathers data via:
- `git ls-files` + counting for structure
- `git grep -h "^import\|^from\|^require" -- '*.ts' '*.tsx' '*.js' '*.py'` (configurable per detected language) for the import graph
- `git log --oneline -n <depth>` for recent commits
- `git log --stat -n <depth>` for hot files
- `gh pr list --limit <n> --json ...` for past PRs (skipped if `gh` unavailable or `--no-prs`)

Honors `.anchorignore` (if user has one) and standard ignore dirs (`node_modules`, `dist`, `.git`, etc.) when scanning the structure.

### `lib/status.mjs` — repo + last-review + git state summary

Gathers and returns a single status object the user can read at a glance. Output (text format):

```
Anchor Status
─────────────
Repo:           /home/me/projects/myrepo

Last review:    2026-06-09 14:32 (3 days ago)
                files: 2, score: 4/5, target: main..feature/auth-fix
                archive: .anchor/reviews/2026-06-09-abc1234.md
Open findings:  0 critical, 0 high, 1 medium, 2 low (from last review)

Codebase map:   built 2026-06-08 (4 days ago) — 142 files
Graph:          built 2026-06-08 (4 days ago)
Learnings:      7 patterns

Git status:     ✓ working tree clean
                ✓ 0 unpushed commits
                ⚠ PR #123 open (myrepo: feature/auth-fix → main)
                  · 3 reviews on this PR
                  · last activity: 2 hours ago
                (or: ✓ no open PRs)

Next:           PR #123 is awaiting review. Try:
                  /anchor review pr 123
```

JSON shape:

```
{
  repo: { path, name, owner? },
  lastReview: {
    date, sha, target, score,
    fileCount, openFindings: { critical, high, medium, low },
    archivePath
  } | null,
  artifacts: {
    codebaseMap: { built, ageDays, fileCount } | null,
    codebaseGraph: { built, ageDays } | null,
    learnings: { count }
  },
  git: {
    clean: boolean,
    unpushedCommits: number,
    openPrs: [
      { number, title, branch, baseBranch, lastActivity, reviewCount }
    ]
  },
  nextSuggestion: string  // human-readable hint
}
```

Implementation:
- Reads `.anchor/reviews/` directory for the most recent review (by date in filename)
- Reads `.anchor/codebase-map.md` and `.anchor/codebase-graph.md` frontmatter (we add `built:` and `fileCount:` to the frontmatter when init writes them) for the artifact ages
- Counts learnings by counting `### …` headings in `.anchor/learnings.md`
- Runs `git status --porcelain`, `git log @{u}.. --oneline 2>/dev/null | wc -l` for git state
- Runs `gh pr list --json ...` for open PRs (skipped if `gh` unavailable)
- Composes a `nextSuggestion` based on the state (e.g., "PR #123 is awaiting review" if open PRs exist, or "All clean — run /anchor review when you have new changes")

### `lib/doctor.mjs` — diagnostics

Checks (each returns pass/fail with message):
- `git` available and ≥ 2.0
- `gh` available (only required for PR mode; warn otherwise)
- inside a git repo
- `~/.claude/skills/anchor/SKILL.md` symlink resolves
- `~/.claude/commands/anchor.md` symlink resolves
- `~/bin/anchor` symlink resolves and is on `$PATH`
- `.anchor/config.yaml` exists and parses (if present)
- Claude Code session is active (heuristic: `CLAUDECODE=1` env var, which Claude Code sets in its Bash tool environment)
- node version is ≥ 18

Exits 0 if all pass, 1 otherwise. Warnings don't cause non-zero exit.

## 10. Testing Strategy

Four layers.

### Layer 1 — Unit tests for `lib/*` (`tests/unit/`, vitest)

```
tests/unit/
├── diff.test.mjs             # anchor diff against fixture repos
├── context.test.mjs          # git grep → related files, with ignore patterns
├── learn.test.mjs            # add/list/remove learnings, dedupe, format
├── review.test.mjs           # save/list/show review archives
├── config.test.mjs           # valid/invalid yaml, missing file, defaults
├── ignore.test.mjs           # glob matching, anchor patterns
├── frontmatter.test.mjs      # parse/write yaml frontmatter on reviews
└── doctor.test.mjs           # each diagnostic check, happy + failure paths
```

Run with `pnpm test` or `vitest watch`. Fast (no LLM, no network).

### Layer 2 — Integration tests (`tests/integration/`)

```
tests/integration/
├── fixtures/
│   ├── small-ts-repo/        # 20-file TS project
│   ├── large-monorepo/       # 500-file repo for scale
│   └── pr-mode/              # mocked `gh` for PR mode
├── diff.test.mjs
├── context.test.mjs
├── learn.test.mjs
└── review.test.mjs
```

Run with `pnpm test:integration`. Slower but still no LLM.

### Layer 3 — Golden review tests (`tests/golden/`)

The LLM step can't be unit-tested, but it can be regression-tested. Freeze the entire review context (diff + related files + learnings + custom instructions) as a fixture, freeze the prompt, and snapshot the LLM's output. If the snapshot changes, the prompt drifted.

**Caveat**: because Anchor uses whatever model is active in the user's Claude Code session, golden snapshots are model-dependent. Each expected snapshot is tagged with the model it was generated against (e.g. `clean-refactor.claude-opus-4-6.md`). When you run the golden test suite, you compare against the snapshot for the currently active model. If the user switches from Opus to Sonnet, they re-record the snapshots (a single command, `pnpm test:golden -- --update`). This is the trade-off for not owning the LLM.

```
tests/golden/
├── fixtures/
│   ├── clean-refactor/
│   ├── security-bug/
│   ├── perf-issue/
│   └── noisy-style/
├── expected/                 # expected review markdown
└── golden.test.mjs
```

Opt-in (`pnpm test:golden`) because they cost real LLM tokens and are sensitive to model updates.

### Layer 4 — Manual smoke test (`tests/manual/SMOKE.md`)

A 5-minute checklist the developer runs on first install and after any major change to `SKILL.md`:

```
0. In a clean fixture repo, run `/anchor init` and verify .anchor/codebase-map.md
   and .anchor/codebase-graph.md are created with non-empty content
1. Run `/anchor review` and verify it reads codebase-map.md, codebase-graph.md,
   .anchor/config.yaml, .anchor/learnings.md, AGENTS.md
2. Verify it produces a review in the format spec
3. Reply "mark finding 1 as noise", verify learnings.md grows
4. Reply "save review", verify .anchor/reviews/<date>-<sha>.md exists
5. Run `/anchor full`, verify the same flow + auto-archive
6. Run `/anchor doctor`, verify all green
7. Run `/anchor init --refresh`, verify the map and graph are regenerated
8. Run `/anchor status`, verify the text summary + JSON output are coherent
9. Run `make install-hook` from the fixture repo, then `git push` to a fake
   remote (or `--dry-run`, which also fires pre-push), verify the reminder
   prints and the push is NOT blocked
10. Verify the PostToolUse hook fires inside Claude Code after `git push`
11. Run `make uninstall-hook`, verify .git/hooks/pre-push is removed
12. Run `/anchor review pr <N>` against a fixture PR with a body and a linked
    closing issue; verify the review explicitly references both
13. Run `/anchor review pr <N> --no-pr-context` and verify PR metadata is NOT
    included in the review
14. Reply "fix all" to a multi-finding review; verify Claude walks through
    each finding in CRITICAL → LOW order
15. Reply "generate docstrings" / "generate tests" / "simplify" and verify
    Claude proposes the corresponding patch via the normal diff workflow
16. Run `/anchor review pr <N>` against a fixture PR with a failed CI run;
    verify the review explicitly references the CI failure and the likely
    causing change
17. Run `/anchor review pr <N> --no-ci-context` and verify CI logs are NOT
    included in the review
18. Set `strictness: 1` in `.anchor/config.yaml`, run `/anchor review`, verify
    the review surfaces more findings (style, naming, docs) than at default
19. Set `strictness: 3`, run `/anchor review`, verify the review surfaces
    only bugs/security/crashes
20. Set `strictness: 9` (invalid), verify Anchor warns and falls back to 2
21. Run `/anchor review`; verify the rendered review ends with a `Context
    used` block listing every source consulted, with no failed sources
22. Run `/anchor review` in a fixture where `gh` is unavailable; verify the
    `Context used` block shows "PR body + linked issues: (failed: gh not
    found)" rather than dropping silently
23. Add a learning like "Use `==` for string equality" that would suppress
    a finding, then introduce a `==` on user input in auth code; verify the
    review still flags it as a CRITICAL/HIGH security finding despite the
    learning (carve-out wins)
```

## 11. Error Handling

The pattern: **fail fast on environmental errors, degrade gracefully on data errors, trust the LLM on output.**

> **Superseded (2026-06-16):** the diff budget no longer hard-fails. `anchor diff`
> now emits `overBudget: true` with a `budgetWarning` and the reviewer prioritizes
> the most important files instead of bailing. The "Diff too large"/"Too many
> files" rows below describe the original behavior. See
> `docs/superpowers/plans/2026-06-16-anchor-review-quality.md`.

| Failure | What happens | UX |
|---|---|---|
| Not in a git repo | bail at start | "anchor: not a git repository. Run from inside a repo, or pass --dir." |
| `gh` not installed (PR mode) | bail at start | "anchor: PR mode requires the `gh` CLI. Install from https://cli.github.com." |
| `gh` not authenticated (PR mode) | bail at start | "anchor: `gh` is not authenticated. Run `gh auth login` first." |
| Diff too large (> max_diff_lines) | bail with hint | "anchor: diff is 4,231 lines (max is 2,000). Adjust .anchor/config.yaml → max_diff_lines, or split the PR." |
| Too many files (> max_files) | bail with hint | similar |
| `.anchor/config.yaml` is invalid YAML | warn, use defaults | "anchor: .anchor/config.yaml is invalid YAML at line 12. Using defaults." |
| `.anchor/learnings.md` is missing | create on first `learn add` | silent |
| `anchor review save` to a read-only path | bail | "anchor: cannot write to /readonly/.anchor/reviews/. Check permissions." |
| LLM context too long | trim the context block | (Claude Code handles this) |
| LLM produces a malformed review | present as-is, don't fail | (skill quality issue, not runtime error) |
| `git diff` exits non-zero | surface stderr | "anchor: git diff failed: <stderr>" |
| `git grep` finds nothing | continue with empty context | silent |
| `anchor doctor` finds a problem | show in report, exit 1 | "✗ <problem> → <fix>" |
| `anchor learn add` with empty pattern | bail | "anchor: pattern cannot be empty" |
| `anchor learn add` with duplicate | dedupe silently | "↪ already in learnings, skipped" |
| `anchor init` on a repo with no commits | warn, return empty history | "anchor: no commits found. Init will only build the structure and graph." |
| `anchor init` with `gh` unavailable and `--no-prs` not set | skip PR analysis, proceed | "anchor: gh not available; skipping PR analysis. Use --no-prs to silence this message." |
| `anchor init` when codebase-map.md exists (no `--refresh`) | prompt | "codebase-map.md already exists. Refresh (overwrite) or skip? [R/s]" |
| `anchor init` on a huge repo (very large `git ls-files`) | cap and warn | "anchor: repo has > 10,000 files. Init may be slow. Continue? [Y/n]" |
| `make install-hook` run from outside a git repo | bail | "anchor: install-hook must be run from inside a git repo." |
| `make install-hook` when `.git/hooks/pre-push` already exists | prompt before overwrite | "anchor: .git/hooks/pre-push already exists. Overwrite? [y/N]" |
| `bin/install-posttool-hook.mjs` finds malformed `~/.claude/settings.json` | warn, skip install | "anchor: ~/.claude/settings.json is invalid JSON. Skipping PostToolUse hook install. Fix it manually." |
| `anchor status` run outside a git repo | bail | "anchor: not a git repository. Run from inside a repo, or pass --dir." |
| `anchor status` with no `.anchor/` dir at all | warn, return minimal status | "anchor: no .anchor/ directory found. Run `/anchor init` to bootstrap." |
| `anchor status` with no archived reviews | show "never" for lastReview | silent |
| `anchor review pr <N>` when `gh` is unavailable or `gh pr view` fails | skip PR context, continue with diff only | "anchor: could not fetch PR #N metadata. Reviewing the diff only. (Use `--no-pr-context` to silence.)" |
| `anchor review pr <N>` when the PR has no body or no linked issues | continue with whatever context was found | silent |
| `anchor review pr <N>` when all CI checks pass or no CI has run yet | skip CI context, continue | silent |
| `anchor review pr <N>` when `gh pr checks` or `gh run view` errors | skip CI context, continue | "anchor: could not fetch CI status for PR #N. Reviewing the diff only. (Use `--no-ci-context` to silence.)" |
| `.anchor/config.yaml` has `strictness` not in {1, 2, 3} | warn, default to 2 | "anchor: strictness must be 1, 2, or 3. Got <value>. Using 2 (balanced)." |

Every error message names the command the user can run to fix it.

## 12. Distribution & Versioning

- **Repo**: github.com/<user>/anchor (private or public)
- **Versioning**: SemVer. Tags `v0.1.0`, `v0.2.0`, etc.
- **Install**: `git clone` + `pnpm install` + `make link`
- **Update**: `git pull && pnpm install && make link` (symlinks mean no re-install)
- **Local dev**: edit files, `make build` (re-runs `tsc`), test with `pnpm test` + manual smoke
- **Changelog**: `CHANGELOG.md`, written on every release

### `Makefile` targets

```makefile
install:
	pnpm install
	@mkdir -p ~/bin
	@ln -sf $(PWD)/bin/anchor.mjs ~/bin/anchor
	@mkdir -p ~/.claude/skills/anchor ~/.claude/commands
	@ln -sf $(PWD)/skill/SKILL.md ~/.claude/skills/anchor/SKILL.md
	@ln -sf $(PWD)/commands/anchor.md ~/.claude/commands/anchor.md
	@chmod +x $(PWD)/hooks/post-push-reminder.sh
	@node $(PWD)/bin/install-posttool-hook.mjs
	@echo ""
	@echo "Anchor installed. To initialize a codebase map for a repo:"
	@echo "  cd <your-repo> && claude   # then run /anchor init"
	@echo ""
	@echo "To install the pre-push reminder hook in a specific repo:"
	@echo "  cd <your-repo> && make -f <anchor-repo>/Makefile install-hook"
	@echo ""

build:
	pnpm exec tsc --noEmit          # type-check only; no compilation, no dist/

test:
	pnpm test

# Note: Make target names cannot contain colons — the pnpm *script* names
# (test:integration, test:golden) keep the colon convention; the Make
# targets use hyphens.
test-integration:
	pnpm test:integration

test-golden:
	pnpm test:golden

link:
	@mkdir -p ~/bin
	@ln -sf $(PWD)/bin/anchor.mjs ~/bin/anchor
	@mkdir -p ~/.claude/skills/anchor ~/.claude/commands
	@ln -sf $(PWD)/skill/SKILL.md ~/.claude/skills/anchor/SKILL.md
	@ln -sf $(PWD)/commands/anchor.md ~/.claude/commands/anchor.md

# Installs the pre-push reminder hook into the .git of the current directory.
# Run from inside a repo (not from the anchor repo itself).
install-hook:
	@cp $(PWD)/hooks/pre-push .git/hooks/pre-push
	@chmod +x .git/hooks/pre-push
	@echo "Anchor pre-push hook installed in $$(pwd)"

uninstall-hook:
	@rm -f .git/hooks/pre-push
	@echo "Anchor pre-push hook removed from $$(pwd)"

clean:
	rm -rf node_modules
```

`make install` does not run `anchor init` automatically — init is per-repo, not global, and requires an active Claude Code session for the LLM synthesis step. The install message tells the user to run `/anchor init` in their repo. `make install-hook` is run from inside a specific repo (not from the Anchor repo) to install the pre-push hook there.

### Claude Code PostToolUse hook (in-chat reminder)

The PostToolUse hook in `~/.claude/settings.json` is the in-chat companion to the git pre-push hook. When Claude Code calls a tool that the hook matches (the `Bash` tool with a command that starts with `git push`), the hook injects a reminder into Claude's context, and Claude relays it in chat:

```
> git push
✓ pushed origin/main
🪝 Anchor: branch main was just pushed. Run `/anchor review` on the new commits (or `/anchor full` for the full pipeline + archive).
```

The hook is a tiny shell script (`hooks/post-push-reminder.sh`) that detects `git push` commands and emits the reminder via `additionalContext`. The user enables it once, in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/home/mjenkins/github/anchor/hooks/post-push-reminder.sh"
          }
        ]
      }
    ]
  }
}
```

`make install` also installs this hook (additive, non-destructive — if the user already has a `PostToolUse` hook, Anchor appends rather than overwrites).

## 13. Phased Rollout

| Phase | What's in | Trigger for "done" |
|---|---|---|
| **0 — Foundation** | repo + install + `anchor doctor` + symlinks | `make link` puts a working `anchor doctor` on PATH |
| **1 — Scripts** | `anchor diff`, `anchor context`, `anchor learn`, `anchor init` (data gatherer), `anchor status`; unit + integration tests | scripts work standalone against fixture repos; `anchor init --json` returns the raw structure/graph/history payload; `anchor status` returns a valid status object |
| **2 — Skill** | `SKILL.md` (with init + review workflows; `status` dispatches straight to the script), `commands/anchor.md`, the `/anchor` slash command, manual smoke test | `/anchor review` produces a real review on a real repo; `/anchor init` produces real `codebase-map.md` and `codebase-graph.md`; `/anchor status` returns a readable summary |
| **2b — Push reminder** | git pre-push hook (`hooks/pre-push`), Claude Code PostToolUse hook (`hooks/post-push-reminder.sh`), `make install-hook` / `make uninstall-hook` targets, auto-install of PostToolUse hook in `make install` | `git push` prints the Anchor reminder without blocking the push; PostToolUse hook fires inside Claude Code |
| **3 — Polish** | `anchor full`, review format tweaks, examples, golden tests | `/anchor full` runs the full pipeline + archives cleanly |
| **4 — Dogfood** | use it on real personal projects for a week | the workflow feels natural and catches real issues |

## 14. Reference Material

For comparison and inspiration:
- **Greptile** (`Anchor-Spec-Bundle/greptile-docs/`) — graph-based context, learned nitpick suppression, MCP server for IDE, Fix with your Agent
- **CodeRabbit** (`Anchor-Spec-Bundle/coderabbit-docs/`) — walkthroughs, AST-based path instructions, `cr` CLI with `--agent` mode, Skills integration
- **Macroscope** (`Anchor-Spec-Bundle/macroscope-docs/`) — `.macroscope/correctness/` custom instructions with glob frontmatter, severity levels, Fix It For Me, check run agents
- **Anchor v1.4 spec packet** (`Anchor-Spec-Bundle/anchor-spec-packet-v1.4-complete/`) — the commercial-spec origin of this project; explicitly out of scope for the personal MVP

## 15. Open Questions / Future Work

Things deliberately deferred:

- **Multi-repo review** — review changes across multiple repos in one session
- **Sharing learnings across repos** — symlink `.anchor/learnings.md` from a central location
- **Shared team config** — `.anchor/config.yaml` checked in (not gitignored)
- **Pre-commit hook integration** — auto-run `anchor review` before each commit
- **Local embeddings for context** — `node-llama-cpp` or similar, for repos too large for grep
- **AST-based path instructions** — like CodeRabbit's, using `tree-sitter` for richer matching
- **GitHub App (Phase 2)** — auto-review PRs on push, post comments. Would require either a tunneled server (current local) or a small always-on host
- **MCP server export** — expose Anchor's tools (diff, context, learn) to other AI agents via the Model Context Protocol

These can be added later without re-architecting Anchor — the skill + scripts split makes the scripts reusable, and the LLM-in-Claude-Code model means new LLM-backed features just need a new skill or subcommand.
