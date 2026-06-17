import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, basename, extname, normalize } from 'node:path';
import { runGit, escapeRe } from './git.mjs';
import { filterIgnored } from './ignore.mjs';
import { loadManifest, selectManifest } from './manifest.mjs';
import { findRefs } from './refs.mjs';

const IMPORT_RE = /(?:import\s[^'"]*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.js', '.py'];
const GREP_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.py'];
const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SIBLING_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.java', '.rb', '.c', '.cpp', '.h']);

// Generic names too common to give a useful reverse-ref signal (length>=4 still applies).
const COMMON_NAMES = new Set([
  'get', 'set', 'run', 'init', 'main', 'index', 'default', 'handler', 'value', 'data',
  'name', 'type', 'item', 'list', 'config', 'options', 'props', 'state', 'result',
  'error', 'utils', 'util', 'helper', 'helpers', 'create', 'update', 'remove', 'delete',
  'parse', 'format', 'render', 'setup', 'start', 'stop', 'load', 'save', 'read', 'write',
]);
const CALLER_FILE_CAP = 15;
const SYMBOLS_PER_FILE = 8;

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

/**
 * Best-effort exported-symbol extraction (grep-approximate, no semantic analysis).
 * JS/TS: `export [default] [async] function NAME`, `export const|let|var NAME`,
 * `export class NAME`, and `export { A, B as C }` (captures the exported-as name).
 * Python: top-level `def NAME` / `class NAME`. Other extensions → []. Used to seed
 * the caller signal; cannot disambiguate same-named symbols across scopes.
 * @param {string} src @param {string} ext @returns {string[]}
 */
export function parseExports(src, ext) {
  const names = new Set();
  const s = String(src);
  if (JS_EXTS.has(ext)) {
    for (const m of s.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const asMatch = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(seg);
        const name = asMatch ? asMatch[1] : /^([A-Za-z_$][\w$]*)/.exec(seg)?.[1];
        if (name) names.add(name);
      }
    }
  } else if (ext === '.py') {
    for (const m of s.matchAll(/^def\s+([A-Za-z_]\w*)/gm)) names.add(m[1]);
    for (const m of s.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) names.add(m[1]);
  }
  return [...names];
}

/** Length of the shared leading run of two strings. */
function sharedPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Same-directory code files most likely related to `filePath`, ranked by shared
 * filename-prefix length with its stem (desc), tie-broken alphabetically (asc) for
 * determinism. Excludes the file itself and anything in `exclude`. Repo-relative paths.
 * @param {string} repoDir @param {string} filePath
 * @param {{ max?: number, exclude?: Set<string> }} [opts] @returns {string[]}
 */
export function findSiblings(repoDir, filePath, { max = 5, exclude = new Set() } = {}) {
  const dir = dirname(filePath);
  let entries;
  try { entries = readdirSync(join(repoDir, dir), { withFileTypes: true }); }
  catch { return []; }
  const stem = basename(filePath, extname(filePath));
  const selfBase = basename(filePath);
  const cands = entries
    .filter((e) => e.isFile() && SIBLING_EXTS.has(extname(e.name)) && e.name !== selfBase)
    .map((e) => (dir === '.' ? e.name : `${dir}/${e.name}`))
    .filter((p) => !exclude.has(p));
  cands.sort((a, b) => {
    const da = sharedPrefixLen(stem, basename(a, extname(a)));
    const db = sharedPrefixLen(stem, basename(b, extname(b)));
    return db !== da ? db - da : a.localeCompare(b);
  });
  return cands.slice(0, max);
}

export function getContext({ files, repoDir, maxFiles = 50, ignore = [] }) {
  const related = new Map(); // path → reason (first reason wins)
  const descriptions = new Map(); // path → description (manifest entries only)
  const changed = new Set(files);
  const srcCache = new Map(); // changed file → source text (read once, reused by the caller pass)

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
      const src = readFileSync(abs, 'utf8');
      srcCache.set(f, src);
      for (const spec of parseImports(src)) {
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

  // Callers (4A): symbol-level reverse refs for barrel/re-export call sites the
  // import grep misses. Conservative — distinctive exported names only, with a global
  // lookup set + per-file and total caps so a hot symbol can't flood the context.
  const lookedUp = new Set();
  let callerFiles = 0;
  for (const f of files) {
    if (callerFiles >= CALLER_FILE_CAP) break;
    const src = srcCache.get(f);
    if (src === undefined) continue;
    const symbols = parseExports(src, extname(f))
      .filter((s) => s.length >= 4 && !COMMON_NAMES.has(s.toLowerCase()) && !lookedUp.has(s))
      .slice(0, SYMBOLS_PER_FILE);
    for (const sym of symbols) {
      lookedUp.add(sym);
      let refs;
      try { refs = findRefs(repoDir, sym).references; } catch { continue; }
      for (const ref of refs) {
        if (callerFiles >= CALLER_FILE_CAP) break;
        if (!changed.has(ref.file) && !related.has(ref.file)) {
          related.set(ref.file, 'caller');
          callerFiles++;
        }
      }
    }
  }

  // Siblings (4A): same-directory code files, ranked by shared filename-prefix.
  const siblingExclude = new Set([...changed, ...related.keys()]);
  for (const f of files) {
    for (const sib of findSiblings(repoDir, f, { max: 5, exclude: siblingExclude })) {
      if (!related.has(sib)) {
        related.set(sib, 'sibling');
        siblingExclude.add(sib);
      }
    }
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
