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

The portable core is the Agent Skill at `skills/anchor-review/SKILL.md`. Each
harness gets a thin manifest that points at the **same** `skills/` (and, where
supported, `commands/`/`hooks/`) directories — nothing is duplicated per harness.
See [`docs/portability.md`](docs/portability.md) for the mapping and caveats.

### Per-harness install

| Harness | Manifest | Install / load | Status |
|---|---|---|---|
| **Claude Code** | `.claude-plugin/plugin.json` | `/plugin marketplace add mjenkinsx9/mjenkins-toolbox` then `/plugin install anchor@mjenkins-toolbox` | ✅ runtime-validated (`claude plugin validate .`) |
| **GitHub Copilot CLI** | *(none — reads `.claude-plugin/plugin.json` as a documented fallback)* | add this repo as a plugin source | ✅ manifest port (fallback per [docs](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)) |
| **OpenAI Codex** | `.codex-plugin/plugin.json` | list the repo in a Codex marketplace catalog and install | ✅ manifest port ([docs](https://developers.openai.com/codex/plugins/build)) |
| **Factory Droid** | `.factory-plugin/plugin.json` | add via the Factory plugin manager | ✅ manifest port ([docs](https://docs.factory.ai/cli/configuration/plugins)) |
| **Cursor** | `.cursor-plugin/plugin.json` | add via Cursor's plugin manager | ✅ manifest port ([docs](https://cursor.com/docs/reference/plugins)) |
| **Gemini CLI** | `gemini-extension.json` | `gemini extensions install <repo>` | ✅ manifest port — skills auto-discovered ([docs](https://geminicli.com/docs/extensions/reference/)) |
| **OpenCode** | *(gap)* | — | 📝 documented gap, [`docs/opencode.md`](docs/opencode.md) ([docs](https://opencode.ai/docs/plugins/)) |

> **Honesty note.** Only Claude Code's loader is runtime-verified in this repo
> (`claude plugin validate .`). The Codex/Factory/Cursor/Gemini manifests are
> written to each harness's **current** published schema but were not executed
> against a live install. The SKILL.md's bundled-CLI lookup relies on Claude
> Code's "skill base directory" convention — see the caveat in
> [`docs/portability.md`](docs/portability.md). OpenCode has no skills primitive,
> so it is a documented gap, not a shipped port.

> Codex marketplace listing lives in the **catalog** repo, not here: Codex reads
> `.agents/plugins/marketplace.json` with `source.path` entries pointing at the
> plugin directory.

**Updating:** version bumps happen in this repo; Claude Code machines pick them
up with `/plugin update anchor`. Keep every manifest's `name`/`version`/
`description` in sync with `.claude-plugin/plugin.json` (enforced by
`tests/unit/manifest-sync.test.mjs`).

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
| `.claude-plugin/plugin.json` | Claude Code manifest (canonical metadata; Copilot CLI fallback) |
| `.codex-plugin/plugin.json` · `.factory-plugin/plugin.json` · `.cursor-plugin/plugin.json` · `gemini-extension.json` | per-harness manifests pointing at the shared `skills/` |
| `docs/portability.md` · `docs/opencode.md` | cross-harness mapping + the OpenCode gap |
| `skills/anchor-review/SKILL.md` | the review + init workflows the agent follows (the portable core) |
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
