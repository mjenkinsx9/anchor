# Repository layout

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

For how the manifests, command, and hooks map onto each harness, see
[Cross-harness portability](portability.md). For the per-repo `.anchor/`
contents, see [Configuration](05-configuration.md).

---

Back to the documentation index: [README.md](README.md)
