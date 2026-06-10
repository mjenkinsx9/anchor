<div align="center">

# ⚓ Anchor

### Personal code review for Claude Code, packaged as a plugin

**A `/anchor` slash command + skill backed by small deterministic scripts — the LLM is your active Claude Code session.**

![Plugin version](https://img.shields.io/badge/plugin-v0.2.2-blue)
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

## 🚀 Install

Inside Claude Code, on any machine:

```
/plugin marketplace add mjenkinsx9/mjenkins-toolbox
/plugin install anchor@mjenkins-toolbox
```

**Updating:** version bumps happen in this repo; machines pick them up with
`/plugin update anchor`.

## 🧭 Usage

Then in any repo:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

Review targets:

| Target | Reviews |
|---|---|
| *(none)* | uncommitted changes |
| `--staged` | staged changes |
| `main..feature` | a branch range |
| `pr 123` · `pr <url>` | a pull request |
| `@path/to/file` | a specific file |

## 🔔 Push reminder hook

The Claude Code push reminder hook is registered automatically by the plugin.
An optional per-repo git push reminder is also available:

```
/anchor hook install      # add the per-repo reminder
/anchor hook uninstall    # remove it
```

`ANCHOR_NO_REMIND=1` silences both.

## 📁 Layout

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | plugin manifest |
| `skills/anchor-review/SKILL.md` | the review + init workflows Claude follows |
| `commands/anchor.md` | the `/anchor` slash command |
| `hooks/hooks.json`, `hooks/post-push-reminder.sh` | PostToolUse push reminder |
| `bin/anchor.mjs`, `lib/` | deterministic scripts (source) |
| `dist/anchor.mjs` | committed single-file bundle the skill invokes |
| `.anchor/` (in *your* repo, gitignored) | config, learnings, codebase map, archived reviews |

## 🛠️ Develop

```bash
pnpm install
pnpm test                 # unit
pnpm test:integration
pnpm test:golden          # snapshot of review inputs
pnpm typecheck
make bundle               # regenerate dist/anchor.mjs (required before release)
```

Manual checklist: [`tests/manual/SMOKE.md`](tests/manual/SMOKE.md) ·
Design specs: [`docs/superpowers/specs/`](docs/superpowers/specs/)

## 🚢 Release

1. Bump versions in `.claude-plugin/plugin.json` + `package.json`
2. `make bundle`
3. All suites green
4. Update [CHANGELOG.md](CHANGELOG.md)
5. Commit → `git tag vX.Y.Z` → push with tags

## 📄 License

[MIT](LICENSE) © 2026 Mike Jenkins
