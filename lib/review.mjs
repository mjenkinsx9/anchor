import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { shortHead } from './git.mjs';

function reviewsDir(repoDir) {
  return join(repoDir, '.anchor', 'reviews');
}

/**
 * Pull score + severity counts out of a rendered review (SKILL.md step 7
 * format: `Confidence: <n> / 5` and `🔴 CRITICAL  (<n>)` section headers).
 * Returns nulls when the markers are absent (freeform content).
 */
export function extractReviewMeta(content) {
  const score = /Confidence:\s*(\d+(?:\.\d+)?)\s*\/\s*5/.exec(content);
  const count = (emoji, word) => {
    const m = new RegExp(`${emoji} ${word}\\s*\\((\\d+)\\)`).exec(content);
    return m ? Number(m[1]) : null;
  };
  const found = {
    critical: count('🔴', 'CRITICAL'),
    high: count('🟠', 'HIGH'),
    medium: count('🟡', 'MEDIUM'),
    low: count('🟢', 'LOW'),
  };
  const anyHeader = Object.values(found).some((v) => v !== null);
  return {
    score: score ? Number(score[1]) : null,
    severities: anyHeader
      ? { critical: found.critical ?? 0, high: found.high ?? 0, medium: found.medium ?? 0, low: found.low ?? 0 }
      : null,
  };
}

export function saveReview(repoDir, content, meta = {}) {
  const date = meta.date ?? new Date().toISOString().slice(0, 10);
  const sha = meta.sha ?? shortHead(repoDir) ?? 'nosha';
  const path = meta.path ?? join(reviewsDir(repoDir), `${date}-${sha}.md`);
  mkdirSync(dirname(path), { recursive: true });
  const extracted = extractReviewMeta(content);
  const fm = {
    date,
    sha,
    target: meta.target ?? '',
    score: meta.score ?? extracted.score,
    severities: meta.severities ?? extracted.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
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
