/** The git pre-push reminder script, installed by `anchor hook install`. */
export const MARKER = '# Anchor pre-push reminder';

export const PRE_PUSH_SCRIPT = `#!/usr/bin/env bash
# Anchor pre-push reminder. Git invokes this when \`git push\` runs.
# It only prints a reminder — it always exits 0 and never blocks the push.
# Opt out with ANCHOR_NO_REMIND=1, or remove via \`anchor hook uninstall\`.
[ -n "$ANCHOR_NO_REMIND" ] && exit 0

remote="\${1:-origin}"
branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo '?')"

echo ""
echo "[anchor] Pushing to \${remote}/\${branch}."
echo "  To review these commits after the push:  /anchor review @{u}..HEAD"
echo "  To review the PR (if any):               /anchor review pr <number>"
echo "  Or run /anchor status for a repo summary."
echo ""
exit 0
`;
