# Anchor Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 4 of Anchor's review-quality roadmap — the unified `anchor:finding` block (4D), incremental `--since-last` review + per-finding dedup (4C), local graph-context approximation via callers + siblings (4A), and linked-issue acceptance-criteria validation (4E) — per the approved design at `docs/superpowers/specs/2026-06-16-anchor-phase4-design.md`.

**Architecture:** Anchor is a deterministic Node CLI (`lib/*.mjs`, bundled to `dist/anchor.mjs`) that gathers review *inputs* as JSON; the LLM session (driven by `skills/anchor-review/SKILL.md`) does the review *reasoning*. Phase 4 adds: (a) a machine-readable per-finding block the SKILL emits and a script parses (`parseFindingBlocks`), (b) incremental-diff + finding-hash storage so reviews don't repeat themselves, (c) caller/sibling context signals, and (d) a pure acceptance-criteria extractor. New deterministic logic is unit/integration-tested; LLM-behavioral changes live in SKILL prose and are guarded by light content tests + the manual eval gate.

**Tech Stack:** Node ESM (`.mjs`), vitest (unit/integration/golden), esbuild (single-file bundle), js-yaml, minimatch. No new runtime dependencies.

## Global Constraints

- **No new runtime dependencies.** Use only Node built-ins + the already-vendored `js-yaml` / `minimatch`.
- **Bundle stays in sync.** Any task that edits a `lib/*.mjs` file MUST end by running `npm run bundle` and staging `dist/anchor.mjs` in the same commit. `tests/integration/bundle.test.mjs` rebuilds with the pinned esbuild and asserts a byte-for-byte match — a stale bundle fails CI.
- **CLI emits JSON by default**; `--format text` is opt-in. New subcommands follow `emit(obj, flags)`.
- **Deterministic CI gate (must stay green):** `npm test` (unit), `npm run test:integration`, `npm run test:golden`, `npm run typecheck`. Run all four before declaring a task done.
- **Manual quality gate (model required, NOT CI):** `npm run eval`. Used to validate 4A recall, 4C suppression, 4D fix-spec sanity, 4E verdicts. When a model is unavailable, state that the eval was not run rather than claiming it passed.
- **Preserve existing behavior** unless the spec requires a change. Additive frontmatter keys, additive context reasons, additive CLI flags/subcommands only.
- **Build order (fixed by the design):** 4D → 4C → 4A → 4E. 4D defines the `anchor:finding` block + the shared `parseFindingBlocks`; 4C consumes it. 4A and 4E are independent.
- **4B (cascading per-directory config) is SPEC-ONLY** — do NOT implement it. No `config.mjs`, `templates/config.yaml`, or `disabled_rules` changes in Phase 4. Its semantics are already recorded in the design doc.
- **Finding-block coordinates** are `[startLine, endLine]` in **new-file** (post-change) coordinates, matching the review's `<line> | code` blocks.
- **Title normalization (the dedup identity):** `normalizeTitle(s) = s.toLowerCase().replace(/\s+/g, ' ').replace(/\d+/g, '#').trim()` and `findingHash(file, title) = sha1(file + '\0' + normalizeTitle(title))` (hex). Digit-blind so line-number shifts don't break identity.

### Documented interpretation calls (where the spec left a choice)

These resolve spec ambiguities toward the **safest implementation consistent with the spec**; each is called out again in the relevant task and must survive review:

1. **4C script-level suppression** is built as a **non-destructive save-time flag**, not an auto-rewrite of the archived review body. `saveReview` stores the deterministic identity (`finding_hashes` + `findings`), and additionally compares each finding's hash against the most-recent prior review's hashes; matches are **flagged** — recorded as `repeated_finding_hashes` in frontmatter and returned as `repeated[]` — but the body is never edited and no finding is dropped. The spec's verb is "flag/drop"; *flag* is satisfiable non-destructively, while auto-deleting finding blocks from a saved `.md` would desync the rendered severity counts and corrupt the user's archive (a data-integrity hazard the spec never asked for). This realizes the spec's "two layers" (§4C): prompt-level drop is **primary**; the save-time flag is the deterministic backstop that fires "even if the prompt missed it." (Spec §4C "two layers".)
2. **4A limitation documentation** ("JSON output + footer") is satisfied via JSDoc/code comments that ship in the bundle + a SKILL footer line, WITHOUT adding a new top-level field to `getContext`'s return shape (which would ripple through every golden snapshot and the context contract beyond the intended caller/sibling entries). (Spec §4A acceptance.)
3. **4A `pattern-inconsistency` eval fixture** is added to `tests/eval/cases.mjs` as the manual-gate target for the sibling signal, but its scoring requires a model — verification is deferred to the manual eval gate, not CI.

---

## Task 1 — 4D: unified `anchor:finding` block (`parseFindingBlocks` + SKILL emit/apply)

**Files:**
- Modify: `lib/review.mjs` (add `parseFindingBlocks` export)
- Test: `tests/unit/review.test.mjs` (extend)
- Modify: `skills/anchor-review/SKILL.md` (Step 7 emit; Step 8 fix/verify rewording)
- Create: `tests/unit/skill-contract.test.mjs` (light prose guard)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

**Interfaces:**
- Produces: `parseFindingBlocks(content: string) => Array<{ n?, file: string, line?, severity?, category?, title: string, fix?: object }>` — every well-formed `<!-- anchor:finding {…} -->` block; malformed-JSON blocks skipped; a block needs string `file` + string `title` to count. Consumed by Task 3 (`saveReview` storage).

- [ ] **Step 1: Write the failing test** — append to `tests/unit/review.test.mjs`:

```js
import { saveReview, listReviews, showReview, extractReviewMeta, parseFindingBlocks } from '../../lib/review.mjs';
```
(replace the existing import line at the top of the file with the line above — it adds `parseFindingBlocks`.)

Then append this describe block at the end of the file:

```js
describe('parseFindingBlocks', () => {
  const block = (o) => `<!-- anchor:finding ${JSON.stringify(o)} -->`;

  it('parses a single block with a nested fix spec', () => {
    const content = `intro\n${block({
      n: 1, file: 'src/a.ts', line: 10, severity: 'high', category: 'logic',
      title: 'Off-by-one in slice', fix: { edits: [{ file: 'src/a.ts', range: [10, 10], replacement: 'xs[i]' }], verify: 'vitest run tests/unit' },
    })}\nmore\n`;
    const out = parseFindingBlocks(content);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ file: 'src/a.ts', title: 'Off-by-one in slice', severity: 'high' });
    expect(out[0].fix.edits[0].range).toEqual([10, 10]);
    expect(out[0].fix.verify).toBe('vitest run tests/unit');
  });

  it('parses multiple blocks in document order', () => {
    const content = `${block({ n: 1, file: 'a.ts', title: 'First' })}\n${block({ n: 2, file: 'b.ts', title: 'Second' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['First', 'Second']);
  });

  it('skips a malformed-JSON block but keeps valid ones', () => {
    const content = `<!-- anchor:finding {not json} -->\n${block({ file: 'b.ts', title: 'Valid' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['Valid']);
  });

  it('skips a block missing file or title (the dedup identity)', () => {
    const content = `${block({ file: 'a.ts' })}\n${block({ title: 'no file' })}\n${block({ file: 'c.ts', title: 'ok' })}\n`;
    expect(parseFindingBlocks(content).map((f) => f.title)).toEqual(['ok']);
  });

  it('returns [] when there are no blocks', () => {
    expect(parseFindingBlocks('plain review, no machine block\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: FAIL — `parseFindingBlocks is not a function` (export missing).

- [ ] **Step 3: Implement `parseFindingBlocks`** — add to `lib/review.mjs` (after `extractReviewMeta`, before `saveReview`):

```js
/**
 * Parse every per-finding `anchor:finding` block from a rendered review.
 * Mirrors extractReviewMeta's HTML-comment convention (the terminating `}` is the
 * one immediately before `-->`, so nested JSON in `fix` is captured intact) but
 * returns ALL blocks. Best-effort: malformed-JSON blocks are skipped, never thrown.
 * A block must carry a string `file` and a string `title` (the dedup identity) to
 * count; other fields pass through as authored. The LLM never computes a hash —
 * this script is the single parser (4C reads `file`+`title`; 4D writes `fix`).
 * @param {string} content
 * @returns {Array<{ n?: number, file: string, line?: number, severity?: string,
 *   category?: string, title: string, fix?: object }>}
 */
export function parseFindingBlocks(content) {
  const out = [];
  const re = /<!--\s*anchor:finding\s*(\{[\s\S]*?\})\s*-->/g;
  for (const m of String(content).matchAll(re)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch { continue; }
    if (!obj || typeof obj !== 'object') continue;
    if (typeof obj.file !== 'string' || typeof obj.title !== 'string') continue;
    out.push(obj);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: PASS (all `parseFindingBlocks` cases + the pre-existing review tests).

- [ ] **Step 5: Update `skills/anchor-review/SKILL.md` — Step 7 (emit the block)**

In Step 7, immediately after the closing ```` ``` ```` of the render structure block and before the line beginning "Number findings sequentially…", INSERT this subsection verbatim:

```markdown
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
```

- [ ] **Step 6: Update `skills/anchor-review/SKILL.md` — Step 8 (apply + verify, not "never auto-apply")**

In Step 8, REPLACE these two lines:

```markdown
- `fix finding N` → propose a patch via the normal Edit workflow (never auto-apply)
- `fix all` → walk findings CRITICAL → LOW, proposing a patch for each in turn
```

with:

```markdown
- `fix finding N` → never edit as a side-effect of review; an explicit `fix finding N`
  applies the finding's `fix.edits` via the Edit tool (which surfaces the change for
  approval), then auto-runs the `fix.verify` command, reports pass/fail, and **keeps
  the diff even if verify fails** (a failing verify is information, not a rollback
  trigger — tell the user and let them decide). If the finding has no `fix` spec, say
  so and propose a patch the normal way.
- `fix all` → walk findings CRITICAL → LOW, applying each finding's `fix.edits` in
  turn, then run the discovered `verify` command ONCE at the end and report the result.
```

- [ ] **Step 7: Write the failing SKILL-contract test** — create `tests/unit/skill-contract.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = readFileSync(join(ROOT, 'skills', 'anchor-review', 'SKILL.md'), 'utf8');

// Guards the spec-required prose contract so a future edit can't silently drop it.
// Asserts stable identifiers/phrases (not full sentences) to stay non-brittle.
describe('SKILL.md Phase 4 contract', () => {
  it('4D: emits the anchor:finding block and documents the fix-spec discipline', () => {
    expect(SKILL).toContain('anchor:finding');
    expect(SKILL).toContain('no safe automatic fix');
    expect(SKILL).toContain('fix.verify');
  });
  it('4D: fix follow-up applies + verifies (no longer "never auto-apply")', () => {
    expect(SKILL).toMatch(/applies the finding's `fix\.edits` via the Edit tool/);
    expect(SKILL).not.toContain('propose a patch via the normal Edit workflow (never auto-apply)');
  });
});
```

- [ ] **Step 8: Run the SKILL-contract test to verify it passes**

Run: `npx vitest run tests/unit/skill-contract.test.mjs`
Expected: PASS (Steps 5–6 already added the required prose).

- [ ] **Step 9: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 10: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS (the bundle test confirms `dist/anchor.mjs` is fresh).

- [ ] **Step 11: Commit**

```bash
git add lib/review.mjs tests/unit/review.test.mjs skills/anchor-review/SKILL.md tests/unit/skill-contract.test.mjs dist/anchor.mjs
git commit -m "feat(4D): unified anchor:finding block — parseFindingBlocks + SKILL emit/apply/verify"
```

---

## Task 2 — 4C-range: `anchor diff --since-last` (incremental range + rebase fallback)

**Files:**
- Modify: `lib/diff.mjs` (add `sinceLastRange`)
- Modify: `lib/cli.mjs` (wire `--since-last` into the `diff` handler)
- Create: `tests/integration/since-last.test.mjs` (lib fn + CLI e2e)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

**Interfaces:**
- Consumes: `listReviews(repoDir)` (already imported by `cli.mjs`) — `[0].sha` is the last review's SHA.
- Produces: `sinceLastRange(repoDir: string, lastSha: string|null|undefined, opts?: { env? }) => { mode: 'range', range: string } | { mode: 'fallback', reason: string }`. CLI: `anchor diff --since-last` adds `result.sinceLast = { applied: true, range } | { applied: false, fallback: reason }` and writes a warning to stderr on fallback.

- [ ] **Step 1: Write the failing lib test** — create `tests/integration/since-last.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { sinceLastRange } from '../../lib/diff.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');

describe('sinceLastRange', () => {
  it('no prior SHA → fallback', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      expect(sinceLastRange(repo.dir, undefined)).toMatchObject({ mode: 'fallback' });
      expect(sinceLastRange(repo.dir, null).reason).toMatch(/no prior review/i);
    } finally { repo.cleanup(); }
  });

  it('reachable ancestor SHA → range <sha>..HEAD', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      const sha = repo.git('rev-parse', '--short', 'HEAD').trim();
      writeFiles(repo.dir, { 'b.ts': 'export const b = 2;\n' });
      commitAll(repo.dir, 'second');
      expect(sinceLastRange(repo.dir, sha)).toEqual({ mode: 'range', range: `${sha}..HEAD` });
    } finally { repo.cleanup(); }
  });

  it('unreachable SHA (rebased/pruned) → fallback with a reason', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      const r = sinceLastRange(repo.dir, 'deadbeef');
      expect(r.mode).toBe('fallback');
      expect(r.reason).toMatch(/unreachable/i);
    } finally { repo.cleanup(); }
  });

  it('non-ancestor SHA (divergent history) → fallback', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      // sibling branch with a commit that is NOT an ancestor of main's HEAD
      repo.git('checkout', '-b', 'side');
      writeFiles(repo.dir, { 'side.ts': 'export const s = 1;\n' });
      commitAll(repo.dir, 'side commit');
      const sideSha = repo.git('rev-parse', '--short', 'HEAD').trim();
      repo.git('checkout', 'main');
      writeFiles(repo.dir, { 'main2.ts': 'export const m = 1;\n' });
      commitAll(repo.dir, 'main advance');
      expect(sinceLastRange(repo.dir, sideSha)).toMatchObject({ mode: 'fallback' });
    } finally { repo.cleanup(); }
  });
});

function anchor(args, cwd, input) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8', input });
}

describe('anchor diff --since-last (CLI)', () => {
  it('no prior review → falls back to the full diff with a warning', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      writeFileSync(join(repo.dir, 'a.ts'), 'export const a = 2;\n'); // uncommitted
      const r = anchor(['diff', '--since-last'], repo.dir);
      expect(r.status).toBe(0);
      const d = JSON.parse(r.stdout);
      expect(d.sinceLast).toMatchObject({ applied: false });
      expect(d.files.map((f) => f.path)).toContain('a.ts'); // full working diff
      expect(r.stderr).toMatch(/since-last fell back/i);
    } finally { repo.cleanup(); }
  });

  it('prior review present → range diff since that SHA', () => {
    const repo = makeFixtureRepo({ 'a.ts': 'export const a = 1;\n' });
    try {
      // Archive a review while HEAD is the first commit → frontmatter sha == that commit.
      anchor(['review', 'save'], repo.dir, '# prior review\nbody\n');
      writeFiles(repo.dir, { 'b.ts': 'export const b = 2;\n' });
      // Stage ONLY b.ts. `review save` created an untracked .gitignore (via ensureGitignore);
      // a `git add -A` would commit it into this commit and pollute the <sha>..HEAD range.
      // The review file itself lands under the now-ignored .anchor/reviews/.
      repo.git('add', 'b.ts');
      repo.git('commit', '-m', 'add b after the review');
      const r = anchor(['diff', '--since-last'], repo.dir);
      expect(r.status).toBe(0);
      const d = JSON.parse(r.stdout);
      expect(d.sinceLast).toMatchObject({ applied: true });
      expect(d.files.map((f) => f.path)).toEqual(['b.ts']); // only what changed since the review
    } finally { repo.cleanup(); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/since-last.test.mjs`
Expected: FAIL — `sinceLastRange is not a function` and the CLI `--since-last` not wired.

- [ ] **Step 3: Implement `sinceLastRange`** — add to `lib/diff.mjs` (after the imports, near the top, e.g. before `parseTarget`):

```js
/**
 * Resolve the `--since-last` diff range from the prior review's SHA. Returns a
 * `range` of `<sha>..HEAD` when <sha> is a reachable ancestor of HEAD; otherwise a
 * `fallback` (with a human reason) so the caller can review the full working diff
 * instead — covers no-prior-review and the rebase/prune case where the recorded SHA
 * is gone or no longer on HEAD's history.
 * @param {string} repoDir
 * @param {string|null|undefined} lastSha
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ mode: 'range', range: string } | { mode: 'fallback', reason: string }}
 */
export function sinceLastRange(repoDir, lastSha, { env } = {}) {
  if (!lastSha) return { mode: 'fallback', reason: 'no prior review to diff since' };
  const verify = runGit(['rev-parse', '--verify', '--quiet', `${lastSha}^{commit}`], { cwd: repoDir, env });
  if (verify.code !== 0) {
    return { mode: 'fallback', reason: `prior review SHA ${lastSha} is unreachable (rebased or pruned?)` };
  }
  const anc = runGit(['merge-base', '--is-ancestor', lastSha, 'HEAD'], { cwd: repoDir, env });
  if (anc.code !== 0) {
    return { mode: 'fallback', reason: `prior review SHA ${lastSha} is not an ancestor of HEAD (rebased?)` };
  }
  return { mode: 'range', range: `${lastSha}..HEAD` };
}
```

- [ ] **Step 4: Wire `--since-last` into the `diff` handler** — in `lib/cli.mjs`, update the import from `./diff.mjs` and the `diff` handler.

Replace the import line:
```js
import { getDiff, withStats, applyBudget } from './diff.mjs';
```
with:
```js
import { getDiff, withStats, applyBudget, sinceLastRange } from './diff.mjs';
```

Replace the body of the `diff` handler (the whole `diff(positional, flags) { … }` method) with:

```js
  diff(positional, flags) {
    requireRepo();
    const config = loadCfg();
    // Use parsed positionals (not raw tokens) so valued-flag values like
    // `--max-diff-lines 100` never leak in as a bogus diff target.
    let tokens = flags.has('staged') ? ['--staged', ...positional] : positional;
    let sinceLast;
    if (flags.has('since-last')) {
      const lastSha = listReviews(process.cwd())[0]?.sha;
      const r = sinceLastRange(process.cwd(), lastSha);
      if (r.mode === 'range') {
        tokens = [r.range];
        sinceLast = { applied: true, range: r.range };
      } else {
        tokens = [];   // full working diff
        sinceLast = { applied: false, fallback: r.reason };
        process.stderr.write(`anchor: --since-last fell back to the full diff — ${r.reason}.\n`);
      }
    }
    const d = getDiff(tokens, { cwd: process.cwd() });
    const filtered = d.files.filter((f) => !isIgnored(f.path, config.ignore));
    // Over-budget diffs are flagged, never dropped: emit with `overBudget` so the
    // reviewer can prioritize the most important files instead of failing outright.
    const result = applyBudget(withStats({ ...d, files: filtered }), {
      maxLines: Number(flags.get('max-diff-lines') ?? config.max_diff_lines),
      maxFiles: Number(flags.get('max-files') ?? config.max_files),
      force: flags.has('force'),
      fallbackLines: config.max_diff_lines,
      fallbackFiles: config.max_files,
    });
    if (sinceLast) result.sinceLast = sinceLast;
    if (result.budgetWarning) process.stderr.write(result.budgetWarning + '\n');
    emit(result, flags);
  },
```

(`listReviews` is already imported in `cli.mjs`. `--since-last` is a boolean flag — no change to the `VALUED` set.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/since-last.test.mjs`
Expected: PASS (all `sinceLastRange` + CLI cases).

- [ ] **Step 6: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 7: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/diff.mjs lib/cli.mjs tests/integration/since-last.test.mjs dist/anchor.mjs
git commit -m "feat(4C): anchor diff --since-last incremental range with rebase fallback"
```

---

## Task 3 — 4C-dedup: finding-hash storage, accessor, and SKILL suppression

**Files:**
- Modify: `lib/review.mjs` (`normalizeTitle`, `findingHash`, store `finding_hashes`/`findings` in `saveReview`, surface them in `listReviews`, add `priorFindings`)
- Test: `tests/unit/review.test.mjs` (extend)
- Modify: `skills/anchor-review/SKILL.md` (consume prior findings; suppression rule; since-last footer note)
- Modify: `tests/unit/skill-contract.test.mjs` (extend)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

**Interfaces:**
- Consumes: `parseFindingBlocks` (Task 1).
- Produces: `normalizeTitle(s) => string`; `findingHash(file, title) => hex string`; `saveReview` writes frontmatter `findings: [{file, line, title}]` + `finding_hashes: [hex…]`, flags repeats against the most-recent prior review (frontmatter `repeated_finding_hashes` when non-empty) and returns `{ path, repeated: [{file, title}] }` (non-destructive — body never edited); `listReviews(repoDir)[i]` gains `findings` + `finding_hashes`; `priorFindings(repoDir) => [{file, line, title}]` (newest review, or `[]`).

- [ ] **Step 1: Write the failing test** — update the import in `tests/unit/review.test.mjs` to add the new exports:

```js
import { saveReview, listReviews, showReview, extractReviewMeta, parseFindingBlocks, normalizeTitle, findingHash, priorFindings } from '../../lib/review.mjs';
```

Append this describe block:

```js
describe('finding dedup storage (4C)', () => {
  const block = (o) => `<!-- anchor:finding ${JSON.stringify(o)} -->`;

  it('normalizeTitle is lowercased, whitespace-collapsed, and digit-blind', () => {
    expect(normalizeTitle('  Off-by-one  at   line 42 ')).toBe('off-by-one at line #');
    expect(normalizeTitle('Drops write on row 7')).toBe('drops write on row #');           // canonical value
    expect(normalizeTitle('Drops write on row 7')).toBe(normalizeTitle('Drops write on row 1234'));
  });

  it('findingHash is stable and digit-blind across line shifts', () => {
    expect(findingHash('src/a.ts', 'Bug at line 10')).toBe(findingHash('src/a.ts', 'Bug at line 99'));
    expect(findingHash('src/a.ts', 'Bug')).not.toBe(findingHash('src/b.ts', 'Bug'));
    expect(findingHash('src/a.ts', 'X')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('saveReview stores finding_hashes + findings parsed from the body', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const body = `review\n${block({ n: 1, file: 'src/a.ts', line: 5, severity: 'high', title: 'Null deref on input' })}\n` +
        `${block({ n: 2, file: 'src/b.ts', line: 9, severity: 'critical', title: 'SQL injection' })}\n`;
      const { path } = saveReview(fresh.dir, body, { sha: 'dedup1', target: 'uncommitted' });
      const text = readFileSync(path, 'utf8');
      expect(text).toContain('finding_hashes:');
      expect(text).toContain(findingHash('src/a.ts', 'Null deref on input'));
      const [latest] = listReviews(fresh.dir);
      expect(latest.findings).toEqual([
        { file: 'src/a.ts', line: 5, title: 'Null deref on input' },
        { file: 'src/b.ts', line: 9, title: 'SQL injection' },
      ]);
      expect(latest.finding_hashes).toHaveLength(2);
    } finally { fresh.cleanup(); }
  });

  it('priorFindings returns the newest review findings, [] when none/freeform', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      expect(priorFindings(fresh.dir)).toEqual([]);
      saveReview(fresh.dir, `r\n${block({ file: 'src/a.ts', line: 1, title: 'First finding' })}\n`, { sha: 'pf0001', date: '2026-06-10' });
      saveReview(fresh.dir, 'freeform, no blocks\n', { sha: 'pf0002', date: '2026-06-12' });
      // newest (2026-06-12) is freeform → no findings
      expect(priorFindings(fresh.dir)).toEqual([]);
    } finally { fresh.cleanup(); }
  });

  it('back-compat: a review without blocks stores empty findings', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const { path } = saveReview(fresh.dir, 'plain body\n', { sha: 'bc0001' });
      const text = readFileSync(path, 'utf8');
      expect(text).toContain('findings: []');
      expect(listReviews(fresh.dir).find((r) => r.sha === 'bc0001').findings).toEqual([]);
    } finally { fresh.cleanup(); }
  });

  it('script-level net flags (never drops) a finding whose hash repeats the prior review', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      saveReview(fresh.dir, `r1\n${block({ file: 'src/a.ts', line: 5, title: 'Null deref on input' })}\n`, { sha: 'rep001', date: '2026-06-10' });
      const r2 = saveReview(fresh.dir,
        `r2\n${block({ file: 'src/a.ts', line: 8, title: 'Null deref on input' })}\n${block({ file: 'src/b.ts', line: 1, title: 'New issue' })}\n`,
        { sha: 'rep002', date: '2026-06-11' });
      // line 5 vs 8 → digit-blind identity matches the prior review; 'New issue' does not.
      expect(r2.repeated.map((f) => f.title)).toEqual(['Null deref on input']);
      const text = readFileSync(r2.path, 'utf8');
      expect(text).toContain('repeated_finding_hashes:');
      // non-destructive: both finding blocks remain in the saved body
      expect(parseFindingBlocks(text)).toHaveLength(2);
    } finally { fresh.cleanup(); }
  });

  it('first review (no prior) reports no repeats and adds no repeated_finding_hashes key', () => {
    const fresh = makeFixtureRepo({ 'x.txt': 'x\n' });
    try {
      const r = saveReview(fresh.dir, `r\n${block({ file: 'src/a.ts', line: 1, title: 'Only finding' })}\n`, { sha: 'rep000' });
      expect(r.repeated).toEqual([]);
      expect(readFileSync(r.path, 'utf8')).not.toContain('repeated_finding_hashes');
    } finally { fresh.cleanup(); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: FAIL — `normalizeTitle`/`findingHash`/`priorFindings` undefined; frontmatter lacks `finding_hashes`.

- [ ] **Step 3: Implement the storage + accessors** — edit `lib/review.mjs`.

Add `createHash` to the imports at the top:
```js
import { createHash } from 'node:crypto';
```
Add the import of `parseFindingBlocks`? It is defined in this same file (Task 1) — no import needed.

Add these two helpers (after `parseFindingBlocks`):
```js
/** Canonical, digit-blind title key — line shifts must not break finding identity. */
export function normalizeTitle(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\d+/g, '#').trim();
}

/** Deterministic per-finding identity: sha1(file + NUL + normalized title), hex. */
export function findingHash(file, title) {
  return createHash('sha1').update(`${file}\0${normalizeTitle(title)}`).digest('hex');
}
```

In `saveReview`, replace the `const fm = { … };` block with:
```js
  const findings = parseFindingBlocks(content).map((f) => ({
    file: f.file, line: typeof f.line === 'number' ? f.line : null, title: f.title,
  }));
  const fm = {
    date,
    sha,
    target: meta.target ?? '',
    score: meta.score ?? extracted.score,
    severities: meta.severities ?? extracted.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
    findings,
    finding_hashes: findings.map((f) => findingHash(f.file, f.title)),
  };
```

Then replace the final two lines of `saveReview`:
```js
  writeFileSync(path, stringifyFrontmatter(fm, content));
  return { path };
```
with the non-destructive script-level dedup flag + extended return:
```js
  // Script-level dedup safety net (4C): flag — never drop or rewrite — findings whose
  // identity hash already appeared in the most-recent prior review. Self-excludes the
  // file being (over)written so re-saving the same review can't flag itself.
  const prior = listReviews(repoDir).find((r) => r.file !== path);
  const priorHashes = new Set(prior?.finding_hashes ?? []);
  const repeated = findings.filter((f) => priorHashes.has(findingHash(f.file, f.title)));
  if (repeated.length) fm.repeated_finding_hashes = repeated.map((f) => findingHash(f.file, f.title));
  writeFileSync(path, stringifyFrontmatter(fm, content));
  return { path, repeated: repeated.map((f) => ({ file: f.file, title: f.title })) };
```
(`listReviews` is defined later in this same module — function declarations are hoisted, so calling it here is fine. The current review is not yet written, so it never appears in `prior`.)

In `listReviews`, replace the `.map((file) => { … })` return object with one that surfaces the new keys:
```js
    .map((file) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      return {
        file: join(dir, file),
        date: data.date ?? null,
        sha: data.sha ?? null,
        target: data.target ?? '',
        score: data.score ?? null,
        severities: data.severities ?? null,
        findings: Array.isArray(data.findings) ? data.findings : [],
        finding_hashes: Array.isArray(data.finding_hashes) ? data.finding_hashes : [],
      };
    })
```

Add `priorFindings` (after `listReviews`):
```js
/** Findings of the most-recent archived review (newest by date), or [] when none. */
export function priorFindings(repoDir) {
  const [latest] = listReviews(repoDir);
  return latest?.findings ?? [];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: PASS (new dedup cases + all pre-existing review tests — the extra frontmatter keys don't break the `toContain` assertions).

- [ ] **Step 5: Update `skills/anchor-review/SKILL.md` — consume prior findings + suppression**

In Step 3 (Get the diff), after the `overBudget` paragraph, INSERT:

```markdown
**Incremental review (`--since-last`).** If the user asked for `--since-last`, run
`anchor diff --since-last`. Its `sinceLast` field reports `{applied:true,range}` (the
diff is only what changed since the last archived review) or `{applied:false,fallback}`
(the recorded SHA was rebased/pruned — you got the full working diff instead). When
`sinceLast.fallback` is set, note the fallback reason in the "Context used" footer.
```

In Step 3e (Scoped learnings + positive rules), append a third bullet:

```markdown
- **Prior findings (dedup).** Run `anchor review list` and read the newest entry's
  `findings` array (`[{file, line, title}]`). Treat these as **prior findings**: drop a
  candidate finding that is materially identical to a prior finding (same `file` and a
  digit-blind title match) **when that location is NOT in the current diff** (i.e. the
  code there is unchanged since the last review). A finding on a line the diff DID
  touch is fair game — re-surface it. This is the primary dedup layer; the archive also
  stores each finding's hash as the deterministic identity backstop.
```

- [ ] **Step 6: Extend the SKILL-contract test** — add to `tests/unit/skill-contract.test.mjs` inside the existing describe:

```js
  it('4C: documents --since-last and prior-findings suppression', () => {
    expect(SKILL).toContain('--since-last');
    expect(SKILL).toContain('prior findings');
    expect(SKILL).toMatch(/NOT in the current diff/);
  });
```

- [ ] **Step 7: Run the SKILL-contract test**

Run: `npx vitest run tests/unit/skill-contract.test.mjs`
Expected: PASS.

- [ ] **Step 8: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 9: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/review.mjs tests/unit/review.test.mjs skills/anchor-review/SKILL.md tests/unit/skill-contract.test.mjs dist/anchor.mjs
git commit -m "feat(4C): finding-hash storage + priorFindings accessor + SKILL dedup"
```

---

## Task 4 — 4A-helpers: `parseExports` + `findSiblings` (pure, golden-safe)

**Files:**
- Modify: `lib/context.mjs` (add `parseExports`, `findSiblings`; add `readdirSync` to the fs import)
- Create: `tests/unit/context.test.mjs` (new unit file for the pure helpers)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

This task adds the pure helpers ONLY — it does NOT touch `getContext`, so golden snapshots and the context integration tests are unaffected. (The `getContext` wiring + golden regen is Task 5.)

**Interfaces:**
- Produces:
  - `parseExports(src: string, ext: string) => string[]` — distinct exported symbol names. JS/TS: `export [default] [async] function NAME`, `export const|let|var NAME`, `export class NAME`, `export { A, B as C }` (the exported-as name). Python (`.py`): top-level `def NAME` / `class NAME`. Other ext → `[]`.
  - `findSiblings(repoDir, filePath, { max = 5, exclude = new Set() }) => string[]` — same-directory code files (repo-relative), excluding the file itself and anything in `exclude`, ranked by shared filename-prefix length with the file's stem (desc), tie-break alphabetical (asc), capped at `max`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/context.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { parseExports, findSiblings } from '../../lib/context.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

describe('parseExports', () => {
  it('captures JS/TS function, class, const/let/var, async, and default exports', () => {
    const src = [
      'export function alpha() {}',
      'export async function beta() {}',
      'export const gamma = 1;',
      'export let delta = 2;',
      'export class Epsilon {}',
      'export default function zeta() {}',
    ].join('\n');
    expect(parseExports(src, '.ts').sort()).toEqual(['Epsilon', 'alpha', 'beta', 'delta', 'gamma', 'zeta'].sort());
  });

  it('captures named re-exports including the exported-as name', () => {
    const src = "export { foo, bar as baz } from './x';\n";
    expect(parseExports(src, '.ts').sort()).toEqual(['baz', 'foo']);
  });

  it('captures top-level Python def/class', () => {
    const src = 'def handler_fn():\n    pass\nclass Widget:\n    pass\n';
    expect(parseExports(src, '.py').sort()).toEqual(['Widget', 'handler_fn']);
  });

  it('returns [] for unknown extensions', () => {
    expect(parseExports('export function x(){}', '.txt')).toEqual([]);
  });
});

describe('findSiblings', () => {
  const repo = makeFixtureRepo({
    'src/db/getUser.ts': 'export const u = 1;\n',
    'src/db/getUserProfile.ts': 'export const p = 1;\n',
    'src/db/getOrder.ts': 'export const o = 1;\n',
    'src/db/notes.md': '# notes\n',           // non-code, excluded
    'src/other/elsewhere.ts': 'export const e = 1;\n',
  });
  afterAll(() => repo.cleanup());

  it('ranks same-dir code files by shared filename-prefix, then alphabetically', () => {
    const sibs = findSiblings(repo.dir, 'src/db/getUser.ts', { max: 5 });
    expect(sibs).toEqual(['src/db/getUserProfile.ts', 'src/db/getOrder.ts']); // prefix 7 before 3; md excluded; self excluded; other dir excluded
  });

  it('honors the exclude set and the max cap', () => {
    const sibs = findSiblings(repo.dir, 'src/db/getUser.ts', { max: 1, exclude: new Set(['src/db/getUserProfile.ts']) });
    expect(sibs).toEqual(['src/db/getOrder.ts']);
  });

  it('returns [] for a directory with no other code files', () => {
    expect(findSiblings(repo.dir, 'src/other/elsewhere.ts', { max: 5 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/context.test.mjs`
Expected: FAIL — `parseExports`/`findSiblings` not exported.

- [ ] **Step 3: Implement the helpers** — edit `lib/context.mjs`.

Update the fs import line to add `readdirSync`:
```js
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
```

Add, after the existing `GREP_GLOBS` constant near the top:
```js
const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SIBLING_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.java', '.rb', '.c', '.cpp', '.h']);
```

Add the two helpers (place them after `resolveImport`, before `getContext`):
```js
/**
 * Best-effort exported-symbol extraction (grep-approximate, no semantic analysis).
 * JS/TS: `export [default] [async] function NAME`, `export const|let|var NAME`,
 * `export class NAME`, and `export { A, B as C }` (captures the exported-as name).
 * Python: top-level `def NAME` / `class NAME`. Other extensions → []. Used to seed
 * the caller signal; cannot disambiguate same-named symbols across scopes.
 * @param {string} src @param {string} ext @returns {string[]}
 */
export function parseExports(src, ext) {
  const names = new Set();
  const s = String(src);
  if (JS_EXTS.has(ext)) {
    for (const m of s.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const asMatch = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(seg);
        const name = asMatch ? asMatch[1] : /^([A-Za-z_$][\w$]*)/.exec(seg)?.[1];
        if (name) names.add(name);
      }
    }
  } else if (ext === '.py') {
    for (const m of s.matchAll(/^def\s+([A-Za-z_]\w*)/gm)) names.add(m[1]);
    for (const m of s.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) names.add(m[1]);
  }
  return [...names];
}

/** Length of the shared leading run of two strings. */
function sharedPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Same-directory code files most likely related to `filePath`, ranked by shared
 * filename-prefix length with its stem (desc), tie-broken alphabetically (asc) for
 * determinism. Excludes the file itself and anything in `exclude`. Repo-relative paths.
 * @param {string} repoDir @param {string} filePath
 * @param {{ max?: number, exclude?: Set<string> }} [opts] @returns {string[]}
 */
export function findSiblings(repoDir, filePath, { max = 5, exclude = new Set() } = {}) {
  const dir = dirname(filePath);
  let entries;
  try { entries = readdirSync(join(repoDir, dir), { withFileTypes: true }); }
  catch { return []; }
  const stem = basename(filePath, extname(filePath));
  const selfBase = basename(filePath);
  const cands = entries
    .filter((e) => e.isFile() && SIBLING_EXTS.has(extname(e.name)) && e.name !== selfBase)
    .map((e) => (dir === '.' ? e.name : `${dir}/${e.name}`))
    .filter((p) => !exclude.has(p));
  cands.sort((a, b) => {
    const da = sharedPrefixLen(stem, basename(a, extname(a)));
    const db = sharedPrefixLen(stem, basename(b, extname(b)));
    return db !== da ? db - da : a.localeCompare(b);
  });
  return cands.slice(0, max);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 6: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS (golden unchanged — `getContext` not yet touched).

- [ ] **Step 7: Commit**

```bash
git add lib/context.mjs tests/unit/context.test.mjs dist/anchor.mjs
git commit -m "feat(4A): parseExports + findSiblings pure helpers"
```

---

## Task 5 — 4A-context: wire callers + siblings into `getContext` (+ golden regen)

**Files:**
- Modify: `lib/context.mjs` (extend `getContext`; add `COMMON_NAMES`; import `findRefs`)
- Test: `tests/integration/context.test.mjs` (extend — sibling, caller, ordering-preserved)
- Modify: `tests/golden/__snapshots__/*.json` (regenerate — all four gain sibling entries)
- Modify: `tests/eval/cases.mjs` (add the `pattern-inconsistency` manual-gate fixture)
- Modify: `skills/anchor-review/SKILL.md` (Step 4 limitation footer line)
- Modify: `tests/unit/skill-contract.test.mjs` (extend)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

**Interfaces:**
- Consumes: `parseExports`, `findSiblings` (Task 4), `findRefs` (from `./refs.mjs`).
- Produces: `getContext` related-file insertion order becomes `importer → importee → manifest → caller → sibling` (first-reason-wins preserved). Return shape unchanged (`{ files: [{path, reason, description?}] }`). New reasons: `'caller'`, `'sibling'`. On by default.

**Caps/guards (conservative):** caller symbols kept only when `length >= 4` AND not in `COMMON_NAMES`; ≤ 8 symbols looked up per changed file; ≤ 15 caller files total; a global `Set` prevents re-grepping a symbol; siblings ≤ 5 per changed file.

- [ ] **Step 1: Write the failing integration test** — append to `tests/integration/context.test.mjs`:

```js
describe('getContext callers + siblings (4A)', () => {
  // Barrel re-export: `report.ts` imports the symbol from a barrel, NOT from the
  // changed file — so the importer grep (keyed on the changed file's stem) misses it,
  // but the caller signal (reverse refs on the exported symbol) catches it.
  const repo = makeFixtureRepo({
    'src/calc.ts': 'export function computeTax(x) { return x; }\n',
    'src/barrel.ts': "export { computeTax } from './calc';\n",
    'src/report.ts': "import { computeTax } from './barrel';\nexport const r = computeTax(1);\n",
    'src/db/getUser.ts': 'export const u = 1;\n',
    'src/db/getOrder.ts': 'export const o = 1;\n',
  });
  afterAll(() => repo.cleanup());

  it('surfaces a same-dir sibling with reason "sibling"', () => {
    const ctx = getContext({ files: ['src/db/getUser.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    expect(ctx.files.find((f) => f.path === 'src/db/getOrder.ts')).toMatchObject({ reason: 'sibling' });
  });

  it('surfaces a barrel/re-export call site the importer misses with reason "caller"', () => {
    const ctx = getContext({ files: ['src/calc.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    const report = ctx.files.find((f) => f.path === 'src/report.ts');
    expect(report).toBeTruthy();
    expect(report.reason).toBe('caller');           // not 'importer' (report.ts has no "calc" token)
    expect(ctx.files.find((f) => f.path === 'src/barrel.ts')).toMatchObject({ reason: 'importer' }); // unchanged precedence
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/context.test.mjs`
Expected: FAIL — no `caller`/`sibling` reasons yet.

- [ ] **Step 3: Implement the `getContext` extension** — edit `lib/context.mjs`.

Add `findRefs` to the imports:
```js
import { findRefs } from './refs.mjs';
```

Add the denylist constant near the other constants:
```js
// Generic names too common to give a useful reverse-ref signal (length>=4 still applies).
const COMMON_NAMES = new Set([
  'get', 'set', 'run', 'init', 'main', 'index', 'default', 'handler', 'value', 'data',
  'name', 'type', 'item', 'list', 'config', 'options', 'props', 'state', 'result',
  'error', 'utils', 'util', 'helper', 'helpers', 'create', 'update', 'remove', 'delete',
  'parse', 'format', 'render', 'setup', 'start', 'stop', 'load', 'save', 'read', 'write',
]);
const CALLER_FILE_CAP = 15;
const SYMBOLS_PER_FILE = 8;
```

In `getContext`, cache each changed file's source during the existing importer/importee loop so the caller pass doesn't re-read. Change the importee block from:
```js
    const abs = join(repoDir, f);
    if (existsSync(abs)) {
      for (const spec of parseImports(readFileSync(abs, 'utf8'))) {
```
to:
```js
    const abs = join(repoDir, f);
    if (existsSync(abs)) {
      const src = readFileSync(abs, 'utf8');
      srcCache.set(f, src);
      for (const spec of parseImports(src)) {
```
and declare the cache next to `const related = new Map();` at the top of `getContext`:
```js
  const srcCache = new Map(); // changed file → source text (read once, reused by the caller pass)
```

Then, AFTER the existing manifest `for (const entry of selectManifest(...))` loop and BEFORE the final `const list = filterIgnored(...)`, INSERT the caller + sibling passes:
```js
  // Callers (4A): symbol-level reverse refs for barrel/re-export call sites the
  // import grep misses. Conservative — distinctive exported names only, with a global
  // lookup set + per-file and total caps so a hot symbol can't flood the context.
  const lookedUp = new Set();
  let callerFiles = 0;
  for (const f of files) {
    if (callerFiles >= CALLER_FILE_CAP) break;
    const src = srcCache.get(f);
    if (src === undefined) continue;
    const symbols = parseExports(src, extname(f))
      .filter((s) => s.length >= 4 && !COMMON_NAMES.has(s.toLowerCase()) && !lookedUp.has(s))
      .slice(0, SYMBOLS_PER_FILE);
    for (const sym of symbols) {
      lookedUp.add(sym);
      let refs;
      try { refs = findRefs(repoDir, sym).references; } catch { continue; }
      for (const ref of refs) {
        if (callerFiles >= CALLER_FILE_CAP) break;
        if (!changed.has(ref.file) && !related.has(ref.file)) {
          related.set(ref.file, 'caller');
          callerFiles++;
        }
      }
    }
  }

  // Siblings (4A): same-directory code files, ranked by shared filename-prefix.
  const siblingExclude = new Set([...changed, ...related.keys()]);
  for (const f of files) {
    for (const sib of findSiblings(repoDir, f, { max: 5, exclude: siblingExclude })) {
      if (!related.has(sib)) {
        related.set(sib, 'sibling');
        siblingExclude.add(sib);
      }
    }
  }
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npx vitest run tests/integration/context.test.mjs`
Expected: PASS (sibling + caller + precedence cases, plus the pre-existing importer/importee/manifest tests).

- [ ] **Step 5: Regenerate the golden snapshots and verify the delta**

Run: `npx vitest run --update tests/golden`
Then inspect: `git --no-pager diff tests/golden/__snapshots__/`
Expected: the ONLY changes are additions to each scenario's `context.files` array of `{ "path": …, "reason": "sibling" }` (and, where applicable, `"reason": "caller"`) entries. The `diff` and `learnings` sections of every snapshot MUST be byte-identical to before. Sanity-check the expected same-dir siblings per scenario (all four fixtures live in `src/`): e.g. `clean-refactor` (change `src/sum.ts`) gains `src/auth.ts`, `src/find.ts`, `src/helper.ts` as siblings; `perf-issue` and `noisy-style` similarly gain their same-dir neighbors. If any snapshot's `diff`/`learnings` changed, STOP — that is a regression, not an intended update.

- [ ] **Step 6: Run the golden suite to confirm it passes against the updated snapshots**

Run: `npm run test:golden`
Expected: PASS.

- [ ] **Step 7: Add the `pattern-inconsistency` manual-gate eval fixture** — append to the `CASES` array in `tests/eval/cases.mjs` (before the closing `];`):

```js
  {
    name: 'pattern-inconsistency',
    // getOrder.ts validates its arg; the changed getUser.ts (same dir) drops the guard.
    // The sibling signal puts getOrder.ts in context so the review can flag the gap.
    base: {
      'src/db/getOrder.ts': 'export function getOrder(id: string) {\n  if (!id) throw new Error("id required");\n  return { id };\n}\n',
      'src/db/getUser.ts': 'export function getUser(id: string) {\n  if (!id) throw new Error("id required");\n  return { id };\n}\n',
    },
    change: {
      'src/db/getUser.ts': 'export function getUser(id: string) {\n  return { id };\n}\n',
    },
    expected: [{ file: 'src/db/getUser.ts', category: 'logic' }],
    cleanFiles: [],
  },
```

Note: this case is scored only by the **manual** eval gate (`npm run eval`, model required). It does not run in CI (`tests/unit/eval.test.mjs` tests the scorer, not the case list).

- [ ] **Step 8: Add the limitation footer to the SKILL + extend the contract test**

In `skills/anchor-review/SKILL.md` Step 4 (Get related files), after the existing paragraph, INSERT:

```markdown
Related files may carry `reason: "caller"` (a reverse-reference call site) or
`reason: "sibling"` (a same-directory file). Both are **grep-approximate** — no
semantic resolution, so they can't disambiguate same-named symbols across scopes.
Treat them as leads to read, not proof, and note in the "Context used" footer that
caller/sibling context is heuristic.
```

Add to `tests/unit/skill-contract.test.mjs` inside the describe:

```js
  it('4A: documents the grep-approximate caller/sibling limitation', () => {
    expect(SKILL).toContain('reason: "caller"');
    expect(SKILL).toContain('reason: "sibling"');
    expect(SKILL).toContain('grep-approximate');
  });
```

- [ ] **Step 9: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 10: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/context.mjs tests/integration/context.test.mjs tests/golden/__snapshots__ tests/eval/cases.mjs skills/anchor-review/SKILL.md tests/unit/skill-contract.test.mjs dist/anchor.mjs
git commit -m "feat(4A): caller + sibling context signals in getContext (+ golden regen)"
```

---

## Task 6 — 4E: linked-issue acceptance-criteria extractor + `issue-criteria` CLI + SKILL

**Files:**
- Create: `lib/issue.mjs` (`extractAcceptanceCriteria`)
- Create: `tests/unit/issue.test.mjs`
- Modify: `lib/cli.mjs` (new `issue-criteria` handler + USAGE)
- Modify: `tests/integration/new-subcommands.test.mjs` (CLI e2e)
- Modify: `skills/anchor-review/SKILL.md` (Step 3b pipe into extractor; Step 7 render verdicts)
- Modify: `tests/unit/skill-contract.test.mjs` (extend)
- Modify: `dist/anchor.mjs` (via `npm run bundle`)

**Interfaces:**
- Produces: `extractAcceptanceCriteria(body: string) => string[]` — markdown checklist items (`- [ ]` / `- [x]`) first; else non-empty lines under an "Acceptance criteria"/"Requirements" heading until the next heading (list markers stripped); else `[]`. CLI: `anchor issue-criteria` reads the issue body on stdin and emits `{ criteria: string[] }`.

- [ ] **Step 1: Write the failing unit test** — create `tests/unit/issue.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { extractAcceptanceCriteria } from '../../lib/issue.mjs';

describe('extractAcceptanceCriteria', () => {
  it('extracts checklist items (- [ ] / - [x]) anywhere', () => {
    const body = 'Intro text\n\n- [ ] Add login\n- [x] Hash passwords\n* [ ] Rate-limit\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['Add login', 'Hash passwords', 'Rate-limit']);
  });

  it('falls back to lines under an "Acceptance criteria" heading until the next heading', () => {
    const body = [
      '## Summary', 'does things', '',
      '## Acceptance Criteria', '- returns 200 on success', '- logs the request id', '',
      '## Notes', '- not a criterion',
    ].join('\n');
    expect(extractAcceptanceCriteria(body)).toEqual(['returns 200 on success', 'logs the request id']);
  });

  it('accepts a "Requirements" heading as the alias', () => {
    const body = '# Requirements\n1. Must validate input\n2. Must persist\n# Other\nignore me\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['Must validate input', 'Must persist']);
  });

  it('prefers checklist items over heading content when both exist', () => {
    const body = '## Acceptance Criteria\n- [ ] checkbox wins\nplain line loses\n';
    expect(extractAcceptanceCriteria(body)).toEqual(['checkbox wins']);
  });

  it('returns [] when there is nothing to extract', () => {
    expect(extractAcceptanceCriteria('just a paragraph, no structure\n')).toEqual([]);
    expect(extractAcceptanceCriteria('')).toEqual([]);
    expect(extractAcceptanceCriteria(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/issue.test.mjs`
Expected: FAIL — module `lib/issue.mjs` does not exist.

- [ ] **Step 3: Implement `lib/issue.mjs`** — create the file:

```js
/**
 * Pure, network-free extraction of acceptance criteria from an issue/PR body.
 * Order of precedence:
 *   1. Markdown checklist items (`- [ ]` / `- [x]`) anywhere in the body.
 *   2. Else non-empty lines under an "Acceptance criteria"/"Requirements" heading,
 *      until the next heading (leading list/number/checkbox markers stripped).
 *   3. Else [].
 * Unit-tested without a model or `gh` — the SKILL pipes `gh issue view` output in.
 */
const CHECKLIST_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const CRITERIA_HEADING_RE = /(acceptance\s+criteria|requirements)/i;
const LIST_MARKER_RE = /^(?:[-*]\s+|\d+\.\s+)?(?:\[[ xX]\]\s+)?/;

/** @param {string} body @returns {string[]} */
export function extractAcceptanceCriteria(body) {
  const lines = String(body ?? '').split('\n');

  const checklist = [];
  for (const l of lines) {
    const m = CHECKLIST_RE.exec(l);
    if (m) checklist.push(m[1].trim());
  }
  if (checklist.length) return checklist;

  const out = [];
  let capturing = false;
  for (const l of lines) {
    const h = HEADING_RE.exec(l);
    if (h) { capturing = CRITERIA_HEADING_RE.test(h[1]); continue; }
    if (!capturing) continue;
    const t = l.trim();
    if (!t) continue;
    out.push(t.replace(LIST_MARKER_RE, '').trim());
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/issue.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing CLI integration test** — append to `tests/integration/new-subcommands.test.mjs`:

```js
describe('anchor issue-criteria', () => {
  it('extracts checklist criteria from a body on stdin', () => {
    const r = spawnSync('node', [BIN, 'issue-criteria'], {
      cwd: repo.dir, encoding: 'utf8', input: '## Acceptance Criteria\n- [ ] do X\n- [x] do Y\n',
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ criteria: ['do X', 'do Y'] });
  });

  it('emits an empty array for an unstructured body', () => {
    const r = spawnSync('node', [BIN, 'issue-criteria'], { cwd: repo.dir, encoding: 'utf8', input: 'no structure here\n' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ criteria: [] });
  });
});
```

- [ ] **Step 6: Run the CLI test to verify it fails**

Run: `npx vitest run tests/integration/new-subcommands.test.mjs`
Expected: FAIL — unknown subcommand `issue-criteria` (exit 1, USAGE on stderr).

- [ ] **Step 7: Wire the `issue-criteria` handler** — edit `lib/cli.mjs`.

Add the import near the other lib imports:
```js
import { extractAcceptanceCriteria } from './issue.mjs';
```

Update `USAGE` to include the subcommand:
```js
const USAGE = `usage: anchor <init|diff|context|analyze|rules|refs|review|learn|status|config|doctor|hook|issue-criteria> [args] [--format json|text]`;
```

Add this handler to the `HANDLERS` object (e.g. after `refs`):
```js
  'issue-criteria'(positional, flags) {
    const body = readFileSync(0, 'utf8'); // stdin — an issue/PR body piped from `gh issue view`
    emit({ criteria: extractAcceptanceCriteria(body) }, flags);
  },
```
(`readFileSync` is already imported in `cli.mjs`. No `requireRepo()` — extraction is pure and must work without a repo.)

- [ ] **Step 8: Run the CLI test to verify it passes**

Run: `npx vitest run tests/integration/new-subcommands.test.mjs`
Expected: PASS.

- [ ] **Step 9: Update the SKILL + extend the contract test**

In `skills/anchor-review/SKILL.md` Step 3b, after the sentence about fetching linked issues, INSERT:

```markdown
For each linked issue body, pipe it into `anchor issue-criteria` (stdin → JSON
`{criteria:[…]}`) to get the testable acceptance criteria. Keep them for Step 7.
```

In Step 7, after the "Per-finding machine-readable block" subsection (added in Task 1), INSERT:

```markdown
**Acceptance criteria (PR mode with a linked issue).** If Step 3b produced criteria,
render an **"Acceptance criteria"** subsection — one line per criterion with a
three-state verdict: `✅ Addressed` / `❌ Not addressed` / `❓ Unclear`, each with a
one-line justification (cite file/line evidence where addressed). **Abstain (`❓
Unclear`) whenever the diff doesn't clearly settle it — never guess.**
```

Add to `tests/unit/skill-contract.test.mjs`:

```js
  it('4E: pipes issue bodies into issue-criteria and renders three-state verdicts', () => {
    expect(SKILL).toContain('anchor issue-criteria');
    expect(SKILL).toContain('Acceptance criteria');
    expect(SKILL).toContain('✅ Addressed');
    expect(SKILL).toContain('❓ Unclear');
  });
```

- [ ] **Step 10: Run the SKILL-contract test**

Run: `npx vitest run tests/unit/skill-contract.test.mjs`
Expected: PASS (all of 4D/4C/4A/4E contract assertions).

- [ ] **Step 11: Refresh the bundle**

Run: `npm run bundle`
Expected: writes `dist/anchor.mjs` (exit 0).

- [ ] **Step 12: Run the full deterministic gate**

Run: `npm test && npm run test:integration && npm run test:golden && npm run typecheck`
Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/issue.mjs tests/unit/issue.test.mjs lib/cli.mjs tests/integration/new-subcommands.test.mjs skills/anchor-review/SKILL.md tests/unit/skill-contract.test.mjs dist/anchor.mjs
git commit -m "feat(4E): issue acceptance-criteria extractor + issue-criteria CLI + SKILL verdicts"
```

---

## 4B — Not implemented (spec-only)

4B (cascading per-directory config) is intentionally NOT built in Phase 4. Its merge
semantics are recorded in `docs/superpowers/specs/2026-06-16-anchor-phase4-design.md`.
No `lib/config.mjs`, `templates/config.yaml`, or `disabled_rules` changes are part of
this plan. Do not add them.

---

## Final whole-branch review

After Task 6, run the broad review across the full branch (`git merge-base main HEAD` …
`HEAD`) per superpowers:requesting-code-review, then superpowers:finishing-a-development-branch.

Manual quality gate (state explicitly whether a model was available): `npm run eval`
to sanity-check 4A recall (incl. `pattern-inconsistency`), 4C suppression behavior,
4D fix-spec sanity, and 4E verdicts.

---

## Self-review (author checklist — completed)

**Spec coverage:**
- Keystone `anchor:finding` block → Task 1 (parser) + SKILL emit. ✅
- 4D apply+auto-verify, "can't spec it → noise", Step 8 rewording, verify discovery → Task 1. ✅
- 4C `--since-last` + rebase fallback → Task 2. ✅
- 4C write-time hash storage, read accessor, prompt suppression → Task 3. ✅
- 4A `parseExports`/`findSiblings` → Task 4; `getContext` callers+siblings, caps, ordering, golden regen, limitation doc → Task 5. ✅
- 4B spec-only → explicitly NOT built. ✅
- 4E extractor + `issue-criteria` + SKILL verdicts → Task 6. ✅

**Type consistency:** `parseFindingBlocks` (Task 1) consumed by `saveReview` (Task 3); `normalizeTitle`/`findingHash` names stable; `findSiblings(repoDir, filePath, {max, exclude})` signature identical in Task 4 def and Task 5 call; `sinceLastRange` return `{mode:'range'|'fallback'}` consistent between def (Task 2 Step 3) and CLI use (Task 2 Step 4). ✅

**Interpretation calls flagged:** 4C script-net = stored identity (no body rewrite); 4A limitation via comments+footer (no new JSON field); `pattern-inconsistency` is manual-gate only. All three are restated in their tasks and in the Global Constraints. ✅
