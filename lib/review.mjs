import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { shortHead } from './git.mjs';

function reviewsDir(repoDir) {
  return join(repoDir, '.anchor', 'reviews');
}

/**
 * Pull score + severity counts out of a rendered review. Prefers a machine-readable
 * `<!-- anchor:meta {"score":n,"severities":{...}} -->` block (emitted by SKILL.md
 * step 7) and only falls back to scraping the human render (`Confidence: <n> / 5`
 * and `🔴 CRITICAL  (<n>)` headers) when the block is absent or invalid.
 * Returns nulls when neither is present (freeform content).
 */
export function extractReviewMeta(content) {
  const block = /<!--\s*anchor:meta\s*(\{[\s\S]*?\})\s*-->/.exec(content);
  if (block) {
    try {
      const m = JSON.parse(block[1]);
      if (m && typeof m === 'object') {
        return {
          score: typeof m.score === 'number' ? m.score : null,
          severities: (m.severities && typeof m.severities === 'object') ? m.severities : null,
        };
      }
    } catch { /* malformed block — fall through to text scraping */ }
  }
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

/**
 * Parse every per-finding `anchor:finding` block from a rendered review.
 * Mirrors extractReviewMeta's HTML-comment convention (the terminating `}` is the
 * one immediately before `-->`, so nested JSON in `fix` is captured intact) but
 * returns ALL blocks. Best-effort: malformed-JSON blocks are skipped, never thrown.
 * A block must carry a string `file` and a string `title` (the dedup identity) to
 * count; other fields pass through as authored. The LLM never computes a hash —
 * this script is the single parser (4C reads `file`+`title`; 4D writes `fix`).
 * @param {string} content
 * @returns {Array<{ n?: number, file: string, line?: number, severity?: string,
 *   category?: string, title: string, fix?: object }>}
 */
export function parseFindingBlocks(content) {
  const out = [];
  const re = /<!--\s*anchor:finding\s*(\{[\s\S]*?\})\s*-->/g;
  for (const m of String(content).matchAll(re)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch { continue; }
    if (!obj || typeof obj !== 'object') continue;
    if (typeof obj.file !== 'string' || typeof obj.title !== 'string') continue;
    out.push(obj);
  }
  return out;
}

/** Canonical, digit-blind title key — line shifts must not break finding identity. */
export function normalizeTitle(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\d+/g, '#').trim();
}

/** Deterministic per-finding identity: sha1(file + NUL + normalized title), hex. */
export function findingHash(file, title) {
  return createHash('sha1').update(`${file}\0${normalizeTitle(title)}`).digest('hex');
}

export function saveReview(repoDir, content, meta = {}) {
  const date = meta.date ?? new Date().toISOString().slice(0, 10);
  const sha = meta.sha ?? shortHead(repoDir) ?? 'nosha';
  const path = meta.path ?? join(reviewsDir(repoDir), `${date}-${sha}.md`);
  mkdirSync(dirname(path), { recursive: true });
  const extracted = extractReviewMeta(content);
  const findings = parseFindingBlocks(content).map((f) => ({
    file: f.file, line: typeof f.line === 'number' ? f.line : null, title: f.title,
  }));
  const fm = {
    date,
    sha,
    target: meta.target ?? '',
    score: meta.score ?? extracted.score,
    severities: meta.severities ?? extracted.severities ?? { critical: 0, high: 0, medium: 0, low: 0 },
    findings,
    finding_hashes: findings.map((f) => findingHash(f.file, f.title)),
  };
  // Script-level dedup safety net (4C): flag — never drop or rewrite — findings whose
  // identity hash already appeared in the most-recent prior review. Self-excludes the
  // file being (over)written so re-saving the same review can't flag itself.
  const prior = listReviews(repoDir).find((r) => r.file !== path);
  const priorHashes = new Set(prior?.finding_hashes ?? []);
  const repeated = findings.filter((f) => priorHashes.has(findingHash(f.file, f.title)));
  if (repeated.length) fm.repeated_finding_hashes = repeated.map((f) => findingHash(f.file, f.title));
  writeFileSync(path, stringifyFrontmatter(fm, content));
  return { path, repeated: repeated.map((f) => ({ file: f.file, title: f.title })) };
}

export function listReviews(repoDir) {
  const dir = reviewsDir(repoDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
      return {
        file: join(dir, file),
        date: data.date ?? null,
        sha: data.sha ?? null,
        target: data.target ?? '',
        score: data.score ?? null,
        severities: data.severities ?? null,
        findings: Array.isArray(data.findings) ? data.findings : [],
        finding_hashes: Array.isArray(data.finding_hashes) ? data.finding_hashes : [],
      };
    })
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || b.file.localeCompare(a.file));
}

/** Findings of the most-recent archived review (newest by date), or [] when none. */
export function priorFindings(repoDir) {
  const [latest] = listReviews(repoDir);
  return latest?.findings ?? [];
}

export function showReview(repoDir, sha) {
  if (!sha || sha.length < 4) return null;
  const match = listReviews(repoDir).find((r) => r.sha === sha || basename(r.file).includes(sha));
  if (!match) return null;
  return { content: readFileSync(match.file, 'utf8') };
}
