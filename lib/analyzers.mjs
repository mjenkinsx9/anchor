import { extname, join, isAbsolute, relative, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { runCmd, hasCmd } from './git.mjs';

const MAX_FINDINGS = 200;

// Resolve a tool binary: prefer project-local node_modules/.bin, else global PATH.
// Returns an absolute path (local) or the bare command name (global) or null.
export function resolveBin(repoDir, bin) {
  for (const name of [bin, `${bin}.cmd`]) {
    const local = join(repoDir, 'node_modules', '.bin', name);
    if (existsSync(local)) return local;
  }
  return hasCmd(bin) ? bin : null;
}

// Built-in registry. Each: { name, bin, exts:[...], command(files)->args[], parse(stdout,stderr)->Finding[] }
// tsc is whole-project (passing files to tsc disables tsconfig — deliberate).
export const ANALYZERS = [
  {
    name: 'tsc',
    bin: 'tsc',
    exts: ['.ts', '.tsx'],
    command: () => ['--noEmit', '--pretty', 'false'],
    parse: (stdout, stderr) => {
      const out = `${stdout}\n${stderr}`;
      const re = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm;
      const findings = [];
      let m;
      while ((m = re.exec(out)) !== null) {
        findings.push({
          rule: m[3],
          file: m[1],
          line: Number(m[2]),
          severity: 'high',
          message: m[4],
        });
      }
      return findings;
    },
  },
  {
    name: 'eslint',
    bin: 'eslint',
    exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    command: (files) => ['--format', 'json', ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).flatMap((f) =>
          f.messages.map((m) => ({
            rule: m.ruleId ?? 'eslint',
            file: f.filePath,
            line: m.line,
            severity: m.severity === 2 ? 'high' : 'medium',
            message: m.message,
          })),
        );
      } catch {
        return [];
      }
    },
  },
  {
    name: 'ruff',
    bin: 'ruff',
    exts: ['.py'],
    command: (files) => ['check', '--output-format', 'json', ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).map((d) => ({
          rule: d.code,
          file: d.filename,
          line: d.location?.row,
          severity: 'medium',
          message: d.message,
        }));
      } catch {
        return [];
      }
    },
  },
  {
    name: 'shellcheck',
    bin: 'shellcheck',
    exts: ['.sh', '.bash'],
    command: (files) => ['--format', 'json', ...files],
    parse: (stdout) => {
      try {
        return JSON.parse(stdout).map((d) => ({
          rule: `SC${d.code}`,
          file: d.file,
          line: d.line,
          severity: d.level === 'error' ? 'high' : 'medium',
          message: d.message,
        }));
      } catch {
        return [];
      }
    },
  },
];

export function selectAnalyzers(registry, files) {
  const exts = new Set(files.map((f) => extname(f)));
  return registry.filter((a) => a.exts.some((e) => exts.has(e)));
}

export async function runAnalyzers(registry, { repoDir, files, exec = undefined, resolve = resolveBin }) {
  const run =
    exec ?? ((bin, args) => Promise.resolve(runCmd(bin, args, { cwd: repoDir, defaultTimeout: 60_000 })));

  const changedSet = new Set(files.map((f) => f.replace(/^(\.\/)+/, '')));
  const selected = selectAnalyzers(registry, files);

  const tools = [];
  const findings = [];

  for (const a of selected) {
    const matched = files.filter((f) => a.exts.includes(extname(f)));

    // Tests inject `exec` and use the bare bin name; otherwise resolve a real binary.
    const bin = exec ? a.bin : resolve(repoDir, a.bin);
    if (!bin) {
      tools.push({ name: a.name, ran: false, fileCount: 0, reason: 'not installed' });
      continue;
    }

    const r = await run(bin, a.command(matched));
    tools.push({ name: a.name, ran: true, fileCount: matched.length });

    for (const f of a.parse(r.stdout ?? '', r.stderr ?? '')) {
      let file = isAbsolute(f.file) ? relative(repoDir, f.file) : f.file.replace(/^(\.\/)+/, '');
      file = file.split(sep).join('/');
      findings.push({ tool: a.name, ...f, file, changed: changedSet.has(file) });
    }
  }

  findings.sort((x, y) => Number(y.changed) - Number(x.changed));
  const truncated = findings.length > MAX_FINDINGS;

  return {
    tools,
    findings: findings.slice(0, MAX_FINDINGS),
    ...(truncated ? { truncated: true } : {}),
  };
}

export async function analyze(repoDir, files) {
  return runAnalyzers(ANALYZERS, { repoDir, files });
}
