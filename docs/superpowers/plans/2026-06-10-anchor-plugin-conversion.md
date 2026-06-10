# Anchor v0.2.0 Plugin Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Anchor from a symlink-installed personal tool into a formal Claude Code plugin distributed from a personal GitHub marketplace, per the approved spec `docs/superpowers/specs/2026-06-10-anchor-plugin-design.md`.

**Architecture:** The anchor repo becomes the plugin in place: a `.claude-plugin/plugin.json` manifest, the skill moved to `skills/anchor/`, a declarative `hooks/hooks.json` for the PostToolUse reminder, and a committed esbuild single-file bundle (`dist/anchor.mjs`) that the skill invokes by plugin-relative path. A new `anchor hook install|uninstall` CLI subcommand replaces the Makefile git-hook targets. A second tiny repo (`<gh-user>/claude-plugins`) is the marketplace catalog.

**Tech Stack:** Node ≥18 ESM (.mjs) + JSDoc, esbuild (new devDep, build only), vitest, pnpm, js-yaml + minimatch (inlined into the bundle).

**Worker notes:**
- Run all commands from `/home/mjenkins/github/anchor` unless stated.
- `<gh-user>` = output of `gh api user -q .login`. Resolve it when first needed; never hardcode a guess.
- After every task: `pnpm test && pnpm test:integration && pnpm test:golden && pnpm typecheck` must be green before committing (plus any task-specific verification).
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Documented deviations from the spec

1. **Skill CLI invocations (spec §6):** instead of mechanically rewriting every `anchor <sub>` occurrence in the skill body, the new preamble defines once: "`anchor <args>` means `node "<plugin-root>/dist/anchor.mjs" <args>`". One unambiguous definition, ~15 fewer fragile edits, same behavior.
2. **Hook script byte-identity (spec §8):** one comment line changes (`remove via \`make uninstall-hook\`` → `remove via \`anchor hook uninstall\``) so the installed hook doesn't reference a deleted make target. The `# Anchor pre-push reminder` marker line is unchanged, so v0.1.0-installed hooks remain recognized.
3. **Bundle smoke test uses `config validate` + `diff`, not `doctor` (spec §10):** doctor's exit code depends on host environment; the smoke test must pass identically on any machine.
4. **esbuild flags appear in both `package.json` (`bundle` script) and the freshness test.** Each site carries a "keep in sync" comment; the freshness test fails loudly if they drift from what produced the committed bundle.

## File structure (end state)

```
.claude-plugin/plugin.json                    NEW    manifest (Task 1)
skills/anchor/SKILL.md                        MOVED  from skill/SKILL.md (Task 1), content updated (Task 6)
commands/anchor.md                            KEPT   rewritten to defer to the skill (Task 6)
hooks/hooks.json                              NEW    declarative PostToolUse registration (Task 3)
hooks/post-push-reminder.sh                   KEPT   unchanged
lib/hook-script.mjs                           NEW    pre-push script as template string (Task 2)
lib/hook.mjs                                  NEW    installHook/uninstallHook (Task 2)
bin/anchor.mjs                                MOD    `hook` handler + USAGE (Task 2)
lib/doctor.mjs                                MOD    symlink checks → bundle/plugin checks (Task 5)
dist/anchor.mjs                               NEW    committed esbuild bundle (Task 4)
Makefile                                      MOD    slimmed; `bundle` target (Tasks 2,3,4)
package.json                                  MOD    esbuild devDep + bundle script (Task 4), v0.2.0 (Task 7)
tests/integration/hook-subcommand.test.mjs    NEW    ports hooks.test.mjs (Task 2)
tests/integration/bundle.test.mjs             NEW    freshness + smoke (Task 4)
tests/unit/doctor.test.mjs                    MOD    new check names (Task 5)
README.md / CHANGELOG.md / tests/manual/SMOKE.md  MOD  (Task 7)

DELETED: skill/ dir (T1) · hooks/pre-push, tests/integration/hooks.test.mjs,
Makefile install-hook/uninstall-hook (T2) · lib/posttool-hook.mjs,
bin/install-posttool-hook.mjs, tests/unit/posttool-hook.test.mjs (T3) ·
Makefile install/link (T4)

NEW REPO: ~/github/claude-plugins → <gh-user>/claude-plugins (Task 8)
```

---

### Task 1: Plugin manifest + skill relocation

**Files:**
- Create: `.claude-plugin/plugin.json`
- Move: `skill/SKILL.md` → `skills/anchor/SKILL.md` (content untouched in this task)

- [ ] **Step 1: Move the skill**

```bash
mkdir -p skills/anchor
git mv skill/SKILL.md skills/anchor/SKILL.md
```

Note: the Makefile `link` target still references `skill/SKILL.md` and is now stale; it is deleted in Task 4. Do not run `make link`/`make install` between Tasks 1 and 4.

- [ ] **Step 2: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "anchor",
  "description": "Personal code review: deterministic CLI gathers diff/context/learnings; the active Claude session reasons over them.",
  "version": "0.2.0",
  "author": { "name": "Mike Jenkins" }
}
```

- [ ] **Step 3: Verify manifest parses and skill frontmatter survived the move**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
const m = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8'));
if (m.name !== 'anchor' || m.version !== '0.2.0') process.exit(1);
const { data } = parseFrontmatter(readFileSync('skills/anchor/SKILL.md', 'utf8'));
if (data.name !== 'anchor') process.exit(1);
console.log('manifest + skill OK');
"
```

Expected: `manifest + skill OK`

- [ ] **Step 4: Full suite green** (`pnpm test && pnpm test:integration && pnpm test:golden && pnpm typecheck`)

- [ ] **Step 5: Commit**

```bash
git add -A .claude-plugin skills skill
git commit -m "feat: plugin manifest, skill moved to skills/anchor"
```

---

### Task 2: `anchor hook install|uninstall` subcommand

Replaces the Makefile `install-hook`/`uninstall-hook` targets and the `hooks/pre-push` file. TDD: port the old test coverage first.

**Files:**
- Create: `lib/hook-script.mjs`, `lib/hook.mjs`
- Create: `tests/integration/hook-subcommand.test.mjs`
- Modify: `bin/anchor.mjs` (imports, USAGE, HANDLERS)
- Modify: `Makefile` (delete `install-hook`, `uninstall-hook` targets, the pre-push chmod line, and their `.PHONY` entries)
- Delete: `hooks/pre-push`, `tests/integration/hooks.test.mjs`

- [ ] **Step 1: Write `lib/hook-script.mjs`**

Content matches v0.1.0 `hooks/pre-push` except the comment now names the new uninstall command (deviation #2). The marker constant is what `uninstallHook` greps for — it must remain a substring of the script.

```js
/** The git pre-push reminder script, installed by `anchor hook install`. */
export const MARKER = '# Anchor pre-push reminder';

export const PRE_PUSH_SCRIPT = `#!/usr/bin/env bash
# Anchor pre-push reminder. Git invokes this when \`git push\` runs.
# It only prints a reminder — it always exits 0 and never blocks the push.
# Opt out with ANCHOR_NO_REMIND=1, or remove via \`anchor hook uninstall\`.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

remote="\${1:-origin}"
branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo '?')"

echo ""
echo "[anchor] Pushing to \${remote}/\${branch}."
echo "  To review these commits after the push:  /anchor review @{u}..HEAD"
echo "  To review the PR (if any):               /anchor review pr <number>"
echo "  Or run /anchor status for a repo summary."
echo ""
exit 0
`;
```

(Backtick and `${...}` characters inside the template literal are escaped with `\` — the emitted file must match v0.1.0's `hooks/pre-push` apart from the comment line.)

- [ ] **Step 2: Write `lib/hook.mjs`**

```js
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { PRE_PUSH_SCRIPT, MARKER } from './hook-script.mjs';

function gitDirOf(repoDir) {
  const gitDir = join(repoDir, '.git');
  try {
    if (statSync(gitDir).isDirectory()) return gitDir;
  } catch {}
  return null; // absent, or a worktree/submodule .git FILE — both unsupported
}

export function installHook(repoDir, { force = false } = {}) {
  const gitDir = gitDirOf(repoDir);
  if (!gitDir) {
    throw new Error('anchor: hook install must be run from inside a git repo (worktrees/submodules not supported).');
  }
  const hookPath = join(gitDir, 'hooks', 'pre-push');
  if (existsSync(hookPath) && !force) {
    throw new Error('anchor: .git/hooks/pre-push already exists. Re-run with --force to overwrite.');
  }
  mkdirSync(join(gitDir, 'hooks'), { recursive: true });
  writeFileSync(hookPath, PRE_PUSH_SCRIPT, { mode: 0o755 });
  chmodSync(hookPath, 0o755); // mode option is ignored if the file pre-existed (--force path)
  return { installed: true, path: hookPath };
}

export function uninstallHook(repoDir) {
  const hookPath = join(repoDir, '.git', 'hooks', 'pre-push');
  if (!existsSync(hookPath)) {
    return { removed: false, message: 'no pre-push hook installed' };
  }
  if (!readFileSync(hookPath, 'utf8').includes(MARKER)) {
    throw new Error("anchor: existing .git/hooks/pre-push is not Anchor's — leaving it alone");
  }
  rmSync(hookPath);
  return { removed: true, path: hookPath };
}
```

- [ ] **Step 3: Write the failing tests** — `tests/integration/hook-subcommand.test.mjs`

This ports ALL coverage from `tests/integration/hooks.test.mjs` (3 script-behavior tests + 5 installer tests, adapted from make targets to the CLI).

```js
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(ROOT, 'bin', 'anchor.mjs');
const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
afterAll(() => repo.cleanup());

function anchor(args, cwd = repo.dir) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
}
const hookPath = () => join(repo.dir, '.git', 'hooks', 'pre-push');

describe('anchor hook install/uninstall', () => {
  it('installs into the current repo and is idempotent-guarded', () => {
    const r1 = anchor(['hook', 'install']);
    expect(r1.status).toBe(0);
    expect(JSON.parse(r1.stdout).installed).toBe(true);
    expect(existsSync(hookPath())).toBe(true);
    const r2 = anchor(['hook', 'install']); // already exists, no --force
    expect(r2.status).not.toBe(0);
    expect(r2.stderr).toContain('already exists');
    const r3 = anchor(['hook', 'install', '--force']);
    expect(r3.status).toBe(0);
  });

  it('installed script prints the reminder and exits 0', () => {
    const r = spawnSync('bash', [hookPath(), 'origin', 'git@github.com:me/repo.git'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[anchor]');
    expect(r.stdout).toContain('/anchor review');
    expect(r.stdout).toContain('/anchor status');
  });

  it('installed script is silent when ANCHOR_NO_REMIND=1', () => {
    const r = spawnSync('bash', [hookPath(), 'origin', 'url'], {
      cwd: repo.dir, encoding: 'utf8', input: '',
      env: { ...process.env, ANCHOR_NO_REMIND: '1' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('a real git push triggers it without blocking', () => {
    const remote = mkdtempSync(join(tmpdir(), 'anchor-remote-'));
    spawnSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
    const r = spawnSync('git', ['push', '--dry-run', remote, 'main'], {
      cwd: repo.dir, encoding: 'utf8',
    });
    rmSync(remote, { recursive: true, force: true });
    expect(r.status).toBe(0); // push not blocked
    expect(r.stdout + r.stderr).toContain('[anchor]');
  });

  it('uninstall removes the hook', () => {
    const r = anchor(['hook', 'uninstall']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).removed).toBe(true);
    expect(existsSync(hookPath())).toBe(false);
  });

  it('bails outside a git repo', () => {
    const out = mkdtempSync(join(tmpdir(), 'anchor-norepo-'));
    const r = anchor(['hook', 'install'], out);
    rmSync(out, { recursive: true, force: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('must be run from inside a git repo');
  });

  it('uninstall refuses to delete a non-anchor pre-push hook', () => {
    const customContent = '#!/bin/sh\necho mine\n';
    writeFileSync(hookPath(), customContent, { mode: 0o755 });
    try {
      const r = anchor(['hook', 'uninstall']);
      expect(r.status).not.toBe(0);
      expect(existsSync(hookPath())).toBe(true);
      expect(readFileSync(hookPath(), 'utf8')).toBe(customContent);
    } finally {
      rmSync(hookPath(), { force: true });
    }
  });

  it('uninstall reports cleanly when no hook installed', () => {
    rmSync(hookPath(), { force: true });
    const r = anchor(['hook', 'uninstall']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).message).toContain('no pre-push hook installed');
  });
});
```

Test-order note: the suite is sequential within the file (vitest runs tests in a file in order); the script-behavior tests rely on the install from the first test. Keep them in this order.

- [ ] **Step 4: Run to verify failure**

Run: `pnpm exec vitest run tests/integration/hook-subcommand.test.mjs`
Expected: FAIL — `anchor: hook` is an unknown subcommand (usage on stderr).

- [ ] **Step 5: Wire the handler in `bin/anchor.mjs`**

Add to the imports block:

```js
import { installHook, uninstallHook } from '../lib/hook.mjs';
```

Replace the USAGE line with:

```js
const USAGE = `usage: anchor <init|diff|context|review|learn|status|config|doctor|hook> [args] [--format json|text]`;
```

Add to `HANDLERS` (after `init`):

```js
  hook(positional, flags) {
    const [action] = positional;
    if (action === 'install') return emit(installHook(process.cwd(), { force: flags.has('force') }), flags);
    if (action === 'uninstall') return emit(uninstallHook(process.cwd()), flags);
    throw new Error('anchor: hook needs install|uninstall');
  },
```

(`--force` is boolean — do NOT add it to `VALUED`.)

- [ ] **Step 6: Run to verify pass**

Run: `pnpm exec vitest run tests/integration/hook-subcommand.test.mjs`
Expected: 8 passed.

- [ ] **Step 7: Delete the superseded pieces**

```bash
git rm hooks/pre-push tests/integration/hooks.test.mjs
```

In `Makefile`: delete the entire `install-hook:` and `uninstall-hook:` targets (including their comment block), delete the line
`@[ ! -f "$(ANCHOR_DIR)/hooks/pre-push" ] || chmod +x "$(ANCHOR_DIR)/hooks/pre-push"`
from the `install` target, and remove `install-hook uninstall-hook` from `.PHONY`.

- [ ] **Step 8: Full suite green** (`pnpm test && pnpm test:integration && pnpm test:golden && pnpm typecheck`)

- [ ] **Step 9: Commit**

```bash
git add -A lib/hook-script.mjs lib/hook.mjs bin/anchor.mjs Makefile tests/integration/
git commit -m "feat: anchor hook install|uninstall subcommand replaces make hook targets"
```

---

### Task 3: Declarative PostToolUse hook + delete settings-installer machinery

**Files:**
- Create: `hooks/hooks.json`
- Modify: `Makefile` (remove the installer line from `install`)
- Delete: `lib/posttool-hook.mjs`, `bin/install-posttool-hook.mjs`, `tests/unit/posttool-hook.test.mjs`

`tests/integration/posttool-hook-script.test.mjs` is KEPT unchanged — the script still ships and its behavior contract is unchanged.

- [ ] **Step 1: Write `hooks/hooks.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/post-push-reminder.sh\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate it is parseable JSON**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('hooks/hooks.json','utf8')); console.log('hooks.json OK')"
```

Expected: `hooks.json OK`

- [ ] **Step 3: Delete the settings-editing machinery**

```bash
git rm lib/posttool-hook.mjs bin/install-posttool-hook.mjs tests/unit/posttool-hook.test.mjs
```

In `Makefile`, delete this line from the `install` target:
`@[ ! -f "$(ANCHOR_DIR)/bin/install-posttool-hook.mjs" ] || node "$(ANCHOR_DIR)/bin/install-posttool-hook.mjs"`

- [ ] **Step 4: Full suite green** — unit count drops by 6 (the deleted `posttool-hook.test.mjs`); integration count unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A hooks/hooks.json Makefile lib bin tests
git commit -m "feat: declarative PostToolUse hook via hooks.json; drop settings installer"
```

---

### Task 4: esbuild bundle + Makefile rewrite + bundle tests

**Files:**
- Modify: `package.json` (esbuild devDep, `bundle` script)
- Rewrite: `Makefile`
- Create: `dist/anchor.mjs` (generated, committed)
- Create: `tests/integration/bundle.test.mjs`

- [ ] **Step 1: Add esbuild**

```bash
pnpm add -D esbuild
```

`pnpm-workspace.yaml` already contains the build approval (`esbuild: true`) — verify it is still there; if absent, add it and re-run `pnpm install`.

- [ ] **Step 2: Add the bundle script to `package.json` scripts**

```json
    "bundle": "esbuild bin/anchor.mjs --bundle --platform=node --format=esm --outfile=dist/anchor.mjs"
```

(Comment for future readers goes in the test file, not package.json — JSON has no comments. These flags must stay in sync with `tests/integration/bundle.test.mjs`.)

- [ ] **Step 3: Rewrite `Makefile`** (full replacement content)

```make
ANCHOR_DIR := $(shell cd "$$(dirname "$(MAKEFILE_LIST)")" && pwd -P)

bundle:
	pnpm run bundle
	@chmod +x "$(ANCHOR_DIR)/dist/anchor.mjs"
	@echo "bundled dist/anchor.mjs"

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

.PHONY: bundle build test test-integration test-golden clean
```

- [ ] **Step 4: Build and sanity-check the bundle**

```bash
make bundle
head -1 dist/anchor.mjs
node dist/anchor.mjs config validate
```

Expected: first line is `#!/usr/bin/env node` (esbuild preserves the entry hashbang); `config validate` prints `{ "valid": true, "warnings": [] }` and exits 0.

- [ ] **Step 5: Write the failing bundle tests** — `tests/integration/bundle.test.mjs`

```js
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { makeFixtureRepo } from '../helpers/fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist', 'anchor.mjs');

describe('dist/anchor.mjs bundle', () => {
  it('is fresh — rebuilding with the pinned esbuild reproduces the committed file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'anchor-bundle-'));
    const out = join(tmp, 'anchor.mjs');
    // Flags must match the "bundle" script in package.json — keep in sync.
    const r = spawnSync('pnpm', ['exec', 'esbuild', join(ROOT, 'bin', 'anchor.mjs'),
      '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`],
      { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const rebuilt = readFileSync(out, 'utf8');
    rmSync(tmp, { recursive: true, force: true });
    expect(readFileSync(DIST, 'utf8')).toBe(rebuilt);
  });

  it('runs standalone in a fixture repo (smoke: config validate + diff)', () => {
    const repo = makeFixtureRepo({ 'a.txt': 'x\n' });
    try {
      const c = spawnSync('node', [DIST, 'config', 'validate'], { cwd: repo.dir, encoding: 'utf8' });
      expect(c.status).toBe(0);
      expect(JSON.parse(c.stdout).valid).toBe(true);
      const d = spawnSync('node', [DIST, 'diff'], { cwd: repo.dir, encoding: 'utf8' });
      expect(d.status).toBe(0);
      expect(JSON.parse(d.stdout).mode).toBe('uncommitted');
    } finally {
      repo.cleanup();
    }
  });
});
```

- [ ] **Step 6: Run the bundle tests**

Run: `pnpm exec vitest run tests/integration/bundle.test.mjs`
Expected: 2 passed. (If freshness fails: rerun `make bundle` and check `git diff dist/` — the committed bundle must be the current build.)

- [ ] **Step 7: Full suite green**

- [ ] **Step 8: Commit** (dist is committed deliberately — it is a release artifact)

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml Makefile dist/anchor.mjs tests/integration/bundle.test.mjs
git commit -m "feat: committed esbuild bundle + bundle freshness/smoke tests; slim Makefile"
```

---

### Task 5: Doctor rework

**Files:**
- Modify: `lib/doctor.mjs`
- Modify: `tests/unit/doctor.test.mjs:13`

- [ ] **Step 1: Update the failing test first** — in `tests/unit/doctor.test.mjs`, replace the expected-names list (line 13):

```js
    for (const expected of ['git', 'gh', 'repo', 'bundle', 'plugin install', 'config', 'claude code', 'node']) {
```

Run: `pnpm exec vitest run tests/unit/doctor.test.mjs`
Expected: FAIL — `bundle` and `plugin install` are not produced yet.

- [ ] **Step 2: Rework `lib/doctor.mjs`**

Replace the imports block (homedir is no longer used; fileURLToPath is new):

```js
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGit, runCmd, isGitRepo } from './git.mjs';
import { loadConfig } from './config.mjs';
```

Delete the two blocks at lines 33–53 (the `symlinks` loop and the `bin symlink` check) and put this in their place:

```js
  // Where is this code running from? lib/doctor.mjs and the bundled
  // dist/anchor.mjs are both exactly one level below the package root.
  const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
  const underPluginCache = pkgRoot.includes(join('.claude', 'plugins', 'cache'));

  const bundlePath = join(pkgRoot, 'dist', 'anchor.mjs');
  const bundleOk = existsSync(bundlePath);
  add('bundle', bundleOk, bundleOk ? `${bundlePath} present` : `${bundlePath} missing`, {
    level: underPluginCache ? 'error' : 'warn', // missing bundle in a plugin install = broken release
    fix: 'Run /plugin update anchor (or `make bundle` in a dev checkout)',
  });

  add('plugin install', underPluginCache,
    underPluginCache
      ? `running from plugin cache (${pkgRoot})`
      : `running from source checkout (dev mode): ${pkgRoot}`,
    { level: 'warn', fix: 'Install via /plugin install anchor@claude-plugins for normal use' });
```

- [ ] **Step 3: Run to verify pass**

Run: `pnpm exec vitest run tests/unit/doctor.test.mjs`
Expected: PASS (the dev checkout has `dist/anchor.mjs` from Task 4, so `bundle` is ok; `plugin install` is a warn-level not-ok in dev, which doesn't flip overall `ok`).

- [ ] **Step 4: Refresh the bundle** — doctor.mjs is bundled code, so the committed bundle changed:

```bash
make bundle
```

- [ ] **Step 5: Full suite green** (including the bundle freshness test, which now requires the Step 4 rebuild)

- [ ] **Step 6: Commit**

```bash
git add lib/doctor.mjs tests/unit/doctor.test.mjs dist/anchor.mjs
git commit -m "feat: doctor checks bundle + install mode instead of symlinks"
```

---

### Task 6: Plugin-aware skill + slash command content

**Files:**
- Modify: `skills/anchor/SKILL.md` (frontmatter argument-hint, preamble, dispatch table)
- Rewrite: `commands/anchor.md`

- [ ] **Step 1: Update SKILL.md frontmatter** — replace the `argument-hint` line with:

```yaml
argument-hint: "[init|diff|context|review|learn|status|doctor|full|hook] [target]"
```

- [ ] **Step 2: Replace the SKILL.md preamble** — the paragraph under `# Anchor — Personal Code Review` currently reads:

```
Anchor reviews the user's code changes using deterministic scripts for data
gathering and YOU (the active LLM session) for the review reasoning. The
`anchor` CLI is on PATH. All scripts emit JSON by default.
```

Replace it with:

```
Anchor reviews the user's code changes using deterministic scripts for data
gathering and YOU (the active LLM session) for the review reasoning. All
scripts emit JSON by default.

**Locating the CLI:** `anchor` is NOT on PATH. This skill ships inside the
anchor plugin, and the harness shows `Base directory for this skill: <dir>`
when it loads — that directory is `<plugin-root>/skills/anchor`. Resolve the
plugin root (two directory levels up from the base directory) once. Then,
whenever this skill says to run `anchor <args>`, execute via Bash:

    node "<plugin-root>/dist/anchor.mjs" <args>

If there is no base-directory line or `dist/anchor.mjs` does not exist, tell
the user the anchor plugin install looks broken and suggest
`/plugin update anchor`. Do not guess paths.
```

- [ ] **Step 3: Add the hook row to the dispatch table** — after the `diff / context / learn / status / doctor` row, insert:

```
| `hook install` / `hook uninstall` | Run the matching `anchor hook ...` command in the current repo (manages the per-repo git pre-push reminder) |
```

- [ ] **Step 4: Rewrite `commands/anchor.md`** (full replacement content)

```markdown
---
description: >
  Run Anchor code review operations. Subcommands:
  init (build codebase map + graph on first install),
  diff (structured diff), context (related files), review (full review in chat),
  full (doctor + review + archive), learn (manage per-repo learnings),
  status (summarize repo + last review + git state),
  doctor (run diagnostics), hook (per-repo push reminder).
argument-hint: "[init|diff|context|review|learn|status|doctor|full|hook] [target]"
---

The user invoked Anchor with: $ARGUMENTS

Invoke the `anchor` skill (Skill tool) and follow its subcommand dispatch
table with these arguments. The skill knows how to locate the bundled anchor
CLI inside this plugin — do not assume an `anchor` command is on PATH.

Quick reference:
- `init [--refresh] [--depth N] [--no-prs] [--no-graph]` → init workflow
- `review [target]` → review workflow; `review --explain <sha>` / `full --explain <sha>`
  re-display an archived review (no new review)
- `full [target]` → doctor gate + review + auto-archive
- `diff` / `context` / `learn` / `status` / `doctor` / `hook` → run the matching
  CLI subcommand and show the result
- (no args) → review uncommitted changes
```

- [ ] **Step 5: Verify frontmatter still parses**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
for (const f of ['skills/anchor/SKILL.md', 'commands/anchor.md']) {
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (!data['argument-hint'].includes('hook')) { console.error(f + ' missing hook hint'); process.exit(1); }
}
console.log('frontmatter OK');
"
```

Expected: `frontmatter OK`

- [ ] **Step 6: Full suite green, commit**

```bash
git add skills/anchor/SKILL.md commands/anchor.md
git commit -m "feat: skill resolves bundled CLI from plugin root; command defers to skill"
```

---

### Task 7: Docs, versions, tag v0.2.0

**Files:**
- Modify: `README.md` (rewrite), `CHANGELOG.md` (prepend entry), `tests/manual/SMOKE.md` (items 6, 9, 11), `package.json` (version)

- [ ] **Step 1: Bump `package.json` version** to `"version": "0.2.0"`. (`.claude-plugin/plugin.json` is already 0.2.0 from Task 1.)

- [ ] **Step 2: Rewrite `README.md`** (full replacement content; replace `<gh-user>` with the real login from `gh api user -q .login`)

```markdown
# Anchor

Personal code review for Claude Code, packaged as a plugin. A `/anchor` slash
command + skill backed by small deterministic scripts. The LLM is your active
Claude Code session — no API keys, no servers, no per-call cost.

## Install

Inside Claude Code, on any machine:

```
/plugin marketplace add <gh-user>/claude-plugins
/plugin install anchor@claude-plugins
```

Then in any repo:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Targets: `(none)` uncommitted · `--staged` · `main..feature` · `pr 123` ·
`pr <url>` · `@path/to/file`.

Optional per-repo git push reminder: `/anchor hook install` (remove with
`/anchor hook uninstall`). The Claude Code push reminder hook is registered
automatically by the plugin. `ANCHOR_NO_REMIND=1` silences both.

Update: bump happens in this repo; machines pick it up with `/plugin update anchor`.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest
- `skills/anchor/SKILL.md` — the review + init workflows Claude follows
- `commands/anchor.md` — the `/anchor` slash command
- `hooks/hooks.json`, `hooks/post-push-reminder.sh` — PostToolUse push reminder
- `bin/anchor.mjs`, `lib/` — deterministic scripts (source)
- `dist/anchor.mjs` — committed single-file bundle the skill invokes
- `.anchor/` (in *your* repo, gitignored) — config, learnings, codebase map, archived reviews

## Develop

```bash
pnpm install
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
make bundle               # regenerate dist/anchor.mjs (required before release)
```

Release: bump `.claude-plugin/plugin.json` + `package.json` versions →
`make bundle` → suites green → update CHANGELOG → commit → `git tag vX.Y.Z` →
push with tags.

Manual checklist: `tests/manual/SMOKE.md`. Design specs:
`docs/superpowers/specs/`.
```

- [ ] **Step 3: Prepend to `CHANGELOG.md`** (above the v0.1.0 entry):

```markdown
## v0.2.0 — 2026-06-10

Formal Claude Code plugin.

- Installable via a personal marketplace: `/plugin marketplace add <gh-user>/claude-plugins`,
  `/plugin install anchor@claude-plugins`
- Single-file bundled CLI (`dist/anchor.mjs`, esbuild) — no PATH symlink, no node_modules
- PostToolUse push reminder registered declaratively via `hooks/hooks.json`
  (settings.json installer removed)
- New `anchor hook install|uninstall` replaces `make install-hook`/`uninstall-hook`
- Doctor now checks the bundle + install mode instead of symlinks
- Symlink install (`make install`/`make link`) removed
```

(Replace `<gh-user>` with the real login.)

- [ ] **Step 4: Update `tests/manual/SMOKE.md`** — replace items 9 and 11 with:

```markdown
- [ ] 9. Run `/anchor hook install` from the fixture repo, then `git push` to a fake
   remote (or `--dry-run`, which also fires pre-push), verify the reminder
   prints and the push is NOT blocked
```

```markdown
- [ ] 11. Run `/anchor hook uninstall`, verify .git/hooks/pre-push is removed
```

And replace item 6 with:

```markdown
- [ ] 6. Run `/anchor doctor`, verify all checks pass (a "plugin install" warn
   is expected only in a dev checkout)
```

- [ ] **Step 5: Full suite green** (bundle unchanged — bin/lib untouched in this task; freshness still passes)

- [ ] **Step 6: Commit and tag**

```bash
git add README.md CHANGELOG.md tests/manual/SMOKE.md package.json
git commit -m "docs: plugin install flow; release v0.2.0"
git tag v0.2.0
```

---

### Task 8: Publish — anchor repo + marketplace repo

**Files:**
- Create (new repo): `~/github/claude-plugins/.claude-plugin/marketplace.json`, `~/github/claude-plugins/README.md`

- [ ] **Step 1: Resolve the GitHub login**

```bash
GH_USER=$(gh api user -q .login) && echo "$GH_USER"
```

- [ ] **Step 2: Create and push the anchor repo** (public, full history + tags)

```bash
cd /home/mjenkins/github/anchor
gh repo create "$GH_USER/anchor" --public --source . --push
git push origin --tags
```

Expected: repo visible at `https://github.com/<gh-user>/anchor` with tags `v0.1.0` and `v0.2.0`.

- [ ] **Step 3: Create the marketplace repo**

```bash
mkdir -p ~/github/claude-plugins/.claude-plugin
cd ~/github/claude-plugins
git init
```

Write `.claude-plugin/marketplace.json` (substitute the real `$GH_USER`):

```json
{
  "name": "claude-plugins",
  "owner": { "name": "Mike Jenkins" },
  "plugins": [
    {
      "name": "anchor",
      "source": { "source": "github", "repo": "<gh-user>/anchor" },
      "description": "Personal code review: deterministic CLI gathers diff/context/learnings; the active Claude session reasons over them."
    }
  ]
}
```

Write `README.md`:

```markdown
# claude-plugins

Personal Claude Code plugin marketplace.

```
/plugin marketplace add <gh-user>/claude-plugins
/plugin install anchor@claude-plugins
```

| Plugin | What it does |
|---|---|
| [anchor](https://github.com/<gh-user>/anchor) | Personal code review (`/anchor`) |
```

(Substitute `<gh-user>` in both files.)

- [ ] **Step 4: Validate, commit, push**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('marketplace.json OK')"
git add -A
git commit -m "feat: marketplace catalog with anchor"
gh repo create "$GH_USER/claude-plugins" --public --source . --push
```

---

### Task 9: Migrate this machine + end-to-end verification

⚠️ This task touches live user config outside the repo and ends with steps the USER must run interactively (`/plugin` commands run in the Claude Code UI, not in bash). Execute the scripted parts, then hand the interactive checklist to the user.

- [ ] **Step 1: Back up and remove the symlink install**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.pre-v020
rm -f ~/bin/anchor ~/.claude/commands/anchor.md
rm -rf ~/.claude/skills/anchor
```

- [ ] **Step 2: Remove the v0.1.0 PostToolUse entry from settings.json** (atomic write; preserves all other keys and any non-anchor hooks)

```bash
node -e '
const fs = require("node:fs");
const p = process.env.HOME + "/.claude/settings.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
const before = (s.hooks?.PostToolUse ?? []).length;
if (s.hooks?.PostToolUse) {
  s.hooks.PostToolUse = s.hooks.PostToolUse.filter(
    (e) => !JSON.stringify(e).includes("post-push-reminder.sh"),
  );
  if (s.hooks.PostToolUse.length === 0) delete s.hooks.PostToolUse;
  if (Object.keys(s.hooks).length === 0) delete s.hooks;
}
fs.writeFileSync(p + ".tmp", JSON.stringify(s, null, 2) + "\n");
fs.renameSync(p + ".tmp", p);
console.log("PostToolUse entries:", before, "->", (s.hooks?.PostToolUse ?? []).length);
'
```

Expected: the count drops by exactly 1. If it drops by more, restore: `cp ~/.claude/settings.json.pre-v020 ~/.claude/settings.json` and inspect manually.

- [ ] **Step 3: Verify removal**

```bash
ls ~/bin/anchor ~/.claude/skills/anchor ~/.claude/commands/anchor.md 2>&1 | grep -c "No such" # expect 3
grep -c post-push-reminder ~/.claude/settings.json || echo "0 (clean)"
```

- [ ] **Step 4 (USER, interactive): install the plugin** — run inside Claude Code:

```
/plugin marketplace add <gh-user>/claude-plugins
/plugin install anchor@claude-plugins
```

- [ ] **Step 5 (USER + worker): end-to-end verification** — in a NEW Claude Code session (so the plugin skill/command/hooks load):

1. `/anchor doctor` → all checks green; "plugin install" reports `running from plugin cache`.
2. In a scratch repo: `/anchor review` of an uncommitted change → full §8-format review renders.
3. `/anchor hook install` in the scratch repo → `git push --dry-run` to a bare remote prints the reminder once, push not blocked; `/anchor hook uninstall` removes it.
4. Run a `git push` via the Bash tool → the PostToolUse reminder fires exactly ONCE (plugin hook; the settings.json entry is gone).
5. `ls ~/.claude/plugins/cache/claude-plugins/anchor/*/dist/anchor.mjs` → the bundle
   exists in the versioned cache dir (cache layout is `<marketplace>/<plugin>/<version>/`).

- [ ] **Step 6: Record completion** — nothing to commit in the anchor repo for Steps 1–5; if verification exposed fixes, commit them, `make bundle` if bin/lib changed, re-tag only if the fix landed before announcing the release (`git tag -f v0.2.0 && git push -f origin v0.2.0`).

---

## Final verification checklist (after all tasks)

- [ ] `pnpm test && pnpm test:integration && pnpm test:golden && pnpm typecheck` — all green
- [ ] `git status --porcelain` clean; `git tag` shows v0.1.0 and v0.2.0; both pushed
- [ ] `https://github.com/<gh-user>/anchor` and `<gh-user>/claude-plugins` exist and are public
- [ ] No references to deleted things remain: `git grep -nE "make (install-hook|uninstall-hook|install|link)\b|install-posttool-hook|skill/SKILL" -- ':!docs' ':!CHANGELOG.md'` returns nothing
- [ ] This machine runs Anchor only via the plugin (symlinks gone, settings entry gone, reminder fires once)
