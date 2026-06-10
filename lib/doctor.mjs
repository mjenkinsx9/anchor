import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runGit, runCmd, isGitRepo } from './git.mjs';
import { loadConfig } from './config.mjs';

export function runDoctor({ cwd = process.cwd() } = {}) {
  const checks = [];
  /** @param {{ level?: string, fix?: string }} [opts] */
  const add = (name, ok, message, opts = {}) => {
    const { level = 'error', fix } = opts;
    checks.push({ name, ok, level, message, ...(ok ? {} : { fix }) });
  };

  const gitV = runGit(['--version']);
  const gitMajor = Number(/git version (\d+)/.exec(gitV.stdout)?.[1] ?? 0);
  const gitOk = gitV.code === 0 && gitMajor >= 2;
  add('git', gitOk, gitOk ? gitV.stdout.trim() : 'git not found or too old', {
    fix: 'Install git >= 2.0',
  });

  const ghV = runCmd('gh', ['--version']);
  add('gh', ghV.code === 0, ghV.code === 0 ? ghV.stdout.split('\n')[0] : 'gh not found (only required for PR mode)', {
    level: 'warn',
    fix: 'Install from https://cli.github.com',
  });

  const inRepo = isGitRepo(cwd);
  add('repo', inRepo, inRepo ? 'inside a git repository' : 'not a git repository', {
    fix: 'Run from inside a repo',
  });

  const symlinks = [
    ['skill symlink', join(homedir(), '.claude', 'skills', 'anchor', 'SKILL.md')],
    ['command symlink', join(homedir(), '.claude', 'commands', 'anchor.md')],
  ];
  for (const [name, p] of symlinks) {
    const ok = existsSync(p);
    add(name, ok, ok ? `${p} resolves` : `${p} missing or broken`, {
      fix: 'Run `make link` in the anchor repo',
    });
  }

  const binPath = join(homedir(), 'bin', 'anchor');
  const binResolves = existsSync(binPath);
  const binDir = join(homedir(), 'bin');
  const onPath = (process.env.PATH ?? '').split(':').includes(binDir);
  const binOk = binResolves && onPath;
  add('bin symlink', binOk,
    binOk ? `${binPath} resolves and ~/bin is on $PATH`
    : !binResolves ? `${binPath} missing or broken`
    : `${binPath} resolves but ~/bin is not on $PATH`,
    { fix: 'Run `make link` in the anchor repo and add ~/bin to $PATH' });

  const { warnings } = loadConfig(cwd);
  add('config', warnings.length === 0, warnings.length === 0 ? '.anchor/config.yaml ok (or absent)' : warnings.join('; '), {
    level: 'warn',
    fix: 'Fix .anchor/config.yaml',
  });

  const inClaude = process.env.CLAUDECODE === '1';
  add('claude code', inClaude, inClaude ? 'session active' : 'no active Claude Code session detected', {
    level: 'warn',
    fix: 'Run inside Claude Code for review workflows',
  });

  const major = Number(process.version.slice(1).split('.')[0]);
  add('node', major >= 18, `node ${process.version}`, { fix: 'Install Node 18+' });

  const ok = checks.every((c) => c.ok || c.level === 'warn');
  return { ok, checks };
}
