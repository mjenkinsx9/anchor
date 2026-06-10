---
name: anchor
description: >
  Anchor is a personal code review tool for Claude Code. Use this skill
  when the user runs /anchor to perform a code review, initialize a
  repo's codebase map, gather context for a diff, manage per-repo
  learnings, check repo status, or run diagnostics.
argument-hint: "[init|diff|context|review|learn|status|doctor|full] [target]"
---

# Anchor — Personal Code Review

Anchor reviews the user's code changes using deterministic scripts for data
gathering and YOU (the active LLM session) for the review reasoning. The
`anchor` CLI is on PATH. All scripts emit JSON by default.

## Subcommand dispatch

| Subcommand | What you do |
|---|---|
| `init` | Follow the **Init workflow** below |
| `review [target]` | Follow the **Review workflow** below |
| `full [target]` | Run `anchor doctor` first (bail if exit 1), then the Review workflow, then auto-archive (no need for the user to ask) |
| `diff` / `context` / `learn` / `status` / `doctor` | Run the matching `anchor` command via Bash and show the result (use `--format text` for doctor/status when presenting to the user) |
| (no args) | Default to `review` of uncommitted changes |

## Review workflow

### Step 1 — Resolve the target
Parse the arguments: no target = uncommitted; `--staged`; `<ref1>..<ref2>`;
`pr <number|url>`; `@<path>` = single file. Validate (does the ref exist? is
the PR real?). If invalid, ask the user.

### Step 2 — Read project state
Read these files with the Read tool (skip silently if absent):
- `.anchor/config.yaml`, `.anchor/codebase-map.md`, `.anchor/codebase-graph.md`, `.anchor/learnings.md`
- `CLAUDE.md` at cwd and each parent directory up to the repo root
- `AGENTS.md` at the repo root
- `.anchor/instructions.md` and `.anchor/instructions.d/*.md` — these may have
  YAML frontmatter with `include`/`exclude` globs; only apply instruction
  files whose globs match files in the diff. Multiple files stack.

If neither codebase-map.md nor codebase-graph.md exists, tell the user:
"Tip: run `/anchor init` to build a codebase map and dependency graph for
richer reviews." Then continue — grep context still works.

### Step 3 — Get the diff
Run `anchor diff <target>` via Bash and parse the JSON. If it exits 1
(too large / not a repo / bad target), show the error verbatim and stop.

### Step 3b — PR/issue context (PR mode only, skip if `--no-pr-context`)
Run: `gh pr view <N> --json title,body,closingIssues`
Add PR title + body + each linked issue to the context under a
`## PR/issue context` label. If `gh` fails or there is no body/issues, skip
silently — never block the review. Note failures for the Context used footer.

### Step 3c — CI failure context (PR mode only, skip if `--no-ci-context`)
Run: `gh pr checks <N>`. If any check failed, get the failed log:
`gh run view <run-id> --log-failed` (cap at ~2000 lines). Add under a
`## CI failure context` label. All checks passing, no runs, or gh errors →
skip silently.

### Step 4 — Get related files
Run `anchor context --from-diff <target> --max-files 50`. Read each related
file with the Read tool (respect a sensible token budget — prefer importers
of changed files first).

### Step 5 — Build the context block and track sources
Assemble: diff + related files + project instructions + learnings + config
(+ PR/issue + CI sections when present). Maintain a **sources-used list** of
every source consulted (with counts where natural: learnings pattern count,
related file count by reason, CI log line range). If a source failed to load,
record "(failed: <reason>)" — never drop it silently.

### Step 6 — Reason and produce the review
Apply the strictness prior from config (default 2):
- **1 (verbose):** Look for everything: logic, style, naming, organization,
  doc quality, performance, security. Comment on minor things.
- **2 (balanced):** Focus on bugs, security, performance, error handling.
  Comment on style only if it affects readability or maintainability.
- **3 (critical-only):** Only flag bugs, security vulnerabilities, data loss
  risks, crashes. Skip style, naming, organization, optimization.

Apply learnings: each `###` heading in learnings.md is a "do not surface"
pattern — do not flag it unless it creates a real bug.

Be honest. If the code is clean, say so. Do not invent issues to fill quota.
Respect the user's noise markings and the project's stated rules.

In PR mode: verify the change addresses the linked issue's acceptance
criteria; call out unmet criteria. If CI failed, correlate the failure back
to the changed lines and say which change likely caused it.

**SAFETY GUARDRAIL (always-on; overrides strictness and learnings):**
Always surface CRITICAL and HIGH security/correctness issues regardless of
noise markings: auth/authorization bypass; secret/credential/token leak;
SQL injection, command injection, path traversal, XSS, SSRF; null/undefined
deref on external input; infinite loops or runaway resource use; unhandled
promise rejection or swallowed error on the success path of I/O; data loss
or corruption (dropped writes, race conditions, missing transactions);
insecure deserialization; missing input validation on a security boundary.
If a learning conflicts with this carve-out, the carve-out wins.

Filter post-hoc: drop findings below `min_severity`, below `min_confidence`,
outside `categories`, and beyond `max_findings`.

### Step 7 — Render the review
Use exactly this structure (severities with zero findings show "None."):

```
────────────────────────────────────────────────────────────────
  Anchor Review  ·  <target>  ·  <sha>
  <date time>  ·  <N> files changed, +<added> / −<removed>
────────────────────────────────────────────────────────────────

  Confidence: <0-5> / 5
  Reasoning:  <one or two lines>

────────────────────────────────────────────────────────────────
  🔴 CRITICAL  (<n>)
────────────────────────────────────────────────────────────────
  [N] <file>:<line>  ·  <category>
  ────────────────────────────────────────────────────────────
  <explanation>

  <line> |   <offending code>

  Suggested fix:
  <line> |   <replacement code>

────────────────────────────────────────────────────────────────
  🟠 HIGH  (<n>)        … same shape …
  🟡 MEDIUM  (<n>)      … same shape …
  🟢 LOW  (<n>)         … same shape …

────────────────────────────────────────────────────────────────
  ✨ What's good                       (if output.show_whats_good)
────────────────────────────────────────────────────────────────
  • <genuine positives>

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
  Context used
────────────────────────────────────────────────────────────────
  <one line per source from the sources-used list, failures noted>
────────────────────────────────────────────────────────────────
```

Number findings sequentially across all severities (CRITICAL first) so
"finding N" replies are unambiguous.

### Step 8 — Handle follow-ups
- `mark finding N as noise` → Bash: `anchor learn add "<a concise generalized pattern>" --reason "<why>"`
- `explain finding N` → explain in more depth using the context you already have
- `fix finding N` → propose a patch via the normal Edit workflow (never auto-apply)
- `fix all` → walk findings CRITICAL → LOW, proposing a patch for each in turn
- `generate docstrings` → add docstrings (per language convention) to changed functions/classes/exports
- `generate tests` → write unit tests for the changed code paths in the project's existing test style
- `simplify` → propose a refactor of the changed code (dead code, redundant conditionals, naming, duplication)
- `save review` → Bash: pipe the full rendered review into `anchor review save --target "<target>"` via stdin

### `/anchor full` extras
1. `anchor doctor` first — if exit 1, show the report and stop.
2. After rendering, auto-archive: pipe the review into `anchor review save --target "<target>"`.
3. Include the diff summary, related files consulted, and learnings applied.

## Init workflow

Builds `.anchor/codebase-map.md` and `.anchor/codebase-graph.md`.

1. Run `anchor init [--depth N] [--no-prs] [--no-graph]` via Bash; parse the JSON
   (structure, dependencyGraph, history, pullRequests). Show any warnings.
2. If the map/graph already exist and `--refresh` was not passed, ask:
   "codebase-map.md and codebase-graph.md already exist. Refresh (overwrite), or skip?"
3. Write `.anchor/codebase-map.md` with YAML frontmatter
   `built: <YYYY-MM-DD>` and `fileCount: <n>`, covering: **Structure**
   (top-level dirs and purpose), **Key modules** (5–15 most important files
   and responsibilities), **Coding conventions** (observed naming, error
   handling, test style, commit style), **Problem areas** (hot files, bug
   clusters), **Recurring feedback themes** (from PR data if present).
   Write for your future self at review time. Be specific — name files,
   quote snippets. Skip generic platitudes.
4. Unless `--no-graph`: write `.anchor/codebase-graph.md` with the same
   frontmatter (`built:` only), rendering module import/imported-by
   relationships as an indented text tree, with hot files and critical
   (most-imported) files called out.
5. Check the repo's `.gitignore` for the `.anchor/` entries (spec §5 block);
   if missing, append them with the Edit tool. (The CLI also does this
   automatically on `anchor learn add` / `anchor review save`.)
6. Confirm: "✓ Wrote .anchor/codebase-map.md (<size>) and
   .anchor/codebase-graph.md (<size>). Reviews will use these for richer
   context. Re-run `/anchor init --refresh` anytime to update."
