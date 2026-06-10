import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { runGit, runCmd, hasCmd } from './git.mjs';
import { filterIgnored, DEFAULT_IGNORE_DIRS } from './ignore.mjs';
import { parseImports, resolveImport } from './context.mjs';

const CONVENTIONAL_RE = /^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\(.+\))?!?:/;
const CONFIG_NAMES = new Set(['package.json', 'tsconfig.json', 'Makefile', 'pyproject.toml', 'Cargo.toml', 'go.mod']);

export function gatherInitData(repoDir, { depth = 100, prLimit = 50, noPrs = false, noGraph = false } = {}) {
  const warnings = [];
  const files = listFiles(repoDir);
  const { history, hotFiles } = buildHistory(repoDir, depth, warnings);
  const structure = buildStructure(repoDir, files, hotFiles);
  const dependencyGraph = noGraph ? null : buildGraph(repoDir, files, hotFiles);
  const pullRequests = noPrs ? null : buildPrs(repoDir, prLimit, warnings);
  return { structure, dependencyGraph, history, pullRequests, warnings };
}

function listFiles(repoDir) {
  const out = runGit(['ls-files'], { cwd: repoDir }).stdout.split('\n').filter(Boolean);
  const anchorignore = join(repoDir, '.anchorignore');
  const userPatterns = existsSync(anchorignore)
    ? readFileSync(anchorignore, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  return filterIgnored(out, [...DEFAULT_IGNORE_DIRS, ...userPatterns]);
}

function buildStructure(repoDir, files, hotFiles) {
  const topLevelDirs = [...new Set(files.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
  const languageMix = {};
  for (const f of files) {
    const ext = extname(f);
    if (ext) languageMix[ext] = (languageMix[ext] ?? 0) + 1;
  }
  const notable = new Map();
  for (const f of files) {
    const name = basename(f);
    if (/^(index|main|app)\.(ts|tsx|js|jsx|mjs|py)$/.test(name) || f.startsWith('bin/')) {
      notable.set(f, 'entrypoint');
    } else if (CONFIG_NAMES.has(name) || /\.config\.(ts|js|mjs|json)$/.test(name)) {
      if (!notable.has(f)) notable.set(f, 'config');
    }
  }
  const bySize = files
    .map((f) => ({ f, size: safeSize(join(repoDir, f)) }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
  for (const { f } of bySize) if (!notable.has(f)) notable.set(f, 'large');
  for (const { path } of hotFiles.slice(0, 5)) if (files.includes(path) && !notable.has(path)) notable.set(path, 'recently-changed');
  return {
    topLevelDirs,
    fileCount: files.length,
    languageMix,
    notableFiles: [...notable.entries()].slice(0, 15).map(([path, reason]) => ({ path, reason })),
  };
}

function safeSize(p) {
  try { return statSync(p).size; } catch { return 0; }
}

function normalizeNumstatPath(p) {
  // compact form: prefix{old => new}suffix  → prefix + new + suffix
  const compact = /^(.*)\{(?:[^{}]*) => ([^{}]*)\}(.*)$/.exec(p);
  if (compact) return (compact[1] + compact[2] + compact[3]).replace(/\/\//g, '/');
  // full form: old => new → new
  const full = /^.* => (.+)$/.exec(p);
  if (full) return full[1];
  return p;
}

function buildHistory(repoDir, depth, warnings) {
  const log = runGit(['log', '-n', String(depth), '--format=%h|%aI|%an|%s'], { cwd: repoDir });
  if (log.code !== 0 || !log.stdout.trim()) {
    warnings.push('anchor: no commits found. Init will only build the structure and graph.');
    return {
      history: { recentCommits: [], commitMessageStyle: { conventionalCommits: false, avgSubjectLength: 0, commonPrefixes: [] } },
      hotFiles: [],
    };
  }
  const recentCommits = log.stdout.trim().split('\n').map((l) => {
    const [sha, date, author, ...rest] = l.split('|');
    return { sha, date, author, subject: rest.join('|'), filesChanged: 0 };
  });

  const numstat = runGit(['log', '-n', String(depth), '--numstat', '--format=@%h'], { cwd: repoDir }).stdout;
  const changeCounts = new Map();
  let currentSha = null;
  const perCommit = new Map();
  for (const line of numstat.split('\n')) {
    if (line.startsWith('@')) { currentSha = line.slice(1); continue; }
    const m = /^\d+\t\d+\t(.+)$/.exec(line) ?? /^-\t-\t(.+)$/.exec(line);
    if (m && currentSha) {
      const path = normalizeNumstatPath(m[1]);
      changeCounts.set(path, (changeCounts.get(path) ?? 0) + 1);
      perCommit.set(currentSha, (perCommit.get(currentSha) ?? 0) + 1);
    }
  }
  for (const c of recentCommits) c.filesChanged = perCommit.get(c.sha) ?? 0;
  const hotFiles = [...changeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, changeCount]) => ({ path, changeCount }));

  const subjects = recentCommits.map((c) => c.subject);
  const conventional = subjects.filter((s) => CONVENTIONAL_RE.test(s)).length / subjects.length >= 0.6;
  const avgSubjectLength = Math.round(subjects.reduce((s, x) => s + x.length, 0) / subjects.length);
  const firstWords = new Map();
  for (const s of subjects) {
    const w = (s.split(/[\s:]/)[0] ?? '').toLowerCase();
    if (w) firstWords.set(w, (firstWords.get(w) ?? 0) + 1);
  }
  const commonPrefixes = [...firstWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

  return {
    history: { recentCommits, commitMessageStyle: { conventionalCommits: conventional, avgSubjectLength, commonPrefixes } },
    hotFiles,
  };
}

function buildGraph(repoDir, files, hotFiles) {
  const moduleOf = (f) => (f.includes('/') ? f.split('/')[0] : '.');
  const moduleImports = new Map(); // module → Set(module)
  const importTargets = new Map(); // file → import count
  const fileSet = new Set(files);
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|py)$/.test(f)) continue;
    const abs = join(repoDir, f);
    if (!existsSync(abs)) continue;
    for (const spec of parseImports(readFileSync(abs, 'utf8'))) {
      const target = resolveImport(repoDir, f, spec);
      if (!target || !fileSet.has(target)) continue;
      importTargets.set(target, (importTargets.get(target) ?? 0) + 1);
      const from = moduleOf(f);
      const to = moduleOf(target);
      if (from !== to) {
        if (!moduleImports.has(from)) moduleImports.set(from, new Set());
        moduleImports.get(from).add(to);
      }
    }
  }
  const allModules = [...new Set(files.map(moduleOf))];
  const modules = allModules.map((path) => ({
    path,
    imports: [...(moduleImports.get(path) ?? [])],
    importedBy: allModules.filter((other) => moduleImports.get(other)?.has(path)),
  }));
  const criticalFiles = [...importTargets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, importCount]) => ({ path, importCount }));
  return { modules, hotFiles, criticalFiles };
}

function buildPrs(repoDir, prLimit, warnings) {
  if (!hasCmd('gh')) {
    warnings.push('anchor: gh not available; skipping PR analysis. Use --no-prs to silence this message.');
    return null;
  }
  const r = runCmd('gh', ['pr', 'list', '--state', 'all', '--limit', String(prLimit), '--json', 'number,title,author,state,additions,deletions'], { cwd: repoDir });
  if (r.code !== 0) {
    warnings.push('anchor: gh pr list failed; skipping PR analysis.');
    return null;
  }
  let prs;
  try { prs = JSON.parse(r.stdout); } catch {
    warnings.push('anchor: could not parse gh pr list output; skipping PR analysis.');
    return null;
  }
  return {
    recent: prs.map((p) => ({
      number: p.number, title: p.title, author: p.author?.login ?? '', state: p.state,
      reviewComments: 0, additions: p.additions ?? 0, deletions: p.deletions ?? 0,
    })),
    recurringThemes: [], // extracted by the LLM in a second pass (spec §9)
  };
}
