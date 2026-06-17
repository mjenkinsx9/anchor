# Anchor documentation

Start here: [Overview — what Anchor does](01-overview.md).

This is the documentation map for Anchor. The top-level
[`README.md`](../README.md) is the gateway (what it is + quick start); the pages
below hold the detail.

## Getting started

| Doc | Description |
|---|---|
| [Overview](01-overview.md) | What Anchor is and how it splits deterministic data-gathering from LLM reasoning |
| [Installation](02-installation.md) | Per-harness install table, honesty notes, and updating |
| [Usage](03-usage.md) | The `/anchor` command, subcommands, review targets, and the push reminder hook |

## Using it

| Doc | Description |
|---|---|
| [Review workflow](04-review-workflow.md) | How a review runs end-to-end, strictness, and Phase 4 (`--since-last`, `anchor:finding`/fix specs, caller/sibling context, issue criteria) |
| [Configuration](05-configuration.md) | `.anchor/config.yaml` keys, defaults, and the other per-repo `.anchor/` files |

## Reference

| Doc | Description |
|---|---|
| [Repository layout](06-layout.md) | What each path in the repo is |
| [Cross-harness portability](portability.md) | What loads/runs on Claude Code, Copilot, Codex, Cursor, and Gemini — command and hook caveats |
| [The review skill](../skills/anchor-review/SKILL.md) | The canonical step-by-step review + init workflow the model follows |

## Project & meta

| Doc | Description |
|---|---|
| [Development & release](07-development.md) | Build/test commands, the bundle-sync rule, and the release checklist |
| [`AGENTS.md`](../AGENTS.md) | Full dev/release guidance for AI agents and humans working in the repo |
| [`CHANGELOG.md`](../CHANGELOG.md) | Release history |

### Design history

Internal specs and TDD plans — kept for the record; not a guide to current
behaviour. Do not treat these as user docs.

| Doc | Description |
|---|---|
| [Anchor — Design Spec](superpowers/specs/2026-06-09-anchor-design.md) | Original design spec |
| [Anchor v0.2.0 — Formal Claude Code Plugin](superpowers/specs/2026-06-10-anchor-plugin-design.md) | Plugin conversion design |
| [Anchor Phase 4 — Design](superpowers/specs/2026-06-16-anchor-phase4-design.md) | Phase 4 design (resolved decisions) |
| [Anchor Implementation Plan](superpowers/plans/2026-06-09-anchor-implementation.md) | Initial implementation plan |
| [Anchor v0.2.0 Plugin Conversion Plan](superpowers/plans/2026-06-10-anchor-plugin-conversion.md) | Plugin conversion plan |
| [Anchor Phase 4 Implementation Plan](superpowers/plans/2026-06-16-anchor-phase4-impl.md) | Phase 4 implementation plan |
| [Anchor Review-Quality Implementation Plan](superpowers/plans/2026-06-16-anchor-review-quality.md) | Review-quality implementation plan |
