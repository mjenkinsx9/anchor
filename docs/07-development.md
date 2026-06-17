# Development & release

This page covers building and testing Anchor locally and cutting a release. For
the full guidance aimed at AI agents and humans working in the repo, see
[`AGENTS.md`](../AGENTS.md).

## Develop

```bash
pnpm install
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
make bundle               # regenerate dist/anchor.mjs (required before release)
```

Manual checklist: [`tests/manual/SMOKE.md`](../tests/manual/SMOKE.md) ·
Design specs: [`docs/superpowers/specs/`](superpowers/specs/)

**Bundle stays in sync.** Any change to a `lib/*.mjs` file reachable from
`lib/cli.mjs` must be followed by `make bundle` (or `pnpm run bundle`) and the
regenerated `dist/anchor.mjs` staged in the same commit — a stale bundle fails
CI (`tests/integration/bundle.test.mjs` rebuilds with the pinned esbuild and
asserts a byte-for-byte match). Comment-only edits, or new exports not yet
imported by the CLI, may leave the bundle byte-identical — that's fine.

The LLM eval (`pnpm run eval`) is a **manual** quality gate (it needs a model /
the `claude` CLI), not part of CI. The deterministic suite above is the CI gate.

## Release

> Bump the version, or new code never reaches users. The `mjenkins-toolbox`
> marketplace references Anchor by repo tracking `main`, and Claude Code caches
> the installed plugin **keyed by the version** in the manifest — landing on
> `main` without bumping the version means installs keep serving the stale
> cached bundle.

1. Bump versions in lockstep across all five manifests (enforced by
   `tests/unit/manifest-sync.test.mjs`):
   `package.json`, `.claude-plugin/plugin.json` (canonical source of truth),
   `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`,
   `gemini-extension.json`.
2. `make bundle` (if any `lib/*.mjs` changed).
3. All suites green.
4. Update [`CHANGELOG.md`](../CHANGELOG.md) (move `Unreleased` → the new
   `vX.Y.Z` heading) and the README version badge.
5. Commit → open a PR → merge → `git tag vX.Y.Z` → push with tags → cut a
   GitHub release.

Semver (pre-1.0): new features → minor (`0.x.0`); fixes only → patch (`0.x.y`).

## Conventions

- Work ships via PRs against `main`; never push to `main` directly. Branch
  prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `release/`.
- Keep changes focused; follow existing patterns in the file you're editing.
- Larger work is planned under `docs/superpowers/` (specs → TDD plans) and
  executed task-by-task with review between tasks.

---

Back to the documentation index: [README.md](README.md)
