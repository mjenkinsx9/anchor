// NOTE: readFileSync, existsSync, join, runGit, and runCmd are used by the
// full getDiff implementation arriving in the next task. They are omitted here
// to keep the typecheck clean; add them back when implementing getDiff.

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

export function parseUnifiedDiff(text) {
  const files = [];
  let file = null;
  let oldPath = null;
  let hunk = null;
  let remOld = 0;
  let remNew = 0;

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
    if (line.startsWith('--- ')) { oldPath = line.slice(4).replace(/^a\//, ''); continue; }
    if (line.startsWith('+++ ')) {
      const newPath = line.slice(4).replace(/^b\//, '');
      file = { path: newPath === '/dev/null' ? oldPath : newPath, added: 0, removed: 0, hunks: [] };
      files.push(file);
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

/** Placeholder until the next task implements local + PR modes. */
export function getDiff() {
  throw new Error('anchor: getDiff not implemented yet');
}
