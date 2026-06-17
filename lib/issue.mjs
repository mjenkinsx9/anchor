/**
 * Pure, network-free extraction of acceptance criteria from an issue/PR body.
 * Order of precedence:
 *   1. Markdown checklist items (`- [ ]` / `- [x]`) anywhere in the body.
 *   2. Else non-empty lines under an "Acceptance criteria"/"Requirements" heading,
 *      until the next heading (leading list/number/checkbox markers stripped).
 *   3. Else [].
 * Unit-tested without a model or `gh` — the SKILL pipes `gh issue view` output in.
 */
const CHECKLIST_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const CRITERIA_HEADING_RE = /(acceptance\s+criteria|requirements)/i;
const LIST_MARKER_RE = /^(?:[-*]\s+|\d+\.\s+)?(?:\[[ xX]\]\s+)?/;

/** @param {string} body @returns {string[]} */
export function extractAcceptanceCriteria(body) {
  const lines = String(body ?? '').split('\n');

  const checklist = [];
  for (const l of lines) {
    const m = CHECKLIST_RE.exec(l);
    if (m) checklist.push(m[1].trim());
  }
  if (checklist.length) return checklist;

  const out = [];
  let capturing = false;
  for (const l of lines) {
    const h = HEADING_RE.exec(l);
    if (h) { capturing = CRITERIA_HEADING_RE.test(h[1]); continue; }
    if (!capturing) continue;
    const t = l.trim();
    if (!t) continue;
    out.push(t.replace(LIST_MARKER_RE, '').trim());
  }
  return out;
}
