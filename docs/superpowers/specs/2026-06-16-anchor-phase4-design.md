# Anchor Phase 4 — Design (resolved decisions)

**Date:** 2026-06-16
**Status:** Approved design. Refines the Phase 4 task-specs in
`docs/superpowers/plans/2026-06-16-anchor-review-quality.md` (lines ~1083–1122)
with the decisions made in a grounded design pass against the post-Phase-1–3 code.
Supersedes the plan's Phase 4 specs where they differ.

**Next step:** expand into TDD implementation steps via the writing-plans skill.

---

## Context & grounding

Phases 1–3 + M shipped in PR #7 (commit `0093c56`, merged `c2e75b8`). Phase 4 was
left as enriched-but-deferred specs. A 5-agent readiness audit + direct reads
grounded each item against the real tree and surfaced four gaps the plan glossed:

1. **4A** assumed a `parseExports` helper that does not exist (`context.mjs` only
   parses imports). Symbol-level "callers" also overlap heavily with the existing
   `importer` signal — they add value mainly for barrel/re-export call sites.
2. **4C** has no data source today: the archive stores `{sha, score, severities}`
   + the rendered body, but **not** the findings. Dedup had nothing to read.
3. **4D**'s "apply via Edit + run tests" collides with the SKILL's current
   "never auto-apply" wording — a deliberate posture choice, now reconsidered.
4. **4E**: the plan's claim that "Step 3b already fetches the PR body + derives
   linked issues" is **correct** (verified, `SKILL.md:83-90` runs
   `gh issue view <n> --json title,body`), so 4E is purely additive.

Verified code facts this design relies on:
- `refs.mjs` — `findRefs(repoDir, symbol, { globs = CODE_GLOBS } = {})` →
  `{ symbol, references: [{ file, line, text }], count }`.
- `context.mjs` — `getContext({ files, repoDir, maxFiles = 50, ignore = [] })`
  builds a `related` Map (first-reason-wins), reasons `importer`/`importee`/
  `manifest`, then `filterIgnored(...).slice(0, maxFiles)`.
- `review.mjs` — `saveReview(repoDir, content, meta)` writes the **full rendered
  body** + frontmatter `{date, sha, target, score, severities}`;
  `listReviews(repoDir)` returns `{file, date, sha, target, score, severities}`
  sorted newest-first; `extractReviewMeta` already parses an `anchor:meta` block.
- `git.mjs` — `runGit`, `runCmd`, `escapeRe`, `shortHead`.
- Shared scope helpers live in `ignore.mjs` (`filterIgnored`, scope matching) and
  are reused by `rules.mjs`/`manifest.mjs`.

---

## Keystone: the unified `anchor:finding` block

4D and 4C both need a per-finding machine-readable record, so they **share one**.
The SKILL emits **one block per finding**, inside that finding's rendered block in
the body (the single top-of-review `anchor:meta` block is unchanged). Required for
CRITICAL/HIGH; optional for MEDIUM/LOW.

```
<!-- anchor:finding {"n":N,"file":"<repo-rel>","line":L,"severity":"high","category":"logic","title":"<canonical short desc>","fix":{"edits":[{"file":"<repo-rel>","range":[start,end],"replacement":"<new text>"}],"verify":"<cmd|null>"}} -->
```

- `title` — canonical short description; the dedup identity (4C).
- `fix.edits` — array (from the start, so a multi-spot fix is one spec); `range`
  is `[startLine, endLine]` in **new-file** (post-change) coordinates, matching
  the review's `<line> | code` blocks; `replacement` is the new text for that range.
- `fix.verify` — the discovered test/build command, or `null`.
- It renders as an HTML comment (invisible in markdown viewers), like `anchor:meta`.
- A **script** parses these blocks (new `parseFindingBlocks(content)` in
  `review.mjs`, mirroring `extractReviewMeta`); the LLM never computes a hash.

This block is the integration point: 4D writes the `fix`; 4C reads `file`+`title`
for identity. It also leaves room to later simplify the eval scorer's text-scraper.

---

## 4A — Local graph-context approximation (callers + siblings)

**Decision:** build the **full** scope (siblings + symbol-level callers), with
**conservative** caller noise control.

**Files:** `lib/context.mjs` (extend `getContext`; add `parseExports`,
`findSiblings`); `tests/unit/context.test.mjs` (new — `parseExports`/`findSiblings`
units); `tests/integration/context.test.mjs` (extend); golden snapshot update.

**`parseExports(src, ext)`** — pure, beside `parseImports`. Returns distinct
exported symbol names.
- JS/TS: `export function NAME`, `export async function NAME`,
  `export const|let|var NAME`, `export class NAME`, `export default function NAME`,
  `export { A, B as C }` (captures the exported-as name).
- Python (`.py`): top-level `^def NAME`, `^class NAME`.
- Other extensions → `[]` (callers degrade gracefully to none).
- Best-effort / grep-approximate — documented as such.

**Callers** (conservative):
- For each changed file that exists, `parseExports` → keep **distinctive**
  symbols: `length >= 4` AND not in a `COMMON_NAMES` denylist
  (`get,set,run,init,main,index,default,handler,value,data,name,type,item,list,...`).
- A **global** `Set` of already-looked-up symbols avoids re-grepping the same name
  across changed files.
- For each kept symbol: `findRefs(repoDir, symbol)`; add each `reference.file` that
  is not changed and not already in `related` as `reason:'caller'`.
- Caps: **8 symbols/file**, **~15 caller files total** (stop adding once hit).

**`findSiblings(repoDir, filePath, { max = 5 })`** — pure, exported.
- `readdir(dirname(filePath))`, code files only — reuse the existing code-file
  extension set (`context.mjs` `GREP_GLOBS` / `refs.mjs` `CODE_GLOBS`) — excluding
  the file itself, changed files, and already-related files.
- Rank by **shared filename-prefix length** with the changed file's stem
  (descending), tie-break alphabetically (deterministic).
- Return the top `max` as `reason:'sibling'`.

**Ordering & integration:** populate in `getContext` as
`importer → importee → manifest → caller → sibling`, then the existing
`filterIgnored(...).slice(0, maxFiles)`. Existing three reasons keep their current
positions (so user-declared `manifest` outranks the approximate signals, and
fixtures without spare budget are unaffected). New reasons **on by default**.

**Acceptance:**
- Representative test: changed `src/db/getUser.ts` → context includes same-dir
  `src/db/getOrder.ts` with `reason:'sibling'`.
- A caller test: a barrel/re-export call site that `importer` misses is surfaced as
  `reason:'caller'`.
- `npm run eval` recall does not drop; the `pattern-inconsistency` eval fixture
  (M.1) is caught. Golden snapshot + context integration tests updated.
- Documented limitation (JSON output + footer): grep-approximate; no semantic
  resolution (can't disambiguate same-named symbols across scopes).

---

## 4D — Structured per-finding fix-spec (apply + auto-verify)

**Decision:** **apply + auto-verify.** Prompt-only (no new lib code beyond the
`parseFindingBlocks` helper shared with 4C).

**Files:** `skills/anchor-review/SKILL.md` (Step 7 render; Step 8 follow-ups);
`lib/review.mjs` (`parseFindingBlocks` — shared with 4C).

- **Step 7:** emit the unified `anchor:finding` block per finding (see Keystone).
- **"Can't spec it → noise" discipline:** every CRITICAL/HIGH must carry a
  `fix` spec **or** an explicit `no safe automatic fix: <reason>`. If it can
  produce neither a concrete fix nor a justification → downgrade or drop it
  (vagueness becomes visible; a precision win).
- **Step 8 `fix finding N`:** apply the `fix.edits` via the Edit tool (which
  surfaces the change for approval), then auto-run the `fix.verify` command,
  report pass/fail, and **keep the diff even if verify fails.** Reword the
  current "propose a patch… never auto-apply" to **"never edit as a side-effect
  of review; an explicit `fix finding N` applies via Edit, then verifies."**
- **`fix all`:** walk CRITICAL→LOW applying each; run verify once at the end.
- **Verify-command discovery:** `package.json` `scripts.test`/`scripts.build`
  (this repo: `vitest run tests/unit`) → else `pytest` / `cargo test` /
  `go test ./...` / `make test` heuristics → else `null` and ask at fix-time.

**Acceptance:** every CRITICAL/HIGH either has a fix-spec or an explicit
"no safe automatic fix"; `fix finding N` applies + verifies + reports in-session.
Ports = full.

---

## 4C — Incremental review + per-finding dedup

**Decision:** build the **full** feature — `--since-last` range + write-time hash
storage + read-time injection + two suppression layers.

**Files:** `lib/diff.mjs` (`--since-last` range + rebase fallback); `lib/review.mjs`
(`parseFindingBlocks`, frontmatter `finding_hashes`/`findings`, prior-findings
accessor); `lib/cli.mjs` (wire `--since-last`; a prior-findings step);
`skills/anchor-review/SKILL.md` (consume prior findings; suppression rule);
tests across `diff`/`review` units + an integration test.

- **`anchor diff --since-last`:** range = `<lastSha>..HEAD` where
  `lastSha = listReviews(repoDir)[0]?.sha`. **Rebase fallback:** if `lastSha` is
  missing or unreachable (`git rev-parse --verify <sha>^{commit}` fails, or it is
  not an ancestor of HEAD), fall back to the full working diff and emit a warning
  noted in the Context-used footer. No prior review → full diff.
- **Write-time (in `saveReview`):** parse `anchor:finding` blocks via
  `parseFindingBlocks(content)`; for each compute
  `sha1(repoRelFile + '\0' + normalize(title))`. Store additive frontmatter:
  `finding_hashes: [<hex>...]` and `findings: [{file, line, title}]`. Old reviews
  lacking these → treated as empty (back-compat). `normalize(s)` =
  `s.toLowerCase().replace(/\s+/g, ' ').replace(/\d+/g, '#').trim()` (digit-blind so
  line-number shifts don't break identity).
- **Read-time:** surface the most-recent review's `findings` (extend `listReviews`
  / add an accessor); a SKILL step injects them as "prior findings."
- **Suppression — two layers:**
  - *Prompt-level (primary):* the SKILL drops a candidate finding that is
    materially identical (same `file` + `normalize(title)`) to a prior finding
    **when that location is not in the since-last diff** (i.e. unchanged).
  - *Script-level (safety net):* the stored `finding_hashes` give deterministic
    identity, so a save-time check can flag/drop a re-emitted prior hash on an
    unchanged line even if the prompt missed it.

**Acceptance:** re-running a review on an unchanged tree yields no findings
(empty since-last diff); on a partially-changed tree, still-present prior findings
on unchanged lines are not re-emitted. Rebase of the prior SHA falls back cleanly
to a full diff with a warning. Ports = partial (local; no PR-thread state).

---

## 4B — Cascading per-directory config (WON'T BUILD — personal tool, no monorepo use case)

**Decision (updated 2026-06-17):** **won't build.** Anchor is a personal code-review
tool; nested per-directory config only benefits shared multi-config monorepos —
single-config repos gain nothing, and that monorepo use case is not expected here. The
merge semantics below are kept on record so the feature can be picked up cheaply *if*
that ever changes, but it is not planned work. (Originally "build deferred"; closed out
as won't-build once it was clear the monorepo case wouldn't arise.)

**Semantics (if it is ever built):**
- **Trigger:** per-file resolution activates only when nested `.anchor/config.yaml`
  files exist; otherwise behavior is byte-identical to today (golden snapshots safe).
- **`resolveConfigForPath(repoDir, filePath)`:** walk `dirname(filePath)` up to
  `repoDir`, collect each `.anchor/config.yaml`, merge **root→nearest**; cache by
  directory (process-lifetime — Anchor is a one-shot CLI, no staleness concern);
  returns `{config, warnings}` like `loadConfig`.
- **Scalars** (strictness, min_severity, min_confidence, max_*): **nearest-wins.**
- **Arrays:** `rules` accumulate root→child, **dedup by `id`** (a child rule with
  the same id overrides the parent's); `ignore` accumulate + **string-dedup.**
- **`disabled_rules: [id]`** — NEW config key (add to `DEFAULTS = []` + validation:
  must be a list of strings). Accumulates; applied **last** as a blocklist that
  removes matching rule ids from the merged set.
- **Visibility:** expose `anchor config --for-file <path> --format json`.
- **Recommended scope when built:** **gather-only** — per-file resolution drives
  the deterministic steps (`rules` selection, `ignore` filtering); the SKILL's
  strictness/category gating stays root-config-driven for v1 (don't make the
  reviewer juggle per-file strictness in a single pass).
- **Acceptance:** existing single-config repos behave identically (golden +
  integration unchanged).

---

## 4E — Linked-issue acceptance-criteria validation (PR mode)

**Decision:** add a small **testable extractor** + LLM verdicts.

**Files:** `lib/issue.mjs` (NEW — pure extractor + unit tests); `lib/cli.mjs`
(new `issue-criteria` handler); `skills/anchor-review/SKILL.md` (Step 3b/Step 7 —
render criteria verdicts).

- **`extractAcceptanceCriteria(body)`** (pure, unit-tested): markdown checklist
  items (`- [ ]` / `- [x]`) first; if none, lines under an
  "Acceptance criteria" / "Requirements" heading (until the next heading); else `[]`.
- **`anchor issue-criteria`** handler: reads an issue body on **stdin**, emits the
  extracted criteria as JSON. (gh stays in the SKILL — the extractor is pure and
  testable without a network/gh dependency.)
- **SKILL:** Step 3b already runs `gh issue view <n> --json title,body`; pipe that
  body into `anchor issue-criteria`. Render an **"Acceptance criteria"** subsection:
  each item `✅ Addressed` / `❌ Not addressed` / `❓ Unclear` + a one-line
  justification (+ file/line evidence where addressed). **Abstain** (`Unclear`)
  when the diff doesn't clearly settle it — never guess.
- PR-mode only; gh-dependent; not validatable in a local non-PR repo.

**Acceptance:** in PR mode with a linked issue, the review lists each criterion with
a three-state verdict; `extractAcceptanceCriteria` is unit-tested (no model needed).
Ports = partial (PR mode only).

---

## Build order, sequencing, and gate

**Order when scheduled:** **4D** (defines the `anchor:finding` block + the shared
`parseFindingBlocks`) → **4C** (consumes the block for identity/dedup) → **4A**
(independent) → **4E** (independent) → **4B** (deferred build).

**Shared-file sequencing (from the plan's Conventions):** `lib/cli.mjs`,
`lib/config.mjs`, `skills/anchor-review/SKILL.md`, `templates/config.yaml`, and
`dist/anchor.mjs` are touched by multiple tasks — edit them **sequentially**, one
task at a time; bundle once per batch. Parallel-safe: the standalone new module
`lib/issue.mjs` (4E) + its unit test, and the pure functions added to
`context.mjs`/`review.mjs` with their unit tests.

**Bundle refresh:** any task editing a `lib/*.mjs` file ends with `npm run bundle`
and stages `dist/anchor.mjs`. Config keys get a `DEFAULTS` entry + a
`templates/config.yaml` doc line (`disabled_rules` only when 4B is built).

**Gate:** the deterministic suite (`npm test`, `test:integration`, `test:golden`,
`typecheck`, plus the new units) is the binding CI gate. The LLM eval
(`npm run eval` with a model) is the manual quality gate for the recall/precision
and prompt-behavior claims (4A recall, 4C suppression, 4D fix-spec sanity,
4E verdicts).

## TDD-step expansion deferred to writing-plans

Per-task RED→GREEN steps, exact test fixtures, the `COMMON_NAMES` denylist contents,
and the precise `parseExports`/`extractAcceptanceCriteria` regexes are pinned when
each task is expanded by the writing-plans skill. This document is the contract they
expand against.
