#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDoctor } from '../lib/doctor.mjs';
import { loadConfig } from '../lib/config.mjs';

const USAGE = `usage: anchor <init|diff|context|review|learn|status|config|doctor> [args] [--format json|text]`;

/** Flags that take a value. Everything else with -- is boolean. */
const VALUED = new Set(['format', 'reason', 'max-files', 'from-diff', 'depth', 'target']);

export function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      if (VALUED.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags.set(key, argv[++i]);
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function emit(obj, flags, renderText) {
  if (flags.get('format') === 'text' && renderText) {
    process.stdout.write(renderText(obj) + '\n');
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  }
}

function renderDoctorText({ checks }) {
  return checks
    .map((c) => {
      const icon = c.ok ? '✓' : c.level === 'warn' ? '⚠' : '✗';
      const fix = c.ok ? '' : ` → ${c.fix}`;
      return `${icon} ${c.name} — ${c.message}${fix}`;
    })
    .join('\n');
}

const HANDLERS = {
  doctor(positional, flags) {
    const result = runDoctor({ cwd: process.cwd() });
    emit(result, flags, renderDoctorText);
    process.exitCode = result.ok ? 0 : 1;
  },
  config(positional, flags) {
    const { config, warnings } = loadConfig(process.cwd());
    for (const w of warnings) process.stderr.write(w + '\n');
    if (positional[0] === 'validate') {
      emit({ valid: warnings.length === 0, warnings }, flags);
      process.exitCode = warnings.length === 0 ? 0 : 1;
      return;
    }
    emit(config, flags);
  },
};

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const handler = HANDLERS[sub];
  if (!handler) {
    process.stderr.write(USAGE + '\n');
    process.exitCode = 1;
    return;
  }
  try {
    handler(positional, flags, rest);
  } catch (e) {
    process.stderr.write((e?.message ?? String(e)) + '\n');
    process.exitCode = 1;
  }
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) main();
