#!/usr/bin/env node
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../lib/doctor.mjs';
import { loadConfig, ensureGitignore } from '../lib/config.mjs';
import { getDiff, withStats } from '../lib/diff.mjs';
import { getContext } from '../lib/context.mjs';
import { listLearnings, addLearning, removeLearning } from '../lib/learn.mjs';
import { saveReview, listReviews, showReview } from '../lib/review.mjs';
import { gatherInitData } from '../lib/init.mjs';
import { getStatus, renderStatusText } from '../lib/status.mjs';
import { isIgnored } from '../lib/ignore.mjs';
import { isGitRepo } from '../lib/git.mjs';
import { installHook, uninstallHook } from '../lib/hook.mjs';

const USAGE = `usage: anchor <init|diff|context|review|learn|status|config|doctor|hook> [args] [--format json|text]`;

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

function requireRepo() {
  if (!isGitRepo(process.cwd())) {
    throw new Error('anchor: not a git repository. Run from inside a repo.');
  }
}

function loadCfg() {
  const { config, warnings } = loadConfig(process.cwd());
  for (const w of warnings) process.stderr.write(w + '\n');
  return config;
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

  diff(positional, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const d = getDiff(rawTokens, { cwd: process.cwd() });
    const filtered = d.files.filter((f) => !isIgnored(f.path, config.ignore));
    const result = withStats({ ...d, files: filtered });
    const totalLines = result.files.reduce((s, f) => s + f.added + f.removed, 0);
    if (totalLines > config.max_diff_lines) {
      throw new Error(
        `anchor: diff is ${totalLines.toLocaleString()} lines (max is ${config.max_diff_lines.toLocaleString()}). ` +
        'Adjust .anchor/config.yaml -> max_diff_lines, or split the PR.',
      );
    }
    if (result.files.length > config.max_files) {
      throw new Error(
        `anchor: diff touches ${result.files.length} files (max is ${config.max_files}). ` +
        'Adjust .anchor/config.yaml -> max_files, or split the PR.',
      );
    }
    emit(result, flags);
  },

  context(positional, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const maxFiles = Number(flags.get('max-files') ?? 50);
    let files;
    if (flags.has('from-diff')) {
      const fd = flags.get('from-diff');
      const targetTokens = typeof fd === 'string' ? [fd, ...positional] : positional;
      files = getDiff(targetTokens, { cwd: process.cwd() }).files.map((f) => f.path);
    } else {
      files = positional;
    }
    emit(getContext({ files, repoDir: process.cwd(), maxFiles, ignore: config.ignore }), flags);
  },

  learn(positional, flags) {
    requireRepo();
    const [action, ...args] = positional;
    if (action === 'list') return emit(listLearnings(process.cwd()), flags);
    if (action === 'add') {
      ensureGitignore(process.cwd());
      const r = addLearning(process.cwd(), args.join(' '), /** @type {string|undefined} */ (flags.get('reason')));
      if (r.deduped) process.stderr.write('↪ already in learnings, skipped\n');
      return emit(r, flags);
    }
    if (action === 'remove') return emit(removeLearning(process.cwd(), args.join(' ')), flags);
    throw new Error('anchor: learn needs add|list|remove');
  },

  review(positional, flags) {
    requireRepo();
    const [action, ...args] = positional;
    if (action === 'save') {
      ensureGitignore(process.cwd());
      const content = readFileSync(0, 'utf8'); // stdin
      return emit(saveReview(process.cwd(), content, { path: args[0], target: /** @type {string|undefined} */ (flags.get('target')) }), flags);
    }
    if (action === 'list') return emit(listReviews(process.cwd()), flags);
    if (action === 'show') {
      const r = showReview(process.cwd(), args[0] ?? '');
      if (!r) throw new Error(`anchor: no archived review matching "${args[0]}"`);
      return process.stdout.write(r.content);
    }
    throw new Error('anchor: review needs save|list|show');
  },

  status(positional, flags) {
    requireRepo();
    emit(getStatus(process.cwd()), flags, renderStatusText);
  },

  init(positional, flags) {
    requireRepo();
    const data = gatherInitData(process.cwd(), {
      depth: Number(flags.get('depth') ?? 100),
      noPrs: flags.has('no-prs'),
      noGraph: flags.has('no-graph'),
    });
    for (const w of data.warnings) process.stderr.write(w + '\n');
    emit(data, flags);
  },

  hook(positional, flags) {
    const [action] = positional;
    if (action === 'install') return emit(installHook(process.cwd(), { force: flags.has('force') }), flags);
    if (action === 'uninstall') return emit(uninstallHook(process.cwd()), flags);
    throw new Error('anchor: hook needs install|uninstall');
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
