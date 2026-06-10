#!/usr/bin/env node
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
  doctor(rest, flags) {
    const result = runDoctor({ cwd: process.cwd() });
    emit(result, flags, renderDoctorText);
    process.exit(result.ok ? 0 : 1);
  },
  config(rest, flags) {
    const { config, warnings } = loadConfig(process.cwd());
    for (const w of warnings) process.stderr.write(w + '\n');
    if (rest[0] === 'validate') {
      emit({ valid: warnings.length === 0, warnings }, flags);
      process.exit(warnings.length === 0 ? 0 : 1);
    }
    emit(config, flags);
  },
};

const [sub, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);
const handler = HANDLERS[sub];
if (!handler) {
  process.stderr.write(USAGE + '\n');
  process.exit(1);
}
try {
  handler(positional, flags);
} catch (e) {
  process.stderr.write((e?.message ?? String(e)) + '\n');
  process.exit(1);
}
