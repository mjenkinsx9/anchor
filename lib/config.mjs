import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export const DEFAULTS = {
  ignore: ['**/*.lock', '**/*.generated.*', 'vendor/**', 'node_modules/**'],
  min_severity: 'low',
  strictness: 2,
  max_findings: 50,
  categories: ['logic', 'security', 'perf', 'style', 'docs', 'tests'],
  min_confidence: 2,
  max_diff_lines: 2000,
  max_files: 100,
  output: { show_whats_good: true, show_diff_stats: true, color: 'auto' },
};

export function loadConfig(repoDir) {
  const warnings = [];
  const file = join(repoDir, '.anchor', 'config.yaml');
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
  const config = {
    ...DEFAULTS,
    ...raw,
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
  const lines = new Set(existing.split('\n'));
  const missing = GITIGNORE_BLOCK.filter((l) => !lines.has(l));
  if (missing.length === 0) return { added: false };
  const sep = existing.length && !existing.endsWith('\n') ? '\n' : '';
  appendFileSync(file, `${sep}${missing.join('\n')}\n`);
  return { added: true };
}
