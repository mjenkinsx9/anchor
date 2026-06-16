/**
 * Evaluation helpers for review *quality* (not just the deterministic inputs).
 *
 * `parseFindings` extracts structured findings from a rendered Anchor review
 * (SKILL.md step-7 format). `scoreReview` compares them against a fixture's
 * expected findings to compute recall, precision, and false positives — the
 * signal that catches a review getting noisier or missing real bugs.
 */

const SEVERITIES = [
  ['🔴', 'critical'],
  ['🟠', 'high'],
  ['🟡', 'medium'],
  ['🟢', 'low'],
];

/** Strip a leading "./" so fixture paths and rendered paths compare cleanly. */
function norm(p) {
  return String(p).replace(/^\.\//, '').trim();
}

/** Two paths match if equal or one is a path-suffix of the other (src/a.ts ~ a.ts). */
function sameFile(a, b) {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.endsWith('/' + y) || y.endsWith('/' + x);
}

/**
 * Parse findings from a rendered review.
 * @returns {{ n: number; file: string; line: string|null; category: string; severity: string|null }[]}
 */
export function parseFindings(reviewText) {
  const findings = [];
  let severity = null;
  for (const line of String(reviewText).split('\n')) {
    for (const [emoji, sev] of SEVERITIES) {
      if (line.includes(emoji)) severity = sev; // section header sets the current severity
    }
    // Finding header: "  [N] <file>[:<line>]  ·  <category>"
    // Category accepts hyphens (e.g. data-loss, null-deref) so those aren't silently dropped.
    const m = /^\s*\[(\d+)\]\s+(.+?)\s+·\s+([a-z][a-z-]*)\s*$/.exec(line);
    if (!m) continue;
    const ref = m[2].trim();
    const withLine = /^(.*):(\d+|\?)$/.exec(ref);
    findings.push({
      n: Number(m[1]),
      file: withLine ? withLine[1] : ref,
      line: withLine ? withLine[2] : null,
      category: m[3],
      severity,
    });
  }
  return findings;
}

/**
 * Score a rendered review against a fixture's expectations.
 * @param {{ expected?: { file: string; category?: string; mustMention?: string[] }[];
 *           cleanFiles?: string[] }} spec
 * @param {string} reviewText
 */
export function scoreReview({ expected = [], cleanFiles = [] }, reviewText) {
  const found = parseFindings(reviewText);
  const haystack = String(reviewText).toLowerCase();
  const matched = [];
  const missed = [];

  for (const exp of expected) {
    const hit = found.find(
      (f) =>
        sameFile(f.file, exp.file) &&
        (!exp.category || f.category === exp.category) &&
        (!exp.mustMention || exp.mustMention.every((s) => haystack.includes(s.toLowerCase()))),
    );
    if (hit) matched.push({ expected: exp, finding: hit });
    else missed.push(exp);
  }

  const falsePositives = found.filter((f) => cleanFiles.some((c) => sameFile(f.file, c)));
  const recall = expected.length ? matched.length / expected.length : 1;
  const precision = found.length ? (found.length - falsePositives.length) / found.length : 1;

  return { found: found.length, matched, missed, falsePositives, recall, precision };
}
