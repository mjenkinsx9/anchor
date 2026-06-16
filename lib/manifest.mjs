import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { matchesScope } from './ignore.mjs';

// Return manifest entries whose scope glob (default '**') matches at least one changed path.
export function selectManifest(entries, changedPaths) {
  return (entries ?? []).filter((e) => matchesScope(e.scope, changedPaths));
}

// Load + validate .anchor/files.json. Missing file → []. Unparseable or non-array → [].
// Drop entries lacking a string `path`. Coerce missing `scope` to '**'. NEVER throw.
export function loadManifest(repoDir) {
  const f = join(repoDir, '.anchor', 'files.json');
  if (!existsSync(f)) return [];
  let raw;
  try { raw = JSON.parse(readFileSync(f, 'utf8')); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.path === 'string')
    .map((e) => ({ path: e.path, description: typeof e.description === 'string' ? e.description : '', scope: typeof e.scope === 'string' ? e.scope : '**' }));
}
