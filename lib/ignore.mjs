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

function normalize(relPath) {
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
