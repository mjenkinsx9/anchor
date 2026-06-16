/**
 * Review-quality eval cases. Each builds a fixture repo from `base`, applies
 * `change` as an uncommitted edit, and declares what a good review SHOULD find
 * (`expected`) and which files must stay quiet (`cleanFiles`, for the
 * false-positive rate). Scored by lib/eval.mjs via tests/eval/run.mjs.
 *
 * Keep cases small and unambiguous — the point is to measure recall on real
 * bugs and precision on clean code, not to test edge cases of the model.
 */

export const CASES = [
  {
    name: 'security-bug',
    base: { 'src/auth.ts': 'export function check(a: string, b: string) {\n  return false;\n}\n' },
    change: { 'src/auth.ts': 'export function check(a: any, b: any) {\n  return a.hash == b.hash;\n}\n' },
    expected: [{ file: 'src/auth.ts', category: 'security', mustMention: ['=='] }],
    cleanFiles: [],
  },
  {
    name: 'perf-issue',
    base: { 'src/find.ts': 'export const find = (xs: number[], ys: number[]) => xs;\n' },
    change: { 'src/find.ts': 'export const find = (xs: number[], ys: number[]) => xs.filter((x) => ys.includes(x));\n' },
    expected: [{ file: 'src/find.ts', category: 'perf' }],
    cleanFiles: [],
  },
  {
    name: 'logic-bug',
    base: { 'src/last.ts': 'export const last = (xs: unknown[]) => xs[xs.length - 1];\n' },
    // Off-by-one reintroduced: indexing at length is always undefined / OOB.
    change: { 'src/last.ts': 'export const last = (xs: unknown[]) => xs[xs.length];\n' },
    expected: [{ file: 'src/last.ts', category: 'logic' }],
    cleanFiles: [],
  },
  {
    name: 'clean-refactor',
    base: { 'src/sum.ts': 'export function sum(a: number, b: number) {\n  return a + b;\n}\n' },
    // Behavior-preserving: arrow form. A good review flags nothing here.
    change: { 'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n' },
    expected: [],
    cleanFiles: ['src/sum.ts'],
  },
  {
    name: 'noisy-style',
    base: { 'src/calc.ts': 'export function calc(a: number, b: number) {\n  const r = a + b;\n  return r;\n}\n' },
    // Behavior-preserving local rename (r → result). At default strictness a good
    // review must stay quiet — any finding here is a style false positive.
    change: { 'src/calc.ts': 'export function calc(a: number, b: number) {\n  const result = a + b;\n  return result;\n}\n' },
    expected: [],
    cleanFiles: ['src/calc.ts'],
  },
];
