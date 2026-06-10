import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { shortHead } from './git.mjs';

function reviewsDir(repoDir) {
  return join(repoDir, '.anchor', 'reviews');
}

export function saveReview(repoDir, content, meta = {}) {
  const date = meta.date ?? new Date().toISOString().slice(0, 10);
  const sha = meta.sha ?? shortHead(repoDir) ?? 'nosha';
  mkdirSync(reviewsDir(repoDir), { recursive: true });
  const path = meta.path ?? join(reviewsDir(repoDir), `${date}-${sha}.md`);
  const fm = {
    date,
    sha,
    target: meta.target ?? '',
    score: meta.score ?? null,
    severities: meta.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
  };
  writeFileSync(path, stringifyFrontmatter(fm, content));
  return { path };
}

export function listReviews(repoDir) {
  const dir = reviewsDir(repoDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      return { file: join(dir, file), date: data.date ?? null, sha: data.sha ?? null, target: data.target ?? '', score: data.score ?? null, severities: data.severities ?? null };
    })
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || b.file.localeCompare(a.file));
}

export function showReview(repoDir, sha) {
  if (!sha || sha.length < 4) return null;
  const match = listReviews(repoDir).find((r) => r.sha === sha || basename(r.file).includes(sha));
  if (!match) return null;
  return { content: readFileSync(match.file, 'utf8') };
}
