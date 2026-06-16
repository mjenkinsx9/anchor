import { minimatch, Minimatch } from 'minimatch';

// Patterns assume repo-relative *file* paths (git ls-files output);
// bare directory names like "node_modules" (no slash) are not matched.
export const DEFAULT_IGNORE_DIRS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.anchor/**',
];

/** Strip a leading `./` so a path compares cleanly against repo-relative globs. */
export function normalize(relPath) {
  return relPath.startsWith('./') ? relPath.slice(2) : relPath;
}

export function isIgnored(relPath, patterns = []) {
  return patterns.some((p) => minimatch(normalize(relPath), p, { dot: true }));
}

export function filterIgnored(paths, patterns = []) {
  if (patterns.length === 0) return paths;
  const matchers = patterns.map((p) => new Minimatch(p, { dot: true }));
  return paths.filter((p) => !matchers.some((m) => m.match(normalize(p))));
}

/** True if `glob` compiles as a minimatch pattern (used to validate config scopes). */
export function isValidGlob(glob) {
  try { new Minimatch(glob, { dot: true }); return true; } catch { return false; }
}

/**
 * True if a `scope` glob (default `**`) matches at least one of `changedPaths`.
 * The single primitive behind selectRules/selectManifest/selectLearnings — an
 * uncompilable scope is treated as "no match" rather than throwing.
 */
export function matchesScope(scope, changedPaths) {
  let mm;
  try { mm = new Minimatch(scope ?? '**', { dot: true }); } catch { return false; }
  return changedPaths.some((p) => mm.match(normalize(String(p))));
}
