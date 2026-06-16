import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { matchesScope } from './ignore.mjs';

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
    .replace(/\s+/g, ' ')        // collapse ALL whitespace runs — line-oriented format + dedup
    .replace(/-->/g, '→')        // would terminate the HTML reason comment early
    .trim();
}

/**
 * Parse the learnings file. Each entry: a `### heading`, an optional
 * `<!-- reason: ... -->` line, and an optional `<!-- meta: {json} -->` line.
 * Legacy entries (no meta) default to `{ scope: '**', category: null, action: 'suppress' }`,
 * preserving the original apply-everywhere behavior.
 */
function parse(text) {
  const patterns = [];
  const re = /^### (.+)\n(?:<!-- reason: (.*?) -->\n?)?(?:<!-- meta: (\{.*?\}) -->\n?)?/gm;
  for (const m of text.matchAll(re)) {
    let meta = {};
    if (m[3]) { try { meta = JSON.parse(m[3]) ?? {}; } catch { meta = {}; } }
    patterns.push({
      heading: m[1].trim(),
      reason: m[2]?.trim() ?? null,
      scope: (typeof meta.scope === 'string' && meta.scope) ? meta.scope : '**',
      category: typeof meta.category === 'string' ? meta.category : null,
      action: (typeof meta.action === 'string' && meta.action) ? meta.action : 'suppress',
    });
  }
  return patterns;
}

/** A meta line is only written when an entry departs from the legacy defaults. */
function metaLine(p) {
  const meta = {};
  if (p.scope && p.scope !== '**') meta.scope = p.scope;
  if (p.category) meta.category = p.category;
  if (p.action && p.action !== 'suppress') meta.action = p.action;
  return Object.keys(meta).length ? `<!-- meta: ${JSON.stringify(meta)} -->\n` : '';
}

function serialize(patterns) {
  const body = patterns
    .map((p) => `### ${p.heading}\n${p.reason ? `<!-- reason: ${p.reason} -->\n` : ''}${metaLine(p)}`)
    .join('\n');
  return `${HEADER}\n${body}`;
}

/** Return learnings whose `scope` glob (default '**') matches at least one changed path. */
export function selectLearnings(patterns, changedPaths) {
  return (patterns ?? []).filter((p) => matchesScope(p.scope, changedPaths));
}

export function listLearnings(repoDir) {
  const f = filePath(repoDir);
  if (!existsSync(f)) return { patterns: [] };
  return { patterns: parse(readFileSync(f, 'utf8')) };
}

export function addLearning(repoDir, pattern, reason, meta = {}) {
  const heading = sanitize(pattern ?? '');
  if (!heading) throw new Error('anchor: pattern cannot be empty');
  const { patterns } = listLearnings(repoDir);
  if (patterns.some((p) => p.heading.toLowerCase() === heading.toLowerCase())) {
    return { added: false, deduped: true };
  }
  patterns.push({
    heading,
    reason: reason ? sanitize(reason) || null : null,
    scope: typeof meta.scope === 'string' && meta.scope ? meta.scope : '**',
    category: typeof meta.category === 'string' && meta.category ? meta.category : null,
    action: typeof meta.action === 'string' && meta.action ? meta.action : 'suppress',
  });
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
