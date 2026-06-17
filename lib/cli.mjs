import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runDoctor } from './doctor.mjs';
import { loadConfig, ensureGitignore } from './config.mjs';
import { getDiff, withStats, applyBudget, sinceLastRange } from './diff.mjs';
import { getContext } from './context.mjs';
import { listLearnings, addLearning, removeLearning, selectLearnings } from './learn.mjs';
import { analyze } from './analyzers.mjs';
import { gatherRules } from './rules.mjs';
import { findRefs } from './refs.mjs';
import { saveReview, listReviews, showReview } from './review.mjs';
import { gatherInitData } from './init.mjs';
import { getStatus, renderStatusText } from './status.mjs';
import { isIgnored } from './ignore.mjs';
import { isGitRepo } from './git.mjs';
import { installHook, uninstallHook, hookStatus } from './hook.mjs';
import { extractAcceptanceCriteria } from './issue.mjs';

const USAGE = `usage: anchor <init|diff|context|analyze|rules|refs|review|learn|status|config|doctor|hook|issue-criteria> [args] [--format json|text]`;

/** Flags that take a value. Everything else with -- is boolean. */
const VALUED = new Set(['format', 'reason', 'max-files', 'from-diff', 'depth', 'target', 'max-diff-lines', 'scope', 'category', 'action']);

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

/**
 * Resolve diff-target tokens for the commands that derive changed files from a diff
 * (analyze/rules). Supports `--from-diff <target>`, `--staged`, or bare positionals.
 */
function diffTargetTokens(positional, flags) {
  if (flags.has('from-diff')) {
    const fd = flags.get('from-diff');
    return typeof fd === 'string' ? [fd, ...positional] : positional;
  }
  if (flags.has('staged')) return ['--staged', ...positional];
  return positional;
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

  diff(positional, flags) {
    requireRepo();
    const config = loadCfg();
    // Use parsed positionals (not raw tokens) so valued-flag values like
    // `--max-diff-lines 100` never leak in as a bogus diff target.
    let tokens = flags.has('staged') ? ['--staged', ...positional] : positional;
    let sinceLast;
    // `--since-last` resolves to a committed range (or a full-diff fallback) and takes
    // precedence over `--staged`/positionals — staged-vs-range is a category mismatch.
    if (flags.has('since-last')) {
      const lastSha = listReviews(process.cwd())[0]?.sha;
      const r = sinceLastRange(process.cwd(), lastSha);
      if (r.mode === 'range') {
        tokens = [r.range];
        sinceLast = { applied: true, range: r.range };
      } else {
        tokens = [];   // full working diff
        sinceLast = { applied: false, fallback: r.reason };
        process.stderr.write(`anchor: --since-last fell back to the full diff — ${r.reason}.\n`);
      }
    }
    const d = getDiff(tokens, { cwd: process.cwd() });
    const filtered = d.files.filter((f) => !isIgnored(f.path, config.ignore));
    // Over-budget diffs are flagged, never dropped: emit with `overBudget` so the
    // reviewer can prioritize the most important files instead of failing outright.
    const result = applyBudget(withStats({ ...d, files: filtered }), {
      maxLines: Number(flags.get('max-diff-lines') ?? config.max_diff_lines),
      maxFiles: Number(flags.get('max-files') ?? config.max_files),
      force: flags.has('force'),
      fallbackLines: config.max_diff_lines,
      fallbackFiles: config.max_files,
    });
    if (sinceLast) result.sinceLast = sinceLast;
    if (result.budgetWarning) process.stderr.write(result.budgetWarning + '\n');
    emit(result, flags);
  },

  context(positional, flags, rawTokens) {
    requireRepo();
    const config = loadCfg();
    const maxFiles = Number(flags.get('max-files') ?? 50);
    // `--from-diff <target>` or `--staged` → derive files from a diff (matches the
    // sibling handlers + the design spec). Bare positionals are literal file paths.
    const files = (flags.has('from-diff') || flags.has('staged'))
      ? getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() }).files.map((f) => f.path)
      : positional;
    emit(getContext({ files, repoDir: process.cwd(), maxFiles, ignore: config.ignore }), flags);
  },

  async analyze(positional, flags) {
    requireRepo();
    const config = loadCfg();
    const files = getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() }).files
      .map((f) => f.path)
      .filter((p) => !isIgnored(p, config.ignore));
    emit(await analyze(process.cwd(), files), flags);
  },

  rules(positional, flags) {
    requireRepo();
    const config = loadCfg();
    const changedPaths = getDiff(diffTargetTokens(positional, flags), { cwd: process.cwd() })
      .files.map((f) => f.path);
    emit(gatherRules({ repoDir: process.cwd(), configRules: config.rules, changedPaths }), flags);
  },

  refs(positional, flags) {
    requireRepo();
    if (!positional[0]) throw new Error('anchor: refs needs a symbol, e.g. `anchor refs myFunction`');
    emit(findRefs(process.cwd(), positional[0]), flags);
  },

  'issue-criteria'(positional, flags) {
    const body = readFileSync(0, 'utf8'); // stdin — an issue/PR body piped from `gh issue view`
    emit({ criteria: extractAcceptanceCriteria(body) }, flags);
  },

  learn(positional, flags) {
    requireRepo();
    const [action, ...args] = positional;
    if (action === undefined || action === 'list') {
      const all = listLearnings(process.cwd());
      // `--from-diff <target>` / `--staged` → only learnings whose scope matches the changed files.
      if (flags.has('from-diff') || flags.has('staged')) {
        const changedPaths = getDiff(diffTargetTokens(args, flags), { cwd: process.cwd() }).files.map((f) => f.path);
        return emit({ patterns: selectLearnings(all.patterns, changedPaths) }, flags);
      }
      return emit(all, flags);
    }
    if (action === 'add') {
      ensureGitignore(process.cwd());
      const meta = {
        scope: /** @type {string|undefined} */ (flags.get('scope')),
        category: /** @type {string|undefined} */ (flags.get('category')),
        action: /** @type {string|undefined} */ (flags.get('action')),
      };
      const r = addLearning(process.cwd(), args.join(' '), /** @type {string|undefined} */ (flags.get('reason')), meta);
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
    if (action === undefined) return emit(hookStatus(process.cwd()), flags);
    if (action === 'install') return emit(installHook(process.cwd(), { force: flags.has('force') }), flags);
    if (action === 'uninstall') return emit(uninstallHook(process.cwd()), flags);
    throw new Error('anchor: hook needs install|uninstall');
  },
};

export async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const handler = HANDLERS[sub];
  if (!handler) {
    process.stderr.write(USAGE + '\n');
    process.exitCode = 1;
    return;
  }
  try {
    // `await` is a no-op for the sync handlers and lets async ones (e.g. analyze) finish
    // before the event loop drains; the catch still sees throws from both.
    await handler(positional, flags, rest);
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
