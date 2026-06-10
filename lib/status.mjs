import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { runGit, runCmd, hasCmd } from './git.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { listReviews } from './review.mjs';
import { listLearnings } from './learn.mjs';

function asDateString(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? null : String(v);
}

function artifactInfo(repoDir, name) {
  const p = join(repoDir, '.anchor', name);
  if (!existsSync(p)) return null;
  const { data } = parseFrontmatter(readFileSync(p, 'utf8'));
  const built = asDateString(data.built);
  const ageDays = built ? Math.max(0, Math.floor((Date.now() - new Date(built).getTime()) / 86400000)) : null;
  const info = { built, ageDays };
  if (data.fileCount !== undefined) info.fileCount = data.fileCount;
  return info;
}

export function getStatus(repoDir) {
  const root = repoDir;

  const reviews = listReviews(root);
  const last = reviews[0] ?? null;
  const lastReview = last
    ? {
        date: asDateString(last.date), sha: last.sha, target: last.target, score: last.score,
        fileCount: null,
        openFindings: last.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
        archivePath: last.file,
      }
    : null;

  const artifacts = {
    codebaseMap: artifactInfo(root, 'codebase-map.md'),
    codebaseGraph: artifactInfo(root, 'codebase-graph.md'),
    learnings: { count: listLearnings(root).patterns.length },
  };

  const porcelain = runGit(['status', '--porcelain'], { cwd: root });
  const clean = porcelain.stdout.trim() === '';
  const unpushedR = runGit(['log', '@{u}..', '--oneline'], { cwd: root });
  const unpushedCommits = unpushedR.code === 0 ? unpushedR.stdout.split('\n').filter(Boolean).length : 0;

  let openPrs = [];
  if (hasCmd('gh')) {
    const r = runCmd('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,baseRefName,updatedAt'], { cwd: root });
    if (r.code === 0) {
      try {
        openPrs = JSON.parse(r.stdout).map((p) => ({
          number: p.number, title: p.title, branch: p.headRefName,
          baseBranch: p.baseRefName, lastActivity: p.updatedAt, reviewCount: 0,
        }));
      } catch { openPrs = []; }
    }
  }

  let nextSuggestion;
  if (openPrs.length > 0) {
    nextSuggestion = `PR #${openPrs[0].number} is awaiting review. Try: /anchor review pr ${openPrs[0].number}`;
  } else if (!clean) {
    nextSuggestion = 'You have uncommitted changes. Try: /anchor review';
  } else if (unpushedCommits > 0) {
    nextSuggestion = `You have ${unpushedCommits} unpushed commit(s). Try: /anchor review @{u}..HEAD`;
  } else {
    nextSuggestion = 'All clean — run /anchor review when you have new changes';
  }

  return {
    repo: { path: root, name: basename(root) },
    lastReview,
    artifacts,
    git: { clean, unpushedCommits, openPrs },
    nextSuggestion,
  };
}

export function renderStatusText(s) {
  const lines = [];
  lines.push('Anchor Status');
  lines.push('─────────────');
  lines.push(`Repo:           ${s.repo.path}`);
  lines.push('');
  if (s.lastReview) {
    lines.push(`Last review:    ${s.lastReview.date} (${s.lastReview.target || 'unknown target'})`);
    lines.push(`                score: ${s.lastReview.score ?? '?'}/5`);
    lines.push(`                archive: ${s.lastReview.archivePath}`);
    const f = s.lastReview.openFindings;
    lines.push(`Open findings:  ${f.critical} critical, ${f.high} high, ${f.medium} medium, ${f.low} low (from last review)`);
  } else {
    lines.push('Last review:    never');
  }
  lines.push('');
  const map = s.artifacts.codebaseMap;
  const graph = s.artifacts.codebaseGraph;
  lines.push(`Codebase map:   ${map ? `built ${map.built} (${map.ageDays} days ago)${map.fileCount ? ` — ${map.fileCount} files` : ''}` : 'not built — run /anchor init'}`);
  lines.push(`Graph:          ${graph ? `built ${graph.built} (${graph.ageDays} days ago)` : 'not built'}`);
  lines.push(`Learnings:      ${s.artifacts.learnings.count} patterns`);
  lines.push('');
  lines.push(`Git status:     ${s.git.clean ? '✓ working tree clean' : '⚠ uncommitted changes'}`);
  lines.push(`                ${s.git.unpushedCommits === 0 ? '✓ 0 unpushed commits' : `⚠ ${s.git.unpushedCommits} unpushed commits`}`);
  if (s.git.openPrs.length > 0) {
    for (const pr of s.git.openPrs) {
      lines.push(`                ⚠ PR #${pr.number} open (${pr.branch} → ${pr.baseBranch})`);
    }
  } else {
    lines.push('                ✓ no open PRs');
  }
  lines.push('');
  lines.push(`Next:           ${s.nextSuggestion}`);
  return lines.join('\n');
}
