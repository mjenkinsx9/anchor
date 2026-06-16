# Anchor Review-Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Anchor's review quality toward Greptile/CodeRabbit grade — fewer false positives, more real bugs caught — while staying a local, no-cloud, deterministic-scripts + LLM-session tool, and add the eval feedback loop that proves each change helps.

**Architecture:** Anchor keeps its split: deterministic Node scripts in `lib/*.mjs` gather review inputs (diff, related files, codebase map, learnings, config) and emit JSON; the active Claude Code session does the review reasoning, guided by `skills/anchor-review/SKILL.md`. Every improvement here is either (a) a new/extended deterministic gather step that feeds *grounded* context into the prompt, or (b) a prompt change in SKILL.md. New CLI subcommands follow the existing `HANDLERS` pattern in `lib/cli.mjs`. The `lib/eval.mjs` harness (recall/precision/false-positives over fixtures) is the acceptance gate for every phase.

**Tech Stack:** Node ESM (`.mjs`), vitest, js-yaml, minimatch, esbuild (bundle), `git`/`gh` via `spawnSync`. No new runtime deps unless a task says so.

---

## Conventions (apply to every task)

- **TDD is mandatory.** Write the failing test, watch it fail for the right reason, write minimal code, watch it pass. No production code without a failing test first.
- **Granularity:** Phases 1–3 are written to TDD-step granularity with complete code. Phase 4 (medium-effort) items are written to **task-spec** granularity — exact files, function signatures, one representative failing test, and acceptance criteria — to be expanded into per-step code when scheduled (their design crystallizes at build time; do not treat the specs as placeholders, they are the contract). Phase 5 is a non-goals reference, not tasks.
- **Bundle refresh:** `bin/anchor.mjs` prefers `lib/` but ships `dist/anchor.mjs`, and `tests/integration/bundle.test.mjs` asserts the bundle is fresh. **Any task that edits a `lib/*.mjs` file MUST end with `npm run bundle` and stage `dist/anchor.mjs`.**
- **Test commands:** `npm test` (unit), `npm run test:integration`, `npm run test:golden`, `npm run typecheck`, `npm run eval`.
- **Eval gate (the meta point):** before starting a phase, run `npm run eval` (with reviews generated, see Phase M) and record the baseline. After the phase, re-run: **recall must not drop and false-positives must not rise.** A phase that regresses either is not done.
- **Eval-gate reality (be honest about what gates what):** `tests/eval/run.mjs` only *scores* when `ANCHOR_EVAL_GENERATE=1` AND the `claude` CLI is installed and authenticated; otherwise it writes prompts and exits 0 **without scoring** (`scored.length === 0`). So in any automated/CI/subagent context without a live model, the LLM eval is a no-op. The **binding** acceptance gate for those contexts is the deterministic suite — `npm test`, `npm run test:integration`, `npm run test:golden`, `npm run typecheck`, plus the scorer's own unit tests (`tests/unit/eval.test.mjs`). Treat the LLM eval as a *manual/optional* quality gate run by a human with a model, not a blocker that silently passes.
- **Config back-compat:** every new config key has a default in `lib/config.mjs` `DEFAULTS` and is documented in `templates/config.yaml`. Unknown/invalid values warn (don't throw) and fall back to default, matching the existing `loadConfig` pattern.
- **SKILL changes are not bundled** (the skill ships as a markdown file), but they DO ship in the plugin — bump nothing, just edit `skills/anchor-review/SKILL.md`.
- **Shared-file sequencing (critical for parallel execution):** `lib/cli.mjs`, `lib/config.mjs`, `skills/anchor-review/SKILL.md`, `templates/config.yaml`, and `dist/anchor.mjs` are touched by *many* tasks. These must be edited **sequentially, one task at a time** — never by parallel agents/worktrees, or the edits clobber each other and the bundle races. What *is* safe to parallelize: creating the standalone new modules (`lib/analyzers.mjs`, `lib/rules.mjs`, `lib/refs.mjs`, `lib/manifest.mjs`) and their *unit* tests, since each is a disjoint new file. Build those in parallel, then do all `cli.mjs`/`config.mjs`/`SKILL.md` wiring + the single `npm run bundle` centrally and sequentially.
- **Hard dependency order:** Phase 1 (esp. **1.3 timeout** — 2A's analyzers pass `defaultTimeout`) lands before Phase 2. Within Phase 2: **2C (`refs`) before 4A** (4A reuses `findRefs`). The shared `anchor config` effective-config step (below) lands before 3A/3D rely on it.
- **Effective-config bridge (resolves a recurring gap):** the SKILL reads raw `.anchor/config.yaml` with the Read tool, so it never sees *merged defaults* for keys the user omitted (e.g. `protected_categories`, `strictness`, `categories`). Fix once: SKILL **Step 2 also runs `anchor config --format json`** to get the effective merged config and uses *those* values for category-gating (3D), protected categories (3A), `min_severity`/`min_confidence`/`max_findings` filtering, and rules-presence. Document this in SKILL Step 2; tasks 3A/3D/2B reference it instead of re-inventing a config-passing mechanism.

---

## File / module map

New modules (each one responsibility):
- `lib/analyzers.mjs` — detect installed static analyzers, run them scoped to changed files, normalize output. (Phase 2A)
- `lib/rules.mjs` — load + scope-filter positive review rules (`.anchor/rules.md` + structured rules). (Phase 2B)
- `lib/refs.mjs` — find references / definitions of a symbol via `git grep`. (Phase 2C)
- `lib/manifest.mjs` — load + scope-filter the context-file manifest (`.anchor/files.json`). (Phase 3B)

Extended modules:
- `lib/diff.mjs` — budget NaN guard (1.1).
- `lib/config.mjs` — value validation (1.2), `protected_categories` (3A), `rules` (2B), per-dir resolution (4B).
- `lib/git.mjs` — default command timeouts (1.3).
- `lib/learn.mjs` — richer learning records: `scope`, `category`, `action` (3C).
- `lib/context.mjs` — callers-grep + pattern-siblings (4A); manifest files (3B).
- `lib/review.mjs` — machine-readable meta block (1.4); incremental + dedup (4C).
- `lib/cli.mjs` — new subcommands (`analyze`, `rules`, `refs`), flags.
- `skills/anchor-review/SKILL.md` — consume all the above; category-gating; fix-spec; linked-issue; protected categories.
- `lib/eval.mjs` + `tests/eval/` — expanded fixtures, more categories (Phase M).

---

## Phase 1 — Hardening & small fixes

Self-contained, no design risk, ship first.

### Task 1.1: Guard the diff budget against a non-numeric flag

**Files:**
- Modify: `lib/cli.mjs` (diff handler, ~line 101)
- Modify: `lib/diff.mjs` (`applyBudget`)
- Test: `tests/unit/diff.test.mjs`

- [ ] **Step 1: Write the failing test** (append to the `applyBudget` describe block)

```js
it('treats a non-finite budget as the fallback, not as "no limit"', () => {
  const r = applyBudget(mk([{ path: 'a', added: 9999, removed: 0, hunks: [] }]),
    { maxLines: NaN, maxFiles: NaN, fallbackLines: 100, fallbackFiles: 5 });
  expect(r.overBudget).toBe(true); // NaN must not silently disable the budget
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/diff.test.mjs`
Expected: FAIL — `applyBudget` ignores `fallbackLines`/`fallbackFiles`, so `NaN` comparisons are false and `overBudget` is undefined.

- [ ] **Step 3: Implement** — make `applyBudget` coerce non-finite budgets to the fallback

```js
export function applyBudget(result, { maxLines, maxFiles, force = false, fallbackLines = 15000, fallbackFiles = 100 }) {
  const lines = Number.isFinite(maxLines) ? maxLines : fallbackLines;
  const files = Number.isFinite(maxFiles) ? maxFiles : fallbackFiles;
  const totalLines = result.files.reduce((s, f) => s + f.added + f.removed, 0);
  const reasons = [];
  if (totalLines > lines) reasons.push(`${totalLines.toLocaleString()} change-lines (budget ${lines.toLocaleString()})`);
  if (result.files.length > files) reasons.push(`${result.files.length.toLocaleString()} files (budget ${files.toLocaleString()})`);
  if (force || reasons.length === 0) return result;
  return {
    ...result,
    overBudget: true,
    budgetWarning:
      `anchor: diff exceeds budget — ${reasons.join('; ')}. Reviewing anyway; ` +
      'prioritize the most important files. Use --force to silence, ' +
      '--max-diff-lines N to raise the budget, or split the change.',
  };
}
```

- [ ] **Step 4: Wire the fallback in `lib/cli.mjs`** (diff handler) so a typo'd flag falls back to config, not to "unlimited"

```js
const result = applyBudget(withStats({ ...d, files: filtered }), {
  maxLines: Number(flags.get('max-diff-lines') ?? config.max_diff_lines),
  maxFiles: Number(flags.get('max-files') ?? config.max_files),
  force: flags.has('force'),
  fallbackLines: config.max_diff_lines,
  fallbackFiles: config.max_files,
});
```

- [ ] **Step 5: Run tests + bundle**

Run: `npx vitest run tests/unit/diff.test.mjs && npm run bundle`
Expected: PASS; bundle rewritten.

- [ ] **Step 6: Commit**

```bash
git add lib/diff.mjs lib/cli.mjs tests/unit/diff.test.mjs dist/anchor.mjs
git commit -m "fix: non-numeric diff budget flag falls back to config, not unlimited"
```

### Task 1.2: Config hardening — validate enums, bound numerics, fix `ensureGitignore`

Covers three real defects the deep review found in `config.mjs`: (a) no membership/enum validation for `min_severity`, `output.color`, categories; (b) no bounds on numeric keys, so `max_files: 0` / `min_confidence: 99` pass silently; (c) `ensureGitignore` uses an exact-string `Set` membership test, so a `.gitignore` line with trailing whitespace defeats dedup and the block is appended repeatedly (idempotency bug).

**Files:**
- Modify: `lib/config.mjs` (`loadConfig` + `ensureGitignore`)
- Test: `tests/unit/config.test.mjs`

- [ ] **Step 1: Write the failing tests** (append to the `loadConfig` describe)

```js
it('invalid min_severity → warning + default low', () => {
  writeConfig('min_severity: huge\n');
  const { config, warnings } = loadConfig(dir);
  expect(config.min_severity).toBe('low');
  expect(warnings[0]).toContain('min_severity must be one of');
});
it('unknown category → warning + drops the bad entry', () => {
  writeConfig('categories:\n  - logic\n  - bogus\n');
  const { config, warnings } = loadConfig(dir);
  expect(config.categories).toEqual(['logic']);
  expect(warnings[0]).toContain('unknown categor');
});
it('invalid output.color → warning + default auto', () => {
  writeConfig('output:\n  color: rainbow\n');
  const { config, warnings } = loadConfig(dir);
  expect(config.output.color).toBe('auto');
  expect(warnings[0]).toContain('output.color');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/config.test.mjs`
Expected: FAIL — no validation for these keys today.

- [ ] **Step 3: Implement** — add validation in `loadConfig` before the final merge

```js
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = ['logic', 'security', 'perf', 'style', 'docs', 'tests'];
const COLORS = ['auto', 'always', 'never'];

if (raw.min_severity !== undefined && !SEVERITIES.includes(raw.min_severity)) {
  warnings.push(`anchor: min_severity must be one of ${SEVERITIES.join(', ')}. Got ${JSON.stringify(raw.min_severity)}. Using low.`);
  delete raw.min_severity;
}
if (Array.isArray(raw.categories)) {
  const bad = raw.categories.filter((c) => !CATEGORIES.includes(c));
  if (bad.length) {
    warnings.push(`anchor: unknown categories ${JSON.stringify(bad)}. Allowed: ${CATEGORIES.join(', ')}. Dropping them.`);
    raw.categories = raw.categories.filter((c) => CATEGORIES.includes(c));
  }
}
if (raw.output !== undefined && (typeof raw.output !== 'object' || Array.isArray(raw.output))) {
  warnings.push(`anchor: output must be a mapping. Got ${JSON.stringify(raw.output)}. Using defaults.`);
  delete raw.output;
}
if (raw.output && typeof raw.output === 'object' && raw.output.color !== undefined && !COLORS.includes(raw.output.color)) {
  warnings.push(`anchor: output.color must be one of ${COLORS.join(', ')}. Got ${JSON.stringify(raw.output.color)}. Using auto.`);
  delete raw.output.color;
}
```

**Numeric bounds** (run this *after* the existing `Number.isInteger` loop — those already drop non-integers; this drops out-of-range integers). Append to the same `loadConfig` validation region:

```js
const BOUNDS = { max_findings: [1, Infinity], min_confidence: [0, 5], max_diff_lines: [1, Infinity], max_files: [1, Infinity] };
for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
  if (Number.isInteger(raw[key]) && (raw[key] < lo || raw[key] > hi)) {
    warnings.push(`anchor: ${key} must be between ${lo} and ${hi}. Got ${raw[key]}. Using ${DEFAULTS[key]}.`);
    delete raw[key];
  }
}
```

- [ ] **Step 3b: Fix `ensureGitignore` idempotency** — normalize lines before the membership test so trailing whitespace can't defeat dedup:

```js
const lines = new Set(existing.split('\n').map((l) => l.trim()));
```

Add a test: write a `.gitignore` containing `'.anchor/config.yaml   \n'` (trailing spaces), call `ensureGitignore` twice, assert the block isn't duplicated.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.mjs tests/unit/config.test.mjs
git commit -m "feat: validate min_severity, categories membership, and output.color"
```

### Task 1.3: Default timeouts on git/gh commands

**Files:**
- Modify: `lib/git.mjs` (`runCmd`)
- Test: `tests/unit/git.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { runCmd } from '../../lib/git.mjs';
it('applies a default timeout when none is passed', () => {
  // `sleep 5` should be killed by the injected default well under 5s.
  const start = Date.now();
  const r = runCmd('sh', ['-c', 'sleep 5'], { defaultTimeout: 200 });
  expect(Date.now() - start).toBeLessThan(2000);
  expect(r.code).not.toBe(0); // killed → non-zero / signal
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/git.test.mjs`
Expected: FAIL — no `defaultTimeout` honored; the call blocks ~5s.

- [ ] **Step 3: Implement** — honor an explicit timeout, else a default; keep existing callers working.

> **Verify, don't assume:** Node's `spawnSync` timeout behavior across versions sets *both* `res.error` (an `Error` whose `.code` is `'ETIMEDOUT'`) **and** `res.signal` (`'SIGTERM'`). Detect the timeout robustly via *either* signal. Confirm empirically once with `node -e "const {spawnSync}=require('child_process');const r=spawnSync('sh',['-c','sleep 5'],{timeout:200});console.log(JSON.stringify({err:r.error&&r.error.code,sig:r.signal,status:r.status}))"` before finalizing. Missing-binary (`ENOENT`) must still return 127 (existing test `tests/unit/git.test.mjs` asserts this).

```js
export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout ?? opts.defaultTimeout ?? 30_000,
  });
  const timedOut = res.error?.code === 'ETIMEDOUT' || (res.error == null && res.signal != null && res.status == null);
  if (timedOut) {
    return { stdout: res.stdout ?? '', stderr: `anchor: command timed out: ${cmd}`, code: 124 }; // 124 = GNU timeout convention
  }
  if (res.error) {
    return { stdout: '', stderr: String(res.error.message), code: 127 }; // missing binary etc.
  }
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', code: res.status ?? (res.signal ? 128 : 0) };
}
```

Revise the **Step 1 test** to assert the *behavior* (killed, distinct code) rather than only wall-clock, which can flake under load:

```js
it('applies a default timeout and reports a clean timeout code/message', () => {
  const start = Date.now();
  const r = runCmd('sh', ['-c', 'sleep 5'], { defaultTimeout: 200 });
  expect(Date.now() - start).toBeLessThan(3000); // killed well before 5s
  expect(r.code).toBe(124);
  expect(r.stderr).toMatch(/timed out/);
});
it('still returns 127 for a missing binary (not 124)', () => {
  expect(runCmd('definitely-not-a-real-binary-xyz', []).code).toBe(127);
});
```

- [ ] **Step 3b: Give long-running external calls a generous explicit timeout** so the new 30s default never truncates a legitimately slow fetch. In `lib/diff.mjs` `prMode`, pass `{ cwd, env, timeout: 120_000 }` to the `gh pr diff` / `gh pr view` `runCmd` calls. (The eval harness spawns `claude -p` via `spawnSync` directly, **not** through `runCmd`, so it is unaffected — note this in a comment.)

- [ ] **Step 4: Run to verify pass + full unit suite** (ensure the 30s default doesn't break fast tests)

Run: `npx vitest run tests/unit && npm run bundle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/git.mjs tests/unit/git.test.mjs dist/anchor.mjs
git commit -m "feat: default 30s timeout on external commands; clean timeout message"
```

### Task 1.4: Decouple review-meta extraction from the rendered format

`lib/review.mjs` `extractReviewMeta` regex-scrapes `Confidence: n/5` and `🔴 CRITICAL (n)` from the human render. Add a machine-readable block the SKILL emits, parse that first, fall back to the regex.

**Files:**
- Modify: `lib/review.mjs` (`extractReviewMeta`)
- Modify: `skills/anchor-review/SKILL.md` (Step 7 — emit the block)
- Test: `tests/unit/review.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { extractReviewMeta } from '../../lib/review.mjs';
it('prefers the machine-readable anchor:meta block over text scraping', () => {
  const content = `<!-- anchor:meta {"score":4,"severities":{"critical":1,"high":0,"medium":2,"low":0}} -->\n` +
    `Confidence: 1 / 5\n🔴 CRITICAL  (9)\n`; // text says 9/1, block says 1/4 — block wins
  const m = extractReviewMeta(content);
  expect(m.score).toBe(4);
  expect(m.severities.critical).toBe(1);
  expect(m.severities.medium).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: FAIL — current code scrapes the text and returns score 1, critical 9.

- [ ] **Step 3: Implement** — parse the block first in `extractReviewMeta`

```js
export function extractReviewMeta(content) {
  const block = /<!--\s*anchor:meta\s*(\{[\s\S]*?\})\s*-->/.exec(content);
  if (block) {
    try {
      const m = JSON.parse(block[1]);
      if (m && typeof m === 'object') {
        return {
          score: typeof m.score === 'number' ? m.score : null,
          severities: m.severities ?? null,
        };
      }
    } catch { /* fall through to text scraping */ }
  }
  // ... existing regex-based extraction unchanged ...
}
```

- [ ] **Step 4: Emit the block from SKILL.md Step 7** — add one line to the render contract, immediately after the header block:

```
  Immediately below the header, emit one machine-readable line (it renders as an
  HTML comment, invisible in most viewers):
  <!-- anchor:meta {"score": <0-5>, "severities": {"critical": <n>, "high": <n>, "medium": <n>, "low": <n>}} -->
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/unit/review.test.mjs`
Expected: PASS (text-scraping fallback tests still pass).

- [ ] **Step 6: Commit**

```bash
git add lib/review.mjs skills/anchor-review/SKILL.md tests/unit/review.test.mjs
git commit -m "feat: machine-readable anchor:meta block for review score/severities"
```

### Task 1.5: Unify the two ignore lists

`DEFAULTS.ignore` (diff filter) omits `dist/`/`build/` that `DEFAULT_IGNORE_DIRS` (init/context) has, so generated output counts toward the diff budget.

**Files:**
- Modify: `lib/config.mjs` (`DEFAULTS.ignore`)
- Test: `tests/unit/config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
it('default ignore covers build output dirs', () => {
  const { config } = loadConfig(dir);
  expect(config.ignore).toEqual(expect.arrayContaining(['**/dist/**', '**/build/**', '**/coverage/**']));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/config.test.mjs`
Expected: FAIL — `DEFAULTS.ignore` lacks those globs.

- [ ] **Step 3: Implement** — extend `DEFAULTS.ignore`

```js
ignore: ['**/*.lock', '**/*.generated.*', 'vendor/**', 'node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
```

- [ ] **Step 4: Run + verify golden snapshots unaffected** (golden fixtures don't include dist/build)

Run: `npx vitest run tests/unit && npm run test:golden`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.mjs tests/unit/config.test.mjs
git commit -m "fix: default ignore now covers dist/build/coverage (matches init/context)"
```

### Task 1.6: Add a stale-design note to the dated spec

The dated `docs/superpowers/specs/2026-06-09-anchor-design.md` (line ~936) still documents the old hard-fail. Don't rewrite history; add a one-line pointer.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-09-anchor-design.md`

- [ ] **Step 1: Add a note** at the top of the "Diff too large" error-table row's section (no test — docs only)

```markdown
> **Superseded (2026-06-16):** the diff budget no longer hard-fails; `anchor diff`
> emits `overBudget: true` and the reviewer prioritizes files. See
> `docs/superpowers/plans/2026-06-16-anchor-review-quality.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-09-anchor-design.md
git commit -m "docs: note that the diff hard-fail behavior was superseded"
```

### Task 1.7: Harden `parseUnifiedDiff` against truncated/malformed hunks

The deep review found a real state-machine bug: if a hunk header declares more lines than the body actually contains (truncated diff — e.g. a `gh pr diff` cut off, or a malformed paste), `remOld`/`remNew` never reach zero, so the **next file's `diff --git` line is absorbed into the previous hunk's body** and that whole subsequent file is silently lost. Git's own output is well-formed, but Anchor ingests `gh` output and pasted/file-mode diffs, so this is reachable. The fix: recognize a new section header even while a hunk is "hungry".

**Files:**
- Modify: `lib/diff.mjs` (`parseUnifiedDiff`)
- Test: `tests/unit/diff.test.mjs`

- [ ] **Step 1: Failing test** — a truncated first hunk followed by a second file; assert BOTH files parse:

```js
it('does not swallow the next file when a hunk is truncated', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,5 +1,5 @@',   // claims 5 lines…
    ' one',
    '+two',             // …but only 2 body lines provided (truncated)
    'diff --git a/b.ts b/b.ts',
    '--- a/b.ts',
    '+++ b/b.ts',
    '@@ -1 +1 @@',
    '-x',
    '+y',
    '',
  ].join('\n');
  const files = parseUnifiedDiff(diff);
  expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']); // currently returns ['a.ts'] only
});
```

- [ ] **Step 2: Run to verify failure** — current parser returns only `a.ts`; `b.ts` was absorbed into `a.ts`'s hunk body.

- [ ] **Step 3: Implement** — in the hunk-consumption branch (top of the per-line loop), bail out of consumption when the line begins a **new file section** so the normal header logic runs. Guard on `diff --git ` ONLY:

```js
for (const line of text.split('\n')) {
  // A new file section starts with an UNPREFIXED `diff --git `. Body content lines are
  // always prefixed (+/-/space), so a content line can never bare-start with `diff --git `.
  // (Do NOT also test `--- `/`+++ ` here: a removed content line like `-- x` renders as
  // `--- x`, which would misfire. Real `---`/`+++` headers only ever follow `diff --git`,
  // and by then flush() has already reset the hunk state.)
  if (hunk && (remOld > 0 || remNew > 0) && !line.startsWith('diff --git ')) {
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    hunk.body += line + '\n';
    const c = line[0];
    if (c === '+') { remNew--; file.added++; }
    else if (c === '-') { remOld--; file.removed++; }
    else { remOld--; remNew--; }
    continue;
  }
  // …existing `diff --git` / `---` / `+++` / `@@` handling unchanged…
}
```

The existing "does not mistake body lines starting with --- or +++ for headers" test stays green (those lines don't start with `diff --git `, and for well-formed hunks `remOld/remNew` are consumed exactly so we never reach the next `diff --git` mid-hunk anyway). Verify it still passes.

- [ ] **Step 4: Run unit suite + bundle**

Run: `npx vitest run tests/unit/diff.test.mjs && npm run bundle`
Expected: PASS (all existing diff tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/diff.mjs tests/unit/diff.test.mjs dist/anchor.mjs
git commit -m "fix: parseUnifiedDiff no longer swallows the next file on a truncated hunk"
```

---

## Phase 2 — The Big 3 (highest review-quality leverage)

### Task 2A: Static-analyzer integration (`anchor analyze`)

Run installed analyzers scoped to changed files and feed normalized, *grounded* findings into the review context. The LLM triages tool output instead of re-deriving (or hallucinating) mechanical bugs.

**Files:**
- Create: `lib/analyzers.mjs`
- Modify: `lib/cli.mjs` (new `analyze` handler + import)
- Modify: `skills/anchor-review/SKILL.md` (new Step 3d — run `anchor analyze`)
- Test: `tests/unit/analyzers.test.mjs`, `tests/integration/analyze.test.mjs`

**Design.** A registry of analyzers, each: `{ name, bin, exts, command(files), parse(stdout, stderr) -> Finding[] }`. `Finding = { tool, file, line, rule, severity, message, changed }`. `analyze(repoDir, changedFiles)` runs only analyzers that (a) match at least one changed file's extension AND (b) have a resolvable binary, scoped to those files, and returns `{ tools: [{name, ran, fileCount, reason?}], findings: Finding[], truncated? }`. Never throws — a failing/missing analyzer is recorded as `ran:false` with a `reason`.

Four things the deep review proved are load-bearing for this to be *useful*, not just present:

1. **Local-binary resolution (the headline fix).** `eslint`/`tsc`/`prettier` are almost always project-local devDeps, not global. `hasCmd('tsc')` (global PATH `--version`) returns false on most real JS/TS repos, so analyzers would silently never fire. Add `resolveBin(repoDir, bin)` that prefers `<repoDir>/node_modules/.bin/<bin>` (also `.cmd` on Windows) and falls back to a global `hasCmd(bin)` check; run the resolved absolute path.
2. **Repo-relative path normalization.** `eslint --format json` emits **absolute** `filePath`; `ruff`/`tsc` vary. Normalize every finding's `file` to repo-relative (strip a leading `repoDir + sep`) so it dedups/attributes against the diff (whose paths are repo-relative).
3. **`changed` tagging + cap instead of flooding.** `tsc --noEmit` is whole-project (passing files to `tsc` disables `tsconfig.json` — a known gotcha — so we deliberately do NOT pass files to tsc), so on a repo with pre-existing errors it would flood the review. Tag each finding `changed: <file ∈ changedSet>`; cap total findings (e.g. 200) and set `truncated: true` if exceeded. The SKILL prioritizes `changed: true` findings and treats the rest as ambient context. (This preserves the valuable "your signature change broke an unchanged caller" signal — that finding has `changed: false` but is still surfaced — without drowning the review.)
4. **Consistent `tools[]` shape.** Every entry is `{ name, ran, fileCount, reason? }`; skipped tools are `{ name, ran: false, fileCount: 0, reason: 'not installed' }`.

- [ ] **Step 1: Write the failing unit test** for the pure parser + selection logic (no external bins needed — inject a fake analyzer)

```js
import { selectAnalyzers, runAnalyzers } from '../../lib/analyzers.mjs';

const fake = {
  name: 'fakelint', bin: 'true', exts: ['.ts'],
  command: (files) => ['-c', `echo`], // not actually executed in selection test
  parse: () => [{ tool: 'fakelint', file: 'a.ts', line: 1, rule: 'x', severity: 'high', message: 'bad' }],
};

it('selects only analyzers whose extensions match the changed files', () => {
  expect(selectAnalyzers([fake], ['a.ts']).map((a) => a.name)).toEqual(['fakelint']);
  expect(selectAnalyzers([fake], ['a.py'])).toEqual([]);
});

it('runAnalyzers normalizes findings and records which tools ran', async () => {
  const out = await runAnalyzers([fake], { repoDir: process.cwd(), files: ['a.ts'], exec: async () => ({ stdout: '', stderr: '', code: 0 }) });
  expect(out.findings[0]).toMatchObject({ tool: 'fakelint', file: 'a.ts', severity: 'high' });
  expect(out.tools).toEqual([{ name: 'fakelint', ran: true, fileCount: 1 }]);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/analyzers.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/analyzers.mjs`** (real built-in registry + injectable `exec` for tests)

```js
import { extname, join, isAbsolute, relative, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { runCmd, hasCmd } from './git.mjs';

const MAX_FINDINGS = 200;

/**
 * Resolve a tool binary: prefer the project-local node_modules/.bin (the common
 * case — eslint/tsc are devDeps), else fall back to a global PATH binary.
 * Returns an absolute path or a bare command name, or null if unresolved.
 */
export function resolveBin(repoDir, bin) {
  for (const name of [bin, `${bin}.cmd`]) {
    const local = join(repoDir, 'node_modules', '.bin', name);
    if (existsSync(local)) return local;
  }
  return hasCmd(bin) ? bin : null;
}

/** Built-in analyzers. tsc is whole-project (passing files disables tsconfig). */
export const ANALYZERS = [
  { name: 'tsc', bin: 'tsc', exts: ['.ts', '.tsx'],
    command: () => ['--noEmit', '--pretty', 'false'],
    parse: (out) => [...out.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)]
      .map((m) => ({ rule: m[3], file: m[1], line: Number(m[2]), severity: 'high', message: m[4] })) },
  { name: 'eslint', bin: 'eslint', exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    command: (files) => ['--format', 'json', ...files],
    parse: (out) => { try { return JSON.parse(out).flatMap((f) => f.messages.map((m) => ({ rule: m.ruleId ?? 'eslint', file: f.filePath, line: m.line, severity: m.severity === 2 ? 'high' : 'medium', message: m.message }))); } catch { return []; } } },
  { name: 'ruff', bin: 'ruff', exts: ['.py'],
    command: (files) => ['check', '--output-format', 'json', ...files],
    parse: (out) => { try { return JSON.parse(out).map((d) => ({ rule: d.code, file: d.filename, line: d.location?.row, severity: 'medium', message: d.message })); } catch { return []; } } },
  { name: 'shellcheck', bin: 'shellcheck', exts: ['.sh', '.bash'],
    command: (files) => ['--format', 'json', ...files],
    parse: (out) => { try { return JSON.parse(out).map((d) => ({ rule: `SC${d.code}`, file: d.file, line: d.line, severity: d.level === 'error' ? 'high' : 'medium', message: d.message })); } catch { return []; } } },
];

export function selectAnalyzers(registry, files) {
  const exts = new Set(files.map((f) => extname(f)));
  return registry.filter((a) => a.exts.some((e) => exts.has(e)));
}

/** Normalize an analyzer-reported path to repo-relative (eslint emits absolute). */
function toRepoRel(repoDir, file) {
  if (!file) return file;
  const rel = isAbsolute(file) ? relative(repoDir, file) : file.replace(/^\.\//, '');
  return rel.split(sep).join('/');
}

export async function runAnalyzers(registry, { repoDir, files, exec, resolve = resolveBin }) {
  const run = exec ?? ((bin, args) => Promise.resolve(runCmd(bin, args, { cwd: repoDir, defaultTimeout: 60_000 })));
  const changedSet = new Set(files.map((f) => f.replace(/^\.\//, '')));
  const selected = selectAnalyzers(registry, files);
  const tools = [];
  const findings = [];
  for (const a of selected) {
    const matched = files.filter((f) => a.exts.includes(extname(f)));
    const bin = exec ? a.bin : resolve(repoDir, a.bin);
    if (!bin) { tools.push({ name: a.name, ran: false, fileCount: 0, reason: 'not installed' }); continue; }
    const r = await run(bin, a.command(matched));
    tools.push({ name: a.name, ran: true, fileCount: matched.length });
    for (const f of a.parse(r.stdout ?? '', r.stderr ?? '')) {
      const file = toRepoRel(repoDir, f.file);
      findings.push({ tool: a.name, ...f, file, changed: changedSet.has(file) });
    }
  }
  // Changed-file findings first; cap to bound prompt size.
  findings.sort((x, y) => Number(y.changed) - Number(x.changed));
  const truncated = findings.length > MAX_FINDINGS;
  return { tools, findings: findings.slice(0, MAX_FINDINGS), ...(truncated ? { truncated: true } : {}) };
}

export async function analyze(repoDir, files) {
  return runAnalyzers(ANALYZERS, { repoDir, files });
}
```

> **Unit test note:** the injected-`exec` path bypasses `resolveBin` (so tests need no real binary). Add a test that `resolveBin` prefers a fake `node_modules/.bin/<bin>` file in a fixture dir over the global lookup, and that findings get `changed: true/false` and absolute paths normalized to repo-relative.

- [ ] **Step 4: Add the `analyze` handler to `lib/cli.mjs`** (mirrors `context` — derives changed files from `--from-diff` or positionals)

```js
import { analyze } from './analyzers.mjs';
// ...in HANDLERS:
async analyze(positional, flags) {
  requireRepo();
  const config = loadCfg();
  const tokens = flags.has('staged') ? ['--staged', ...positional] : positional;
  const files = getDiff(tokens, { cwd: process.cwd() }).files
    .map((f) => f.path).filter((p) => !isIgnored(p, config.ignore));
  emit(await analyze(process.cwd(), files), flags);
},
```
**Make the dispatch async (explicit — this is the part 2A can't skip).** `analyze` is the first async handler; `main()` is currently sync. Convert `main` to `async` and `await` the handler. Existing sync handlers are unaffected (`await` on a non-promise is a no-op), and the try/catch still catches their throws because the `await` is inside it:

```js
export async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const handler = HANDLERS[sub];
  if (!handler) { process.stderr.write(USAGE + '\n'); process.exitCode = 1; return; }
  try {
    await handler(positional, flags, rest);
  } catch (e) {
    process.stderr.write((e?.message ?? String(e)) + '\n');
    process.exitCode = 1;
  }
}
// the bottom `if (isMain) main();` stays — a floating promise is fine here because
// errors are caught inside main() and the event loop drains before exit.
```

Add `analyze` to the `USAGE` string. **Add an integration/CLI test** asserting a previously-sync handler (e.g. `anchor config --format json`) still prints valid JSON and exits 0 through the now-async dispatch (the existing `cli.test.mjs` already covers most handlers — confirm it stays green).

- [ ] **Step 5: Write the integration test** (`tests/integration/analyze.test.mjs`) using a real installed bin — gate on availability so CI without the tool still passes

Prefer a **deterministic** integration test that plants a fake executable in the fixture's `node_modules/.bin` (proves `resolveBin` + scoping + normalization end-to-end without depending on a globally-installed tool), plus a gated real-tool test:

```js
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import { runAnalyzers } from '../../lib/analyzers.mjs';

it('resolves a project-local bin and scopes/normalizes findings', async () => {
  const repo = makeFixtureRepo({ 'src/a.ts': 'export const x = 1;\n' });
  try {
    const bin = join(repo.dir, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    const fake = join(bin, 'eslint');
    // emit one eslint-shaped JSON finding with an ABSOLUTE path
    writeFileSync(fake, `#!/bin/sh\ncat <<'JSON'\n[{"filePath":"${repo.dir}/src/a.ts","messages":[{"ruleId":"no-x","line":1,"severity":2,"message":"bad"}]}]\nJSON\n`);
    chmodSync(fake, 0o755);
    const out = await runAnalyzers(
      [{ name: 'eslint', bin: 'eslint', exts: ['.ts'], command: () => [], parse: (o) => { try { return JSON.parse(o).flatMap((f) => f.messages.map((m) => ({ rule: m.ruleId, file: f.filePath, line: m.line, severity: 'high', message: m.message }))); } catch { return []; } } }],
      { repoDir: repo.dir, files: ['src/a.ts'] },
    );
    expect(out.tools[0]).toMatchObject({ name: 'eslint', ran: true, fileCount: 1 });
    expect(out.findings[0]).toMatchObject({ tool: 'eslint', file: 'src/a.ts', changed: true }); // absolute → repo-relative
  } finally { repo.cleanup(); }
});

it('records a missing analyzer as ran:false, never throws', async () => {
  const repo = makeFixtureRepo({ 'src/a.ts': 'export const x = 1;\n' });
  try {
    const out = await runAnalyzers(
      [{ name: 'ghost', bin: 'definitely-not-real-xyz', exts: ['.ts'], command: () => [], parse: () => [] }],
      { repoDir: repo.dir, files: ['src/a.ts'] },
    );
    expect(out.tools[0]).toMatchObject({ name: 'ghost', ran: false, reason: 'not installed' });
    expect(out.findings).toEqual([]);
  } finally { repo.cleanup(); }
});
```

Also keep one `describe.skipIf(!hasCmd('tsc'))` smoke test for a real installed `tsc`, and a CLI-level test that `anchor analyze` over a `.md`-only change yields `findings: []`.

- [ ] **Step 6: Wire SKILL.md** — add **Step 3d — Static analyzer findings**:

```
### Step 3d — Static analyzer findings (run after the diff)
Run `anchor analyze --from-diff <target>` and parse the JSON. Treat
`findings[]` as GROUND TRUTH (a real parser/linter produced them): do not
re-derive or second-guess them, fold them into your review (dedup against your
own findings), and attribute them to the tool. **Prioritize findings with
`changed: true` (they touch the diff); a `changed: false` finding is ambient
project noise UNLESS it is plausibly caused by this change (e.g. a signature
change breaking an unchanged caller) — surface those, drop the rest.** If
`truncated: true`, say so. List which tools ran (and which were skipped as
not-installed) in the "Context used" footer. If `tools` is empty, note that no
analyzers were available and rely on reasoning.
```

- [ ] **Step 7: Run everything + bundle**

Run: `npx vitest run tests/unit tests/integration && npm run typecheck && npm run bundle`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/analyzers.mjs lib/cli.mjs skills/anchor-review/SKILL.md tests/unit/analyzers.test.mjs tests/integration/analyze.test.mjs dist/anchor.mjs
git commit -m "feat: anchor analyze — feed installed static-analyzer findings into review context"
```

### Task 2B: Positive rules axis (`.anchor/rules.md` + structured rules)

Anchor's learnings only *suppress*. Add rules that *enforce intent*, scoped by glob, injected only for matching changed files.

**Files:**
- Create: `lib/rules.mjs`
- Modify: `lib/config.mjs` (`DEFAULTS.rules = []` + validation)
- Modify: `lib/cli.mjs` (new `rules` handler)
- Modify: `templates/config.yaml` (document `rules`)
- Modify: `skills/anchor-review/SKILL.md` (Step 2 — read rules)
- Test: `tests/unit/rules.test.mjs`

**Design.** Two sources: (1) `.anchor/rules.md` free-prose, injected wholesale when any changed file is under its directory (repo-root file → always). (2) `config.rules`: array of `{ id, rule, scope, severity }`. `selectRules(rules, changedPaths)` returns rules whose `scope` glob (default `**`) matches at least one changed path, via the existing `minimatch` machinery in `lib/ignore.mjs`.

- [ ] **Step 1: Write the failing test**

```js
import { selectRules } from '../../lib/rules.mjs';
const RULES = [
  { id: 'sql', rule: 'Parameterize SQL', scope: 'src/db/**', severity: 'high' },
  { id: 'any', rule: 'No TODO comments', severity: 'low' }, // no scope → all files
];
it('selects scoped rules matching changed paths, plus unscoped rules', () => {
  expect(selectRules(RULES, ['src/db/users.ts']).map((r) => r.id).sort()).toEqual(['any', 'sql']);
  expect(selectRules(RULES, ['src/ui/button.tsx']).map((r) => r.id)).toEqual(['any']);
});
```

- [ ] **Step 2: Run to verify failure** — module missing → FAIL.

- [ ] **Step 3: Implement `lib/rules.mjs`**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Minimatch } from 'minimatch';

export function selectRules(rules, changedPaths) {
  return (rules ?? []).filter((r) => {
    const mm = new Minimatch(r.scope ?? '**', { dot: true });
    return changedPaths.some((p) => mm.match(p.replace(/^\.\//, '')));
  });
}

export function loadRulesProse(repoDir) {
  const f = join(repoDir, '.anchor', 'rules.md');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

export function gatherRules({ repoDir, configRules, changedPaths }) {
  return { prose: loadRulesProse(repoDir), rules: selectRules(configRules, changedPaths) };
}
```

- [ ] **Step 4: Add `rules` to `DEFAULTS` + validation** in `lib/config.mjs`

```js
// in DEFAULTS:
rules: [],
// validation: each rule needs a string `rule` AND (if present) a compilable scope glob.
// An invalid scope would throw inside selectRules' Minimatch and crash the whole review.
if (raw.rules !== undefined) {
  if (!Array.isArray(raw.rules)) { warnings.push('anchor: rules must be a list. Ignoring.'); delete raw.rules; }
  else raw.rules = raw.rules.filter((r) => {
    if (!r || typeof r.rule !== 'string') return false;
    if (r.scope !== undefined) {
      try { new Minimatch(r.scope, { dot: true }); }
      catch { warnings.push(`anchor: rule ${JSON.stringify(r.id ?? r.rule)} has an invalid scope glob ${JSON.stringify(r.scope)}. Dropping it.`); return false; }
    }
    return true;
  });
}
```

(`import { Minimatch } from 'minimatch';` at the top of `config.mjs`, matching `ignore.mjs`.) Also make `selectRules` defensive — wrap its `new Minimatch(...)` in a try/catch that treats an uncompilable scope as "no match" — so a hand-written `.anchor` rule that bypassed config validation still can't crash a review.

- [ ] **Step 5: Add the `rules` handler to `lib/cli.mjs`**

```js
import { gatherRules } from './rules.mjs';
// in HANDLERS:
rules(positional, flags) {
  requireRepo();
  const config = loadCfg();
  const tokens = flags.has('staged') ? ['--staged', ...positional] : positional;
  const changedPaths = getDiff(tokens, { cwd: process.cwd() }).files.map((f) => f.path);
  emit(gatherRules({ repoDir: process.cwd(), configRules: config.rules, changedPaths }), flags);
},
```

- [ ] **Step 6: Document in `templates/config.yaml`**

```yaml
# Positive review rules — enforce intent (vs learnings which suppress noise).
# Each: id, rule (specific + measurable), optional scope glob, severity.
rules:
  - id: no-raw-sql
    rule: "Parameterize all SQL; never string-concatenate user input into queries."
    scope: "src/db/**"
    severity: high
```

- [ ] **Step 7: Wire SKILL.md Step 2** — add to the read-list:

```
- `.anchor/rules.md` (positive rules prose) and `anchor rules --from-diff <target>`
  (scoped structured rules). Enforce matching rules as review criteria; a rule
  violation is a finding at the rule's severity. Rules are project intent — weight
  them above generic best-practice.
```

- [ ] **Step 8: Run + bundle + commit**

```bash
npx vitest run tests/unit && npm run bundle
git add lib/rules.mjs lib/config.mjs lib/cli.mjs templates/config.yaml skills/anchor-review/SKILL.md tests/unit/rules.test.mjs dist/anchor.mjs
git commit -m "feat: positive scoped review rules (.anchor/rules.md + config rules)"
```

### Task 2C: Evidence-seeking verification (`anchor refs`)

Give the reviewer a cheap find-references/definition lookup so the verification gate can *disprove* findings ("is this symbol really unused?", "does this caller exist?") and surface omissions.

**Files:**
- Create: `lib/refs.mjs`
- Modify: `lib/cli.mjs` (new `refs` handler)
- Modify: `skills/anchor-review/SKILL.md` (Step 6 — verification gate uses `anchor refs`)
- Test: `tests/unit/refs.test.mjs`, `tests/integration/refs.test.mjs`

**Design.** `findRefs(repoDir, symbol, { exts })` runs `git grep -n -w -E <symbol>` over code globs, returns `{ symbol, references: [{ file, line, text }], count }`. Escapes the symbol (reuse `escapeRe` pattern). Pure-ish; integration test exercises real `git grep`.

- [ ] **Step 1: Failing integration test** (`tests/integration/refs.test.mjs`) — real fixture repo, assert `findRefs` finds both the definition and the call site:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { findRefs } from '../../lib/refs.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/a.ts': 'export function helper() { return 1; }\n',
  'src/b.ts': "import { helper } from './a';\nexport const y = helper();\n",
});
afterAll(() => repo.cleanup());

it('finds definition and call sites of a symbol', () => {
  const r = findRefs(repo.dir, 'helper');
  expect(r.symbol).toBe('helper');
  expect(r.references.map((x) => x.file)).toEqual(expect.arrayContaining(['src/a.ts', 'src/b.ts']));
  expect(r.count).toBeGreaterThanOrEqual(2);
});
it('rejects a non-identifier symbol', () => {
  expect(() => findRefs(repo.dir, 'a.b()')).toThrow(/valid identifier/);
});
it('empty result for an unknown symbol (no throw)', () => {
  expect(findRefs(repo.dir, 'noSuchSymbolXyz').count).toBe(0);
});
```

> **Limitation to document** (in the JSON output and the footer): `refs` returns *all* word-boundary references, not a definition-resolved set — it can't distinguish a definition from a call or tell same-named symbols in different scopes apart. It's a cheap evidence aid for the verification gate, not a semantic index. (A definition-only mode is a Phase 4 candidate.)

- [ ] **Step 2: Run to verify failure** — handler missing → exit 1 / unknown subcommand.

- [ ] **Step 3: Implement `lib/refs.mjs`**

```js
import { runGit } from './git.mjs';
const CODE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.py', '*.go', '*.rs', '*.java', '*.rb', '*.c', '*.cpp', '*.h'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findRefs(repoDir, symbol, { globs = CODE_GLOBS } = {}) {
  if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) throw new Error('anchor: refs needs a valid identifier');
  const r = runGit(['grep', '-nwE', escapeRe(symbol), '--', ...globs], { cwd: repoDir });
  const references = r.stdout.split('\n').filter(Boolean).map((l) => {
    const m = /^(.+?):(\d+):(.*)$/.exec(l);
    return m ? { file: m[1], line: Number(m[2]), text: m[3].trim() } : null;
  }).filter(Boolean);
  return { symbol, references, count: references.length };
}
```

- [ ] **Step 4: Add the `refs` handler to `lib/cli.mjs`**

```js
import { findRefs } from './refs.mjs';
refs(positional, flags) {
  requireRepo();
  if (!positional[0]) throw new Error('anchor: refs needs a symbol, e.g. `anchor refs myFunction`');
  emit(findRefs(process.cwd(), positional[0]), flags);
},
```

- [ ] **Step 5: Strengthen SKILL.md Step 6 verification gate** — make it evidence-seeking:

```
- Before finalizing a CRITICAL/HIGH that depends on usage ("unused", "never
  called", "no other caller", "always null"), run `anchor refs <symbol>` and
  read the call sites. If the references contradict the finding, DROP it.
- Omission check: for a changed symbol, if `anchor refs` shows callers that the
  diff did NOT update, consider whether they need updating and flag the omission.
```

- [ ] **Step 6: Run + bundle + commit**

```bash
npx vitest run tests/unit tests/integration && npm run bundle
git add lib/refs.mjs lib/cli.mjs skills/anchor-review/SKILL.md tests/unit/refs.test.mjs tests/integration/refs.test.mjs dist/anchor.mjs
git commit -m "feat: anchor refs + evidence-seeking verification gate (kills usage-based false positives)"
```

---

## Phase 3 — High-value, low-effort

### Task 3A: Never-suppress protected categories

A hard floor so learnings can never silence security/data-loss/crash findings.

**Files:**
- Modify: `lib/config.mjs` (`DEFAULTS.protected_categories`)
- Modify: `templates/config.yaml`
- Modify: `skills/anchor-review/SKILL.md` (learnings application + safety guardrail)
- Test: `tests/unit/config.test.mjs`

- [ ] **Step 1: Failing test** — default includes the protected set

```js
it('defaults include protected categories that learnings cannot suppress', () => {
  const { config } = loadConfig(dir);
  expect(config.protected_categories).toEqual(expect.arrayContaining(['security', 'data-loss', 'crash']));
});
```

> `expect.arrayContaining([...])` is a **subset** assertion, so the 5-item default `['security','data-loss','crash','injection','auth']` satisfies it — there is no test/default contradiction. Validate `protected_categories` like `categories` (must be a list; non-list → warn + default).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — add to `DEFAULTS`: `protected_categories: ['security', 'data-loss', 'crash', 'injection', 'auth'],` (and the back-compat array-merge: `protected_categories: Array.isArray(raw.protected_categories) ? raw.protected_categories : [...DEFAULTS.protected_categories]`).

- [ ] **Step 4: SKILL.md** — in the learnings paragraph, add:

```
A learning/noise pattern may downgrade or hide a STYLE/QUALITY finding, but it
must NEVER suppress a finding in a protected category. Read the effective
`protected_categories` from the `anchor config --format json` you ran in Step 2
(default: security, data-loss, crash, injection, auth). If a learning conflicts
with a protected-category finding, the finding wins.
```

This relies on the **effective-config bridge** (Conventions): the SKILL gets `protected_categories` from `anchor config --format json`, not from raw YAML, so it sees the default even when the user never set the key. This generalizes the existing always-on SAFETY GUARDRAIL into a config-driven floor.

- [ ] **Step 5:** document in `templates/config.yaml`; run unit; commit.

### Task 3B: Scoped context-file manifest (`.anchor/files.json`)

Point the reviewer at non-imported contracts (schema, OpenAPI, design docs) the import-graph misses.

**Files:**
- Create: `lib/manifest.mjs`
- Modify: `lib/context.mjs` (`getContext` merges manifest files, reason `manifest`)
- Modify: `skills/anchor-review/SKILL.md` (Step 4 note)
- Test: `tests/unit/manifest.test.mjs`, extend `tests/integration/context.test.mjs`

**Design.** `.anchor/files.json` = `[{ path, description, scope }]`, all paths **repo-relative**. `selectManifest(entries, changedPaths)` returns entries whose `scope` glob (default `**`) matches a changed path. `getContext` appends matched, **existing** (`existsSync`) manifest files to its `files` list with `reason: 'manifest'` and the `description`.

Decisions the audit said were ambiguous — pin them down:
- **Return shape (additive, non-breaking):** each `files[]` entry may now carry an optional `description`. Importer/importee/caller/sibling entries omit it (or set `undefined`); only `manifest` entries set it. Existing consumers (the SKILL reads `path`/`reason`; `context.test.mjs` asserts via `.map(f => f.path)` and `f.reason`) are unaffected by an extra key.
- **Dedup priority:** the import graph wins. Process the manifest **after** importer/importee population into the same `related` Map (first-write-wins is already the rule), so a file that is both an importee and a manifest entry keeps `reason: 'importer'`/`'importee'`. Only files not already related get `reason: 'manifest'`. Manifest files are also excluded if they are themselves in the changed set.
- **`loadManifest(repoDir)` validation:** read `.anchor/files.json`; if missing → `[]`; if unparseable JSON or not an array → `[]` (no throw); drop entries lacking a string `path`; coerce a missing `scope` to `'**'`. Malformed input must never break a review.
- **maxFiles ordering:** keep the existing cap; order importer → importee → manifest so the most directly-relevant context survives the cap.

- [ ] **Step 1: Failing unit test**

```js
import { selectManifest } from '../../lib/manifest.mjs';
const M = [{ path: 'prisma/schema.prisma', description: 'DB schema', scope: 'src/db/**' }];
it('selects manifest entries whose scope matches a changed path', () => {
  expect(selectManifest(M, ['src/db/x.ts'])).toHaveLength(1);
  expect(selectManifest(M, ['src/ui/y.tsx'])).toHaveLength(0);
});
```

- [ ] **Step 2–4:** RED → implement `lib/manifest.mjs` (`selectManifest` + `loadManifest(repoDir)` reading/validating JSON, ignoring malformed) → wire into `getContext` (read manifest, `selectManifest`, push `{ path, reason: 'manifest', description }` for files that `existsSync`) → GREEN.
- [ ] **Step 5:** SKILL.md Step 4: "Manifest files (`reason: manifest`) are declared contracts the change must conform to — read them and check the diff against them."
- [ ] **Step 6:** run unit + integration + bundle; commit.

### Task 3C: Richer learnings (reason + scope + category + action)

Upgrade learnings from bare patterns to scoped records so a domain-layer learning doesn't load for utils, killing *repeat* FPs without blind spots. Back-compatible with existing files.

**Files:**
- Modify: `lib/learn.mjs` (parse/serialize/add carry `scope`, `category`, `action`)
- Modify: `lib/cli.mjs` (`learn add` flags: `--scope`, `--category`, `--action`)
- Modify: `skills/anchor-review/SKILL.md` (Step 2 — scope-filter learnings; Step 8 `mark as noise` writes scope)
- Test: `tests/unit/learn.test.mjs`

**Design.** Keep the `### heading` + `<!-- reason: ... -->` format; add an optional third line `<!-- meta: {"scope":"src/db/**","category":"style","action":"suppress"} -->`. The audit flagged four things to make concrete:

- **Parse regex (handles old + new, EOF-safe):**
  ```js
  const re = /^### (.+)\n(?:<!-- reason: (.*?) -->\n?)?(?:<!-- meta: (\{.*?\}) -->\n?)?/gm;
  // group 3 (meta JSON) is optional; JSON.parse in a try/catch, default {} on failure
  // result per entry: { heading, reason, scope: meta.scope ?? '**', category: meta.category ?? null, action: meta.action ?? 'suppress' }
  ```
- **Serialize is conditional** — only emit the `<!-- meta: ... -->` line when an entry has non-default meta (`scope !== '**'` or a `category`/non-`suppress` `action`). This guarantees the **legacy round-trip**: an old entry (no meta) is re-serialized *without* a meta line. Add a test: `addLearning(dir, 'old', 'why'); list; serialize → expect(text).not.toContain('meta:')`.
- **`addLearning(repoDir, pattern, reason, meta = {})`** — 4th arg optional; the existing 3-arg call sites keep working (meta defaults to `{}` → no meta line written). `selectLearnings(patterns, changedPaths)` filters by `scope` via the shared Minimatch helper (reused from rules/manifest), defaulting `scope` to `'**'` (legacy entries apply everywhere → current behavior preserved).
- **SKILL retrieval mechanism (the missing piece):** extend the `learn list` handler to accept `--from-diff <target>` (and `--staged`); when present it resolves the changed paths via `getDiff` and returns only scope-matching learnings (`{ patterns: selectLearnings(all, changedPaths) }`). SKILL Step 2 calls `anchor learn list --from-diff <target>` so it only loads learnings relevant to the changed files — killing repeat FPs without blind spots. Bare `learn list` is unchanged (returns all).

- [ ] **Step 1: Failing test** — round-trip a scoped learning + back-compat for an old-format entry

```js
it('round-trips a scoped learning and defaults legacy entries to global scope', () => {
  addLearning(dir, 'Missing docstrings', 'team style', { scope: 'src/lib/**', category: 'docs', action: 'suppress' });
  const [p] = listLearnings(dir).patterns;
  expect(p.scope).toBe('src/lib/**');
  expect(p.category).toBe('docs');
  // a legacy entry written without meta still parses with scope '**'
});
```

- [ ] **Step 2–4:** RED → extend `parse`/`serialize`/`addLearning(repoDir, pattern, reason, meta)` and add `selectLearnings(patterns, changedPaths)` → GREEN. (`addLearning` signature gains a 4th optional `meta` arg; keep the 3-arg call sites working.)
- [ ] **Step 5:** `lib/cli.mjs` `learn add` reads `--scope`/`--category`/`--action` (add to `VALUED`) and passes `meta`.
- [ ] **Step 6:** SKILL.md: Step 2 loads learnings and applies only those whose `scope` matches changed files; Step 8 `mark as noise` includes a `--scope` derived from the finding's file.
- [ ] **Step 7:** run unit + integration + bundle; commit.

### Task 3D: Category-gates-generation (decouple kind from severity)

Pass the active `categories` + `strictness` into the prompt so out-of-scope and nitpick findings aren't *generated* (cheaper + quieter than generate-then-hide).

**Files:**
- Modify: `skills/anchor-review/SKILL.md` (Step 6)
- Test: none (prompt-only) — validated via `npm run eval` (noisy-style fixture must stay quiet at default strictness)

- [ ] **Step 1:** SKILL.md Step 6 — make category an explicit generation gate, reading the active `categories`/`strictness` from the `anchor config --format json` run in Step 2 (the effective-config bridge — not raw YAML, so omitted keys still resolve to their defaults):

```
Generate findings ONLY in the active `categories` (from `anchor config`; default
all). Do not produce a finding outside them, even to downgrade it. `category`
(logic/security/perf/style/docs/tests) and `severity` are independent axes: a
logic bug can be any severity; a style nit is category=style. Apply the active
strictness as a generation gate:
  - strictness 1: all categories, including style/docs nits.
  - strictness 2 (default): do NOT emit category=style/docs findings unless they
    cause a real bug (readability/maintainability that risks a defect).
  - strictness 3: emit ONLY logic/security findings with crash/data-loss impact.
The protected-categories floor (Step 6 SAFETY GUARDRAIL) still overrides this:
never drop a protected-category finding to satisfy a category/strictness gate.
```

- [ ] **Step 2:** Add a `noisy-style` eval case to `tests/eval/cases.mjs` — a behavior-preserving change that a strictness-2 review must keep quiet (e.g. renaming a local or adding a private method without a docstring), with `expected: []` and `cleanFiles: [<the changed file>]` so any finding on it counts as a false positive. (This is an LLM eval case in `cases.mjs`, distinct from the deterministic `tests/golden/__snapshots__/noisy-style.json` snapshot.) Because the LLM eval only scores when a model is available, ALSO assert the deterministic guarantee where possible: the case's inputs (diff + context) are produced by the same scripts, so a unit-level check that the gathered context is correct is the CI-enforceable part; the zero-FP claim is the manual eval gate. Run `npm run eval` (with `ANCHOR_EVAL_GENERATE=1` + `claude`) to confirm 0 false positives. Commit.

---

## Phase 4 — Medium effort (task specs; expand to TDD steps when scheduled)

Each item below is specced to interface + representative test + acceptance. They are independent; schedule by value.

> **Status:** Phase 4 is intentionally **deferred** — these are deliberately not implemented in the first build pass (which covers Phases M.1-scorer, 1, 2, 3, and M.2). They are enriched specs, not placeholders. **Resolve these audit-found under-specifications before scheduling each:**
> - **4A (callers + siblings):** *Depends on 2C* (`findRefs`). Pin "siblings": a separate, testable `findSiblings(repoDir, filePath, { max = 5 })` — same-directory files plus same naming-family (shared 3+-char stem, e.g. `getUserById`↔`getOrderById`), capped, deterministic order. Reuse `findRefs` for callers (`reason: 'caller'`). Document it as grep-approximate.
> - **4B (cascading config):** Define array-merge semantics explicitly — `rules`/`ignore` *append* parent→child, `disabled_rules: [id]` is a blocklist applied last, scalars are child-wins. Decide budget granularity: keep `applyBudget` **aggregate** (per-PR), not per-file, to avoid breaking `overBudget`. Cache resolved config by directory. Golden/integration must be unchanged when no subdir configs exist.
> - **4C (incremental + dedup):** Specify the hash: `sha1(repoRelFile + '\0' + normalize(message))` where `normalize` = lowercase, collapse whitespace, strip line numbers/counts. Specify SKILL injection: prior finding-hashes ride along as a JSON block in the review inputs (a new `anchor diff --since-last` derives `<lastReviewedSha>..HEAD` from `listReviews()`). Document the rebase caveat (a rebased prior SHA yields a noisy range — fall back to full diff if the SHA is unreachable).
> - **4D (fix-spec):** Define the machine-readable schema, mirroring 1.4's `anchor:meta`: `<!-- anchor:fix {"file":"src/a.ts","range":[5,7],"replacement":"…"} -->` per finding. Test-command discovery: read `scripts.test`/`scripts.build` from `package.json`, else ask. "Can't write a concrete fix-spec → likely noise; downgrade/drop."
> - **4E (linked-issue criteria):** Extraction heuristic: parse markdown checklist items (`- [ ]`/`- [x]`) from the issue body; if none, fall back to lines under an "Acceptance criteria"/"Requirements" heading. Three-state verdict (Addressed/Not-addressed/Unclear), abstain when unsure. PR-mode only; needs `gh`. Prompt-only (no lib code).

### Task 4A: Local graph-context approximation (callers + pattern-siblings)
- **Files:** `lib/context.mjs` (extend `getContext`); `tests/integration/context.test.mjs`.
- **Approach:** (1) **Callers:** for each changed file, grep its exported symbol names across the codebase (reuse `findRefs` from 2C) and add unique call-site files with `reason: 'caller'`. (2) **Pattern siblings:** add up to N same-directory files and same-naming-family files (e.g. `get*ById`) with `reason: 'sibling'`, so the reviewer can check consistency. Cap total at `maxFiles`; order importer → caller → sibling → importee.
- **Representative test:** changed `src/db/getUser.ts` → context includes a same-dir `src/db/getOrder.ts` with `reason: 'sibling'`.
- **Acceptance:** `npm run eval` recall does not drop; a new fixture where a bug is an *inconsistency with a sibling* is now caught. Ports = Partial (grep-approximate, no semantic resolution — document the limitation in the JSON/footer).

### Task 4B: Cascading per-directory config
- **Files:** `lib/config.mjs` (new `resolveConfigForPath(repoDir, filePath)` + `mergeConfigs`); `tests/unit/config.test.mjs`.
- **Approach:** walk from a changed file's dir up to repo root collecting `.anchor/config.yaml` files; scalars (strictness, min_confidence) override child-wins, arrays (rules, ignore) accumulate, support `disabled_rules: [id]`. The diff handler resolves per-file config only when subdir configs exist (else use root config — no behavior change for the common case).
- **Representative test:** root `strictness: 1`, `src/db/.anchor/config.yaml` `strictness: 3` → `resolveConfigForPath(repo, 'src/db/x.ts').strictness === 3`.
- **Acceptance:** existing single-config repos behave identically (golden + integration unchanged). Ports = Partial (implement per-file walk; skip cross-file PR-level reconciliation unless it earns its keep).

### Task 4C: Incremental review + per-finding dedup
- **Files:** `lib/review.mjs` (store last-reviewed SHA in archive frontmatter; `findingsSince`), `lib/diff.mjs` (support a `<lastSha>..HEAD` convenience), `skills/anchor-review/SKILL.md`.
- **Approach:** `anchor review` archives already record `sha`. Add an `anchor diff --since-last` that diffs from the most recent archived review's SHA to HEAD. Hash each prior finding (`file + normalized message`) into the archive; SKILL suppresses a finding whose hash matches a still-unchanged prior finding.
- **Representative test:** two sequential reviews; the second, with no new changes to the flagged line, does not re-emit the finding (scorer sees it suppressed).
- **Acceptance:** re-running a review on an unchanged tree yields no duplicate findings. Ports = Partial (no PR-thread state; hash-based local dedup only).

### Task 4D: Structured per-finding fix-spec (apply-in-session)
- **Files:** `skills/anchor-review/SKILL.md` (Step 7 render + Step 8 `fix` follow-up).
- **Approach:** each finding emits an optional machine-readable fix-spec (`target file`, line range, intended change). Because Anchor runs inside Claude Code, `fix finding N` applies it via Edit then runs the repo test/build command and reports pass/fail (keep the diff even if verify fails). Forcing a concrete fix-spec also surfaces vague findings (can't spec it → probably noise — drop or downgrade).
- **Representative test:** none (prompt) — validate manually that `fix finding N` edits + runs tests; covered by the verification discipline.
- **Acceptance:** every CRITICAL/HIGH either has a fix-spec or is explicitly marked "no safe automatic fix." Ports = Yes.

### Task 4E: Linked-issue acceptance-criteria validation (PR mode)
- **Files:** `skills/anchor-review/SKILL.md` (Step 3b already fetches PR body + derives linked issues).
- **Approach:** when a linked issue is found, fetch its body (`gh issue view <n> --json title,body`), extract acceptance criteria, and add an "Acceptance criteria" subsection to the review marking each Addressed / Not-addressed / Unclear (abstain, don't guess).
- **Representative test:** none (prompt + `gh`-dependent) — manual verification in PR mode.
- **Acceptance:** in PR mode with a linked issue, the review lists each criterion with a three-state verdict. Ports = Partial (PR mode only; needs `gh`).

---

## Phase 5 — Explicitly does NOT port (documented non-goals)

Record these so future contributors don't waste effort rebuilding cloud features in a local tool. For each: what it is, why it can't port, and Anchor's local substitute.

- **Hosted sandbox running 50+ tools.** Needs managed infra. **Substitute:** Phase 2A runs whatever analyzers are installed locally, scoped to changed files.
- **Org-wide learnings vector DB + similarity search.** Needs a hosted index. **Substitute:** Phase 3C per-repo, scoped, flat-file learnings. Do not build an embedding store.
- **Multi-repo / linked-repo analysis.** Needs cross-repo bot access. **Substitute:** none; Anchor is single-repo by design.
- **Semantic language-server codebase graph.** Greptile's moat; needs hosted indexing. **Substitute:** Phase 4A grep-approximate callers + siblings (document it as approximate).
- **Automatic behavioral learning** (👍/👎 telemetry, first-vs-last-commit diff, auto-suggested rules after ~10 PRs). Needs a persistent cross-PR feedback store. **Substitute:** a manual session-end "mark which findings were noise → write scoped learnings" flow (Phase 3C `learn add --scope`).
- **Merge-blocking / required status checks.** Anchor is advisory and local. **Substitute:** surface findings in the report; optionally post non-blocking `gh` PR comments in PR mode.

---

## Phase M — The eval harness as the feedback loop (cross-cutting; do parts before Phase 1)

The eval (`lib/eval.mjs` + `tests/eval/`) is what makes every other phase *safe* — it measures whether a change raises recall / lowers false positives instead of guessing. Greptile/CodeRabbit tune against hosted telemetry; this is Anchor's local equivalent.

### Task M.1: Expand fixtures + harden the scorer
- **Files:** `tests/eval/cases.mjs`, `tests/eval/run.mjs`, `lib/eval.mjs`, `tests/unit/eval.test.mjs`.
- **Scorer fix (TDD, CI-enforceable — this part does NOT need a model):** the deep review found `parseFindings`' category capture `([a-z]+)` silently drops hyphenated category tokens (`data-loss`, `null-deref`) — the very words the SAFETY GUARDRAIL uses. Relax it to `([a-z][a-z-]*)` and add unit tests proving `[1] src/db.ts:10  ·  data-loss` now parses. Also document (and test) the `sameFile` suffix-collision behavior (`auth.ts` matching both `src/auth.ts` and `lib/auth.ts`) so it's a known, asserted property rather than a latent surprise — prefer an exact match when present.
- **Fixtures (data):** add cases for each category (logic/security/perf exist — add docs, tests, style) and for the new mechanisms: a `static-analyzer-catch` case (a tsc/eslint-detectable bug that should appear once, not duplicated — **depends on 2A**), a `pattern-inconsistency` case (a sibling uses a safe pattern, the change doesn't — **depends on 4A**), and a `protected-not-suppressed` case. Each declares `expected` + `cleanFiles`.
- **Sequencing note:** the docs/tests/style fixtures and the scorer fix can land immediately; the `static-analyzer-catch` and `pattern-inconsistency` fixtures block on 2A and 4A respectively.
- **Classification note:** `protected-not-suppressed` is a **SKILL-behavior** case, not a fixture-shape difference — the fixture is an ordinary security change plus a *learning that should be ignored*; the assertion is that the finding still appears. Mark it as a model-required eval case (it can't be scored by the deterministic harness without generation), or move it to `tests/manual/SMOKE.md`.
- **Acceptance:** the scorer fix + its unit tests are green in CI; `npm run eval` (with a model) reports per-case + aggregate recall/precision/false-positives and gates (recall ≥ 0.8, false-positives = 0).

### Task M.2: Make the eval the phase gate
- **Files:** `package.json` (add an `eval:ci` script), `README`/contributing note.
- **Already true (verified):** `tests/eval/run.mjs` sets `process.exitCode = pass ? 0 : 1` with `pass = aggRecall >= 0.8 && totFp === 0`, so the runner already fails on regression *when it scores*. The gap is only the convenience script + docs.
- **Approach:** add `"eval:ci": "ANCHOR_EVAL_GENERATE=1 node tests/eval/run.mjs"`. Note the cross-platform caveat: the inline `VAR=1 cmd` form is POSIX-only; for Windows either add `cross-env` (a new devDep — only if a Windows contributor needs it) or set `process.env.ANCHOR_EVAL_GENERATE` inside a tiny wrapper. Anchor's other scripts assume a POSIX shell, so the inline form is acceptable for now — document it.
- **Document the reality (per Conventions):** without `ANCHOR_EVAL_GENERATE=1` + an authenticated `claude`, `eval:ci` writes prompts and exits 0 **without scoring** — it is a human/manual gate, not a silent CI pass. The CI-binding gate is the deterministic suite + the scorer unit tests.
- **Acceptance:** the convention is documented and `npm run eval:ci` (with a model) exits non-zero on regression.

---

## Self-review (against the request)

**Coverage of the six buckets:**
- **Small things:** NaN guard (1.1), config hardening — enums + numeric bounds + `ensureGitignore` idempotency (1.2), command timeouts w/ correct detection (1.3), extractReviewMeta coupling (1.4), ignore-list unification (1.5), stale-doc note (1.6), diff-parser truncation hardening (1.7). ✓
- **Big 3:** static-analyzer integration (2A), positive rules (2B), evidence-seeking verification (2C). ✓
- **High-value low-effort:** protected categories (3A), context manifest (3B), richer learnings (3C), category-gates-generation (3D). ✓
- **Medium effort:** graph approximation (4A), cascading config (4B), incremental+dedup (4C), fix-spec (4D), linked-issue (4E). ✓
- **Does NOT port:** Phase 5 reference section. ✓
- **Meta point:** Phase M (eval as the feedback loop + phase gate), plus an eval-gate line in every phase's conventions. ✓

**Type/name consistency:** `Finding = {tool,file,line,rule,severity,message}` used across 2A and SKILL; `selectAnalyzers`/`runAnalyzers`/`analyze` (2A); `selectRules`/`gatherRules` (2B); `findRefs` reused by 2C and 4A; `selectManifest`/`loadManifest` (3B); `selectLearnings`/`addLearning(…, meta)` (3C); `applyBudget` fallback args (1.1). All referenced consistently.

**Granularity:** Phases 1–3 + M are TDD-step detailed with real code; Phase 4 is task-spec granularity (interfaces + representative test + acceptance) by design, flagged in Conventions — not placeholders.

**Standing rules captured:** bundle refresh after any `lib/` change; eval gate per phase; config back-compat; SKILL not bundled.

---

## Execution handoff

Suggested order: **Phase M.1 scorer-fix (baseline) → Phase 1 (1.1–1.7) → effective-config bridge (SKILL Step 2 + `anchor config` already exists) → Phase 2 (2A, then 2C, then 2B) → Phase 3 (3A, 3B, 3C, 3D) → Phase M.2 docs → Phase 4 by value.** Each task is an independent commit; each phase is independently shippable. Respect the shared-file sequencing rule (Conventions): parallelize only the standalone new modules (`analyzers`/`rules`/`refs`/`manifest` + unit tests); serialize all `cli.mjs`/`config.mjs`/`SKILL.md`/`templates` edits and bundle once per batch. The deterministic suite (unit + integration + golden + typecheck) is the binding gate; the LLM eval is the manual quality gate where a model is available.

---

## Changelog of this revision (2026-06-16, post deep-audit)

An 11-agent deep code review + plan audit drove these changes vs the first draft:
- Added **Task 1.7** (parseUnifiedDiff truncation bug — a real correctness defect found in the review).
- Broadened **1.2** to also bound numerics and fix the `ensureGitignore` whitespace idempotency bug.
- Fixed **1.3**'s timeout detection (handle `ETIMEDOUT` *and* signal-kill; distinct code 124; verify empirically) and gave slow `gh` calls an explicit 120s timeout.
- Rebuilt **2A** around `resolveBin` (project-local `node_modules/.bin` — without this analyzers almost never fire), repo-relative path normalization, `changed`-tagging + cap, consistent `tools[]` shape, explicit async-`main()` wiring, and a deterministic fake-bin integration test.
- Added **scope-glob validation** to 2B and real fixture tests + a documented limitation to 2C.
- Introduced the **effective-config bridge** (SKILL runs `anchor config --format json`) to resolve the recurring "SKILL can't see merged config defaults" gap behind 3A and 3D.
- Pinned down **3B** (getContext `description` field, dedup priority, validation), **3C** (parse/serialize regex, `learn list --from-diff` retrieval, legacy round-trip), and **3D** (config-driven gating + concrete eval case).
- Added the **eval-gate reality note** (LLM eval is a manual gate; deterministic suite is the CI gate) and the **scorer regex relax** for hyphenated categories in M.1.
- Enriched Phase 4 specs with the audit's under-specification fixes.
