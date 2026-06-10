/** Pure, idempotent, additive edit of a Claude Code settings object. */
export function addHookEntry(settings, scriptPath) {
  const next = structuredClone(settings ?? {});
  next.hooks ??= {};
  next.hooks.PostToolUse ??= [];
  const exists = next.hooks.PostToolUse.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command === scriptPath),
  );
  if (exists) return { settings: next, changed: false };
  next.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: scriptPath }],
  });
  return { settings: next, changed: true };
}
