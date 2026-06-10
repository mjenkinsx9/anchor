import { minimatch } from 'minimatch';

export const DEFAULT_IGNORE_DIRS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.git/**',
  '.anchor/**',
];

export function isIgnored(relPath, patterns = []) {
  return patterns.some((p) => minimatch(relPath, p, { dot: true }));
}

export function filterIgnored(paths, patterns = []) {
  return paths.filter((p) => !isIgnored(p, patterns));
}
