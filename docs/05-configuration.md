# Configuration — `.anchor/config.yaml`

Anchor reads optional per-repo configuration from `.anchor/config.yaml`. Every
key has a default, so the file is optional — anything you omit falls back to the
default. The review reasoning always uses the **effective** config (defaults
merged with your file); run `anchor config --format json` to see it.

The `.anchor/` directory in your repo (config, learnings, codebase map, archived
reviews) is gitignored.

## Keys

| Key | Default | What it controls |
|---|---|---|
| `min_severity` | `low` | Drop findings below this severity. One of `critical`, `high`, `medium`, `low`. |
| `strictness` | `2` | Review aggressiveness: `1` verbose, `2` balanced, `3` critical-only. See [Review workflow](04-review-workflow.md). |
| `max_findings` | `50` | Cap on the number of findings rendered (≥ 1). |
| `categories` | `[logic, security, perf, style, docs, tests]` | The categories findings may be generated in. Category is a generation gate, not a post-hoc filter. |
| `protected_categories` | `[security, data-loss, crash, injection, auth]` | Findings of these natures are never suppressed by strictness or learnings. |
| `min_confidence` | `2` | Drop findings below this confidence (0–5). |
| `max_diff_lines` | `15000` | Budget for the diff; over-budget diffs are flagged but still reviewed (≥ 1). |
| `max_files` | `100` | Cap on related/context files gathered (≥ 1). |
| `ignore` | `['**/*.lock', '**/*.generated.*', 'vendor/**', 'node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**']` | Glob patterns excluded from review. |
| `rules` | `[]` | Structured positive review rules (project intent). Free-prose rules can also live in `.anchor/rules.md`. |
| `output.show_whats_good` | `true` | Render the "What's good" section. |
| `output.show_diff_stats` | `true` | Show the diff stats line in the review header. |
| `output.color` | `auto` | CLI color: `auto`, `always`, or `never`. |

Invalid values are reported as warnings and fall back to the default rather than
failing the run (e.g. an unknown `strictness` warns and uses `2`; unknown
`categories` entries are dropped; an all-invalid `categories` list reverts to the
defaults).

## Related per-repo files

Beyond `config.yaml`, the review reads these from `.anchor/` when present:

- `.anchor/rules.md` — free-prose positive review rules (project intent),
  enforced as review criteria and weighted above generic best-practice.
- `.anchor/instructions.md` and `.anchor/instructions.d/*.md` — instruction
  files that may carry YAML frontmatter with `include`/`exclude` globs; only
  applied when their globs match files in the diff. Multiple files stack.
- `.anchor/learnings.md` — noise-suppression patterns added by
  `mark finding N as noise` (scoped by glob so a learning doesn't silence
  unrelated code).
- `.anchor/codebase-map.md`, `.anchor/codebase-graph.md` — built by
  `/anchor init`.
- `.anchor/reviews/` — archived reviews (`save review` / `/anchor full`).

`ANCHOR_NO_REMIND=1` silences the push reminders (see [Usage](03-usage.md)).

---

Back to the documentation index: [README.md](README.md)
