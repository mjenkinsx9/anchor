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
- **Config back-compat:** every new config key has a default in `lib/config.mjs` `DEFAULTS` and is documented in `templates/config.yaml`. Unknown/invalid values warn (don't throw) and fall back to default, matching the existing `loadConfig` pattern.
- **SKILL changes are not bundled** (the skill ships as a markdown file), but they DO ship in the plugin — bump nothing, just edit `skills/anchor-review/SKILL.md`.

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

### Task 1.2: Validate `min_severity`, `output.color`, and category membership

**Files:**
- Modify: `lib/config.mjs` (`loadConfig`)
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
if (raw.output && typeof raw.output === 'object' && raw.output.color !== undefined && !COLORS.includes(raw.output.color)) {
  warnings.push(`anchor: output.color must be one of ${COLORS.join(', ')}. Got ${JSON.stringify(raw.output.color)}. Using auto.`);
  delete raw.output.color;
}
```

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

- [ ] **Step 3: Implement** — honor an explicit timeout, else a default; keep existing callers working

```js
export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout ?? opts.defaultTimeout ?? 30_000,
  });
  if (res.error) {
    const killed = res.error.code === 'ETIMEDOUT';
    return { stdout: res.stdout ?? '', stderr: killed ? `command timed out: ${cmd}` : String(res.error.message), code: 127 };
  }
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', code: res.status ?? (res.signal ? 128 : 0) };
}
```

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

---

## Phase 2 — The Big 3 (highest review-quality leverage)

### Task 2A: Static-analyzer integration (`anchor analyze`)

Run installed analyzers scoped to changed files and feed normalized, *grounded* findings into the review context. The LLM triages tool output instead of re-deriving (or hallucinating) mechanical bugs.

**Files:**
- Create: `lib/analyzers.mjs`
- Modify: `lib/cli.mjs` (new `analyze` handler + import)
- Modify: `skills/anchor-review/SKILL.md` (new Step 3d — run `anchor analyze`)
- Test: `tests/unit/analyzers.test.mjs`, `tests/integration/analyze.test.mjs`

**Design.** A registry of analyzers, each: `{ name, bin, detect(repoDir), languages(exts), command(files), parse(stdout, stderr) -> Finding[] }`. `Finding = { tool, file, line, rule, severity, message }`. `analyze(repoDir, changedFiles)` runs only analyzers whose `bin` exists (via `hasCmd`) AND that match at least one changed file's extension, scoped to those files, and returns `{ tools: [{name, ran, fileCount}], findings: Finding[] }`. Never throws — a failing analyzer is recorded as `ran:false` with its stderr.

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
import { extname } from 'node:path';
import { runCmd, hasCmd } from './git.mjs';

/** Built-in analyzers. Each runs only if its bin exists and a changed file matches `exts`. */
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

export async function runAnalyzers(registry, { repoDir, files, exec }) {
  const run = exec ?? ((cmd, args) => Promise.resolve(runCmd(cmd, args, { cwd: repoDir, defaultTimeout: 60_000 })));
  const selected = selectAnalyzers(registry, files);
  const tools = [];
  const findings = [];
  for (const a of selected) {
    const matched = files.filter((f) => a.exts.includes(extname(f)));
    if (!exec && !hasCmd(a.bin)) { tools.push({ name: a.name, ran: false, reason: 'not installed' }); continue; }
    const r = await run(a.bin, a.command(matched));
    tools.push({ name: a.name, ran: true, fileCount: matched.length });
    for (const finding of a.parse(r.stdout, r.stderr)) findings.push({ tool: a.name, ...finding });
  }
  return { tools, findings };
}

export async function analyze(repoDir, files) {
  return runAnalyzers(ANALYZERS, { repoDir, files });
}
```

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
(Also add `analyze` to the `USAGE` string and make `main` await async handlers: change `handler(...)` to `await handler(...)` and `main`/its caller to async — verify existing sync handlers still work.)

- [ ] **Step 5: Write the integration test** (`tests/integration/analyze.test.mjs`) using a real installed bin — gate on availability so CI without the tool still passes

```js
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { hasCmd } from '../../lib/git.mjs';
// build a fixture with a .ts type error; assert `anchor analyze` reports a tsc finding IF tsc is present
const tscAvailable = hasCmd('tsc');
describe.skipIf(!tscAvailable)('anchor analyze', () => {
  it('reports analyzer findings for changed files', () => { /* fixture + assert findings[].tool === 'tsc' */ });
});
it('analyze emits empty findings when no analyzer matches', () => { /* fixture with only .md changes → tools: [], findings: [] */ });
```

- [ ] **Step 6: Wire SKILL.md** — add **Step 3d — Static analyzer findings**:

```
### Step 3d — Static analyzer findings (run after the diff)
Run `anchor analyze --from-diff <target>` and parse the JSON. Treat
`findings[]` as GROUND TRUTH (a real parser/linter produced them): do not
re-derive or second-guess them, fold them into your review (dedup against your
own findings), and attribute them to the tool. List which tools ran (and which
were skipped as not-installed) in the "Context used" footer. If `tools` is
empty, note that no analyzers were available and rely on reasoning.
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
// validation: each rule needs a string `rule`; drop malformed entries with a warning
if (raw.rules !== undefined) {
  if (!Array.isArray(raw.rules)) { warnings.push('anchor: rules must be a list. Ignoring.'); delete raw.rules; }
  else raw.rules = raw.rules.filter((r) => r && typeof r.rule === 'string');
}
```

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

- [ ] **Step 1: Failing integration test** (`tests/integration/refs.test.mjs`) — fixture repo, assert `anchor refs <symbol>` finds the call site

```js
// fixture: src/a.ts defines `helper`, src/b.ts calls `helper`
// run: anchor refs helper  → references include src/b.ts, count >= 2
```

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

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — add to `DEFAULTS`: `protected_categories: ['security', 'data-loss', 'crash', 'injection', 'auth'],`

- [ ] **Step 4: SKILL.md** — in the learnings paragraph, add:

```
A learning/noise pattern may downgrade or hide a STYLE/QUALITY finding, but it
must NEVER suppress a finding in a protected category (config
`protected_categories`, default: security, data-loss, crash, injection, auth).
If a learning conflicts with a protected-category finding, the finding wins.
```

- [ ] **Step 5:** document in `templates/config.yaml`; run unit; commit.

### Task 3B: Scoped context-file manifest (`.anchor/files.json`)

Point the reviewer at non-imported contracts (schema, OpenAPI, design docs) the import-graph misses.

**Files:**
- Create: `lib/manifest.mjs`
- Modify: `lib/context.mjs` (`getContext` merges manifest files, reason `manifest`)
- Modify: `skills/anchor-review/SKILL.md` (Step 4 note)
- Test: `tests/unit/manifest.test.mjs`, extend `tests/integration/context.test.mjs`

**Design.** `.anchor/files.json` = `[{ path, description, scope }]`. `selectManifest(entries, changedPaths)` returns entries whose `scope` glob (default `**`) matches a changed path. `getContext` appends matched, existing manifest files to its `files` list with `reason: 'manifest'` and the `description`, deduped against importer/importee.

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

**Design.** Keep the `### heading` + `<!-- reason: ... -->` format; add an optional second comment `<!-- meta: {"scope":"src/db/**","category":"style","action":"suppress"} -->`. `parse` reads it if present (absent → `{ scope: '**', action: 'suppress' }`). `selectLearnings(patterns, changedPaths)` filters by scope. Existing learnings (no meta) parse unchanged → apply everywhere (current behavior preserved).

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

- [ ] **Step 1:** SKILL.md Step 6 — make category an explicit generation gate:

```
Generate findings ONLY in the active `categories` (config; default all). Do not
produce a finding outside them, even to downgrade it. `category` (logic/security/
perf/style/docs/tests) and `severity` are independent axes: a logic bug can be
any severity; a style nit is category=style. At strictness 2 (default) do not
emit category=style/docs findings unless they cause a real bug; at strictness 3
emit only logic/security with crash/data-loss impact.
```

- [ ] **Step 2:** Add a `noisy-style` eval case to `tests/eval/cases.mjs` (a private-method-missing-docstring change with a `style` learning) whose `cleanFiles` asserts ZERO findings at default strictness. Run `npm run eval` to confirm 0 false positives. Commit.

---

## Phase 4 — Medium effort (task specs; expand to TDD steps when scheduled)

Each item below is specced to interface + representative test + acceptance. They are independent; schedule by value.

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

### Task M.1: Expand fixtures to cover every category and the new mechanisms
- **Files:** `tests/eval/cases.mjs`, `tests/eval/run.mjs`, `lib/eval.mjs`, `tests/unit/eval.test.mjs`.
- **Approach (TDD the scorer changes; fixtures are data):** add fixtures for each category (logic/security/perf already exist — add docs, tests, style) and for the new mechanisms: a `static-analyzer-catch` case (a tsc/eslint-detectable bug that should appear once, not duplicated), a `pattern-inconsistency` case (sibling uses a safe pattern, the change doesn't), and a `protected-not-suppressed` case (a security finding that a learning must NOT silence). Each declares `expected` + `cleanFiles`.
- **Acceptance:** `npm run eval` reports per-case + aggregate recall/precision/false-positives and gates (recall ≥ 0.8, false-positives = 0). Already implemented; this widens coverage.

### Task M.2: Make the eval the phase gate
- **Files:** `package.json` (add `"eval:ci": "ANCHOR_EVAL_GENERATE=1 node tests/eval/run.mjs"`), `CHANGELOG`/contributing note.
- **Approach:** document the workflow: run `npm run eval` (generate reviews via `claude -p` when `ANCHOR_EVAL_GENERATE=1`, else score pre-generated reviews in `tests/eval/.out/`), record baseline before a phase, compare after. A phase that drops recall or raises false-positives is not done.
- **Acceptance:** the convention is documented and the runner exits non-zero on regression (already implemented).

---

## Self-review (against the request)

**Coverage of the six buckets:**
- **Small things:** NaN guard (1.1), config validation (1.2), command timeouts (1.3), extractReviewMeta coupling (1.4), ignore-list unification (1.5), stale-doc note (1.6). ✓
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

Suggested order: **Phase M.1 (baseline) → Phase 1 → Phase 2 (2A, then 2C, then 2B) → Phase 3 → Phase 4 by value.** Each task is an independent commit; each phase is independently shippable and must pass the eval gate.
