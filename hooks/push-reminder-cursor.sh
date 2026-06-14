#!/usr/bin/env bash
# Cursor plugin `afterShellExecution` hook: after a shell command containing
# `git push` runs, remind the user to run /anchor review. Opt out with
# ANCHOR_NO_REMIND=1.
#
# This is the Cursor-native counterpart to hooks/post-push-reminder.sh (which is
# Claude/Codex format: PostToolUse + ${CLAUDE_PLUGIN_ROOT}). Cursor uses
# camelCase events and ${CURSOR_PLUGIN_ROOT}, so it needs its own file, wired via
# the `hooks` field in .cursor-plugin/plugin.json.
#
# CAVEAT: Cursor does not publish the hook stdin shape or how it surfaces hook
# stdout, so this emits a plain-text reminder as a best effort and self-filters
# on the raw input. Verify on a live Cursor install before relying on it.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

input="$(cat)"

# Cheap raw pre-filter: only proceed if the shell command involved `git push`.
case "$input" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

echo "Anchor: you just ran \`git push\`. Run /anchor review on the pushed commits (or the PR if one was created/updated)."
exit 0
