#!/usr/bin/env bash
# Claude Code PostToolUse hook: after the Bash tool runs a `git push`,
# inject context asking Claude to offer an Anchor review. Opt out with
# ANCHOR_NO_REMIND=1 or by removing the entry from ~/.claude/settings.json.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

cmd="$(node --input-type=module -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    process.stdout.write((j.tool_input && j.tool_input.command) || "");
  } catch {}
});
' 2>/dev/null)"

case "$cmd" in
  "git push"*|*"&& git push"*|*"; git push"*)
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"The user just ran `git push`. Offer to run /anchor review on either (1) the latest pushed commits, or (2) the PR if one was created or updated. Wait for their answer before invoking."}}
EOF
    ;;
esac
exit 0
