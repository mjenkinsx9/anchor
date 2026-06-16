import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, runCmd } from './git.mjs';

export function parseTarget(tokens = []) {
  const t = tokens.filter((x) => !x.startsWith('--'));
  if (t.length === 0) return { mode: 'uncommitted' };
  // Accept the mode words the diff JSON itself reports, so output round-trips
  // (e.g. `anchor context --from-diff uncommitted`).
  if (t[0] === 'uncommitted') return { mode: 'uncommitted' };
  if (t[0] === 'staged') return { mode: 'staged' };
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

/**
 * Apply the diff-size budget without ever dropping the diff. Over budget,
 * the result is still returned with `overBudget: true` and a `budgetWarning`
 * so the reviewer can prioritize the most important files instead of bailing.
 * `force` suppresses the flag entirely.
 * @param {{ files: DiffFile[] } & Record<string, any>} result
 * @param {{ maxLines: number; maxFiles: number; force?: boolean }} budget
 */
export function applyBudget(result, { maxLines, maxFiles, force = false }) {
  const totalLines = result.files.reduce((s, f) => s + f.added + f.removed, 0);
  const reasons = [];
  if (totalLines > maxLines) {
    reasons.push(`${totalLines.toLocaleString()} change-lines (budget ${maxLines.toLocaleString()})`);
  }
  if (result.files.length > maxFiles) {
    reasons.push(`${result.files.length.toLocaleString()} files (budget ${maxFiles.toLocaleString()})`);
  }
  if (force || reasons.length === 0) return result;
  return {
    ...result,
    overBudget: true,
    budgetWarning:
      `anchor: diff exceeds budget — ${reasons.join('; ')}. Reviewing anyway; ` +
      'prioritize the most important files. Use --force to silence, ' +
      '--max-diff-lines N to raise the budget, or split the change.',
  };
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

function prMode(target, cwd, env) {
  if (runCmd('gh', ['--version'], { env }).code !== 0) {
    throw new Error('anchor: PR mode requires the `gh` CLI. Install from https://cli.github.com.');
  }
  const view = runCmd(
    'gh',
    ['pr', 'view', target.selector, '--json', 'number,url'],
    { cwd, env },
  );
  if (view.code !== 0) {
    if (/not logged in|authentication required|no credentials|gh auth login/i.test(view.stderr)) {
      throw new Error('anchor: `gh` is not authenticated. Run `gh auth login` first.');
    }
    throw new Error(`anchor: gh pr view failed: ${view.stderr.trim()}`);
  }
  let meta;
  try {
    meta = JSON.parse(view.stdout);
  } catch {
    throw new Error(`anchor: gh pr view returned unexpected output: ${view.stdout.trim().slice(0, 120)}`);
  }
  const diff = runCmd('gh', ['pr', 'diff', target.selector], { cwd, env });
  if (diff.code !== 0) throw new Error(`anchor: gh pr diff failed: ${diff.stderr.trim()}`);
  return withStats({
    mode: 'pr',
    prNumber: String(meta.number),
    prUrl: meta.url,
    files: parseUnifiedDiff(diff.stdout),
  });
}
