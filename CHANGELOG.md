# Changelog

## Unreleased

- **Diff budget no longer hard-fails.** Over `max_diff_lines`/`max_files`,
  `anchor diff` now emits the diff with `overBudget: true` + a `budgetWarning`
  instead of exiting 1, so large diffs still get reviewed (the reviewer
  prioritizes the most important files). Default `max_diff_lines` raised
  2,000 → 15,000. New per-run overrides: `--max-diff-lines N` and `--force`.
- **Fixed:** valued-flag values (e.g. `--max-diff-lines 100`, `--format text`)
  no longer leak into `anchor diff` as a bogus diff target.
- **Review prompt (SKILL.md):** added a verification gate (confirm CRITICAL/HIGH
  against source before flagging; cap unverified findings at confidence 3), a
  fix-safety check, a self-refutation pass, and an evidence-tied confidence
  rubric — fewer confident-but-wrong findings. Step 3 now handles `overBudget`
  gracefully. Fixed the invalid `gh pr view --json closingIssues` call in
  PR-context gathering.
- **Review-quality eval harness** (`tests/eval/`, `lib/eval.mjs`, `npm run eval`):
  fixtures with planted bugs plus a clean case, scored for recall / precision /
  false-positives against the real review prompt. The scorer is unit-tested.
- **New review-input commands** (deterministic gather steps the skill feeds into
  the review):
  - `anchor analyze --from-diff <target>` — runs installed static analyzers
    (tsc/eslint/ruff/shellcheck) scoped to changed files and emits normalized,
    grounded findings. Resolves project-local `node_modules/.bin` tools (not just
    global PATH), normalizes paths to repo-relative, tags each finding `changed`
    (touches the diff) and caps output. Never throws on a missing/failing tool.
  - `anchor rules --from-diff <target>` — positive review rules that *enforce
    intent* (`.anchor/rules.md` prose + scoped `config.rules`), the complement to
    learnings (which suppress). Scope globs are validated.
  - `anchor refs <symbol>` — find word-boundary references via `git grep`, an
    evidence aid so the verification gate can disprove usage-based findings.
- **Config hardening:** validate `min_severity`, category membership, and
  `output.color`; bound `max_findings`/`min_confidence`/`max_diff_lines`/`max_files`;
  reject a non-mapping `output`. New keys `protected_categories` (a floor learnings
  can never suppress) and `rules` (with defaults + validation). `ensureGitignore`
  is now idempotent against trailing whitespace.
- **Scoped learnings:** `anchor learn add` accepts `--scope`/`--category`/`--action`;
  `anchor learn list --from-diff <target>` returns only learnings whose scope
  matches the changed files. Legacy learnings round-trip unchanged (apply
  everywhere). Whitespace is normalized for reliable dedup.
- **Context manifest:** `.anchor/files.json` points the reviewer at non-imported
  contracts (schema/OpenAPI/design docs); matching files appear in `anchor context`
  with `reason: "manifest"` and a description. Malformed manifests are ignored.
- **Hardening:** default 30s timeout on external commands (distinct code 124 on
  timeout; `gh pr` calls get 120s); `parseUnifiedDiff` no longer swallows the next
  file when a hunk is truncated; default `ignore` now covers `dist/`/`build/`/
  `coverage/`; the eval scorer accepts hyphenated categories (`data-loss`).
- **Review prompt (SKILL.md):** reads the *effective* merged config via
  `anchor config --format json`; category + strictness now gate *generation* (not
  just post-hoc filtering); protected categories are a hard floor; emits a
  machine-readable `anchor:meta` block for robust score/severity archival.
- Added `npm run eval:ci` (sets `ANCHOR_EVAL_GENERATE=1`). Note: the LLM eval only
  scores when a `claude` model is available; the deterministic test suite + the
  unit-tested scorer are the CI-binding gate.

## v0.2.3 — 2026-06-14

- Add richer Codex plugin metadata for directory presentation and discovery.
- Keep Codex, Cursor, Gemini, Claude, and package versions in sync so plugin
  cache refreshes pick up the metadata update.

## v0.2.2 — 2026-06-10

- `anchor review save` now extracts `score` and severity counts from the
  rendered review body (`Confidence: <n> / 5`, `🔴 CRITICAL (n)` headers)
  when not passed explicitly — archives previously recorded `score: null`
  and all-zero severities, so `anchor status` showed `score: ?/5` and
  "0 open findings" regardless of the actual review

## v0.2.1 — 2026-06-10

Two install-breaking fixes found while field-testing v0.2.0.

- Skill renamed `anchor` → `anchor-review`: the skill and the `/anchor` command
  shared one name, so the Skill tool resolved the command instead of the skill
  and SKILL.md never loaded (Claude fell back to guessing plugin paths)
- `bin/anchor.mjs` is now a loader that runs `lib/cli.mjs` in dev checkouts and
  falls back to the bundled `dist/anchor.mjs` where node_modules is absent
  (plugin cache) — previously it crashed with ERR_MODULE_NOT_FOUND: js-yaml
- CLI body moved to `lib/cli.mjs` (new bundle entry); behavior unchanged
- New regression tests: plugin-layout name-collision check, bin fallback
  without node_modules

Plus three CLI papercuts from the same field test:

- `uncommitted` and `staged` are now valid target words, so the `mode` the
  diff JSON reports round-trips into `anchor context --from-diff <mode>`
- Bare `anchor learn` defaults to `learn list` instead of exiting 1
- Bare `anchor hook` reports install status (`{installed, path}`) instead of
  exiting 1

## v0.2.0 — 2026-06-10

Formal Claude Code plugin.

- Installable via a personal marketplace: `/plugin marketplace add mjenkinsx9/mjenkins-toolbox`,
  `/plugin install anchor@mjenkins-toolbox`
- Single-file bundled CLI (`dist/anchor.mjs`, esbuild) — no PATH symlink, no node_modules
- PostToolUse push reminder registered declaratively via `hooks/hooks.json`
  (settings.json installer removed)
- New `anchor hook install|uninstall` replaces `make install-hook`/`uninstall-hook`
- Doctor now checks the bundle + install mode instead of symlinks
- Symlink install (`make install`/`make link`) removed

## v0.1.0 — 2026-06-10

Initial release.

- `/anchor` slash command + skill: review, full, init, diff, context, learn, status, doctor
- Review workflow: severity-graded findings, 0–5 confidence, strictness prior,
  learnings suppression with always-on security carve-out, Context used footer
- PR mode: `gh pr diff` + PR/issue context + CI failure context
- `anchor init`: codebase map + grep-based module dependency graph
- Push reminders: git pre-push hook (opt-in per repo) + Claude Code PostToolUse hook
- Four test layers: unit, integration, golden input snapshots, manual smoke
