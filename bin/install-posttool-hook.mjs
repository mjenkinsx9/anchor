#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { addHookEntry } from '../lib/posttool-hook.mjs';

const settingsPath = join(homedir(), '.claude', 'settings.json');
const anchorRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hookScript = join(anchorRoot, 'hooks', 'post-push-reminder.sh');

let current = {};
if (existsSync(settingsPath)) {
  try {
    current = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    console.error('anchor: ~/.claude/settings.json is invalid JSON. Skipping PostToolUse hook install. Fix it manually.');
    process.exit(0);
  }
}

const { settings, changed } = addHookEntry(current, hookScript);
if (!changed) {
  console.log('anchor: PostToolUse hook already installed.');
  process.exit(0);
}
mkdirSync(dirname(settingsPath), { recursive: true });
const tmpPath = settingsPath + '.tmp';
try {
  writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmpPath, settingsPath);
} catch (err) {
  console.error(`anchor: could not write ${settingsPath}: ${err.message}`);
  process.exit(0);
}
console.log(`anchor: PostToolUse hook installed (${hookScript}).`);
