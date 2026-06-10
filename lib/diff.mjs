import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit } from './git.mjs';

export function parseTarget(tokens = []) {
  const t = tokens.filter((x) => !x.startsWith('--'));
  if (t.length === 0) return { mode: 'uncommitted' };
  if (t[0] === 'pr') {
    const selector = t[1] ?? '';
    if (!selector) throw new Error('anchor: pr mode needs a number or URL, e.g. `anchor diff pr 123`');
    return { mode: 'pr', selector };
  }
  if (t[0].startsWith('@')) return { mode: 'file', path: t[0].slice(1) };
  if (t[0].includes('..')) {
    const [ref1, ref2] = t[0].split(/\.{2,3}/);
    return { mode: 'ref-diff', ref1, ref2, range: t[0] };
  }
  throw new Error(`anchor: unrecognized target "${t[0]}"`);
}

/**
 * @typedef {{ path: string; added: number; removed: number; hunks: object[];
 *             binary?: boolean; renamedFrom?: string; modeChange?: boolean }} DiffFile
 */

/** @returns {DiffFile[]} */
export function parseUnifiedDiff(text) {
  const files = [];
  let file = null;        // current file record (created lazily on +++ line)
  let pending = null;     // { oldGit, newGit, flags } from the last `diff --git` line
  let oldPath = null;
  let hunk = null;
  let remOld = 0;
  let remNew = 0;

  const flush = () => {
    // emit a record for a `diff --git` section that never produced a +++ line
    if (pending && !file) {
      files.push({ path: pending.newGit, added: 0, removed: 0, hunks: [], ...pending.flags });
    }
    pending = null;
    file = null;
    oldPath = null;
    hunk = null;
    remOld = remNew = 0;
  };

  for (const line of text.split('\n')) {
    if (hunk && (remOld > 0 || remNew > 0)) {
      if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      hunk.body += line + '\n';
      const c = line[0];
      if (c === '+') { remNew--; file.added++; }
      else if (c === '-') { remOld--; file.removed++; }
      else { remOld--; remNew--; }
      continue;
    }
    const dg = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (dg) {
      flush();
      pending = { oldGit: dg[1], newGit: dg[2], flags: {} };
      continue;
    }
    if (pending) {
      if (line.startsWith('Binary files ')) pending.flags.binary = true;
      else if (line.startsWith('rename from ')) pending.flags.renamedFrom = line.slice('rename from '.length);
      else if (line.startsWith('old mode ')) pending.flags.modeChange = true;
    }
    if (line.startsWith('--- ')) { oldPath = line.slice(4).replace(/^a\//, ''); continue; }
    if (line.startsWith('+++ ')) {
      const newPath = line.slice(4).replace(/^b\//, '');
      file = {
        path: newPath === '/dev/null' ? oldPath : newPath,
        added: 0, removed: 0, hunks: [],
        ...(pending?.flags ?? {}),
      };
      files.push(file);
      pending = null;   // consumed — prevents flush() from emitting a duplicate
      oldPath = null;   // reset — prevents stale-path duplication on malformed input
      hunk = null;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file) {
      hunk = {
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        body: '',
      };
      remOld = hunk.oldLines;
      remNew = hunk.newLines;
      file.hunks.push(hunk);
    }
  }
  flush();   // emit any trailing header-only section
  return files;
}

export function withStats(result) {
  const stats = result.files.reduce(
    (s, f) => ({
      totalAdded: s.totalAdded + f.added,
      totalRemoved: s.totalRemoved + f.removed,
      fileCount: s.fileCount + 1,
    }),
    { totalAdded: 0, totalRemoved: 0, fileCount: 0 },
  );
  return { ...result, stats };
}

/**
 * @param {string[]} tokens
 * @param {{ cwd?: string; env?: NodeJS.ProcessEnv }} [opts]
 */
export function getDiff(tokens, { cwd = process.cwd(), env } = {}) {
  const staged = tokens.includes('--staged');
  const target = staged ? { mode: 'staged' } : parseTarget(tokens);

  if (target.mode === 'file') return fileMode(target, cwd);
  if (target.mode === 'pr') return prMode(target, cwd, env);

  if (target.mode === 'uncommitted' && runGit(['rev-parse', '--verify', 'HEAD'], { cwd, env }).code !== 0) {
    throw new Error('anchor: no commits yet in this repository (nothing to diff against HEAD). Stage files and use --staged.');
  }

  let raw;
  if (target.mode === 'uncommitted') {
    const untracked = runGit(['ls-files', '--others', '--exclude-standard'], { cwd, env })
      .stdout.split('\n').filter(Boolean);
    if (untracked.length > 0) runGit(['add', '-N', '--', ...untracked], { cwd, env });
    try {
      raw = runGit(['diff', 'HEAD'], { cwd, env });
    } finally {
      if (untracked.length > 0) runGit(['restore', '--staged', '--', ...untracked], { cwd, env });
    }
  } else if (target.mode === 'staged') raw = runGit(['diff', '--cached'], { cwd, env });
  else raw = runGit(['diff', target.range], { cwd, env });

  if (raw.code !== 0) throw new Error(`anchor: git diff failed: ${raw.stderr.trim()}`);
  return withStats({
    mode: target.mode,
    ...(target.ref1 ? { ref1: target.ref1, ref2: target.ref2 } : {}),
    files: parseUnifiedDiff(raw.stdout),
  });
}

function fileMode(target, cwd) {
  const abs = join(cwd, target.path);
  if (!existsSync(abs)) throw new Error(`anchor: file not found: ${target.path}`);
  const body = readFileSync(abs, 'utf8');
  const n = body === '' ? 0 : body.endsWith('\n') ? body.split('\n').length - 1 : body.split('\n').length;
  return withStats({
    mode: 'file',
    files: [{
      path: target.path,
      added: n,
      removed: 0,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: n, body }],
    }],
  });
}

/** Placeholder until the next task implements PR mode via gh. */
function prMode(_target, _cwd, _env) {
  throw new Error('anchor: PR mode not implemented yet');
}
