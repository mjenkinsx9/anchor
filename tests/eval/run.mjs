#!/usr/bin/env node
/**
 * Review-quality eval runner. Builds each fixture in tests/eval/cases.mjs,
 * gathers the real review inputs (diff + context), gets a review, and scores
 * recall / precision / false-positives with lib/eval.mjs.
 *
 * Usage:
 *   node tests/eval/run.mjs prompts   # write each case's prompt to .out/<name>.prompt.md
 *   node tests/eval/run.mjs score     # score .out/<name>.review.md files you generated
 *   node tests/eval/run.mjs           # auto: generate via `claude -p` if ANCHOR_EVAL_GENERATE=1,
 *                                      #       else fall back to writing prompts
 *
 * The deterministic scorer (lib/eval.mjs) is unit-tested; this harness only
 * orchestrates generation + scoring and never blocks if no model is available.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';
import { makeFixtureRepo, writeFiles } from '../helpers/fixture.mjs';
import { getDiff } from '../../lib/diff.mjs';
import { getContext } from '../../lib/context.mjs';
import { scoreReview } from '../../lib/eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '.out');

const REVIEW_INSTRUCTIONS = `You are a precise code reviewer. Review ONLY the diff below, using the related
files for context. Be honest — if the code is clean, find nothing. Verify each
finding against the code before reporting it; do not flag speculative issues.

Output format (parsed automatically):
  Group findings under severity headers containing one of: 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW
  Each finding on its own line:  [N] <file>:<line>  ·  <category>
  where <category> is one of: logic, security, perf, style, docs, tests
  Follow each finding line with a one-sentence explanation.
  For a severity with no findings, write the header with (0) and "None."`;

function buildPayload(testCase) {
  const repo = makeFixtureRepo(testCase.base);
  try {
    writeFiles(repo.dir, testCase.change);
    const diff = getDiff([], { cwd: repo.dir });
    const context = getContext({ files: diff.files.map((f) => f.path), repoDir: repo.dir, maxFiles: 50, ignore: [] });
    return { diff, context };
  } finally {
    repo.cleanup();
  }
}

function buildPrompt(payload) {
  return `${REVIEW_INSTRUCTIONS}\n\n## Review inputs (JSON)\n${JSON.stringify(payload, null, 2)}\n`;
}

function generateWithClaude(prompt) {
  const r = spawnSync('claude', ['-p', prompt], { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 && r.stdout ? r.stdout : null;
}

function hasClaude() {
  return spawnSync('claude', ['--version'], { encoding: 'utf8' }).status === 0;
}

function main() {
  const mode = process.argv[2];
  const generate = mode !== 'prompts' && process.env.ANCHOR_EVAL_GENERATE === '1' && hasClaude();
  mkdirSync(OUT, { recursive: true });

  const scored = [];
  let wrotePrompts = 0;

  for (const testCase of CASES) {
    const payload = buildPayload(testCase);
    const prompt = buildPrompt(payload);
    const promptPath = join(OUT, `${testCase.name}.prompt.md`);
    const reviewPath = join(OUT, `${testCase.name}.review.md`);

    if (mode === 'prompts') {
      writeFileSync(promptPath, prompt);
      wrotePrompts++;
      continue;
    }

    let reviewText = null;
    if (generate) reviewText = generateWithClaude(prompt);
    else if (existsSync(reviewPath)) reviewText = readFileSync(reviewPath, 'utf8');

    if (reviewText == null) {
      writeFileSync(promptPath, prompt);
      wrotePrompts++;
      continue;
    }
    if (generate) writeFileSync(reviewPath, reviewText);
    scored.push({ name: testCase.name, ...scoreReview(testCase, reviewText) });
  }

  if (mode === 'prompts' || scored.length === 0) {
    console.log(`Wrote ${wrotePrompts} prompt(s) to ${OUT}`);
    console.log('Next: generate a review per case into .out/<name>.review.md, then run:');
    console.log('  node tests/eval/run.mjs score');
    console.log('Or set ANCHOR_EVAL_GENERATE=1 (with the `claude` CLI installed) to auto-generate.');
    return;
  }

  // Report
  let totRecallNum = 0, totRecallDen = 0, totFp = 0;
  console.log('\nAnchor review-quality eval\n' + '─'.repeat(48));
  for (const s of scored) {
    totRecallNum += s.matched.length;
    totRecallDen += s.matched.length + s.missed.length;
    totFp += s.falsePositives.length;
    const recall = (s.recall * 100).toFixed(0);
    const prec = (s.precision * 100).toFixed(0);
    console.log(
      `${s.name.padEnd(16)} recall ${recall.padStart(3)}%  precision ${prec.padStart(3)}%  ` +
      `findings ${s.found}  false-pos ${s.falsePositives.length}` +
      (s.missed.length ? `  MISSED ${s.missed.map((m) => m.file).join(', ')}` : ''),
    );
  }
  const aggRecall = totRecallDen ? totRecallNum / totRecallDen : 1;
  console.log('─'.repeat(48));
  console.log(`AGGREGATE  recall ${(aggRecall * 100).toFixed(0)}%  false-positives ${totFp}`);

  // Gate: regression if we missed real bugs or flagged clean files.
  const RECALL_FLOOR = 0.8;
  const pass = aggRecall >= RECALL_FLOOR && totFp === 0;
  console.log(pass ? '\n✓ eval passed' : `\n✗ eval failed (recall floor ${RECALL_FLOOR * 100}%, false-positives must be 0)`);
  process.exitCode = pass ? 0 : 1;
}

main();
