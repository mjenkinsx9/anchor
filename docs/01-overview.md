# Overview — what Anchor does

Anchor is personal code review for Claude Code, packaged as a plugin: a
`/anchor` slash command + skill backed by small deterministic scripts — the
LLM is your active Claude Code session.

Anchor puts a personal code reviewer inside your editing loop. Deterministic
scripts gather the diff, context, and learnings; the reasoning happens in the
Claude Code session you already have open — **no API keys, no servers, no
per-call cost.**

## How it splits up the work

- **Deterministic data gathering** lives in `lib/*.mjs` (a Node ESM CLI),
  bundled to a single file `dist/anchor.mjs` with esbuild. The CLI emits JSON
  by default; `--format text` is opt-in.
- **The review reasoning** is driven by
  [`skills/anchor-review/SKILL.md`](../skills/anchor-review/SKILL.md), which the
  active model executes.

The portable core is the Agent Skill at `skills/anchor-review/SKILL.md` — that's
what every harness gets. The `/anchor` command and the push-reminder hook are
Claude-Code-native conveniences that only some harnesses pick up, because
command/hook formats differ across harnesses. See
[Cross-harness portability](portability.md) for the per-component detail.

---

Back to the documentation index: [README.md](README.md)
