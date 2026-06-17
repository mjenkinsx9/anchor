---
name: anchor-review
description: >
  Anchor is a personal code review tool for Claude Code. Use this skill
  when the user runs /anchor to perform a code review, initialize a
  repo's codebase map, gather context for a diff, manage per-repo
  learnings, check repo status, or run diagnostics.
argument-hint: "[init|diff|context|review|learn|status|doctor|full|hook] [target]"
---

# Anchor — Personal Code Review

Anchor reviews the user's code changes using deterministic scripts for data
gathering and YOU (the active LLM session) for the review reasoning. All
scripts emit JSON by default.

**Locating the CLI:** `anchor` is NOT on PATH. This skill ships inside the
anchor plugin, and the harness shows `Base directory for this skill: <dir>`
when it loads — that directory is `<plugin-root>/skills/anchor-review`. Resolve the
plugin root (two directory levels up from the base directory) once. Then,
whenever this skill says to run `anchor <args>`, execute via Bash:

    node "<plugin-root>/dist/anchor.mjs" <args>

If there is no base-directory line or `dist/anchor.mjs` does not exist, tell
the user the anchor plugin install looks broken and suggest
`/plugin update anchor`. Do not guess paths.

## Subcommand dispatch

| Subcommand | What you do |
|---|---|
| `init` | Follow the **Init workflow** below |
| `review [target]` | Follow the **Review workflow** below |
| `review --explain <sha>` / `full --explain <sha>` | Run `anchor review show <sha>` and re-display the archived review — do not start a new review |
| `full [target]` | Run `anchor doctor` first (bail if exit 1), then the Review workflow, then auto-archive (no need for the user to ask) |
| `diff` / `context` / `learn` / `status` / `doctor` | Run the matching `anchor` command via Bash and show the result (use `--format text` for doctor/status when presenting to the user) |
| `hook` / `hook install` / `hook uninstall` | Run the matching `anchor hook ...` command in the current repo (bare `hook` reports install status; manages the per-repo git pre-push reminder) |
| (no args) | Default to `review` of uncommitted changes |

## Review workflow

### Step 1 — Resolve the target
Parse the arguments: no target = uncommitted; `--staged`; `<ref1>..<ref2>`;
`pr <number|url>`; `@<path>` = single file. Validate (does the ref exist? is
the PR real?). If invalid, ask the user.

### Step 2 — Read project state
First, get the **effective** config (defaults merged with the user's file — this is
how you learn the active `categories`, `strictness`, `min_severity`,
`min_confidence`, `max_findings`, and `protected_categories` even for keys the user
didn't set): run `anchor config --format json` via Bash and parse it. Do NOT rely on
reading the raw `.anchor/config.yaml` alone — it omits defaults.

Then read these files with the Read tool (skip silently if absent):
- `.anchor/codebase-map.md`, `.anchor/codebase-graph.md`
- `CLAUDE.md` at cwd and each parent directory up to the repo root
- `AGENTS.md` at the repo root
- `.anchor/rules.md` — free-prose positive review rules (project intent). If present,
  enforce them as review criteria; weight them above generic best-practice.
- `.anchor/instructions.md` and `.anchor/instructions.d/*.md` — these may have
  YAML frontmatter with `include`/`exclude` globs; only apply instruction
  files whose globs match files in the diff. Multiple files stack.

Scoped learnings + structured rules are fetched **after the diff** (Step 3e), since
they filter by the changed files.

If neither codebase-map.md nor codebase-graph.md exists, tell the user:
"Tip: run `/anchor init` to build a codebase map and dependency graph for
richer reviews." Then continue — grep context still works.

### Step 3 — Get the diff
Run `anchor diff <target>` via Bash and parse the JSON. If it exits 1
(not a repo / bad target), show the error verbatim and stop.

If the JSON has `overBudget: true`, the diff is large but **still present** —
do NOT stop. Surface the `budgetWarning` to the user, then review the
highest-signal files first (entrypoints, security-sensitive and hand-written
code before generated/lock/vendored files), and record in the "Context used"
footer which files you prioritized and which you skipped. The user can re-run
with `--max-diff-lines N` (raise the budget) or `--force` (silence the flag).

**Incremental review (`--since-last`).** If the user asked for `--since-last`, run
`anchor diff --since-last`. Its `sinceLast` field reports `{applied:true,range}` (the
diff is only what changed since the last archived review) or `{applied:false,fallback}`
(the recorded SHA was rebased/pruned — you got the full working diff instead). When
`sinceLast.fallback` is set, note the fallback reason in the "Context used" footer.

### Step 3b — PR/issue context (PR mode only, skip if `--no-pr-context`)
Run: `gh pr view <N> --json title,body` (these fields always exist). Do NOT
request `closingIssues` — it is not a valid `gh pr view --json` field and makes
the whole call fail. Derive linked issues best-effort by scanning the body for
`(closes|fixes|resolves) #<n>` and fetching each with
`gh issue view <n> --json title,body`. Add PR title + body + linked issues
under a `## PR/issue context` label. If `gh` fails or there is no body/issues,
skip silently — never block the review. Note failures for the Context used footer.

### Step 3c — CI failure context (PR mode only, skip if `--no-ci-context`)
Run: `gh pr checks <N>`. If any check failed, get the failed log:
`gh run view <run-id> --log-failed` (cap at ~2000 lines). Add under a
`## CI failure context` label. All checks passing, no runs, or gh errors →
skip silently.

### Step 3d — Static analyzer findings (run after the diff)
Run `anchor analyze --from-diff <target>` and parse the JSON. Treat `findings[]`
as GROUND TRUTH (a real parser/linter produced them): do not re-derive or
second-guess them, fold them into your review (dedup against your own findings),
and attribute them to the tool. **Prioritize findings with `changed: true` (they
touch the diff); a `changed: false` finding is ambient project noise UNLESS it is
plausibly caused by this change (e.g. a signature change breaking an unchanged
caller) — surface those, drop the rest.** If `truncated: true`, say so. List which
tools ran (and which were skipped as not-installed) in the "Context used" footer.
If `tools` is empty, note that no analyzers were available and rely on reasoning.

### Step 3e — Scoped learnings + positive rules (run after the diff)
- Run `anchor learn list --from-diff <target>` to load only the noise-suppression
  learnings whose `scope` matches the changed files (so a domain-layer learning
  doesn't silence findings in unrelated code). Apply these as "do not surface"
  patterns — subject to the protected-categories floor in Step 6.
- Run `anchor rules --from-diff <target>` to load scoped positive rules
  (`rules[]`) plus any `.anchor/rules.md` prose. A matching rule violation IS a
  finding at the rule's severity. Rules are project intent — weight them above
  generic best-practice.
- **Prior findings (dedup).** Run `anchor review list` and read the newest entry's
  `findings` array (`[{file, line, title}]`). Treat these as **prior findings**: drop a
  candidate finding that is materially identical to a prior finding (same `file` and a
  digit-blind title match) **when that location is NOT in the current diff** (i.e. the
  code there is unchanged since the last review). A finding on a line the diff DID
  touch is fair game — re-surface it. This is the primary dedup layer; the archive also
  stores each finding's hash as the deterministic identity backstop.

### Step 4 — Get related files
Run `anchor context --from-diff <target> --max-files 50`. Read each related
file with the Read tool (respect a sensible token budget — prefer importers
of changed files first). Files with `reason: "manifest"` are declared contracts
(schema, OpenAPI, design docs from `.anchor/files.json`) that the change must
conform to — read them and check the diff against them; their `description` says
why they matter.

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

**Category is a generation gate, not a post-hoc filter.** Generate findings ONLY
in the active `categories` (from the `anchor config --format json` you ran in
Step 2; default all). Do not produce a finding outside them, even to downgrade
it. `category` (logic/security/perf/style/docs/tests) and `severity` are
independent axes: a logic bug can be any severity; a style nit is category=style.
Apply strictness as a generation gate too: at strictness 2 (default) do NOT emit
category=style/docs findings unless they cause a real bug; at strictness 3 emit
only logic/security findings with crash/data-loss impact. (The protected-categories
floor below still overrides this — never drop a protected finding to satisfy a gate.)

Apply learnings: each `###` heading in learnings.md is a "do not surface"
pattern — do not flag it unless it creates a real bug. A learning may downgrade
or hide a STYLE/QUALITY finding, but it must NEVER suppress a finding whose nature
is in `protected_categories` (from `anchor config`; default: security, data-loss,
crash, injection, auth). If a learning conflicts with a protected-category
finding, the finding wins.

Be honest. If the code is clean, say so. Do not invent issues to fill quota.
Respect the user's noise markings and the project's stated rules.

**Verify before you flag (this is what separates a good review from a noisy one):**
- For every CRITICAL or HIGH finding, confirm the claim against the actual code.
  You fetched related files in Step 4 — read the defining file (open more if
  needed). If a finding depends on behavior you cannot see in the diff or the
  files you read (e.g. "this function is only called once", "this event never
  fires for X", "this value is always non-null"), either read the source that
  proves it, or cap the finding's confidence at 3 and label it
  **unverified — needs confirmation**. Never assert runtime behavior you have
  not checked.
- **Evidence-seeking for usage claims:** before finalizing a CRITICAL/HIGH that
  depends on usage ("unused", "never called", "no other caller", "always null"),
  run `anchor refs <symbol>` and read the call sites. If the references
  contradict the finding, DROP it. Conversely, if `anchor refs` shows callers the
  diff did NOT update (an omission), consider whether they need updating and flag it.
  (Note: `refs` returns all word-boundary matches, not a definition-resolved set —
  use it as evidence, not proof.)
- For every suggested fix, confirm it does not break a path that is currently
  correct, and state the assumption it relies on. A wrong fix is worse than no
  finding — the `fix all` follow-up may apply it verbatim.
- Self-refutation pass: for each CRITICAL/HIGH, spend one sentence trying to
  disprove it. If it survives only as speculation, downgrade or drop it. A
  short list of verified findings beats a long list of plausible ones.

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

**Confidence rubric (tie the score to evidence, not vibes):** 5 = verified
against source/spec you actually read; 4 = strongly supported by the diff plus
a file you read; 3 = plausible from the diff alone; ≤2 = inference. The
`Reasoning:` line must state what you verified and what you did not, and any
finding labeled *unverified* caps the overall confidence at 3.

Use exactly this structure (severities with zero findings show "None."):

```
<!-- anchor:meta {"score": <0-5>, "severities": {"critical": <n>, "high": <n>, "medium": <n>, "low": <n>}} -->
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

**Per-finding machine-readable block (`anchor:finding`).** Inside each finding's
rendered block, emit ONE HTML comment carrying that finding's machine-readable
record (invisible in markdown viewers, like `anchor:meta`). **Required for every
CRITICAL/HIGH finding; optional for MEDIUM/LOW.** Exact shape:

    <!-- anchor:finding {"n":N,"file":"<repo-rel>","line":L,"severity":"high","category":"logic","title":"<canonical short desc>","fix":{"edits":[{"file":"<repo-rel>","range":[start,end],"replacement":"<new text>"}],"verify":"<cmd|null>"}} -->

- `title` is the canonical short description and the dedup identity — keep it stable
  for the same defect across runs (a script hashes `file` + a digit-blinded `title`).
- `fix.edits` is an array (a multi-spot fix is one spec). `range` is `[startLine,
  endLine]` in **new-file** (post-change) coordinates — the same line numbers as the
  `<line> | code` blocks above. `replacement` is the new text for that range. Avoid a
  literal `-->` inside `replacement` or `title` — it truncates the HTML comment and the
  block is silently skipped by the parser.
- `fix.verify` is the discovered test/build command, or `null`. **Discover it once**:
  `package.json` `scripts.test` or `scripts.build` (this repo: `vitest run tests/unit`)
  → else `pytest` / `cargo test` / `go test ./...` / `make test` if those toolchains
  are present → else `null` (and ask the user at fix-time).

**"Can't spec it → noise" discipline.** Every CRITICAL/HIGH finding must carry EITHER
a concrete `fix` spec OR, in its explanation, an explicit `no safe automatic fix:
<reason>`. If you can produce neither a concrete fix nor a justification, the finding
is too vague to stand — downgrade or drop it. (Vagueness becomes visible; precision wins.)

Number findings sequentially across all severities (CRITICAL first) so
"finding N" replies are unambiguous.

The first line is a machine-readable `anchor:meta` comment (invisible in most
markdown viewers). Keep its `score`/`severities` consistent with the rendered
`Confidence` line and the per-severity counts — `anchor review save` parses this
block (falling back to scraping the text) to record the review's score and
severity counts in the archive frontmatter.

### Step 8 — Handle follow-ups
- `mark finding N as noise` → Bash: `anchor learn add "<a concise generalized pattern>" --reason "<why>" --scope "<glob from the finding's file, e.g. src/db/**>" --category "<the finding's category>"` (scope keeps the learning from silencing unrelated code; omit `--scope` only if the pattern is genuinely repo-wide)
- `explain finding N` → explain in more depth using the context you already have
- `fix finding N` → never edit as a side-effect of review; an explicit `fix finding N`
  applies the finding's `fix.edits` via the Edit tool (which surfaces the change for
  approval), then auto-runs the `fix.verify` command, reports pass/fail, and **keeps
  the diff even if verify fails** (a failing verify is information, not a rollback
  trigger — tell the user and let them decide). If the finding has no `fix` spec, say
  so and propose a patch the normal way.
- `fix all` → walk findings CRITICAL → LOW, applying each finding's `fix.edits` in
  turn, then run the discovered `verify` command ONCE at the end and report the result.
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
