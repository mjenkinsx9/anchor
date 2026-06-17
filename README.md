<div align="center">

# ⚓ Anchor

### Personal code review for Claude Code, packaged as a plugin

**A `/anchor` slash command + skill backed by small deterministic scripts — the LLM is your active Claude Code session.**

![Plugin version](https://img.shields.io/badge/plugin-v0.3.0-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)
![Made for Claude Code](https://img.shields.io/badge/made_for-Claude_Code-d97757)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ What it does

Anchor puts a personal code reviewer inside your editing loop. Deterministic
scripts gather the diff, context, and learnings; the reasoning happens in the
Claude Code session you already have open — **no API keys, no servers, no
per-call cost.**

The portable core is the Agent Skill at `skills/anchor-review/SKILL.md`, which
every harness loads. The `/anchor` command and the push-reminder hook are
Claude-Code-native conveniences that some harnesses also pick up.

## 🚀 Quick start

Install the plugin (Claude Code: via the `mjenkins-toolbox` marketplace), then in
any repo:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Review targets: *(none)* = uncommitted · `--staged` · `--since-last` ·
`main..feature` · `pr 123` / `pr <url>` · `@path/to/file`.

For per-harness install details and the honesty notes, see
[Installation](docs/02-installation.md).

## 📚 Documentation

Anchor's full docs live in [`docs/`](docs/). Start with the overview, then dig
into the workflow and configuration.

| Doc | Description |
|---|---|
| [Overview](docs/01-overview.md) | What Anchor is and how it works |
| [Installation](docs/02-installation.md) | Per-harness install + updating |
| [Usage](docs/03-usage.md) | `/anchor` subcommands, targets, push reminder hook |
| [Review workflow](docs/04-review-workflow.md) | How a review runs, strictness, and Phase 4 features |
| [Configuration](docs/05-configuration.md) | `.anchor/config.yaml` keys and per-repo files |
| [Repository layout](docs/06-layout.md) | What each path in the repo is |
| [Development & release](docs/07-development.md) | Build, test, and cut a release |
| [Cross-harness portability](docs/portability.md) | What loads/runs on each harness |

Full documentation map: [docs/README.md](docs/README.md)

## 📄 License

[MIT](LICENSE) © 2026 Mike Jenkins
