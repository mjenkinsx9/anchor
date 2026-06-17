# Installation

The portable core is the Agent Skill at `skills/anchor-review/SKILL.md` — that's
what every harness gets. The `/anchor` **command** and the push-reminder **hook**
are Claude-Code-native conveniences that only some harnesses pick up, because
command/hook formats differ across harnesses. Each manifest points at the
**same** shared directories — nothing is duplicated. See
[Cross-harness portability](portability.md) for the per-component detail.

## Per-harness install

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
[Cross-harness portability](portability.md).

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
> "skill base directory" convention — see [Cross-harness portability](portability.md).

> Codex marketplace listing lives in the **catalog** repo, not here: Codex reads
> `.agents/plugins/marketplace.json` with `source.path` entries pointing at the
> plugin directory.

## Updating

Version bumps happen in this repo; Claude Code machines pick them up with
`/plugin update anchor`. Keep every manifest's `name`/`version`/`description` in
sync with `.claude-plugin/plugin.json` (enforced by
`tests/unit/manifest-sync.test.mjs`).

---

Back to the documentation index: [README.md](README.md)
