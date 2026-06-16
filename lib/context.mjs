import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, extname, normalize } from 'node:path';
import { runGit, escapeRe } from './git.mjs';
import { filterIgnored } from './ignore.mjs';
import { loadManifest, selectManifest } from './manifest.mjs';

const IMPORT_RE = /(?:import\s[^'"]*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.js', '.py'];
const GREP_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.py'];

/** Extract import/require specifiers from source text. */
export function parseImports(src) {
  const specs = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec && !specs.includes(spec)) specs.push(spec);
  }
  return specs;
}

/** Resolve a relative import from `fromFile` to a repo-relative path, or null. */
export function resolveImport(repoDir, fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(fromFile), spec));
  if (base.startsWith('..')) return null; // never escape the repo root
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    const abs = join(repoDir, candidate);
    try {
      if (statSync(abs).isFile()) return candidate;
    } catch { /* not there — try next ext */ }
  }
  return null;
}

export function getContext({ files, repoDir, maxFiles = 50, ignore = [] }) {
  const related = new Map(); // path → reason (first reason wins)
  const descriptions = new Map(); // path → description (manifest entries only)
  const changed = new Set(files);

  for (const f of files) {
    const stem = basename(f, extname(f));
    if (stem) {
      const grep = runGit(
        ['grep', '-lE', `(import|from|require).*${escapeRe(stem)}`, '--', ...GREP_GLOBS],
        { cwd: repoDir },
      );
      // grep exits 1 on no matches — that is fine (spec: silent empty context)
      for (const p of grep.stdout.split('\n').filter(Boolean)) {
        if (!changed.has(p) && !related.has(p)) related.set(p, 'importer');
      }
    }
    const abs = join(repoDir, f);
    if (existsSync(abs)) {
      for (const spec of parseImports(readFileSync(abs, 'utf8'))) {
        const resolved = resolveImport(repoDir, f, spec);
        if (resolved && !changed.has(resolved) && !related.has(resolved)) {
          related.set(resolved, 'importee');
        }
      }
    }
  }

  // Manifest files: declared contracts (schemas, OpenAPI, design docs) the import
  // graph misses. Processed last so the import graph wins on dedup; only existing,
  // not-already-related, not-changed files are added.
  for (const entry of selectManifest(loadManifest(repoDir), files)) {
    const p = entry.path.replace(/^\.\//, '');
    if (changed.has(p) || related.has(p) || !existsSync(join(repoDir, p))) continue;
    related.set(p, 'manifest');
    if (entry.description) descriptions.set(p, entry.description);
  }

  const list = filterIgnored([...related.keys()], ignore)
    .slice(0, maxFiles)
    .map((path) => {
      const reason = related.get(path);
      const description = descriptions.get(path);
      return description ? { path, reason, description } : { path, reason };
    });
  return { files: list };
}
