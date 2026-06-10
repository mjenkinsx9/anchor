import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HEADER = `# Anchor Learnings

<!--
This file is auto-managed by Anchor. Each entry is a "noise pattern" the
user has marked as not worth surfacing in future reviews.

Hand-edits are supported ONLY in this exact shape — one "### Heading" line,
optionally followed by one reason comment line (the format addLearning writes).
Anything else (body paragraphs, extra markdown) is discarded on the next rewrite.
Manage entries with \`anchor learn add|remove\` to be safe.
-->
`;

function filePath(repoDir) {
  return join(repoDir, '.anchor', 'learnings.md');
}

function sanitize(text) {
  return text
    .replace(/\s*\n\s*/g, ' ')   // collapse newlines — format is line-oriented
    .replace(/-->/g, '→')        // would terminate the HTML reason comment early
    .trim();
}

function parse(text) {
  const patterns = [];
  const re = /^### (.+)\n(?:<!-- reason: (.*?) -->\n?)?/gm;
  for (const m of text.matchAll(re)) {
    patterns.push({ heading: m[1].trim(), reason: m[2]?.trim() ?? null });
  }
  return patterns;
}

function serialize(patterns) {
  const body = patterns
    .map((p) => `### ${p.heading}\n${p.reason ? `<!-- reason: ${p.reason} -->\n` : ''}`)
    .join('\n');
  return `${HEADER}\n${body}`;
}

export function listLearnings(repoDir) {
  const f = filePath(repoDir);
  if (!existsSync(f)) return { patterns: [] };
  return { patterns: parse(readFileSync(f, 'utf8')) };
}

export function addLearning(repoDir, pattern, reason) {
  const heading = sanitize(pattern ?? '');
  if (!heading) throw new Error('anchor: pattern cannot be empty');
  const { patterns } = listLearnings(repoDir);
  if (patterns.some((p) => p.heading.toLowerCase() === heading.toLowerCase())) {
    return { added: false, deduped: true };
  }
  patterns.push({ heading, reason: reason ? sanitize(reason) || null : null });
  mkdirSync(dirname(filePath(repoDir)), { recursive: true });
  writeFileSync(filePath(repoDir), serialize(patterns));
  return { added: true, deduped: false };
}

export function removeLearning(repoDir, substring) {
  const needle = (substring ?? '').trim().toLowerCase();
  if (!needle) throw new Error('anchor: search term cannot be empty');
  const { patterns } = listLearnings(repoDir);
  const kept = patterns.filter((p) => !p.heading.toLowerCase().includes(needle));
  const removed = patterns.length - kept.length;
  if (removed > 0) writeFileSync(filePath(repoDir), serialize(kept));
  return { removed };
}
