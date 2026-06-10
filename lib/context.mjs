import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname, normalize } from 'node:path';
import { runGit } from './git.mjs';
import { filterIgnored } from './ignore.mjs';

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
    if (existsSync(join(repoDir, candidate))) return candidate;
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getContext({ files, repoDir, maxFiles = 50, ignore = [] }) {
  const related = new Map(); // path → reason (first reason wins)
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

  const list = filterIgnored([...related.keys()], ignore)
    .slice(0, maxFiles)
    .map((path) => ({ path, reason: related.get(path) }));
  return { files: list };
}
