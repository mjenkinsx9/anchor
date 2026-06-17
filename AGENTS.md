# AGENTS.md — Anchor

Guidance for AI agents (and humans) working in this repo.

## What this is

Anchor is a personal code-review tool for AI coding sessions. Deterministic data
gathering lives in `lib/*.mjs` (a Node ESM CLI), bundled to a single file
`dist/anchor.mjs` with esbuild. The review *reasoning* is driven by
`skills/anchor-review/SKILL.md`, which the active model executes. The CLI emits JSON
by default; `--format text` is opt-in.

## Build, test, verify

The binding gate (run all before claiming done):

```bash
npm test                 # unit (vitest)
npm run test:integration # integration
npm run test:golden      # golden input snapshots
npm run typecheck        # tsc --noEmit (checkJs)
```

- **Bundle stays in sync.** Any change to a `lib/*.mjs` file that is reachable from
  `lib/cli.mjs` must be followed by `npm run bundle` and the regenerated
  `dist/anchor.mjs` staged in the same commit. `tests/integration/bundle.test.mjs`
  rebuilds with the pinned esbuild and asserts a byte-for-byte match, so a stale
  bundle fails CI. (Comment-only edits, or new exports not yet imported by the CLI,
  may leave the bundle byte-identical — that's fine.)
- The LLM eval (`npm run eval`) is a **manual** quality gate (needs a model / the
  `claude` CLI), not part of CI. The deterministic suite above is the CI gate.

## Releasing — bump the version, or new code never reaches users

**This is the easy step to forget.** The `mjenkins-toolbox` marketplace references
Anchor by repo tracking `main`, and Claude Code caches the installed plugin **keyed by
the version** in the plugin manifest. So:

> Landing changes on `main` **without bumping the version** means installed plugins
> keep serving the **stale cached version** — `/plugin update` and cache refreshes only
> pick up new code when the version string changes. (Phase 4 shipped to `main` but, until
> the bump to `0.3.0`, every install still ran the old `0.2.3` bundle.)

When a change should reach users, **bump the version in all five manifests in lockstep**
(they must match — `tests/unit/manifest-sync.test.mjs` enforces it):

1. `package.json`
2. `.claude-plugin/plugin.json`  ← canonical source of truth
3. `.codex-plugin/plugin.json`
4. `.cursor-plugin/plugin.json`
5. `gemini-extension.json`

Then:

- Update `CHANGELOG.md` (move `Unreleased` → the new `vX.Y.Z` heading) and the
  README version badge.
- Re-run `npm run bundle` if any `lib/*.mjs` changed, and run the full gate.
- Commit, open a PR, merge, then `git tag vX.Y.Z` and cut a GitHub release.

Semver (pre-1.0): new features → minor (`0.x.0`); fixes only → patch (`0.x.y`).

## Conventions

- Work ships via PRs against `main`; never push to `main` directly. Branch prefixes:
  `feat/`, `fix/`, `chore/`, `docs/`, `release/`.
- Keep changes focused; follow existing patterns in the file you're editing.
- Larger work is planned under `docs/superpowers/` (specs → TDD plans) and executed
  task-by-task with review between tasks.
