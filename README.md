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

## 🚀 Install

The portable core is the Agent Skill at `skills/anchor-review/SKILL.md` — that's
what every harness gets. The `/anchor` **command** and the push-reminder **hook**
are Claude-Code-native conveniences that only some harnesses pick up, because
command/hook formats differ across harnesses. Each manifest points at the
**same** shared directories — nothing is duplicated. See
[`docs/portability.md`](docs/portability.md) for the per-component detail.

### Per-harness install

"Skill / Command / Hook" below is what actually loads on each harness, not just
what the manifest declares.

| Harness | Manifest | Skill | `/anchor` cmd | Push hook |
|---|---|:--:|:--:|:--:|
| **Claude Code** | `.claude-plugin/plugin.json` | ✅ | ✅ | ✅ |
| **GitHub Copilot CLI** | *(none — reads `.claude-plugin/plugin.json` fallback)* | ✅ | ✅¹ | ⚠️ unverified² |
| **OpenAI Codex** | `.codex-plugin/plugin.json` | ✅ | ➖³ | ✅⁴ |
| **Cursor** | `.cursor-plugin/plugin.json` | ✅ | ✅ | 🟡 native⁵ |
| **Gemini CLI** | `gemini-extension.json` | ✅ | ➖⁶ | ❌⁶ |

¹ Copilot's `commands` field has no default path, so the canonical manifest now
declares `"commands": "./commands/"` (harmless for Claude) to register `/anchor`.
² Copilot documents `${PLUGIN_ROOT}`; our hook uses `${CLAUDE_PLUGIN_ROOT}` and
the page doesn't document a compat alias — so hook behaviour is unverified.
³ `commands` isn't a documented field in the Codex plugin manifest.
⁴ Codex auto-discovers `hooks/hooks.json` and sets `CLAUDE_PLUGIN_ROOT` for
Claude-hook compatibility, so the hook is expected to run.
⁵ Ships a **Cursor-native** hook (`hooks/cursor-hooks.json`,
`hooks/push-reminder-cursor.sh`): `afterShellExecution` event +
`${CURSOR_PLUGIN_ROOT}`, wired via the manifest `hooks` field. Built to Cursor's
documented hook schema; Cursor doesn't publish the hook stdin/stdout protocol, so
whether the reminder text surfaces is **not yet runtime-verified** (🟡).
⁶ Gemini commands are TOML (not our markdown) and its hooks live in a root
`hooks/hooks.json` it can't be pointed away from, using `AfterTool` events — the
shared Claude-format file is discovered but dead there. No Gemini-native hook is
shipped because Gemini publishes neither the hook path-variable nor the
output/context-injection protocol. Gemini is **skill-only**. See
`docs/portability.md`.

Docs: [Claude](https://code.claude.com/docs/en/plugins-reference) ·
[Copilot](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference) ·
[Codex](https://developers.openai.com/codex/plugins/build) ·
[Cursor](https://cursor.com/docs/reference/plugins) ·
[Gemini](https://geminicli.com/docs/extensions/reference/)

> **Honesty note.** Only Claude Code's loader is runtime-verified here
> (`claude plugin validate .` → passed). The Codex/Cursor/Gemini/Copilot
> manifests follow each harness's **current** published schema but were not
> executed against a live install. The **skill** is the portable core and is the
> only component every harness loads; commands/hooks are best-effort per the
> table above. The SKILL.md's bundled-CLI lookup also relies on Claude Code's
> "skill base directory" convention — see [`docs/portability.md`](docs/portability.md).

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
| `.codex-plugin/plugin.json` · `.cursor-plugin/plugin.json` · `gemini-extension.json` | per-harness manifests pointing at the shared `skills/` |
| `docs/portability.md` | cross-harness mapping + caveats |
| `skills/anchor-review/SKILL.md` | the review + init workflows the agent follows (the portable core) |
| `commands/anchor.md` | the `/anchor` slash command |
| `hooks/hooks.json`, `hooks/post-push-reminder.sh` | Claude/Codex PostToolUse push reminder |
| `hooks/cursor-hooks.json`, `hooks/push-reminder-cursor.sh` | Cursor-native (`afterShellExecution`) push reminder |
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
