import { runGit, escapeRe } from './git.mjs';

const CODE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.py', '*.go', '*.rs', '*.java', '*.rb', '*.c', '*.cpp', '*.h'];

// Find word-boundary references to `symbol` across code files. Returns
// { symbol, references: [{file, line, text}], count }. Throws on a non-identifier symbol.
// NOTE: returns ALL references (definitions + calls), not a definition-resolved set.
export function findRefs(repoDir, symbol, { globs = CODE_GLOBS } = {}) {
  if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) throw new Error('anchor: refs needs a valid identifier');
  const r = runGit(['grep', '-nwE', escapeRe(symbol), '--', ...globs], { cwd: repoDir });
  const references = r.stdout.split('\n').filter(Boolean).map((l) => {
    const m = /^(.+?):(\d+):(.*)$/.exec(l);
    return m ? { file: m[1], line: Number(m[2]), text: m[3].trim() } : null;
  }).filter(Boolean);
  return { symbol, references, count: references.length };
}
