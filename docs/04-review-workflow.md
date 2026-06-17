# Review workflow

This page summarizes how a review actually runs. The canonical, step-by-step
reasoning the model follows lives in
[`skills/anchor-review/SKILL.md`](../skills/anchor-review/SKILL.md) — this page
is the orientation map, not a replacement for it.

A review is a pipeline: deterministic scripts gather inputs; the active Claude
Code session does the reasoning.

## The shape of a review

1. **Resolve the target** — uncommitted, `--staged`, `--since-last`, a
   `<ref>..<ref>` range, `pr <number|url>`, or `@<path>`.
2. **Read project state** — the *effective* config (defaults merged with
   `.anchor/config.yaml`, via `anchor config --format json`), the codebase
   map/graph, `CLAUDE.md`/`AGENTS.md`, and any `.anchor/rules.md` /
   `.anchor/instructions.md`.
3. **Get the diff** (`anchor diff <target>`). A large diff is surfaced as a
   budget warning but is **not** dropped — the highest-signal files are reviewed
   first.
4. **Gather context** — static-analyzer findings, scoped learnings + positive
   rules, prior findings (for dedup), and related files.
5. **Reason and produce findings**, gated by category and strictness, with a
   safety carve-out that always surfaces critical security/correctness issues.
6. **Render the review** in Anchor's fixed structure, with machine-readable
   metadata blocks.
7. **Handle follow-ups** — `fix finding N`, `fix all`, `mark finding N as
   noise`, `save review`, and more.

## Strictness (default 2)

- **1 (verbose):** everything — logic, style, naming, organization, docs,
  performance, security; comment on minor things.
- **2 (balanced):** bugs, security, performance, error handling; style only
  where it affects readability/maintainability.
- **3 (critical-only):** bugs, security vulnerabilities, data-loss risks,
  crashes only.

Category is a *generation gate*, not a post-hoc filter — findings are produced
only in the active `categories`. The protected-categories floor (default:
security, data-loss, crash, injection, auth) always overrides strictness and
learnings: a protected finding is never dropped to satisfy a gate. See
[Configuration](05-configuration.md) for the keys.

## Verify before you flag

This is what separates a good review from a noisy one. For every CRITICAL/HIGH
finding the model confirms the claim against the actual code, reading the
defining file. Usage claims ("unused", "never called", "always null") must be
backed by evidence — `anchor refs <symbol>` returns call sites to check.
Anything that survives only as speculation is downgraded or dropped, and an
unverified finding caps overall confidence at 3.

## Phase 4 features

Phase 4 added incremental review, machine-readable fix specs, richer context
signals, and issue-criteria checking.

### `--since-last` (incremental review)

`anchor diff --since-last` reviews only what changed since the last archived
review. Its `sinceLast` field reports either `{applied:true, range}` (the diff
is just the new changes) or `{applied:false, fallback}` (the recorded SHA was
rebased/pruned, so you get the full working diff instead, with the fallback
reason noted in the "Context used" footer).

### `anchor:finding` and the fix spec

Inside each rendered finding the model emits one HTML comment carrying that
finding's machine-readable record (invisible in markdown viewers, like
`anchor:meta`). It is **required for every CRITICAL/HIGH finding, optional for
MEDIUM/LOW**. Shape:

```
<!-- anchor:finding {"n":N,"file":"<repo-rel>","line":L,"severity":"high","category":"logic","title":"<canonical short desc>","fix":{"edits":[{"file":"<repo-rel>","range":[start,end],"replacement":"<new text>"}],"verify":"<cmd|null>"}} -->
```

- `title` is the canonical short description and the dedup identity — kept stable
  for the same defect across runs (a script hashes `file` + a digit-blinded
  `title`).
- `fix.edits` is an array (a multi-spot fix is one spec). `range` is
  `[startLine, endLine]` in **new-file** (post-change) coordinates.
  `replacement` is the new text for that range.
- `fix.verify` is the discovered test/build command (from `package.json`
  scripts, then `pytest`/`cargo test`/`go test ./...`/`make test` if present),
  or `null`.

**"Can't spec it → noise" discipline.** Every CRITICAL/HIGH finding must carry
EITHER a concrete `fix` spec OR an explicit `no safe automatic fix: <reason>`.
A finding that can offer neither is too vague to stand — it is downgraded or
dropped.

`fix finding N` applies the finding's `fix.edits` via the Edit tool, auto-runs
the `verify` command, and keeps the diff even if verify fails (a failing verify
is information, not a rollback trigger). `fix all` walks findings CRITICAL → LOW
and runs `verify` once at the end.

### Caller / sibling context

Related files may carry `reason: "caller"` (a reverse-reference call site) or
`reason: "sibling"` (a same-directory file). Both are **grep-approximate** — no
semantic resolution, so they can't disambiguate same-named symbols across
scopes. They are leads to read, not proof, and the "Context used" footer notes
that caller/sibling context is heuristic. Files with `reason: "manifest"` are
declared contracts (schema, OpenAPI, design docs) the change must conform to.

### Issue acceptance criteria (PR mode)

In PR mode with a linked issue, each linked issue body is piped into
`anchor issue-criteria` (stdin → JSON `{criteria:[…]}`) to extract testable
acceptance criteria. The review then renders an **"Acceptance criteria"**
subsection — one line per criterion with a three-state verdict (`✅ Addressed`
/ `❌ Not addressed` / `❓ Unclear`) and a one-line justification. The model
abstains (`❓ Unclear`) whenever the diff doesn't clearly settle it — it never
guesses.

## Archiving and review metadata

`save review` (and `/anchor full`) pipes the rendered review into
`anchor review save`, which records the review's `score` and per-severity
counts in the archive frontmatter. The first line of every review is a
machine-readable `anchor:meta` comment whose `score`/`severities` stay
consistent with the rendered `Confidence` line and the per-severity counts.

## Init

`/anchor init` builds `.anchor/codebase-map.md` and `.anchor/codebase-graph.md`
(structure, key modules, conventions, problem areas, recurring feedback themes,
and an import/imported-by graph). Run it once per repo; re-run with `--refresh`
to update. Reviews still work without it — grep context is the fallback.

---

Back to the documentation index: [README.md](README.md)
