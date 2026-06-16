import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { isValidGlob } from './ignore.mjs';

export const DEFAULTS = {
  ignore: ['**/*.lock', '**/*.generated.*', 'vendor/**', 'node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
  min_severity: 'low',
  strictness: 2,
  max_findings: 50,
  categories: ['logic', 'security', 'perf', 'style', 'docs', 'tests'],
  protected_categories: ['security', 'data-loss', 'crash', 'injection', 'auth'],
  rules: [],
  min_confidence: 2,
  max_diff_lines: 15000,
  max_files: 100,
  output: { show_whats_good: true, show_diff_stats: true, color: 'auto' },
};

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = ['logic', 'security', 'perf', 'style', 'docs', 'tests'];
const COLORS = ['auto', 'always', 'never'];
const BOUNDS = { max_findings: [1, Infinity], min_confidence: [0, 5], max_diff_lines: [1, Infinity], max_files: [1, Infinity] };

export function loadConfig(repoDir) {
  const warnings = [];
  const file = join(repoDir, '.anchor', 'config.yaml');
  /** @type {any} */ // parsed YAML — shape is validated below, not statically known
  let raw = {};
  if (existsSync(file)) {
    try {
      raw = yaml.load(readFileSync(file, 'utf8')) ?? {};
      if (typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    } catch (e) {
      const line = e?.mark ? ` at line ${e.mark.line + 1}` : '';
      warnings.push(`anchor: .anchor/config.yaml is invalid YAML${line}. Using defaults.`);
      raw = {};
    }
  }
  if (raw.strictness !== undefined && ![1, 2, 3].includes(raw.strictness)) {
    warnings.push(
      `anchor: strictness must be 1, 2, or 3. Got ${JSON.stringify(raw.strictness)}. Using 2 (balanced).`,
    );
    delete raw.strictness;
  }
  if (raw.ignore !== undefined && !Array.isArray(raw.ignore)) {
    warnings.push(`anchor: ignore must be a list. Got ${JSON.stringify(raw.ignore)}. Using defaults.`);
    delete raw.ignore;
  }
  if (raw.categories !== undefined && !Array.isArray(raw.categories)) {
    warnings.push(`anchor: categories must be a list. Got ${JSON.stringify(raw.categories)}. Using defaults.`);
    delete raw.categories;
  }
  for (const key of ['max_findings', 'min_confidence', 'max_diff_lines', 'max_files']) {
    if (raw[key] !== undefined && !Number.isInteger(raw[key])) {
      warnings.push(`anchor: ${key} must be an integer. Got ${JSON.stringify(raw[key])}. Using ${DEFAULTS[key]}.`);
      delete raw[key];
    }
  }
  // Bound the integer keys that survived the type check (e.g. max_files: 0 is nonsensical).
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    if (Number.isInteger(raw[key]) && (raw[key] < lo || raw[key] > hi)) {
      warnings.push(`anchor: ${key} must be between ${lo} and ${hi}. Got ${raw[key]}. Using ${DEFAULTS[key]}.`);
      delete raw[key];
    }
  }
  if (raw.min_severity !== undefined && !SEVERITIES.includes(raw.min_severity)) {
    warnings.push(`anchor: min_severity must be one of ${SEVERITIES.join(', ')}. Got ${JSON.stringify(raw.min_severity)}. Using low.`);
    delete raw.min_severity;
  }
  if (Array.isArray(raw.categories)) {
    const bad = raw.categories.filter((c) => !CATEGORIES.includes(c));
    if (bad.length) {
      warnings.push(`anchor: unknown categories ${JSON.stringify(bad)}. Allowed: ${CATEGORIES.join(', ')}. Dropping them.`);
      raw.categories = raw.categories.filter((c) => CATEGORIES.includes(c));
      // If filtering left NOTHING (every entry was bogus), fall back to defaults rather
      // than silently disabling all findings — `Array.isArray([])` would otherwise win
      // the merge below. An explicitly-empty `categories: []` is left untouched.
      if (raw.categories.length === 0) {
        warnings.push('anchor: all categories were invalid. Using defaults (all).');
        delete raw.categories;
      }
    }
  }
  if (raw.output !== undefined && (typeof raw.output !== 'object' || Array.isArray(raw.output))) {
    warnings.push(`anchor: output must be a mapping. Got ${JSON.stringify(raw.output)}. Using defaults.`);
    delete raw.output;
  }
  if (raw.output && raw.output.color !== undefined && !COLORS.includes(raw.output.color)) {
    warnings.push(`anchor: output.color must be one of ${COLORS.join(', ')}. Got ${JSON.stringify(raw.output.color)}. Using auto.`);
    delete raw.output.color;
  }
  if (raw.protected_categories !== undefined && !Array.isArray(raw.protected_categories)) {
    warnings.push(`anchor: protected_categories must be a list. Got ${JSON.stringify(raw.protected_categories)}. Using defaults.`);
    delete raw.protected_categories;
  }
  // Each rule needs a string `rule`; a present `scope` must be a compilable glob,
  // else selectRules' Minimatch would throw and crash the review. Drop malformed entries.
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules)) {
      warnings.push(`anchor: rules must be a list. Got ${JSON.stringify(raw.rules)}. Ignoring.`);
      delete raw.rules;
    } else {
      raw.rules = raw.rules.filter((r) => {
        if (!r || typeof r.rule !== 'string') {
          warnings.push(`anchor: each rule needs a string "rule". Dropping ${JSON.stringify(r)}.`);
          return false;
        }
        if (r.scope !== undefined && !isValidGlob(r.scope)) {
          warnings.push(`anchor: rule ${JSON.stringify(r.id ?? r.rule)} has an invalid scope glob ${JSON.stringify(r.scope)}. Dropping it.`);
          return false;
        }
        return true;
      });
    }
  }
  const config = {
    ...DEFAULTS,
    ...raw,
    ignore: Array.isArray(raw.ignore) ? raw.ignore : [...DEFAULTS.ignore],
    categories: Array.isArray(raw.categories) ? raw.categories : [...DEFAULTS.categories],
    protected_categories: Array.isArray(raw.protected_categories) ? raw.protected_categories : [...DEFAULTS.protected_categories],
    rules: Array.isArray(raw.rules) ? raw.rules : [...DEFAULTS.rules],
    output: { ...DEFAULTS.output, ...(raw.output ?? {}) },
  };
  return { config, warnings };
}

const GITIGNORE_BLOCK = [
  '# Anchor (personal code review state)',
  '.anchor/config.yaml',
  '.anchor/codebase-map.md',
  '.anchor/codebase-graph.md',
  '.anchor/learnings.md',
  '.anchor/reviews/',
];

/** Idempotently append the Anchor gitignore block (spec §5). */
export function ensureGitignore(repoDir) {
  const file = join(repoDir, '.gitignore');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  // Trim each line so an existing entry with trailing whitespace can't defeat dedup
  // (GITIGNORE_BLOCK entries are already trimmed) — keeps the append idempotent.
  const lines = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = GITIGNORE_BLOCK.filter((l) => !lines.has(l));
  if (missing.length === 0) return { added: false };
  const sep = existing.length && !existing.endsWith('\n') ? '\n' : '';
  appendFileSync(file, `${sep}${missing.join('\n')}\n`);
  return { added: true };
}
