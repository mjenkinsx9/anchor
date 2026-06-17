# Usage — the `/anchor` command

Once Anchor is installed, in any repo:

```
/anchor init        # build the codebase map + dependency graph (once)
/anchor review      # review uncommitted changes
/anchor full        # doctor + review + auto-archive
/anchor status      # repo + last-review + git summary
```

## Subcommands

| Subcommand | What it does |
|---|---|
| `init` | Build the codebase map + dependency graph (run once per repo) |
| `review [target]` | Review the working changes (or a target — see below) |
| `full [target]` | Run `doctor` first (bail on failure), then review, then auto-archive |
| `status` | Repo + last-review + git summary |
| `diff` / `context` | Show the structured diff / related files for a target |
| `learn` | Manage per-repo noise-suppression learnings |
| `doctor` | Run diagnostics |
| `hook` / `hook install` / `hook uninstall` | Manage the per-repo git push reminder |

The skill defaults to `review` of uncommitted changes when called with no
arguments.

## Review targets

| Target | Reviews |
|---|---|
| *(none)* | uncommitted changes |
| `--staged` | staged changes |
| `--since-last` | only what changed since the last archived review (see [Review workflow](04-review-workflow.md)) |
| `main..feature` | a branch range |
| `pr 123` · `pr <url>` | a pull request |
| `@path/to/file` | a specific file |

## Push reminder hook

The Claude Code push reminder hook is registered automatically by the plugin.
An optional per-repo git push reminder is also available:

```
/anchor hook install      # add the per-repo reminder
/anchor hook uninstall    # remove it
```

`ANCHOR_NO_REMIND=1` silences both.

For how the hook differs across harnesses, see
[Cross-harness portability](portability.md).

---

Back to the documentation index: [README.md](README.md)
