/** Pure, idempotent, additive edit of a Claude Code settings object. */
export function addHookEntry(settings, scriptPath) {
  const next = structuredClone(settings ?? {});
  next.hooks ??= {};
  // Normalize corrupt values so we never crash or write garbage.
  if (typeof next.hooks !== 'object' || Array.isArray(next.hooks)) {
    next.hooks = {};
  }
  if (!Array.isArray(next.hooks.PostToolUse)) {
    next.hooks.PostToolUse = [];
  }
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
