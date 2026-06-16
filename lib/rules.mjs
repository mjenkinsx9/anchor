import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { matchesScope } from './ignore.mjs';

// Return rules whose scope glob (default '**') matches at least one changed path.
export function selectRules(rules, changedPaths) {
  return (rules ?? []).filter((r) => matchesScope(r.scope, changedPaths));
}

// Read .anchor/rules.md free-prose (or null if absent).
export function loadRulesProse(repoDir) {
  const f = join(repoDir, '.anchor', 'rules.md');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

// Combine prose + scoped structured rules for the given changed paths.
export function gatherRules({ repoDir, configRules, changedPaths }) {
  return { prose: loadRulesProse(repoDir), rules: selectRules(configRules, changedPaths) };
}
