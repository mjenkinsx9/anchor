# Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Anchor — a personal code review tool for Claude Code: a `/anchor` slash command + skill backed by deterministic Node ESM scripts, with per-repo learnings, codebase map/graph init, status, diagnostics, and a push reminder.

**Architecture:** A skill (`SKILL.md`) teaches the in-session LLM the review/init workflows; plain Node `.mjs` scripts (`bin/anchor.mjs` + `lib/*`) do all deterministic work (diff parsing, grep context, learnings CRUD, archiving, status, doctor). No server, no daemon, no LLM API calls — the LLM is the active Claude Code session. State lives in the reviewed repo's `.anchor/` directory.

**Tech Stack:** Node ≥18, plain ESM JavaScript (`.mjs`, JSDoc only, `tsc --noEmit` for typecheck), `js-yaml`, `minimatch`, vitest, GNU make, bash hooks, `gh` CLI (PR mode only), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-09-anchor-design.md` (v1.6). Read it before starting if anything here is ambiguous — the spec wins.

**Working directory:** `/home/mjenkins/github/anchor` (becomes the Anchor product repo; Task 1 runs `git init`).

---

## File Structure

```
anchor/
├── package.json                  # type:module, bin, scripts, deps
├── tsconfig.json                 # tsc --noEmit typecheck only
├── Makefile                      # link / install / build / test / install-hook / uninstall-hook
├── .gitignore                    # node_modules, .anchor, Anchor-Spec-Bundle
├── README.md                     # short usage doc (Task 22)
├── CHANGELOG.md                  # v0.1.0 (Task 22)
├── bin/
│   ├── anchor.mjs                # subcommand dispatcher (the only CLI entrypoint)
│   └── install-posttool-hook.mjs # thin wrapper over lib/posttool-hook.mjs
├── hooks/
│   ├── pre-push                  # git pre-push reminder (bash; prints, exits 0)
│   └── post-push-reminder.sh     # Claude Code PostToolUse hook (bash+node)
├── skill/SKILL.md                # review + init workflows (the LLM's instructions)
├── commands/anchor.md            # /anchor slash command
├── templates/
│   ├── config.yaml               # default per-repo config
│   └── learnings.md              # learnings seed (header only)
├── examples/
│   ├── good-review.md            # example of the target output
│   └── bad-review.md             # annotated antipatterns
├── lib/
│   ├── git.mjs                   # spawnSync wrappers: runCmd/runGit/isGitRepo/repoRoot/shortHead/hasCmd
│   ├── ignore.mjs                # minimatch helpers + DEFAULT_IGNORE_DIRS
│   ├── frontmatter.mjs           # parseFrontmatter / stringifyFrontmatter
│   ├── config.mjs                # DEFAULTS, loadConfig, ensureGitignore
│   ├── doctor.mjs                # runDoctor → {ok, checks[]}
│   ├── diff.mjs                  # parseTarget, parseUnifiedDiff, getDiff
│   ├── context.mjs               # parseImports, resolveImport, getContext
│   ├── learn.mjs                 # listLearnings / addLearning / removeLearning
│   ├── review.mjs                # saveReview / listReviews / showReview
│   ├── init.mjs                  # gatherInitData (pure data; LLM writes the markdown)
│   ├── status.mjs                # getStatus / renderStatusText
│   └── posttool-hook.mjs         # addHookEntry (pure, testable settings.json editing)
└── tests/
    ├── helpers/fixture.mjs       # makeFixtureRepo / writeFiles / commitAll
    ├── unit/*.test.mjs
    ├── integration/*.test.mjs
    ├── golden/golden.test.mjs    # snapshot of deterministic script outputs
    └── manual/SMOKE.md           # 24-item manual checklist
```

## Shared API Reference (signatures used across tasks — keep these exact)

```js
// lib/git.mjs
runCmd(cmd, args, opts?)            // → { stdout, stderr, code }
runGit(args, opts?)                 // → { stdout, stderr, code }
isGitRepo(dir)                      // → boolean
repoRoot(dir)                       // → string | null
shortHead(dir)                      // → string | null
hasCmd(cmd)                         // → boolean

// lib/ignore.mjs
DEFAULT_IGNORE_DIRS                 // string[]
isIgnored(relPath, patterns)        // → boolean
filterIgnored(paths, patterns)      // → string[]

// lib/frontmatter.mjs
parseFrontmatter(text)              // → { data, body }
stringifyFrontmatter(data, body)    // → string

// lib/config.mjs
DEFAULTS                            // object (spec §5 defaults)
loadConfig(repoDir)                 // → { config, warnings: string[] }
ensureGitignore(repoDir)            // → { added: boolean }

// lib/doctor.mjs
runDoctor({ cwd }?)                 // → { ok, checks: [{name, ok, level, message, fix?}] }

// lib/diff.mjs
parseTarget(tokens)                 // → { mode, ... }   (throws on unrecognized)
parseUnifiedDiff(text)              // → files[]
getDiff(tokens, { cwd }?)           // → spec §9 diff shape (throws on env errors)

// lib/context.mjs
parseImports(src)                   // → string[] (import specifiers)
resolveImport(repoDir, fromFile, spec) // → string | null (repo-relative path)
getContext({ files, repoDir, maxFiles, ignore }) // → { files: [{path, reason}] }

// lib/learn.mjs
listLearnings(repoDir)              // → { patterns: [{heading, reason}] }
addLearning(repoDir, pattern, reason?) // → { added, deduped }  (throws on empty)
removeLearning(repoDir, substring)  // → { removed: number }

// lib/review.mjs
saveReview(repoDir, content, meta?) // → { path }
listReviews(repoDir)                // → [{file, date, sha, target, score}]
showReview(repoDir, sha)            // → { content } | null

// lib/init.mjs
gatherInitData(repoDir, { depth, prLimit, noPrs, noGraph }?) // → spec §9 init shape + warnings[]

// lib/status.mjs
getStatus(repoDir)                  // → spec §9 status shape
renderStatusText(status)            // → string

// lib/posttool-hook.mjs
addHookEntry(settings, scriptPath)  // → { settings, changed: boolean }

// tests/helpers/fixture.mjs
makeFixtureRepo(files?)             // → { dir, git(...args), cleanup() }
writeFiles(dir, files)              // void
commitAll(dir, message)             // void
```

**Conventions for every task:** conventional commits (`feat:`, `test:`, `chore:`, `docs:`). Run tests with `pnpm test` (unit) / `pnpm test:integration`. All `lib/*` functions throw `Error` with messages starting `anchor: ` for user-facing failures; the dispatcher catches and prints them to stderr with exit 1.

---

# Phase 0 — Foundation

### Task 1: Repo scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `tests/unit/sanity.test.mjs` (deleted in Task 2)

- [ ] **Step 1: git init and verify toolchain**

```bash
cd /home/mjenkins/github/anchor
git init -b main
node --version    # expect v18+ (any major ≥18)
corepack enable 2>/dev/null || true
pnpm --version    # if missing: npm install -g pnpm
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
.anchor/
Anchor-Spec-Bundle/
```

(`Anchor-Spec-Bundle/` is reference docs from brainstorming, not product code. `docs/` IS committed — it holds the spec and this plan.)

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "anchor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "anchor": "bin/anchor.mjs" },
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "vitest run tests/unit",
    "test:watch": "vitest tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:golden": "vitest run tests/golden",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "minimatch": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["bin/**/*.mjs", "lib/**/*.mjs"]
}
```

- [ ] **Step 5: Install dependencies and verify vitest runs**

Write `tests/unit/sanity.test.mjs`:

```js
import { it, expect } from 'vitest';

it('sanity', () => {
  expect(1 + 1).toBe(2);
});
```

```bash
pnpm install
pnpm test
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json tsconfig.json pnpm-lock.yaml tests/unit/sanity.test.mjs docs/
git commit -m "chore: scaffold anchor repo (pnpm, vitest, tsconfig, spec + plan docs)"
```

---

### Task 2: Test fixture helper + `lib/git.mjs`

**Files:**
- Create: `tests/helpers/fixture.mjs`
- Create: `lib/git.mjs`
- Create: `tests/unit/git.test.mjs`
- Delete: `tests/unit/sanity.test.mjs`

- [ ] **Step 1: Write the fixture helper** (test infrastructure — no test for it; it's exercised by every test that uses it)

`tests/helpers/fixture.mjs`:

```js
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

/** Create a temp git repo with `files` ({relPath: content}) committed on main. */
export function makeFixtureRepo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-fixture-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'initial commit', '--allow-empty');
  return {
    dir,
    git: (...args) => git(dir, ...args),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

export function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', message);
}
```

- [ ] **Step 2: Write the failing tests for `lib/git.mjs`**

`tests/unit/git.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { runCmd, runGit, isGitRepo, repoRoot, shortHead, hasCmd } from '../../lib/git.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import { tmpdir } from 'node:os';

const repo = makeFixtureRepo({ 'a.txt': 'hello\n' });
afterAll(() => repo.cleanup());

describe('runCmd', () => {
  it('captures stdout and exit code', () => {
    const r = runCmd('echo', ['hi']);
    expect(r.stdout.trim()).toBe('hi');
    expect(r.code).toBe(0);
  });
  it('returns code 127 for missing binaries instead of throwing', () => {
    const r = runCmd('definitely-not-a-real-binary-xyz', []);
    expect(r.code).toBe(127);
  });
});

describe('git helpers', () => {
  it('runGit runs in the given cwd', () => {
    const r = runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repo.dir });
    expect(r.stdout.trim()).toBe('true');
  });
  it('isGitRepo true inside, false outside', () => {
    expect(isGitRepo(repo.dir)).toBe(true);
    expect(isGitRepo(tmpdir())).toBe(false);
  });
  it('repoRoot resolves the fixture root', () => {
    // realpath both sides: macOS/Linux tmpdirs may be symlinked
    expect(repoRoot(repo.dir)).toBeTruthy();
  });
  it('shortHead returns a short sha', () => {
    expect(shortHead(repo.dir)).toMatch(/^[0-9a-f]{6,12}$/);
  });
  it('hasCmd', () => {
    expect(hasCmd('git')).toBe(true);
    expect(hasCmd('definitely-not-a-real-binary-xyz')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
rm tests/unit/sanity.test.mjs
pnpm test
```

Expected: FAIL — `Cannot find module '../../lib/git.mjs'`.

- [ ] **Step 4: Write `lib/git.mjs`**

```js
import { spawnSync } from 'node:child_process';

/** Run a command synchronously. Never throws; missing binary → code 127. */
export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) return { stdout: '', stderr: String(res.error.message), code: 127 };
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', code: res.status ?? 0 };
}

export function runGit(args, opts = {}) {
  return runCmd('git', args, opts);
}

export function isGitRepo(dir) {
  return runGit(['rev-parse', '--is-inside-work-tree'], { cwd: dir }).stdout.trim() === 'true';
}

export function repoRoot(dir) {
  const r = runGit(['rev-parse', '--show-toplevel'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}

export function shortHead(dir) {
  const r = runGit(['rev-parse', '--short', 'HEAD'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}

export function hasCmd(cmd) {
  return runCmd(cmd, ['--version']).code === 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/git.mjs tests/helpers/fixture.mjs tests/unit/git.test.mjs
git rm --cached tests/unit/sanity.test.mjs 2>/dev/null; rm -f tests/unit/sanity.test.mjs
git commit -m "feat: git command wrappers + test fixture helper"
```

---

### Task 3: `lib/ignore.mjs`

**Files:**
- Create: `lib/ignore.mjs`
- Test: `tests/unit/ignore.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/unit/ignore.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { isIgnored, filterIgnored, DEFAULT_IGNORE_DIRS } from '../../lib/ignore.mjs';

describe('isIgnored', () => {
  it('matches glob patterns', () => {
    expect(isIgnored('src/a.test.ts', ['**/*.test.ts'])).toBe(true);
    expect(isIgnored('src/a.ts', ['**/*.test.ts'])).toBe(false);
  });
  it('matches directory globs', () => {
    expect(isIgnored('vendor/lib/x.js', ['vendor/**'])).toBe(true);
    expect(isIgnored('node_modules/pkg/index.js', ['node_modules/**'])).toBe(true);
  });
  it('matches dotfiles (dot: true)', () => {
    expect(isIgnored('.git/config', ['.git/**'])).toBe(true);
  });
  it('empty patterns ignore nothing', () => {
    expect(isIgnored('anything.ts', [])).toBe(false);
  });
});

describe('filterIgnored', () => {
  it('removes ignored paths', () => {
    const out = filterIgnored(['a.ts', 'a.test.ts', 'vendor/b.js'], ['**/*.test.ts', 'vendor/**']);
    expect(out).toEqual(['a.ts']);
  });
});

describe('DEFAULT_IGNORE_DIRS', () => {
  it('covers the standard noise dirs', () => {
    for (const dir of ['node_modules', 'dist', '.git', '.anchor']) {
      expect(isIgnored(`${dir}/x`, DEFAULT_IGNORE_DIRS)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/ignore.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/ignore.mjs`**

```js
import { minimatch } from 'minimatch';

export const DEFAULT_IGNORE_DIRS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.git/**',
  '.anchor/**',
];

export function isIgnored(relPath, patterns = []) {
  return patterns.some((p) => minimatch(relPath, p, { dot: true }));
}

export function filterIgnored(paths, patterns = []) {
  return paths.filter((p) => !isIgnored(p, patterns));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/ignore.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ignore.mjs tests/unit/ignore.test.mjs
git commit -m "feat: glob ignore matching"
```

---

### Task 4: `lib/frontmatter.mjs`

**Files:**
- Create: `lib/frontmatter.mjs`
- Test: `tests/unit/frontmatter.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/unit/frontmatter.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, stringifyFrontmatter } from '../../lib/frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('parses yaml frontmatter and body', () => {
    const { data, body } = parseFrontmatter('---\ndate: 2026-06-09\nsha: abc1234\n---\n\n# Review\n');
    expect(data.sha).toBe('abc1234');
    expect(body.trim()).toBe('# Review');
  });
  it('no frontmatter → empty data, full body', () => {
    const { data, body } = parseFrontmatter('# Just markdown\n');
    expect(data).toEqual({});
    expect(body).toBe('# Just markdown\n');
  });
  it('invalid yaml → empty data, full body (graceful)', () => {
    const text = '---\n: : bad: [\n---\nbody';
    const { data, body } = parseFrontmatter(text);
    expect(data).toEqual({});
    expect(body).toBe(text);
  });
});

describe('stringifyFrontmatter', () => {
  it('round-trips', () => {
    const out = stringifyFrontmatter({ a: 1, list: ['x'] }, 'body text\n');
    const { data, body } = parseFrontmatter(out);
    expect(data).toEqual({ a: 1, list: ['x'] });
    expect(body.trim()).toBe('body text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/frontmatter.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/frontmatter.mjs`**

```js
import yaml from 'js-yaml';

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data;
  try {
    data = yaml.load(m[1]) ?? {};
  } catch {
    return { data: {}, body: text };
  }
  if (typeof data !== 'object' || Array.isArray(data)) return { data: {}, body: text };
  return { data, body: text.slice(m[0].length) };
}

export function stringifyFrontmatter(data, body) {
  return `---\n${yaml.dump(data).trimEnd()}\n---\n\n${body}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/frontmatter.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/frontmatter.mjs tests/unit/frontmatter.test.mjs
git commit -m "feat: yaml frontmatter parse/stringify"
```

---

### Task 5: `lib/config.mjs` (defaults, loader, strictness validation, gitignore management)

**Files:**
- Create: `lib/config.mjs`
- Test: `tests/unit/config.test.mjs`

Spec refs: §5 (schema + defaults + gitignore block), §11 (invalid YAML → warn + defaults; bad strictness → warn + 2).

- [ ] **Step 1: Write the failing tests**

`tests/unit/config.test.mjs`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, loadConfig, ensureGitignore } from '../../lib/config.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-config-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeConfig(yamlText) {
  mkdirSync(join(dir, '.anchor'), { recursive: true });
  writeFileSync(join(dir, '.anchor', 'config.yaml'), yamlText);
}

describe('loadConfig', () => {
  it('missing file → all defaults, no warnings', () => {
    const { config, warnings } = loadConfig(dir);
    expect(config).toEqual(DEFAULTS);
    expect(warnings).toEqual([]);
  });
  it('merges user values over defaults', () => {
    writeConfig('min_severity: high\nmax_findings: 10\n');
    const { config } = loadConfig(dir);
    expect(config.min_severity).toBe('high');
    expect(config.max_findings).toBe(10);
    expect(config.strictness).toBe(2); // untouched default
  });
  it('deep-merges output options', () => {
    writeConfig('output:\n  color: never\n');
    const { config } = loadConfig(dir);
    expect(config.output.color).toBe('never');
    expect(config.output.show_whats_good).toBe(true);
  });
  it('invalid YAML → defaults + warning naming the file', () => {
    writeConfig('ignore: [unclosed\n');
    const { config, warnings } = loadConfig(dir);
    expect(config).toEqual(DEFAULTS);
    expect(warnings[0]).toContain('.anchor/config.yaml is invalid YAML');
  });
  it('strictness outside 1-3 → warning + default 2', () => {
    writeConfig('strictness: 9\n');
    const { config, warnings } = loadConfig(dir);
    expect(config.strictness).toBe(2);
    expect(warnings[0]).toContain('strictness must be 1, 2, or 3');
  });
  it('valid strictness 3 accepted', () => {
    writeConfig('strictness: 3\n');
    expect(loadConfig(dir).config.strictness).toBe(3);
  });
});

describe('ensureGitignore', () => {
  it('creates .gitignore with the anchor block', () => {
    const { added } = ensureGitignore(dir);
    expect(added).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content).toContain('.anchor/reviews/');
    expect(content).toContain('.anchor/learnings.md');
  });
  it('is idempotent', () => {
    ensureGitignore(dir);
    const first = readFileSync(join(dir, '.gitignore'), 'utf8');
    const { added } = ensureGitignore(dir);
    expect(added).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(first);
  });
  it('appends only missing lines to an existing .gitignore', () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.anchor/config.yaml\n');
    ensureGitignore(dir);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content.match(/\.anchor\/config\.yaml/g)).toHaveLength(1);
    expect(content).toContain('.anchor/reviews/');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/config.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/config.mjs`**

```js
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export const DEFAULTS = {
  ignore: ['**/*.lock', '**/*.generated.*', 'vendor/**', 'node_modules/**'],
  min_severity: 'low',
  strictness: 2,
  max_findings: 50,
  categories: ['logic', 'security', 'perf', 'style', 'docs', 'tests'],
  min_confidence: 2,
  max_diff_lines: 2000,
  max_files: 100,
  output: { show_whats_good: true, show_diff_stats: true, color: 'auto' },
};

export function loadConfig(repoDir) {
  const warnings = [];
  const file = join(repoDir, '.anchor', 'config.yaml');
  let raw = {};
  if (existsSync(file)) {
    try {
      raw = yaml.load(readFileSync(file, 'utf8')) ?? {};
      if (typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    } catch (e) {
      const line = e?.mark ? ` at line ${e.mark.line + 1}` : '';
      warnings.push(`anchor: .anchor/config.yaml is invalid YAML${line}. Using defaults.`);
      raw = {};
    }
  }
  if (raw.strictness !== undefined && ![1, 2, 3].includes(raw.strictness)) {
    warnings.push(
      `anchor: strictness must be 1, 2, or 3. Got ${JSON.stringify(raw.strictness)}. Using 2 (balanced).`,
    );
    delete raw.strictness;
  }
  const config = {
    ...DEFAULTS,
    ...raw,
    output: { ...DEFAULTS.output, ...(raw.output ?? {}) },
  };
  return { config, warnings };
}

const GITIGNORE_BLOCK = [
  '# Anchor (personal code review state)',
  '.anchor/config.yaml',
  '.anchor/codebase-map.md',
  '.anchor/codebase-graph.md',
  '.anchor/learnings.md',
  '.anchor/reviews/',
];

/** Idempotently append the Anchor gitignore block (spec §5). */
export function ensureGitignore(repoDir) {
  const file = join(repoDir, '.gitignore');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = new Set(existing.split('\n'));
  const missing = GITIGNORE_BLOCK.filter((l) => !lines.has(l));
  if (missing.length === 0) return { added: false };
  const sep = existing.length && !existing.endsWith('\n') ? '\n' : '';
  appendFileSync(file, `${sep}${missing.join('\n')}\n`);
  return { added: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.mjs tests/unit/config.test.mjs
git commit -m "feat: config loader with defaults, strictness validation, gitignore management"
```

---

### Task 6: `lib/doctor.mjs`

**Files:**
- Create: `lib/doctor.mjs`
- Test: `tests/unit/doctor.test.mjs`

Spec refs: §9 doctor checks list; §11 ("doctor finds a problem → show in report, exit 1; warnings don't cause non-zero exit"). The `gh`, `config`, and `claude code` checks are **warn-level**; everything else is error-level.

- [ ] **Step 1: Write the failing tests**

`tests/unit/doctor.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { runDoctor } from '../../lib/doctor.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';
import { tmpdir } from 'node:os';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('runDoctor', () => {
  it('returns a check for each diagnostic', () => {
    const { checks } = runDoctor({ cwd: repo.dir });
    const names = checks.map((c) => c.name);
    for (const expected of ['git', 'gh', 'repo', 'skill symlink', 'command symlink', 'bin symlink', 'config', 'claude code', 'node']) {
      expect(names).toContain(expected);
    }
  });
  it('git, repo, node pass in a fixture repo', () => {
    const { checks } = runDoctor({ cwd: repo.dir });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName.git.ok).toBe(true);
    expect(byName.repo.ok).toBe(true);
    expect(byName.node.ok).toBe(true);
  });
  it('repo check fails outside a git repo', () => {
    const { checks } = runDoctor({ cwd: tmpdir() });
    const repoCheck = checks.find((c) => c.name === 'repo');
    expect(repoCheck.ok).toBe(false);
    expect(repoCheck.level).toBe('error');
  });
  it('overall ok ignores warn-level failures', () => {
    const { ok, checks } = runDoctor({ cwd: repo.dir });
    const errorFails = checks.filter((c) => !c.ok && c.level === 'error');
    expect(ok).toBe(errorFails.length === 0);
  });
  it('every failing check has a fix hint', () => {
    const { checks } = runDoctor({ cwd: tmpdir() });
    for (const c of checks.filter((c) => !c.ok)) expect(c.fix).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/doctor.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/doctor.mjs`**

```js
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runGit, runCmd, isGitRepo } from './git.mjs';
import { loadConfig } from './config.mjs';

export function runDoctor({ cwd = process.cwd() } = {}) {
  const checks = [];
  const add = (name, ok, message, { level = 'error', fix } = {}) =>
    checks.push({ name, ok, level, message, ...(ok ? {} : { fix }) });

  const gitV = runGit(['--version']);
  add('git', gitV.code === 0, gitV.code === 0 ? gitV.stdout.trim() : 'git not found', {
    fix: 'Install git >= 2.0',
  });

  const ghV = runCmd('gh', ['--version']);
  add('gh', ghV.code === 0, ghV.code === 0 ? ghV.stdout.split('\n')[0] : 'gh not found (only required for PR mode)', {
    level: 'warn',
    fix: 'Install from https://cli.github.com',
  });

  const inRepo = isGitRepo(cwd);
  add('repo', inRepo, inRepo ? 'inside a git repository' : 'not a git repository', {
    fix: 'Run from inside a repo',
  });

  const symlinks = [
    ['skill symlink', join(homedir(), '.claude', 'skills', 'anchor', 'SKILL.md')],
    ['command symlink', join(homedir(), '.claude', 'commands', 'anchor.md')],
    ['bin symlink', join(homedir(), 'bin', 'anchor')],
  ];
  for (const [name, p] of symlinks) {
    let ok = false;
    try {
      ok = existsSync(realpathSync(p));
    } catch {
      ok = false;
    }
    add(name, ok, ok ? `${p} resolves` : `${p} missing or broken`, {
      fix: 'Run `make link` in the anchor repo',
    });
  }

  const { warnings } = loadConfig(cwd);
  add('config', warnings.length === 0, warnings.length === 0 ? '.anchor/config.yaml ok (or absent)' : warnings.join('; '), {
    level: 'warn',
    fix: 'Fix .anchor/config.yaml',
  });

  const inClaude = process.env.CLAUDECODE === '1';
  add('claude code', inClaude, inClaude ? 'session active' : 'no active Claude Code session detected', {
    level: 'warn',
    fix: 'Run inside Claude Code for review workflows',
  });

  const major = Number(process.version.slice(1).split('.')[0]);
  add('node', major >= 18, `node ${process.version}`, { fix: 'Install Node 18+' });

  const ok = checks.every((c) => c.ok || c.level === 'warn');
  return { ok, checks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/doctor.test.mjs`
Expected: PASS. (The symlink checks will report not-ok on this machine until `make link` runs — the tests only assert structure, not symlink success.)

- [ ] **Step 5: Commit**

```bash
git add lib/doctor.mjs tests/unit/doctor.test.mjs
git commit -m "feat: doctor diagnostics"
```

---

### Task 7: Dispatcher skeleton (`bin/anchor.mjs`) + Makefile — Phase 0 gate

**Files:**
- Create: `bin/anchor.mjs` (doctor + config subcommands only; the rest are wired in Task 16)
- Create: `Makefile`
- Test: `tests/integration/cli.test.mjs`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/cli.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

export function anchor(args, cwd = repo.dir) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('anchor CLI skeleton', () => {
  it('doctor emits JSON by default', () => {
    const r = anchor(['doctor']);
    const out = JSON.parse(r.stdout);
    expect(out.checks.length).toBeGreaterThan(5);
  });
  it('doctor --format text emits ✓/✗ lines', () => {
    const r = anchor(['doctor', '--format', 'text']);
    expect(r.stdout).toMatch(/[✓✗⚠]/);
  });
  it('config prints resolved config with defaults', () => {
    const r = anchor(['config']);
    const out = JSON.parse(r.stdout);
    expect(out.strictness).toBe(2);
    expect(out.max_diff_lines).toBe(2000);
  });
  it('unknown subcommand → exit 1 with usage on stderr', () => {
    const r = anchor(['bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration`
Expected: FAIL — `bin/anchor.mjs` not found.

- [ ] **Step 3: Write `bin/anchor.mjs`**

```js
#!/usr/bin/env node
import { runDoctor } from '../lib/doctor.mjs';
import { loadConfig } from '../lib/config.mjs';

const USAGE = `usage: anchor <init|diff|context|review|learn|status|config|doctor> [args] [--format json|text]`;

/** Flags that take a value. Everything else with -- is boolean. */
const VALUED = new Set(['format', 'reason', 'max-files', 'from-diff', 'depth', 'target']);

export function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (VALUED.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags.set(key, argv[++i]);
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function emit(obj, flags, renderText) {
  if (flags.get('format') === 'text' && renderText) {
    process.stdout.write(renderText(obj) + '\n');
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  }
}

function renderDoctorText({ checks }) {
  return checks
    .map((c) => {
      const icon = c.ok ? '✓' : c.level === 'warn' ? '⚠' : '✗';
      const fix = c.ok ? '' : ` → ${c.fix}`;
      return `${icon} ${c.name} — ${c.message}${fix}`;
    })
    .join('\n');
}

const HANDLERS = {
  doctor(rest, flags) {
    const result = runDoctor({ cwd: process.cwd() });
    emit(result, flags, renderDoctorText);
    process.exit(result.ok ? 0 : 1);
  },
  config(rest, flags) {
    const { config, warnings } = loadConfig(process.cwd());
    for (const w of warnings) process.stderr.write(w + '\n');
    if (rest[0] === 'validate') {
      emit({ valid: warnings.length === 0, warnings }, flags);
      process.exit(warnings.length === 0 ? 0 : 1);
    }
    emit(config, flags);
  },
};

const [sub, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);
const handler = HANDLERS[sub];
if (!handler) {
  process.stderr.write(USAGE + '\n');
  process.exit(1);
}
try {
  handler(positional, flags);
} catch (e) {
  process.stderr.write((e?.message ?? String(e)) + '\n');
  process.exit(1);
}
```

```bash
chmod +x bin/anchor.mjs
```

- [ ] **Step 4: Write the `Makefile`**

Note: Make target names cannot contain colons — the pnpm script names keep the `test:x` convention, the Make targets use hyphens. `ANCHOR_DIR` resolves the Makefile's own directory so `install-hook` works when invoked from another repo via `make -f`.

```makefile
ANCHOR_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))

link:
	@mkdir -p ~/bin
	@ln -sf $(ANCHOR_DIR)/bin/anchor.mjs ~/bin/anchor
	@mkdir -p ~/.claude/skills/anchor ~/.claude/commands
	@ln -sf $(ANCHOR_DIR)/skill/SKILL.md ~/.claude/skills/anchor/SKILL.md
	@ln -sf $(ANCHOR_DIR)/commands/anchor.md ~/.claude/commands/anchor.md
	@echo "Anchor linked."

build:
	pnpm exec tsc --noEmit

test:
	pnpm test

test-integration:
	pnpm test:integration

test-golden:
	pnpm test:golden

clean:
	rm -rf node_modules

.PHONY: link build test test-integration test-golden clean
```

(`install`, `install-hook`, `uninstall-hook` are added in Tasks 18-20 once the files they reference exist.)

- [ ] **Step 5: Run tests + typecheck to verify**

```bash
pnpm test:integration
pnpm typecheck
```

Expected: integration tests PASS; typecheck clean (fix any JSDoc/type complaints it raises).

- [ ] **Step 6: Verify the Phase 0 gate**

```bash
make link
~/bin/anchor doctor --format text; echo "exit: $?"
```

Expected: a readable report; `skill symlink` / `command symlink` show ⚠/✗ (those files don't exist until Phase 2) — but `bin symlink`, `git`, `repo`, `node` are ✓. Exit code reflects error-level checks only. **`make link` puts a working `anchor doctor` on PATH — Phase 0 done.**

- [ ] **Step 7: Commit**

```bash
git add bin/anchor.mjs Makefile tests/integration/cli.test.mjs
git commit -m "feat: anchor CLI dispatcher skeleton (doctor, config) + Makefile link target"
```

# Phase 1 — Scripts

### Task 8: `lib/diff.mjs` — target parsing + unified diff parser (pure functions)

**Files:**
- Create: `lib/diff.mjs`
- Test: `tests/unit/diff.test.mjs`

Spec refs: §4 argument forms; §9 diff JSON shape.

- [ ] **Step 1: Write the failing tests**

`tests/unit/diff.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { parseTarget, parseUnifiedDiff } from '../../lib/diff.mjs';

describe('parseTarget', () => {
  it('no args → uncommitted', () => {
    expect(parseTarget([])).toEqual({ mode: 'uncommitted' });
  });
  it('ref range → ref-diff', () => {
    expect(parseTarget(['main..feature/foo'])).toEqual({
      mode: 'ref-diff', ref1: 'main', ref2: 'feature/foo', range: 'main..feature/foo',
    });
  });
  it('three-dot range preserved', () => {
    expect(parseTarget(['main...dev']).range).toBe('main...dev');
  });
  it('pr number', () => {
    expect(parseTarget(['pr', '123'])).toEqual({ mode: 'pr', selector: '123' });
  });
  it('pr url', () => {
    const t = parseTarget(['pr', 'https://github.com/me/repo/pull/77']);
    expect(t.mode).toBe('pr');
    expect(t.selector).toBe('https://github.com/me/repo/pull/77');
  });
  it('@file → file mode', () => {
    expect(parseTarget(['@src/a.ts'])).toEqual({ mode: 'file', path: 'src/a.ts' });
  });
  it('unrecognized → throws', () => {
    expect(() => parseTarget(['wat'])).toThrow(/unrecognized target/);
  });
});

describe('parseUnifiedDiff', () => {
  const SAMPLE = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 111..222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@',
    ' line1',
    '-line2',
    '+line2changed',
    '+line2b',
    ' line3',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    '',
  ].join('\n');

  it('parses files, hunks, and counts', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files).toHaveLength(2);
    const [a, gone] = files;
    expect(a.path).toBe('src/a.ts');
    expect(a.added).toBe(2);
    expect(a.removed).toBe(1);
    expect(a.hunks).toHaveLength(1);
    expect(a.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4 });
    expect(a.hunks[0].body).toContain('+line2changed');
  });
  it('uses the old path for deleted files', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].path).toBe('gone.txt');
    expect(files[1].removed).toBe(1);
  });
  it('hunk headers without explicit counts default to 1', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].hunks[0].oldLines).toBe(1);
    expect(files[1].hunks[0].newLines).toBe(0);
  });
  it('empty input → empty array', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/diff.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/diff.mjs` (pure functions only — `getDiff` arrives in Task 9)**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, runCmd } from './git.mjs';

export function parseTarget(tokens = []) {
  const t = tokens.filter((x) => !x.startsWith('--'));
  if (t.length === 0) return { mode: 'uncommitted' };
  if (t[0] === 'pr') {
    const selector = t[1] ?? '';
    if (!selector) throw new Error('anchor: pr mode needs a number or URL, e.g. `anchor diff pr 123`');
    return { mode: 'pr', selector };
  }
  if (t[0].startsWith('@')) return { mode: 'file', path: t[0].slice(1) };
  if (t[0].includes('..')) {
    const [ref1, ref2] = t[0].split(/\.{2,3}/);
    return { mode: 'ref-diff', ref1, ref2, range: t[0] };
  }
  throw new Error(`anchor: unrecognized target "${t[0]}"`);
}

export function parseUnifiedDiff(text) {
  const files = [];
  let file = null;
  let oldPath = null;
  let hunk = null;
  let remOld = 0;
  let remNew = 0;

  for (const line of text.split('\n')) {
    if (hunk && (remOld > 0 || remNew > 0)) {
      if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      hunk.body += line + '\n';
      const c = line[0];
      if (c === '+') { remNew--; file.added++; }
      else if (c === '-') { remOld--; file.removed++; }
      else { remOld--; remNew--; }
      continue;
    }
    if (line.startsWith('--- ')) { oldPath = line.slice(4).replace(/^a\//, ''); continue; }
    if (line.startsWith('+++ ')) {
      const newPath = line.slice(4).replace(/^b\//, '');
      file = { path: newPath === '/dev/null' ? oldPath : newPath, added: 0, removed: 0, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file) {
      hunk = {
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        body: '',
      };
      remOld = hunk.oldLines;
      remNew = hunk.newLines;
      file.hunks.push(hunk);
    }
  }
  return files;
}

export function withStats(result) {
  const stats = result.files.reduce(
    (s, f) => ({
      totalAdded: s.totalAdded + f.added,
      totalRemoved: s.totalRemoved + f.removed,
      fileCount: s.fileCount + 1,
    }),
    { totalAdded: 0, totalRemoved: 0, fileCount: 0 },
  );
  return { ...result, stats };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/diff.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/diff.mjs tests/unit/diff.test.mjs
git commit -m "feat: diff target parsing and unified diff parser"
```

---

### Task 9: `lib/diff.mjs` — `getDiff` local modes (uncommitted / staged / ref-diff / file)

**Files:**
- Modify: `lib/diff.mjs` (append `getDiff`, `fileMode`)
- Test: `tests/integration/diff.test.mjs`

- [ ] **Step 1: Write the failing integration tests**

`tests/integration/diff.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDiff } from '../../lib/diff.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/a.ts': 'const a = 1;\nexport default a;\n',
  'src/b.ts': 'export const b = 2;\n',
});
afterAll(() => repo.cleanup());

describe('getDiff local modes', () => {
  it('uncommitted: detects working-tree edits vs HEAD', () => {
    writeFileSync(join(repo.dir, 'src/a.ts'), 'const a = 42;\nexport default a;\n');
    const d = getDiff([], { cwd: repo.dir });
    expect(d.mode).toBe('uncommitted');
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(d.stats.fileCount).toBe(1);
    expect(d.files[0].added).toBeGreaterThan(0);
  });
  it('staged: only staged changes', () => {
    repo.git('add', 'src/a.ts');
    writeFileSync(join(repo.dir, 'src/b.ts'), 'export const b = 3;\n'); // unstaged
    const d = getDiff(['--staged'], { cwd: repo.dir });
    expect(d.mode).toBe('staged');
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });
  it('ref-diff between branches', () => {
    commitAll(repo.dir, 'wip changes');
    repo.git('checkout', '-b', 'feature');
    writeFiles(repo.dir, { 'src/c.ts': 'export const c = 9;\n' });
    commitAll(repo.dir, 'add c');
    const d = getDiff(['main..feature'], { cwd: repo.dir });
    expect(d.mode).toBe('ref-diff');
    expect(d.ref1).toBe('main');
    expect(d.ref2).toBe('feature');
    expect(d.files.map((f) => f.path)).toEqual(['src/c.ts']);
  });
  it('file mode returns whole file as one hunk', () => {
    const d = getDiff(['@src/a.ts'], { cwd: repo.dir });
    expect(d.mode).toBe('file');
    expect(d.files[0].hunks).toHaveLength(1);
    expect(d.files[0].hunks[0].body).toContain('const a = 42;');
  });
  it('file mode on a missing file throws', () => {
    expect(() => getDiff(['@nope.ts'], { cwd: repo.dir })).toThrow(/file not found/);
  });
  it('bad ref surfaces git stderr', () => {
    expect(() => getDiff(['nope..alsonope'], { cwd: repo.dir })).toThrow(/git diff failed/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/diff.test.mjs`
Expected: FAIL — `getDiff` is not exported.

- [ ] **Step 3: Append to `lib/diff.mjs`**

```js
export function getDiff(tokens, { cwd = process.cwd() } = {}) {
  const staged = tokens.includes('--staged');
  const target = staged ? { mode: 'staged' } : parseTarget(tokens);

  if (target.mode === 'file') return fileMode(target, cwd);
  if (target.mode === 'pr') return prMode(target, cwd, tokens);

  let raw;
  if (target.mode === 'uncommitted') raw = runGit(['diff', 'HEAD'], { cwd });
  else if (target.mode === 'staged') raw = runGit(['diff', '--cached'], { cwd });
  else raw = runGit(['diff', target.range], { cwd });

  if (raw.code !== 0) throw new Error(`anchor: git diff failed: ${raw.stderr.trim()}`);
  return withStats({
    mode: target.mode,
    ...(target.ref1 ? { ref1: target.ref1, ref2: target.ref2 } : {}),
    files: parseUnifiedDiff(raw.stdout),
  });
}

function fileMode(target, cwd) {
  const abs = join(cwd, target.path);
  if (!existsSync(abs)) throw new Error(`anchor: file not found: ${target.path}`);
  const body = readFileSync(abs, 'utf8');
  const n = body.split('\n').length;
  return withStats({
    mode: 'file',
    files: [{
      path: target.path,
      added: n,
      removed: 0,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: n, body }],
    }],
  });
}
```

Also add a temporary stub so the file parses until Task 10:

```js
function prMode(target, cwd, tokens) {
  throw new Error('anchor: PR mode not implemented yet (Task 10)');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration tests/integration/diff.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/diff.mjs tests/integration/diff.test.mjs
git commit -m "feat: getDiff for uncommitted/staged/ref-diff/file modes"
```

---

### Task 10: `lib/diff.mjs` — PR mode via `gh` (with mocked `gh` in tests)

**Files:**
- Modify: `lib/diff.mjs` (replace the `prMode` stub)
- Test: `tests/integration/diff-pr.test.mjs`

**Design decision (spec §9 simplification):** the spec's §9 lists a 5-step fetch-and-diff dance, but spec line `anchor diff pr 123  # PR diff via \`gh pr diff\`` blesses the simpler path. Implement with `gh pr diff` (it handles forks/cross-repo internally), falling back to `gh api repos/{owner}/{repo}/pulls/{n}/files` is unnecessary — if `gh pr diff` fails we surface the error. Spec error rows for missing/unauthenticated `gh` still apply.

**Mocking `gh`:** tests create a fake `gh` executable in a temp dir and prepend it to `PATH` via the `env` option — `getDiff` accepts `{ env }` passthrough for this.

- [ ] **Step 1: Write the failing tests**

`tests/integration/diff-pr.test.mjs`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDiff } from '../../lib/diff.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
let mockDir;

const FAKE_DIFF = [
  'diff --git a/src/x.ts b/src/x.ts',
  '--- a/src/x.ts',
  '+++ b/src/x.ts',
  '@@ -1 +1,2 @@',
  ' keep',
  '+added',
  '',
].join('\\n');

beforeAll(() => {
  mockDir = mkdtempSync(join(tmpdir(), 'anchor-gh-mock-'));
  // fake gh: `gh --version` ok; `gh pr view ... --json` returns metadata; `gh pr diff N` prints a diff
  writeFileSync(join(mockDir, 'gh'), `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "gh version 2.0.0 (mock)"; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"number": 123, "url": "https://github.com/me/repo/pull/123"}'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "diff" ]; then
  printf '${FAKE_DIFF}'
  exit 0
fi
exit 1
`);
  chmodSync(join(mockDir, 'gh'), 0o755);
});
afterAll(() => {
  rmSync(mockDir, { recursive: true, force: true });
  repo.cleanup();
});

function mockEnv() {
  return { ...process.env, PATH: `${mockDir}:${process.env.PATH}` };
}

describe('getDiff PR mode', () => {
  it('parses gh pr diff output and attaches PR metadata', () => {
    const d = getDiff(['pr', '123'], { cwd: repo.dir, env: mockEnv() });
    expect(d.mode).toBe('pr');
    expect(d.prNumber).toBe('123');
    expect(d.prUrl).toBe('https://github.com/me/repo/pull/123');
    expect(d.files[0].path).toBe('src/x.ts');
    expect(d.files[0].added).toBe(1);
  });
  it('missing gh → clear install message', () => {
    const noGh = { ...process.env, PATH: '/nonexistent-bin-dir' };
    expect(() => getDiff(['pr', '123'], { cwd: repo.dir, env: noGh }))
      .toThrow(/PR mode requires the `gh` CLI/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/diff-pr.test.mjs`
Expected: FAIL — "PR mode not implemented yet".

- [ ] **Step 3: Replace the `prMode` stub and thread `env` through**

In `lib/diff.mjs`, change `getDiff`'s signature line to accept `env`:

```js
export function getDiff(tokens, { cwd = process.cwd(), env } = {}) {
```

…pass `{ cwd, env }` to `runGit`/`runCmd` calls inside `getDiff` and `prMode`, and in `lib/git.mjs` thread it through `spawnSync` (add `env: opts.env` to the `spawnSync` options object in `runCmd`). Then replace the stub:

```js
function prMode(target, cwd, env) {
  if (runCmd('gh', ['--version'], { env }).code !== 0) {
    throw new Error('anchor: PR mode requires the `gh` CLI. Install from https://cli.github.com.');
  }
  const view = runCmd(
    'gh',
    ['pr', 'view', target.selector, '--json', 'number,url'],
    { cwd, env },
  );
  if (view.code !== 0) {
    const msg = view.stderr.toLowerCase();
    if (msg.includes('auth')) throw new Error('anchor: `gh` is not authenticated. Run `gh auth login` first.');
    throw new Error(`anchor: gh pr view failed: ${view.stderr.trim()}`);
  }
  const meta = JSON.parse(view.stdout);
  const diff = runCmd('gh', ['pr', 'diff', target.selector], { cwd, env });
  if (diff.code !== 0) throw new Error(`anchor: gh pr diff failed: ${diff.stderr.trim()}`);
  return withStats({
    mode: 'pr',
    prNumber: String(meta.number),
    prUrl: meta.url,
    files: parseUnifiedDiff(diff.stdout),
  });
}
```

…and update the call site: `if (target.mode === 'pr') return prMode(target, cwd, env);`

- [ ] **Step 4: Run all tests to verify they pass (including no regressions)**

```bash
pnpm test && pnpm test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/diff.mjs lib/git.mjs tests/integration/diff-pr.test.mjs
git commit -m "feat: PR-mode diff via gh pr diff with mocked-gh tests"
```

---

### Task 11: `lib/context.mjs` — related files via grep + import resolution

**Files:**
- Create: `lib/context.mjs`
- Test: `tests/integration/context.test.mjs`

Spec refs: §9 context shape `{ files: [{ path, reason: "importer"|"importee"|"definition" }] }`; honors `max_files` and `ignore`; `git grep` finds nothing → empty context, silent.

- [ ] **Step 1: Write the failing tests**

`tests/integration/context.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { getContext, parseImports, resolveImport } from '../../lib/context.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'src/util.ts': 'export const x = 1;\n',
  'src/consumer.ts': "import { x } from './util';\nexport const y = x + 1;\n",
  'src/main.ts': "import { y } from './consumer';\nconsole.log(y);\n",
  'src/unrelated.ts': 'export const z = 0;\n',
  'src/util.test.ts': "import { x } from './util';\n",
});
afterAll(() => repo.cleanup());

describe('parseImports', () => {
  it('extracts ES import specifiers', () => {
    expect(parseImports(`import { a } from './a';\nimport b from "../b";\n`)).toEqual(['./a', '../b']);
  });
  it('extracts require specifiers', () => {
    expect(parseImports("const a = require('./a');\n")).toEqual(['./a']);
  });
});

describe('resolveImport', () => {
  it('resolves relative specifiers trying known extensions', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', './util')).toBe('src/util.ts');
  });
  it('returns null for unresolvable specifiers', () => {
    expect(resolveImport(repo.dir, 'src/consumer.ts', './missing')).toBeNull();
  });
});

describe('getContext', () => {
  it('finds importers and importees of changed files', () => {
    const ctx = getContext({ files: ['src/consumer.ts'], repoDir: repo.dir, maxFiles: 50, ignore: [] });
    const byReason = (r) => ctx.files.filter((f) => f.reason === r).map((f) => f.path);
    expect(byReason('importer')).toContain('src/main.ts');
    expect(byReason('importee')).toContain('src/util.ts');
    expect(ctx.files.map((f) => f.path)).not.toContain('src/unrelated.ts');
    expect(ctx.files.map((f) => f.path)).not.toContain('src/consumer.ts'); // changed files excluded
  });
  it('applies ignore patterns', () => {
    const ctx = getContext({ files: ['src/util.ts'], repoDir: repo.dir, maxFiles: 50, ignore: ['**/*.test.ts'] });
    expect(ctx.files.map((f) => f.path)).not.toContain('src/util.test.ts');
  });
  it('caps at maxFiles', () => {
    const ctx = getContext({ files: ['src/consumer.ts'], repoDir: repo.dir, maxFiles: 1, ignore: [] });
    expect(ctx.files.length).toBeLessThanOrEqual(1);
  });
  it('no matches → empty list, no throw', () => {
    const ctx = getContext({ files: ['src/unrelated.ts'], repoDir: repo.dir, maxFiles: 50, ignore: ['**/*.test.ts'] });
    expect(Array.isArray(ctx.files)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/context.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/context.mjs`**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, normalize } from 'node:path';
import { runGit } from './git.mjs';
import { filterIgnored } from './ignore.mjs';

const IMPORT_RE = /(?:import\s[^'"]*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.js', '.py'];
const GREP_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.py'];

/** Extract import/require specifiers from source text. */
export function parseImports(src) {
  const specs = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec && !specs.includes(spec)) specs.push(spec);
  }
  return specs;
}

/** Resolve a relative import from `fromFile` to a repo-relative path, or null. */
export function resolveImport(repoDir, fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(fromFile), spec));
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(join(repoDir, candidate))) return candidate;
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getContext({ files, repoDir, maxFiles = 50, ignore = [] }) {
  const related = new Map(); // path → reason (first reason wins)
  const changed = new Set(files);

  for (const f of files) {
    const stem = basename(f, extname(f));
    if (stem) {
      const grep = runGit(
        ['grep', '-lE', `(import|from|require).*${escapeRe(stem)}`, '--', ...GREP_GLOBS],
        { cwd: repoDir },
      );
      // grep exits 1 on no matches — that is fine (spec: silent empty context)
      for (const p of grep.stdout.split('\n').filter(Boolean)) {
        if (!changed.has(p) && !related.has(p)) related.set(p, 'importer');
      }
    }
    const abs = join(repoDir, f);
    if (existsSync(abs)) {
      for (const spec of parseImports(readFileSync(abs, 'utf8'))) {
        const resolved = resolveImport(repoDir, f, spec);
        if (resolved && !changed.has(resolved) && !related.has(resolved)) {
          related.set(resolved, 'importee');
        }
      }
    }
  }

  const list = filterIgnored([...related.keys()], ignore)
    .slice(0, maxFiles)
    .map((path) => ({ path, reason: related.get(path) }));
  return { files: list };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration tests/integration/context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/context.mjs tests/integration/context.test.mjs
git commit -m "feat: grep-based related-file context gatherer"
```

---

### Task 12: `lib/learn.mjs` — learnings CRUD

**Files:**
- Create: `lib/learn.mjs`
- Test: `tests/unit/learn.test.mjs`

Spec refs: §5 learnings format (H3 headings + `<!-- reason: ... -->`), §9 (dedupe case-insensitive, validate non-empty), §11 (empty pattern → bail; duplicate → dedupe silently).

- [ ] **Step 1: Write the failing tests**

`tests/unit/learn.test.mjs`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLearnings, addLearning, removeLearning } from '../../lib/learn.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'anchor-learn-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const FILE = () => join(dir, '.anchor', 'learnings.md');

describe('addLearning', () => {
  it('creates the file on first add (spec: silent creation)', () => {
    const r = addLearning(dir, 'Missing docstrings on private methods', 'project style');
    expect(r.added).toBe(true);
    expect(existsSync(FILE())).toBe(true);
    const text = readFileSync(FILE(), 'utf8');
    expect(text).toContain('### Missing docstrings on private methods');
    expect(text).toContain('<!-- reason: project style -->');
  });
  it('dedupes case-insensitively', () => {
    addLearning(dir, 'Use == for string equality');
    const r = addLearning(dir, 'USE == FOR STRING EQUALITY');
    expect(r.added).toBe(false);
    expect(r.deduped).toBe(true);
    expect(listLearnings(dir).patterns).toHaveLength(1);
  });
  it('throws on empty pattern', () => {
    expect(() => addLearning(dir, '')).toThrow(/pattern cannot be empty/);
    expect(() => addLearning(dir, '   ')).toThrow(/pattern cannot be empty/);
  });
});

describe('listLearnings', () => {
  it('empty when no file', () => {
    expect(listLearnings(dir).patterns).toEqual([]);
  });
  it('returns headings and reasons', () => {
    addLearning(dir, 'Pattern A', 'why A');
    addLearning(dir, 'Pattern B');
    const { patterns } = listLearnings(dir);
    expect(patterns).toEqual([
      { heading: 'Pattern A', reason: 'why A' },
      { heading: 'Pattern B', reason: null },
    ]);
  });
});

describe('removeLearning', () => {
  it('removes by case-insensitive substring', () => {
    addLearning(dir, 'Unused parameters in event handlers', 'interface contract');
    addLearning(dir, 'Pattern B');
    const r = removeLearning(dir, 'unused parameters');
    expect(r.removed).toBe(1);
    const { patterns } = listLearnings(dir);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].heading).toBe('Pattern B');
  });
  it('returns removed: 0 when nothing matches', () => {
    addLearning(dir, 'Pattern A');
    expect(removeLearning(dir, 'zzz').removed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/learn.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/learn.mjs`**

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HEADER = `# Anchor Learnings

<!--
This file is auto-managed by Anchor. Each entry is a "noise pattern" the
user has marked as not worth surfacing in future reviews. Edit by hand or
via \`anchor learn add|remove\`.
-->
`;

function filePath(repoDir) {
  return join(repoDir, '.anchor', 'learnings.md');
}

function parse(text) {
  const patterns = [];
  const re = /^### (.+)\n(?:<!-- reason: (.*?) -->\n?)?/gm;
  for (const m of text.matchAll(re)) {
    patterns.push({ heading: m[1].trim(), reason: m[2]?.trim() ?? null });
  }
  return patterns;
}

function serialize(patterns) {
  const body = patterns
    .map((p) => `### ${p.heading}\n${p.reason ? `<!-- reason: ${p.reason} -->\n` : ''}`)
    .join('\n');
  return `${HEADER}\n${body}`;
}

export function listLearnings(repoDir) {
  const f = filePath(repoDir);
  if (!existsSync(f)) return { patterns: [] };
  return { patterns: parse(readFileSync(f, 'utf8')) };
}

export function addLearning(repoDir, pattern, reason) {
  const heading = (pattern ?? '').trim();
  if (!heading) throw new Error('anchor: pattern cannot be empty');
  const { patterns } = listLearnings(repoDir);
  if (patterns.some((p) => p.heading.toLowerCase() === heading.toLowerCase())) {
    return { added: false, deduped: true };
  }
  patterns.push({ heading, reason: reason?.trim() || null });
  mkdirSync(dirname(filePath(repoDir)), { recursive: true });
  writeFileSync(filePath(repoDir), serialize(patterns));
  return { added: true, deduped: false };
}

export function removeLearning(repoDir, substring) {
  const needle = (substring ?? '').trim().toLowerCase();
  if (!needle) throw new Error('anchor: pattern cannot be empty');
  const { patterns } = listLearnings(repoDir);
  const kept = patterns.filter((p) => !p.heading.toLowerCase().includes(needle));
  const removed = patterns.length - kept.length;
  if (removed > 0) writeFileSync(filePath(repoDir), serialize(kept));
  return { removed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/learn.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/learn.mjs tests/unit/learn.test.mjs
git commit -m "feat: learnings CRUD with dedupe"
```

---

### Task 13: `lib/review.mjs` — review archiver

**Files:**
- Create: `lib/review.mjs`
- Test: `tests/unit/review.test.mjs`

Spec refs: §9 — `save(content)` writes `.anchor/reviews/<date>-<sha>.md` with frontmatter (date, sha, target, score, severity counts); list/show parse frontmatter.

- [ ] **Step 1: Write the failing tests**

`tests/unit/review.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { saveReview, listReviews, showReview } from '../../lib/review.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('saveReview', () => {
  it('writes to .anchor/reviews/<date>-<sha>.md with frontmatter', () => {
    const { path } = saveReview(repo.dir, '# The review body\n', {
      target: 'main..feature', score: 4, severities: { critical: 0, high: 1, medium: 0, low: 2 },
    });
    expect(path).toMatch(/\.anchor\/reviews\/\d{4}-\d{2}-\d{2}-[0-9a-f]+\.md$/);
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('target: main..feature');
    expect(text).toContain('score: 4');
    expect(text).toContain('# The review body');
  });
  it('honors an explicit path override', () => {
    const { path } = saveReview(repo.dir, 'body', { path: `${repo.dir}/.anchor/reviews/custom.md` });
    expect(path.endsWith('custom.md')).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});

describe('listReviews / showReview', () => {
  it('lists newest first with parsed metadata', () => {
    const all = listReviews(repo.dir);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0]).toHaveProperty('date');
    expect(all[0]).toHaveProperty('sha');
    expect(all[0]).toHaveProperty('score');
  });
  it('shows a review by sha substring', () => {
    const all = listReviews(repo.dir);
    const found = showReview(repo.dir, all[0].sha);
    expect(found.content).toContain('review body');
  });
  it('returns null for unknown sha', () => {
    expect(showReview(repo.dir, 'ffffffff')).toBeNull();
  });
  it('empty list when no reviews dir', () => {
    const fresh = makeFixtureRepo({});
    expect(listReviews(fresh.dir)).toEqual([]);
    fresh.cleanup();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/review.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/review.mjs`**

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { shortHead } from './git.mjs';

function reviewsDir(repoDir) {
  return join(repoDir, '.anchor', 'reviews');
}

export function saveReview(repoDir, content, meta = {}) {
  const date = meta.date ?? new Date().toISOString().slice(0, 10);
  const sha = meta.sha ?? shortHead(repoDir) ?? 'nosha';
  mkdirSync(reviewsDir(repoDir), { recursive: true });
  const path = meta.path ?? join(reviewsDir(repoDir), `${date}-${sha}.md`);
  const fm = {
    date,
    sha,
    target: meta.target ?? '',
    score: meta.score ?? null,
    severities: meta.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
  };
  writeFileSync(path, stringifyFrontmatter(fm, content));
  return { path };
}

export function listReviews(repoDir) {
  const dir = reviewsDir(repoDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .map((file) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      return { file: join(dir, file), date: data.date ?? null, sha: data.sha ?? null, target: data.target ?? '', score: data.score ?? null, severities: data.severities ?? null };
    });
}

export function showReview(repoDir, sha) {
  const match = listReviews(repoDir).find((r) => r.file.includes(sha) || r.sha === sha);
  if (!match) return null;
  return { content: readFileSync(match.file, 'utf8') };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/review.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/review.mjs tests/unit/review.test.mjs
git commit -m "feat: review archive save/list/show"
```

---

### Task 14: `lib/init.mjs` — codebase map/graph data gatherer

**Files:**
- Create: `lib/init.mjs`
- Test: `tests/integration/init.test.mjs`

Spec refs: §9 init JSON shape; §7b Step 1; §11 (no commits → warn + empty history; `gh` missing → skip PRs with message; honors `.anchorignore`). Pure data gatherer — the LLM writes the actual markdown files.

- [ ] **Step 1: Write the failing tests**

`tests/integration/init.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { gatherInitData } from '../../lib/init.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'package.json': '{"name":"fixture"}\n',
  'src/index.ts': "import { util } from './util';\nexport default util;\n",
  'src/util.ts': 'export const util = 1;\n',
  'tests/util.test.ts': "import { util } from '../src/util';\n",
  'docs/readme.md': '# fixture\n',
});
// add history: modify util twice so it becomes a hot file
writeFiles(repo.dir, { 'src/util.ts': 'export const util = 2;\n' });
commitAll(repo.dir, 'feat: bump util');
writeFiles(repo.dir, { 'src/util.ts': 'export const util = 3;\n' });
commitAll(repo.dir, 'fix: bump util again');
afterAll(() => repo.cleanup());

describe('gatherInitData', () => {
  const data = gatherInitData(repo.dir, { depth: 50, noPrs: true });

  it('structure: top-level dirs, counts, language mix', () => {
    expect(data.structure.topLevelDirs).toEqual(expect.arrayContaining(['src', 'tests', 'docs']));
    expect(data.structure.fileCount).toBeGreaterThanOrEqual(5);
    expect(data.structure.languageMix['.ts']).toBeGreaterThanOrEqual(3);
  });
  it('structure: notable files include entrypoint and config', () => {
    const reasons = Object.fromEntries(data.structure.notableFiles.map((f) => [f.path, f.reason]));
    expect(reasons['src/index.ts']).toBe('entrypoint');
    expect(reasons['package.json']).toBe('config');
  });
  it('dependencyGraph: modules with imports/importedBy', () => {
    const src = data.dependencyGraph.modules.find((m) => m.path === 'src');
    const tests = data.dependencyGraph.modules.find((m) => m.path === 'tests');
    expect(tests.imports).toContain('src');
    expect(src.importedBy).toContain('tests');
  });
  it('dependencyGraph: hot files ranked by change count', () => {
    expect(data.dependencyGraph.hotFiles[0].path).toBe('src/util.ts');
    expect(data.dependencyGraph.hotFiles[0].changeCount).toBeGreaterThanOrEqual(3);
  });
  it('dependencyGraph: critical files ranked by import count', () => {
    const paths = data.dependencyGraph.criticalFiles.map((f) => f.path);
    expect(paths).toContain('src/util.ts');
  });
  it('history: commits with style detection', () => {
    expect(data.history.recentCommits.length).toBeGreaterThanOrEqual(3);
    expect(data.history.recentCommits[0]).toHaveProperty('sha');
    expect(data.history.recentCommits[0]).toHaveProperty('subject');
    expect(data.history.commitMessageStyle.conventionalCommits).toBe(true);
  });
  it('pullRequests null when noPrs', () => {
    expect(data.pullRequests).toBeNull();
  });
  it('--no-graph skips the graph', () => {
    const d = gatherInitData(repo.dir, { noPrs: true, noGraph: true });
    expect(d.dependencyGraph).toBeNull();
  });
  it('honors .anchorignore', () => {
    writeFiles(repo.dir, { '.anchorignore': 'docs/**\n' });
    commitAll(repo.dir, 'chore: add anchorignore');
    const d = gatherInitData(repo.dir, { noPrs: true });
    expect(d.structure.topLevelDirs).not.toContain('docs');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/init.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/init.mjs`**

```js
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { runGit, runCmd, hasCmd } from './git.mjs';
import { filterIgnored, DEFAULT_IGNORE_DIRS } from './ignore.mjs';
import { parseImports, resolveImport } from './context.mjs';

const CONVENTIONAL_RE = /^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\(.+\))?!?:/;
const CONFIG_NAMES = new Set(['package.json', 'tsconfig.json', 'Makefile', 'pyproject.toml', 'Cargo.toml', 'go.mod']);

export function gatherInitData(repoDir, { depth = 100, prLimit = 50, noPrs = false, noGraph = false } = {}) {
  const warnings = [];
  const files = listFiles(repoDir);
  const { history, hotFiles } = buildHistory(repoDir, depth, warnings);
  const structure = buildStructure(repoDir, files, hotFiles);
  const dependencyGraph = noGraph ? null : buildGraph(repoDir, files, hotFiles);
  const pullRequests = noPrs ? null : buildPrs(repoDir, prLimit, warnings);
  return { structure, dependencyGraph, history, pullRequests, warnings };
}

function listFiles(repoDir) {
  const out = runGit(['ls-files'], { cwd: repoDir }).stdout.split('\n').filter(Boolean);
  const anchorignore = join(repoDir, '.anchorignore');
  const userPatterns = existsSync(anchorignore)
    ? readFileSync(anchorignore, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  return filterIgnored(out, [...DEFAULT_IGNORE_DIRS, ...userPatterns]);
}

function buildStructure(repoDir, files, hotFiles) {
  const topLevelDirs = [...new Set(files.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
  const languageMix = {};
  for (const f of files) {
    const ext = extname(f);
    if (ext) languageMix[ext] = (languageMix[ext] ?? 0) + 1;
  }
  const notable = new Map();
  for (const f of files) {
    const name = basename(f);
    if (/^(index|main|app)\.(ts|tsx|js|jsx|mjs|py)$/.test(name) || f.startsWith('bin/')) {
      notable.set(f, 'entrypoint');
    } else if (CONFIG_NAMES.has(name) || /\.config\.(ts|js|mjs|json)$/.test(name)) {
      if (!notable.has(f)) notable.set(f, 'config');
    }
  }
  const bySize = files
    .map((f) => ({ f, size: safeSize(join(repoDir, f)) }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
  for (const { f } of bySize) if (!notable.has(f)) notable.set(f, 'large');
  for (const { path } of hotFiles.slice(0, 5)) if (files.includes(path) && !notable.has(path)) notable.set(path, 'recently-changed');
  return {
    topLevelDirs,
    fileCount: files.length,
    languageMix,
    notableFiles: [...notable.entries()].slice(0, 15).map(([path, reason]) => ({ path, reason })),
  };
}

function safeSize(p) {
  try { return statSync(p).size; } catch { return 0; }
}

function buildHistory(repoDir, depth, warnings) {
  const log = runGit(['log', '-n', String(depth), '--format=%h|%aI|%an|%s'], { cwd: repoDir });
  if (log.code !== 0 || !log.stdout.trim()) {
    warnings.push('anchor: no commits found. Init will only build the structure and graph.');
    return {
      history: { recentCommits: [], commitMessageStyle: { conventionalCommits: false, avgSubjectLength: 0, commonPrefixes: [] } },
      hotFiles: [],
    };
  }
  const recentCommits = log.stdout.trim().split('\n').map((l) => {
    const [sha, date, author, ...rest] = l.split('|');
    return { sha, date, author, subject: rest.join('|'), filesChanged: 0 };
  });

  const numstat = runGit(['log', '-n', String(depth), '--numstat', '--format=@%h'], { cwd: repoDir }).stdout;
  const changeCounts = new Map();
  let currentSha = null;
  const perCommit = new Map();
  for (const line of numstat.split('\n')) {
    if (line.startsWith('@')) { currentSha = line.slice(1); continue; }
    const m = /^\d+\t\d+\t(.+)$/.exec(line) ?? /^-\t-\t(.+)$/.exec(line);
    if (m && currentSha) {
      changeCounts.set(m[1], (changeCounts.get(m[1]) ?? 0) + 1);
      perCommit.set(currentSha, (perCommit.get(currentSha) ?? 0) + 1);
    }
  }
  for (const c of recentCommits) c.filesChanged = perCommit.get(c.sha) ?? 0;
  const hotFiles = [...changeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, changeCount]) => ({ path, changeCount }));

  const subjects = recentCommits.map((c) => c.subject);
  const conventional = subjects.filter((s) => CONVENTIONAL_RE.test(s)).length / subjects.length >= 0.6;
  const avgSubjectLength = Math.round(subjects.reduce((s, x) => s + x.length, 0) / subjects.length);
  const firstWords = new Map();
  for (const s of subjects) {
    const w = (s.split(/[\s:]/)[0] ?? '').toLowerCase();
    if (w) firstWords.set(w, (firstWords.get(w) ?? 0) + 1);
  }
  const commonPrefixes = [...firstWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

  return {
    history: { recentCommits, commitMessageStyle: { conventionalCommits: conventional, avgSubjectLength, commonPrefixes } },
    hotFiles,
  };
}

function buildGraph(repoDir, files, hotFiles) {
  const moduleOf = (f) => (f.includes('/') ? f.split('/')[0] : '.');
  const moduleImports = new Map(); // module → Set(module)
  const importTargets = new Map(); // file → import count
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|py)$/.test(f)) continue;
    const abs = join(repoDir, f);
    if (!existsSync(abs)) continue;
    for (const spec of parseImports(readFileSync(abs, 'utf8'))) {
      const target = resolveImport(repoDir, f, spec);
      if (!target) continue;
      importTargets.set(target, (importTargets.get(target) ?? 0) + 1);
      const from = moduleOf(f);
      const to = moduleOf(target);
      if (from !== to) {
        if (!moduleImports.has(from)) moduleImports.set(from, new Set());
        moduleImports.get(from).add(to);
      }
    }
  }
  const allModules = [...new Set(files.map(moduleOf))];
  const modules = allModules.map((path) => ({
    path,
    imports: [...(moduleImports.get(path) ?? [])],
    importedBy: allModules.filter((other) => moduleImports.get(other)?.has(path)),
  }));
  const criticalFiles = [...importTargets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, importCount]) => ({ path, importCount }));
  return { modules, hotFiles, criticalFiles };
}

function buildPrs(repoDir, prLimit, warnings) {
  if (!hasCmd('gh')) {
    warnings.push('anchor: gh not available; skipping PR analysis. Use --no-prs to silence this message.');
    return null;
  }
  const r = runCmd('gh', ['pr', 'list', '--state', 'all', '--limit', String(prLimit), '--json', 'number,title,author,state,additions,deletions'], { cwd: repoDir });
  if (r.code !== 0) {
    warnings.push('anchor: gh pr list failed; skipping PR analysis.');
    return null;
  }
  let prs;
  try { prs = JSON.parse(r.stdout); } catch { return null; }
  return {
    recent: prs.map((p) => ({
      number: p.number, title: p.title, author: p.author?.login ?? '', state: p.state,
      reviewComments: 0, additions: p.additions ?? 0, deletions: p.deletions ?? 0,
    })),
    recurringThemes: [], // extracted by the LLM in a second pass (spec §9)
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration tests/integration/init.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/init.mjs tests/integration/init.test.mjs
git commit -m "feat: init data gatherer (structure, graph, history, PRs)"
```

---

### Task 15: `lib/status.mjs` — status summary

**Files:**
- Create: `lib/status.mjs`
- Test: `tests/integration/status.test.mjs`

Spec refs: §9 status JSON shape + text rendering; §11 (no `.anchor/` → minimal status with hint; no reviews → "never"; outside repo → bail handled by dispatcher).

- [ ] **Step 1: Write the failing tests**

`tests/integration/status.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getStatus, renderStatusText } from '../../lib/status.mjs';
import { saveReview } from '../../lib/review.mjs';
import { addLearning } from '../../lib/learn.mjs';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('getStatus', () => {
  it('minimal status when no .anchor dir', () => {
    const s = getStatus(repo.dir);
    expect(s.lastReview).toBeNull();
    expect(s.artifacts.codebaseMap).toBeNull();
    expect(s.artifacts.learnings.count).toBe(0);
    expect(s.git.clean).toBe(true);
    expect(typeof s.nextSuggestion).toBe('string');
  });
  it('reports last review, learnings, artifacts', () => {
    saveReview(repo.dir, '# review', {
      target: 'main..f', score: 4, severities: { critical: 0, high: 0, medium: 1, low: 2 },
    });
    addLearning(repo.dir, 'A pattern');
    mkdirSync(join(repo.dir, '.anchor'), { recursive: true });
    writeFileSync(join(repo.dir, '.anchor', 'codebase-map.md'),
      '---\nbuilt: 2026-06-08\nfileCount: 12\n---\n\n# Map\n');
    const s = getStatus(repo.dir);
    expect(s.lastReview.score).toBe(4);
    expect(s.lastReview.openFindings).toEqual({ critical: 0, high: 0, medium: 1, low: 2 });
    expect(s.artifacts.learnings.count).toBe(1);
    expect(s.artifacts.codebaseMap.fileCount).toBe(12);
    expect(s.artifacts.codebaseMap.built).toBe('2026-06-08');
  });
  it('detects a dirty working tree and suggests a review', () => {
    writeFileSync(join(repo.dir, 'a.txt'), 'changed\n');
    const s = getStatus(repo.dir);
    expect(s.git.clean).toBe(false);
    expect(s.nextSuggestion).toContain('/anchor review');
  });
});

describe('renderStatusText', () => {
  it('renders the headline sections', () => {
    const text = renderStatusText(getStatus(repo.dir));
    expect(text).toContain('Anchor Status');
    expect(text).toContain('Last review:');
    expect(text).toContain('Learnings:');
    expect(text).toContain('Next:');
  });
  it('shows "never" when there is no review', () => {
    const fresh = makeFixtureRepo({});
    const text = renderStatusText(getStatus(fresh.dir));
    expect(text).toContain('never');
    fresh.cleanup();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/status.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/status.mjs`**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { runGit, runCmd, hasCmd } from './git.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { listReviews } from './review.mjs';
import { listLearnings } from './learn.mjs';

function artifactInfo(repoDir, name) {
  const p = join(repoDir, '.anchor', name);
  if (!existsSync(p)) return null;
  const { data } = parseFrontmatter(readFileSync(p, 'utf8'));
  const built = data.built ? String(data.built) : null;
  const ageDays = built ? Math.max(0, Math.floor((Date.now() - new Date(built).getTime()) / 86400000)) : null;
  const info = { built, ageDays };
  if (data.fileCount !== undefined) info.fileCount = data.fileCount;
  return info;
}

export function getStatus(repoDir) {
  const root = repoDir;

  const reviews = listReviews(root);
  const last = reviews[0] ?? null;
  const lastReview = last
    ? {
        date: last.date, sha: last.sha, target: last.target, score: last.score,
        fileCount: null,
        openFindings: last.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
        archivePath: last.file,
      }
    : null;

  const artifacts = {
    codebaseMap: artifactInfo(root, 'codebase-map.md'),
    codebaseGraph: artifactInfo(root, 'codebase-graph.md'),
    learnings: { count: listLearnings(root).patterns.length },
  };

  const porcelain = runGit(['status', '--porcelain'], { cwd: root });
  const clean = porcelain.stdout.trim() === '';
  const unpushedR = runGit(['log', '@{u}..', '--oneline'], { cwd: root });
  const unpushedCommits = unpushedR.code === 0 ? unpushedR.stdout.split('\n').filter(Boolean).length : 0;

  let openPrs = [];
  if (hasCmd('gh')) {
    const r = runCmd('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,baseRefName,updatedAt'], { cwd: root });
    if (r.code === 0) {
      try {
        openPrs = JSON.parse(r.stdout).map((p) => ({
          number: p.number, title: p.title, branch: p.headRefName,
          baseBranch: p.baseRefName, lastActivity: p.updatedAt, reviewCount: 0,
        }));
      } catch { openPrs = []; }
    }
  }

  let nextSuggestion;
  if (openPrs.length > 0) {
    nextSuggestion = `PR #${openPrs[0].number} is awaiting review. Try: /anchor review pr ${openPrs[0].number}`;
  } else if (!clean) {
    nextSuggestion = 'You have uncommitted changes. Try: /anchor review';
  } else if (unpushedCommits > 0) {
    nextSuggestion = `You have ${unpushedCommits} unpushed commit(s). Try: /anchor review @{u}..HEAD`;
  } else {
    nextSuggestion = 'All clean — run /anchor review when you have new changes';
  }

  return {
    repo: { path: root, name: basename(root) },
    lastReview,
    artifacts,
    git: { clean, unpushedCommits, openPrs },
    nextSuggestion,
  };
}

export function renderStatusText(s) {
  const lines = [];
  lines.push('Anchor Status');
  lines.push('─────────────');
  lines.push(`Repo:           ${s.repo.path}`);
  lines.push('');
  if (s.lastReview) {
    lines.push(`Last review:    ${s.lastReview.date} (${s.lastReview.target || 'unknown target'})`);
    lines.push(`                score: ${s.lastReview.score ?? '?'}/5`);
    lines.push(`                archive: ${s.lastReview.archivePath}`);
    const f = s.lastReview.openFindings;
    lines.push(`Open findings:  ${f.critical} critical, ${f.high} high, ${f.medium} medium, ${f.low} low (from last review)`);
  } else {
    lines.push('Last review:    never');
  }
  lines.push('');
  const map = s.artifacts.codebaseMap;
  const graph = s.artifacts.codebaseGraph;
  lines.push(`Codebase map:   ${map ? `built ${map.built} (${map.ageDays} days ago)${map.fileCount ? ` — ${map.fileCount} files` : ''}` : 'not built — run /anchor init'}`);
  lines.push(`Graph:          ${graph ? `built ${graph.built} (${graph.ageDays} days ago)` : 'not built'}`);
  lines.push(`Learnings:      ${s.artifacts.learnings.count} patterns`);
  lines.push('');
  lines.push(`Git status:     ${s.git.clean ? '✓ working tree clean' : '⚠ uncommitted changes'}`);
  lines.push(`                ${s.git.unpushedCommits === 0 ? '✓ 0 unpushed commits' : `⚠ ${s.git.unpushedCommits} unpushed commits`}`);
  if (s.git.openPrs.length > 0) {
    for (const pr of s.git.openPrs) {
      lines.push(`                ⚠ PR #${pr.number} open (${pr.branch} → ${pr.baseBranch})`);
    }
  } else {
    lines.push('                ✓ no open PRs');
  }
  lines.push('');
  lines.push(`Next:           ${s.nextSuggestion}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration tests/integration/status.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs tests/integration/status.test.mjs
git commit -m "feat: status summary with next-step suggestion"
```

---

### Task 16: Wire all subcommands into `bin/anchor.mjs` — Phase 1 gate

**Files:**
- Modify: `bin/anchor.mjs` (add diff, context, learn, review, status, init handlers + diff size limits)
- Test: `tests/integration/cli-full.test.mjs`

Spec refs: §9 command surface; §11 (not-a-repo bail; diff size limits with hint; config warnings to stderr).

- [ ] **Step 1: Write the failing integration tests**

`tests/integration/cli-full.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({
  'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
  'src/b.ts': 'export const b = 1;\n',
});
afterAll(() => repo.cleanup());

function anchor(args, opts = {}) {
  return spawnSync('node', [BIN, ...args], { cwd: opts.cwd ?? repo.dir, encoding: 'utf8', input: opts.input });
}

describe('anchor CLI end-to-end', () => {
  it('diff: structured JSON for uncommitted changes', () => {
    writeFileSync(join(repo.dir, 'src/a.ts'), "import { b } from './b';\nexport const a = b + 1;\n");
    const r = anchor(['diff']);
    const d = JSON.parse(r.stdout);
    expect(d.mode).toBe('uncommitted');
    expect(d.files[0].path).toBe('src/a.ts');
  });
  it('diff: bails with hint when over max_diff_lines', () => {
    writeFileSync(join(repo.dir, '.anchor-tmp-big.txt'), 'x\n'); // ensure repo dirty
    writeFileSync(join(repo.dir, 'src/big.ts'), 'export const big = [\n' + '1,\n'.repeat(3000) + '];\n');
    repo.git('add', '-A');
    const r = anchor(['diff']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/diff is [\d,]+ lines \(max is 2,?000\)/);
    repo.git('reset');
  });
  it('context: --from-diff finds related files', () => {
    const r = anchor(['context', '--from-diff', '--max-files', '10']);
    const c = JSON.parse(r.stdout);
    expect(c.files.map((f) => f.path)).toContain('src/b.ts');
  });
  it('learn: add / list / remove round-trip + gitignore side-effect', () => {
    expect(anchor(['learn', 'add', 'Noise pattern X', '--reason', 'testing']).status).toBe(0);
    const list = JSON.parse(anchor(['learn', 'list']).stdout);
    expect(list.patterns[0].heading).toBe('Noise pattern X');
    expect(readFileSync(join(repo.dir, '.gitignore'), 'utf8')).toContain('.anchor/learnings.md');
    expect(JSON.parse(anchor(['learn', 'remove', 'noise pattern']).stdout).removed).toBe(1);
  });
  it('learn: duplicate add reports dedupe on stderr', () => {
    anchor(['learn', 'add', 'Dup pattern']);
    const r = anchor(['learn', 'add', 'Dup pattern']);
    expect(r.stderr).toContain('already in learnings');
  });
  it('review save: reads stdin, archives with frontmatter', () => {
    const r = anchor(['review', 'save'], { input: '# A review\nbody\n' });
    const { path } = JSON.parse(r.stdout);
    expect(existsSync(path)).toBe(true);
    const shown = anchor(['review', 'list']);
    expect(JSON.parse(shown.stdout).length).toBeGreaterThanOrEqual(1);
  });
  it('status: json and text', () => {
    const j = JSON.parse(anchor(['status']).stdout);
    expect(j).toHaveProperty('nextSuggestion');
    const t = anchor(['status', '--format', 'text']);
    expect(t.stdout).toContain('Anchor Status');
  });
  it('init: emits raw data payload', () => {
    const r = anchor(['init', '--no-prs']);
    const d = JSON.parse(r.stdout);
    expect(d.structure.fileCount).toBeGreaterThan(0);
    expect(d.dependencyGraph.modules.length).toBeGreaterThan(0);
  });
  it('bails outside a git repo', () => {
    const r = anchor(['diff'], { cwd: '/tmp' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not a git repository');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/cli-full.test.mjs`
Expected: FAIL — unknown subcommands print usage.

- [ ] **Step 3: Extend `bin/anchor.mjs`**

Add imports at the top:

```js
import { readFileSync } from 'node:fs';
import { getDiff } from '../lib/diff.mjs';
import { getContext } from '../lib/context.mjs';
import { listLearnings, addLearning, removeLearning } from '../lib/learn.mjs';
import { saveReview, listReviews, showReview } from '../lib/review.mjs';
import { gatherInitData } from '../lib/init.mjs';
import { getStatus, renderStatusText } from '../lib/status.mjs';
import { ensureGitignore } from '../lib/config.mjs';
import { isGitRepo } from '../lib/git.mjs';
```

Add a repo guard helper and the new handlers inside `HANDLERS` (keep `doctor`/`config` from Task 7):

```js
function requireRepo() {
  if (!isGitRepo(process.cwd())) {
    throw new Error('anchor: not a git repository. Run from inside a repo.');
  }
}

function loadCfg() {
  const { config, warnings } = loadConfig(process.cwd());
  for (const w of warnings) process.stderr.write(w + '\n');
  return config;
}
```

```js
  diff(rest, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const d = getDiff(rawTokens, { cwd: process.cwd() });
    d.files = d.files.filter((f) => !isIgnored(f.path, config.ignore));
    const totalLines = d.files.reduce((s, f) => s + f.added + f.removed, 0);
    if (totalLines > config.max_diff_lines) {
      throw new Error(
        `anchor: diff is ${totalLines.toLocaleString()} lines (max is ${config.max_diff_lines.toLocaleString()}). ` +
        'Adjust .anchor/config.yaml → max_diff_lines, or split the PR.',
      );
    }
    if (d.files.length > config.max_files) {
      throw new Error(
        `anchor: diff touches ${d.files.length} files (max is ${config.max_files}). ` +
        'Adjust .anchor/config.yaml → max_files, or split the PR.',
      );
    }
    emit(d, flags);
  },

  context(rest, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const maxFiles = Number(flags.get('max-files') ?? 50);
    let files;
    if (flags.has('from-diff')) {
      const targetTokens = typeof flags.get('from-diff') === 'string' ? [flags.get('from-diff')] : rest;
      files = getDiff(targetTokens, { cwd: process.cwd() }).files.map((f) => f.path);
    } else {
      files = rest;
    }
    emit(getContext({ files, repoDir: process.cwd(), maxFiles, ignore: config.ignore }), flags);
  },

  learn(rest, flags) {
    requireRepo();
    const [action, ...args] = rest;
    if (action === 'list') return emit(listLearnings(process.cwd()), flags);
    if (action === 'add') {
      ensureGitignore(process.cwd());
      const r = addLearning(process.cwd(), args.join(' '), flags.get('reason'));
      if (r.deduped) process.stderr.write('↪ already in learnings, skipped\n');
      return emit(r, flags);
    }
    if (action === 'remove') return emit(removeLearning(process.cwd(), args.join(' ')), flags);
    throw new Error('anchor: learn needs add|list|remove');
  },

  review(rest, flags) {
    requireRepo();
    const [action, ...args] = rest;
    if (action === 'save') {
      ensureGitignore(process.cwd());
      const content = readFileSync(0, 'utf8'); // stdin
      return emit(saveReview(process.cwd(), content, { path: args[0], target: flags.get('target') }), flags);
    }
    if (action === 'list') return emit(listReviews(process.cwd()), flags);
    if (action === 'show') {
      const r = showReview(process.cwd(), args[0] ?? '');
      if (!r) throw new Error(`anchor: no archived review matching "${args[0]}"`);
      return process.stdout.write(r.content);
    }
    throw new Error('anchor: review needs save|list|show');
  },

  status(rest, flags) {
    requireRepo();
    emit(getStatus(process.cwd()), flags, renderStatusText);
  },

  init(rest, flags) {
    requireRepo();
    const data = gatherInitData(process.cwd(), {
      depth: Number(flags.get('depth') ?? 100),
      noPrs: flags.has('no-prs'),
      noGraph: flags.has('no-graph'),
    });
    for (const w of data.warnings) process.stderr.write(w + '\n');
    emit(data, flags);
  },
```

Wiring notes:
- Add `isIgnored` to the `lib/ignore.mjs` import and `loadConfig` is already imported from Task 7.
- Change the dispatch call at the bottom to also pass raw tokens: `handler(positional, flags, rest)` — `rest` is the original argv slice after the subcommand (needed by `diff`/`context` so flags like `--staged` reach `getDiff`).
- Update `USAGE` to list all subcommands.

- [ ] **Step 4: Run the full suite + typecheck**

```bash
pnpm test && pnpm test:integration && pnpm typecheck
```

Expected: all PASS. **Phase 1 gate: scripts work standalone against fixture repos; `anchor init` returns the raw payload; `anchor status` returns a valid status object.**

- [ ] **Step 5: Commit**

```bash
git add bin/anchor.mjs tests/integration/cli-full.test.mjs
git commit -m "feat: wire diff/context/learn/review/status/init into the CLI with limits"
```

# Phase 2 — Skill

### Task 17: Templates + `skill/SKILL.md`

**Files:**
- Create: `templates/config.yaml`
- Create: `templates/learnings.md`
- Create: `skill/SKILL.md`

No automated test — SKILL.md is LLM instructions, validated by the manual smoke test (Task 18) and golden snapshots (Task 21). Verification here = frontmatter parses + files exist.

- [ ] **Step 1: Write `templates/config.yaml`** (the spec §5 example, used by the skill when a user asks for a starter config)

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

# How aggressively the LLM should look for issues (prior, not filter).
#   1 = verbose, 2 = balanced (default), 3 = critical-only
strictness: 2

# Maximum number of findings to surface per review. Default: 50.
max_findings: 50

# Categories to focus on. Default: all.
# Options: logic, security, perf, style, docs, tests
categories:
  - logic
  - security
  - perf

# Confidence floor. Findings the LLM rates below this are not surfaced. 0-5.
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

- [ ] **Step 2: Write `templates/learnings.md`**

```markdown
# Anchor Learnings

<!--
This file is auto-managed by Anchor. Each entry is a "noise pattern" the
user has marked as not worth surfacing in future reviews. Edit by hand or
via `anchor learn add|remove`.
-->
```

- [ ] **Step 3: Write `skill/SKILL.md`** (complete content below — this is the heart of Anchor)

````markdown
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
  <file>:<line>  ·  <category>
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
````

- [ ] **Step 4: Verify frontmatter parses**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
const { data } = parseFrontmatter(readFileSync('skill/SKILL.md', 'utf8'));
if (data.name !== 'anchor' || !data['argument-hint'].includes('status')) process.exit(1);
console.log('SKILL.md frontmatter OK:', JSON.stringify(data['argument-hint']));
"
```

Expected: `SKILL.md frontmatter OK: "[init|diff|context|review|learn|status|doctor|full] [target]"`.

- [ ] **Step 5: Commit**

```bash
git add templates/ skill/SKILL.md
git commit -m "feat: anchor skill (review + init workflows) and templates"
```

---

### Task 18: Slash command + `make install` + smoke test doc

**Files:**
- Create: `commands/anchor.md`
- Create: `tests/manual/SMOKE.md`
- Modify: `Makefile` (add `install` target)

- [ ] **Step 1: Write `commands/anchor.md`** (spec §4)

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
- `init [--refresh] [--depth N] [--no-prs] [--no-graph]`
                      → read ~/.claude/skills/anchor/SKILL.md and follow
                        the init workflow. Builds/refreshes
                        .anchor/codebase-map.md and .anchor/codebase-graph.md.
- `diff [target]`     → run `anchor diff <target>`, show the result
- `context [target]`  → run `anchor context --from-diff <target>`, show the result
- `review [target]`   → read ~/.claude/skills/anchor/SKILL.md and follow
                        the full review workflow, present the review in chat
- `full [target]`     → first run `anchor doctor`; bail if any check fails.
                        Then run the full review workflow. Then auto-archive
                        the review to .anchor/reviews/<date>-<sha>.md. Show
                        diff summary, related files consulted, learnings
                        applied, then the review itself.
- `learn <add|list|remove> [args]` → run `anchor learn <sub> <args>`
- `status`            → run `anchor status --format text`, show the summary
- `doctor`            → run `anchor doctor --format text`, show the report
- (no args)           → default to `review` (uncommitted changes)
```

- [ ] **Step 2: Add `install` to the `Makefile`** (insert above `link`; keep everything else)

```makefile
install:
	pnpm install
	@$(MAKE) -s link
	@chmod +x $(ANCHOR_DIR)/hooks/post-push-reminder.sh 2>/dev/null || true
	@node $(ANCHOR_DIR)/bin/install-posttool-hook.mjs 2>/dev/null || true
	@echo ""
	@echo "Anchor installed. To initialize a codebase map for a repo:"
	@echo "  cd <your-repo> && claude   # then run /anchor init"
	@echo ""
	@echo "To install the pre-push reminder hook in a specific repo:"
	@echo "  cd <your-repo> && make -f $(ANCHOR_DIR)/Makefile install-hook"
	@echo ""
```

(The two hook lines no-op gracefully until Tasks 19-20 create those files; after Task 20 remove the `2>/dev/null || true` guards so failures surface.) Add `install` to `.PHONY`.

- [ ] **Step 3: Write `tests/manual/SMOKE.md`** — the 24-item checklist from spec §10 Layer 4, verbatim (items 0-23). Copy the fenced block from the spec section "Layer 4 — Manual smoke test" in `docs/superpowers/specs/2026-06-09-anchor-design.md` into this file under a `# Anchor Manual Smoke Test` heading, as a markdown checklist (`- [ ]` per item).

- [ ] **Step 4: Verify the install + Phase 2 gate (manual, in Claude Code)**

```bash
make install      # symlinks + (later) hooks
ls -la ~/.claude/skills/anchor/SKILL.md ~/.claude/commands/anchor.md ~/bin/anchor
~/bin/anchor doctor --format text
```

Expected: all three symlinks resolve; doctor's `skill symlink` and `command symlink` checks now pass. Then **in a Claude Code session in a real repo**: run `/anchor init`, verify map + graph are written; run `/anchor review` on a small change, verify the §8-format output renders with a Context used footer; run `/anchor status`. This is the Phase 2 gate (SMOKE items 0-8).

- [ ] **Step 5: Commit**

```bash
git add commands/anchor.md tests/manual/SMOKE.md Makefile
git commit -m "feat: /anchor slash command, make install, manual smoke checklist"
```

# Phase 2b — Push reminder

### Task 19: Git pre-push hook + Makefile install-hook/uninstall-hook

**Files:**
- Create: `hooks/pre-push`
- Modify: `Makefile` (add `install-hook`, `uninstall-hook`)
- Test: `tests/integration/hooks.test.mjs`

Spec refs: §7c (git has no post-push hook — `pre-push` prints the reminder and exits 0, never blocking the push; `ANCHOR_NO_REMIND=1` opt-out); §11 (install-hook outside a repo → bail; existing hook → don't clobber).

- [ ] **Step 1: Write the failing tests**

`tests/integration/hooks.test.mjs`:

```js
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'hooks', 'pre-push');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

describe('hooks/pre-push', () => {
  it('prints the reminder and exits 0', () => {
    const r = spawnSync('bash', [HOOK, 'origin', 'git@github.com:me/repo.git'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[anchor]');
    expect(r.stdout).toContain('/anchor review');
    expect(r.stdout).toContain('/anchor status');
  });
  it('is silent when ANCHOR_NO_REMIND=1', () => {
    const r = spawnSync('bash', [HOOK, 'origin', 'url'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
      env: { ...process.env, ANCHOR_NO_REMIND: '1' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
  it('a real git push triggers it without blocking', () => {
    // a bare repo as the remote — pushing to a non-bare checkout is refused by git
    const remote = mkdtempSync(join(tmpdir(), 'anchor-remote-'));
    spawnSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
    copyFileSync(HOOK, join(repo.dir, '.git', 'hooks', 'pre-push'));
    chmodSync(join(repo.dir, '.git', 'hooks', 'pre-push'), 0o755);
    const r = spawnSync('git', ['push', '--dry-run', remote, 'main'], {
      cwd: repo.dir, encoding: 'utf8',
    });
    rmSync(remote, { recursive: true, force: true });
    expect(r.status).toBe(0); // push not blocked
    expect(r.stdout + r.stderr).toContain('[anchor]');
  });
});

describe('make install-hook / uninstall-hook', () => {
  function make(target, cwd, extra = []) {
    return spawnSync('make', ['-f', join(ROOT, 'Makefile'), target, ...extra], { cwd, encoding: 'utf8' });
  }
  it('installs into the current repo and is idempotent-guarded', () => {
    const r1 = make('install-hook', repo.dir);
    expect(r1.status).toBe(0);
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-push'))).toBe(true);
    const r2 = make('install-hook', repo.dir); // already exists, no FORCE
    expect(r2.status).not.toBe(0);
    expect(r2.stdout + r2.stderr).toContain('already exists');
    const r3 = make('install-hook', repo.dir, ['FORCE=1']);
    expect(r3.status).toBe(0);
  });
  it('uninstall removes the hook', () => {
    const r = make('uninstall-hook', repo.dir);
    expect(r.status).toBe(0);
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-push'))).toBe(false);
  });
  it('bails outside a git repo', () => {
    const r = make('install-hook', '/tmp');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('must be run from inside a git repo');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration tests/integration/hooks.test.mjs`
Expected: FAIL — `hooks/pre-push` missing, make targets missing.

- [ ] **Step 3: Write `hooks/pre-push`**

```bash
#!/usr/bin/env bash
# Anchor pre-push reminder. Git invokes this when `git push` runs.
# It only prints a reminder — it always exits 0 and never blocks the push.
# Opt out with ANCHOR_NO_REMIND=1, or remove via `make uninstall-hook`.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

remote="${1:-origin}"
branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo '?')"

echo ""
echo "[anchor] Pushing to ${remote}/${branch}."
echo "  To review these commits after the push:  /anchor review @{u}..HEAD"
echo "  To review the PR (if any):               /anchor review pr <number>"
echo "  Or run /anchor status for a repo summary."
echo ""
exit 0
```

```bash
chmod +x hooks/pre-push
```

- [ ] **Step 4: Add the Make targets** (append to `Makefile`, keep `ANCHOR_DIR` from Task 7)

```makefile
# Installs the pre-push reminder hook into the .git of the *current* directory.
# Run from inside a target repo:  make -f <anchor-repo>/Makefile install-hook
install-hook:
	@test -d .git || { echo "anchor: install-hook must be run from inside a git repo."; exit 1; }
	@if [ -f .git/hooks/pre-push ] && [ "$(FORCE)" != "1" ]; then \
		echo "anchor: .git/hooks/pre-push already exists. Re-run with FORCE=1 to overwrite."; exit 1; \
	fi
	@cp $(ANCHOR_DIR)/hooks/pre-push .git/hooks/pre-push
	@chmod +x .git/hooks/pre-push
	@echo "Anchor pre-push hook installed in $$(pwd)"

uninstall-hook:
	@rm -f .git/hooks/pre-push
	@echo "Anchor pre-push hook removed from $$(pwd)"
```

Add both to `.PHONY`. (Deviation from spec §11: the "Overwrite? [y/N]" prompt is replaced by a non-interactive `FORCE=1` guard so agent/CI invocations can't hang; same protection, scriptable.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:integration tests/integration/hooks.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-push Makefile tests/integration/hooks.test.mjs
git commit -m "feat: git pre-push reminder hook with install/uninstall targets"
```

---

### Task 20: Claude Code PostToolUse hook + idempotent settings installer

**Files:**
- Create: `hooks/post-push-reminder.sh`
- Create: `lib/posttool-hook.mjs`
- Create: `bin/install-posttool-hook.mjs`
- Test: `tests/unit/posttool-hook.test.mjs`
- Test: `tests/integration/posttool-hook-script.test.mjs`
- Modify: `Makefile` (drop the `2>/dev/null || true` guards on the two hook lines in `install`)

Spec refs: §7c flavor 2, §12 (PostToolUse JSON; additive, non-destructive settings edit); §11 (malformed settings.json → warn, skip, exit 0).

- [ ] **Step 1: Write the failing unit tests for the pure settings editor**

`tests/unit/posttool-hook.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { addHookEntry } from '../../lib/posttool-hook.mjs';

const SCRIPT = '/home/me/anchor/hooks/post-push-reminder.sh';

describe('addHookEntry', () => {
  it('adds hooks structure to empty settings', () => {
    const { settings, changed } = addHookEntry({}, SCRIPT);
    expect(changed).toBe(true);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0]).toEqual({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: SCRIPT }],
    });
  });
  it('preserves existing unrelated hooks (additive)', () => {
    const existing = {
      hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/other.sh' }] }] },
      model: 'opus',
    };
    const { settings } = addHookEntry(existing, SCRIPT);
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.model).toBe('opus');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('/other.sh');
  });
  it('is idempotent', () => {
    const once = addHookEntry({}, SCRIPT).settings;
    const { settings, changed } = addHookEntry(once, SCRIPT);
    expect(changed).toBe(false);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });
  it('does not mutate the input object', () => {
    const input = {};
    addHookEntry(input, SCRIPT);
    expect(input).toEqual({});
  });
});
```

- [ ] **Step 2: Write the failing integration test for the hook script**

`tests/integration/posttool-hook-script.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'post-push-reminder.sh');

function runHook(toolInput, env = {}) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: toolInput }),
    env: { ...process.env, ...env },
  });
}

describe('hooks/post-push-reminder.sh', () => {
  it('emits additionalContext when the command is a git push', () => {
    const r = runHook({ command: 'git push origin main' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(out.hookSpecificOutput.additionalContext).toContain('/anchor review');
  });
  it('matches git push embedded in a compound command', () => {
    const r = runHook({ command: 'git add -A && git commit -m x && git push' });
    expect(JSON.parse(r.stdout).hookSpecificOutput).toBeTruthy();
  });
  it('stays silent for non-push commands', () => {
    const r = runHook({ command: 'git status' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
  it('stays silent when ANCHOR_NO_REMIND=1', () => {
    const r = runHook({ command: 'git push' }, { ANCHOR_NO_REMIND: '1' });
    expect(r.stdout.trim()).toBe('');
  });
  it('tolerates malformed stdin', () => {
    const r = spawnSync('bash', [SCRIPT], { encoding: 'utf8', input: 'not json{{' });
    expect(r.status).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test tests/unit/posttool-hook.test.mjs
pnpm test:integration tests/integration/posttool-hook-script.test.mjs
```

Expected: both FAIL — files missing.

- [ ] **Step 4: Write `lib/posttool-hook.mjs`**

```js
/** Pure, idempotent, additive edit of a Claude Code settings object. */
export function addHookEntry(settings, scriptPath) {
  const next = structuredClone(settings ?? {});
  next.hooks ??= {};
  next.hooks.PostToolUse ??= [];
  const exists = next.hooks.PostToolUse.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command === scriptPath),
  );
  if (exists) return { settings: next, changed: false };
  next.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: scriptPath }],
  });
  return { settings: next, changed: true };
}
```

- [ ] **Step 5: Write `bin/install-posttool-hook.mjs`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { addHookEntry } from '../lib/posttool-hook.mjs';

const settingsPath = join(homedir(), '.claude', 'settings.json');
const anchorRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hookScript = join(anchorRoot, 'hooks', 'post-push-reminder.sh');

let current = {};
if (existsSync(settingsPath)) {
  try {
    current = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    console.error('anchor: ~/.claude/settings.json is invalid JSON. Skipping PostToolUse hook install. Fix it manually.');
    process.exit(0);
  }
}

const { settings, changed } = addHookEntry(current, hookScript);
if (!changed) {
  console.log('anchor: PostToolUse hook already installed.');
  process.exit(0);
}
mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`anchor: PostToolUse hook installed (${hookScript}).`);
```

```bash
chmod +x bin/install-posttool-hook.mjs
```

- [ ] **Step 6: Write `hooks/post-push-reminder.sh`**

```bash
#!/usr/bin/env bash
# Claude Code PostToolUse hook: after the Bash tool runs a `git push`,
# inject context asking Claude to offer an Anchor review. Opt out with
# ANCHOR_NO_REMIND=1 or by removing the entry from ~/.claude/settings.json.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

cmd="$(node --input-type=module -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    process.stdout.write((j.tool_input && j.tool_input.command) || "");
  } catch {}
});
' 2>/dev/null)"

case "$cmd" in
  "git push"*|*"&& git push"*|*"; git push"*)
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"The user just ran `git push`. Offer to run /anchor review on either (1) the latest pushed commits, or (2) the PR if one was created or updated. Wait for their answer before invoking."}}
EOF
    ;;
esac
exit 0
```

```bash
chmod +x hooks/post-push-reminder.sh
```

- [ ] **Step 7: Update the Makefile `install` target** — remove the `2>/dev/null || true` from the `chmod` and `node .../install-posttool-hook.mjs` lines (the files now exist; failures should surface).

- [ ] **Step 8: Run all tests to verify they pass**

```bash
pnpm test && pnpm test:integration
```

Expected: all PASS. Then verify install end-to-end: `make install` → check `~/.claude/settings.json` gained the PostToolUse entry (and re-running prints "already installed"). **Phase 2b gate: `git push` prints the reminder without blocking; PostToolUse hook fires inside Claude Code (SMOKE items 9-11).**

- [ ] **Step 9: Commit**

```bash
git add hooks/post-push-reminder.sh lib/posttool-hook.mjs bin/install-posttool-hook.mjs Makefile tests/unit/posttool-hook.test.mjs tests/integration/posttool-hook-script.test.mjs
git commit -m "feat: Claude Code PostToolUse push reminder with idempotent settings install"
```

---

# Phase 3 — Polish

### Task 21: Examples + golden snapshot tests

**Files:**
- Create: `examples/good-review.md`, `examples/bad-review.md`
- Create: `tests/golden/golden.test.mjs`

**Design decision (spec §10 Layer 3, adapted):** the spec imagines snapshotting LLM review output, but Anchor cannot invoke an LLM headlessly (the whole architecture forbids it). What IS deterministic — and what actually drifts when scripts change — is the data fed to the LLM. So golden tests snapshot the combined script outputs (`diff` + `context` + `learnings`) for four fixture scenarios. LLM output quality is covered by `tests/manual/SMOKE.md` instead. Model-tagged LLM snapshots can be recorded manually later if wanted.

- [ ] **Step 1: Write `examples/good-review.md`** — a complete, realistic instance of the §8 output format: 1 HIGH finding (timing-attack `==` in `src/auth/login.ts:42` with `crypto.timingSafeEqual` suggested fix), 1 MEDIUM (`src/api/users.ts:88` unhandled promise rejection), confidence 3/5, What's good with 2 bullets, full Next steps + Context used footers. Use the §8 spec block as the template, filling every placeholder with the concrete example content.

- [ ] **Step 2: Write `examples/bad-review.md`** — the same diff reviewed badly, with an `> ⚠` annotation under each antipattern: invented nitpicks to fill quota, vague findings without file:line, suggested fix that doesn't compile, missing severity grouping, no confidence reasoning, flagging a pattern the learnings file suppresses, omitting the Context used footer.

- [ ] **Step 3: Write `tests/golden/golden.test.mjs`**

```js
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { getDiff } from '../../lib/diff.mjs';
import { getContext } from '../../lib/context.mjs';
import { listLearnings, addLearning } from '../../lib/learn.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

/** Each scenario builds a repo, applies a change, and snapshots the
 *  deterministic review inputs (diff + context + learnings). */
const SCENARIOS = {
  'clean-refactor': (repo) => {
    writeFiles(repo.dir, { 'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n' });
  },
  'security-bug': (repo) => {
    writeFiles(repo.dir, {
      'src/auth.ts': "export function check(input, stored) {\n  return input.hash == stored.hash;\n}\n",
    });
  },
  'perf-issue': (repo) => {
    writeFiles(repo.dir, {
      'src/find.ts': 'export const find = (xs, ys) => xs.filter((x) => ys.includes(x));\n',
    });
  },
  'noisy-style': (repo) => {
    addLearning(repo.dir, 'Missing docstrings on private methods', 'project style');
    writeFiles(repo.dir, { 'src/helper.ts': 'function _internal() { return 1; }\nexport const h = _internal;\n' });
  },
};

const BASE = {
  'src/sum.ts': 'export function sum(a: number, b: number) {\n  return a + b;\n}\n',
  'src/auth.ts': 'export function check(input, stored) {\n  return false;\n}\n',
  'src/find.ts': 'export const find = (xs, ys) => xs;\n',
  'src/helper.ts': 'export const h = 1;\n',
  'src/app.ts': "import { sum } from './sum';\nimport { check } from './auth';\nexport default { sum, check };\n",
};

describe('golden review inputs', () => {
  for (const [name, apply] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      const repo = makeFixtureRepo(BASE);
      try {
        apply(repo);
        const diff = getDiff([], { cwd: repo.dir });
        const context = getContext({
          files: diff.files.map((f) => f.path),
          repoDir: repo.dir,
          maxFiles: 50,
          ignore: [],
        });
        const learnings = listLearnings(repo.dir);
        const payload = { diff, context, learnings };
        await expect(JSON.stringify(payload, null, 2)).toMatchFileSnapshot(
          join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', `${name}.json`),
        );
      } finally {
        repo.cleanup();
      }
    });
  }
});
```

- [ ] **Step 4: Record and verify the snapshots**

```bash
pnpm test:golden            # first run records tests/golden/__snapshots__/*.json
pnpm test:golden            # second run must pass against the recorded files
git diff --stat             # eyeball the snapshots: 4 files, sane content
```

Expected: 4 scenarios pass on the second run. To intentionally update after a script change: `pnpm test:golden -- --update`. **Phase 3 partial gate.**

- [ ] **Step 5: Commit**

```bash
git add examples/ tests/golden/
git commit -m "test: golden snapshots of review inputs + example reviews"
```

---

### Task 22: README, CHANGELOG, full verification — release v0.1.0

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Anchor

Personal code review for Claude Code. A `/anchor` slash command + skill backed
by small deterministic scripts. The LLM is your active Claude Code session —
no API keys, no servers, no per-call cost.

## Install

```bash
git clone <this-repo> && cd anchor
make install        # pnpm install + symlinks + Claude Code push reminder
```

Then in any repo, inside Claude Code:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Targets: `(none)` uncommitted · `--staged` · `main..feature` · `pr 123` ·
`pr <url>` · `@path/to/file`.

Optional per-repo push reminder: `cd <repo> && make -f <anchor>/Makefile install-hook`.

## Layout

- `skill/SKILL.md` — the review + init workflows Claude follows
- `commands/anchor.md` — the `/anchor` slash command
- `bin/anchor.mjs`, `lib/` — deterministic scripts (diff, context, learn, status, doctor)
- `.anchor/` (in *your* repo, gitignored) — config, learnings, codebase map, archived reviews

## Develop

```bash
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
```

Manual checklist: `tests/manual/SMOKE.md`. Design spec:
`docs/superpowers/specs/2026-06-09-anchor-design.md`.
```

- [ ] **Step 2: Write `CHANGELOG.md`**

```markdown
# Changelog

## v0.1.0 — 2026-06-XX

Initial release.

- `/anchor` slash command + skill: review, full, init, diff, context, learn, status, doctor
- Review workflow: severity-graded findings, 0–5 confidence, strictness prior,
  learnings suppression with always-on security carve-out, Context used footer
- PR mode: `gh pr diff` + PR/issue context + CI failure context
- `anchor init`: codebase map + grep-based module dependency graph
- Push reminders: git pre-push hook (opt-in per repo) + Claude Code PostToolUse hook
- Four test layers: unit, integration, golden input snapshots, manual smoke
```

(Replace `2026-06-XX` with the actual release date.)

- [ ] **Step 3: Run the complete verification suite**

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:golden
make -n install   # dry-run sanity: targets expand correctly
```

Expected: everything green. Fix anything that isn't before proceeding.

- [ ] **Step 4: Walk `tests/manual/SMOKE.md` in Claude Code** (items 0-23). This is the Phase 3 → Phase 4 gate; items that need a real GitHub PR (12, 13, 16, 17) can be done on the first dogfood repo.

- [ ] **Step 5: Commit and tag**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README and v0.1.0 changelog"
git tag v0.1.0
```

---

# Phase 4 — Dogfood (no tasks)

Use Anchor on real personal projects for a week (spec §13). Capture friction
as issues; feed recurring review noise into `/anchor learn`. Phase 4 is done
when the workflow feels natural and catches real issues.

---

## Plan notes — deviations from the spec (all intentional, all small)

1. **PR diff uses `gh pr diff`** instead of §9's 5-step fetch dance — §9's own command table blesses this; forks/cross-repo are handled by `gh` itself.
2. **`install-hook` overwrite prompt → `FORCE=1` guard** — non-interactive-safe; same protection (§11 row adapted).
3. **Golden tests snapshot review *inputs*, not LLM output** — headless LLM calls are architecturally impossible (the spec's own constraint); LLM behavior is covered by SMOKE.md.
4. **`templates/review-format.md` omitted** — the output format lives in SKILL.md §Step 7; a second copy would drift (DRY).
5. **`reviewCount`/`reviewComments` from `gh pr list` default to 0** — not available in the list JSON without extra per-PR calls; YAGNI for v0.1.0.
6. **`anchor review --explain <sha>`** (spec §4 table) is served by `anchor review show <sha>` — the slash command maps `--explain` to `review show`.
7. **`--dir` flag not implemented in v0.1.0** — the spec's not-a-repo error text mentioned it; the message here says "Run from inside a repo." Add `--dir` later if dogfooding wants it.
8. **`anchor context <file> --depth N` (transitive context depth) not implemented** — v0.1.0 context is direct importers/importees only (depth 1). The flag parses but is ignored; deepen later if reviews feel under-contexted.



