import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  // Where is this code running from? lib/doctor.mjs and the bundled
  // dist/anchor.mjs are both exactly one level below the package root.
  const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
  const underPluginCache = pkgRoot.includes(join('.claude', 'plugins', 'cache'));

  const bundlePath = join(pkgRoot, 'dist', 'anchor.mjs');
  const bundleOk = existsSync(bundlePath);
  add('bundle', bundleOk, bundleOk ? `${bundlePath} present` : `${bundlePath} missing`, {
    level: underPluginCache ? 'error' : 'warn', // missing bundle in a plugin install = broken release
    fix: 'Run /plugin update anchor (or `make bundle` in a dev checkout)',
  });

  add('plugin install', underPluginCache,
    underPluginCache
      ? `running from plugin cache (${pkgRoot})`
      : `running from source checkout (dev mode): ${pkgRoot}`,
    { level: 'warn', fix: 'Install via /plugin install anchor@mjenkins-plugins for normal use' });

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
