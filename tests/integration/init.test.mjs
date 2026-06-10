import { describe, it, expect, afterAll } from 'vitest';
import { gatherInitData } from '../../lib/init.mjs';
import { makeFixtureRepo, writeFiles, commitAll } from '../helpers/fixture.mjs';

const repo = makeFixtureRepo({
  'package.json': '{"name":"fixture"}\n',
  'src/index.ts': "import { util } from './util';\nexport default util;\n",
  'src/util.ts': 'export const util = 1;\n',
  'tests/util.test.ts': "import { util } from '../src/util';\n",
  'docs/readme.md': '# fixture\n',
});
// add history: modify util twice so it becomes a hot file
writeFiles(repo.dir, { 'src/util.ts': 'export const util = 2;\n' });
commitAll(repo.dir, 'feat: bump util');
writeFiles(repo.dir, { 'src/util.ts': 'export const util = 3;\n' });
commitAll(repo.dir, 'fix: bump util again');
afterAll(() => repo.cleanup());

describe('gatherInitData', () => {
  const data = gatherInitData(repo.dir, { depth: 50, noPrs: true });

  it('structure: top-level dirs, counts, language mix', () => {
    expect(data.structure.topLevelDirs).toEqual(expect.arrayContaining(['src', 'tests', 'docs']));
    expect(data.structure.fileCount).toBeGreaterThanOrEqual(5);
    expect(data.structure.languageMix['.ts']).toBeGreaterThanOrEqual(3);
  });
  it('structure: notable files include entrypoint and config', () => {
    const reasons = Object.fromEntries(data.structure.notableFiles.map((f) => [f.path, f.reason]));
    expect(reasons['src/index.ts']).toBe('entrypoint');
    expect(reasons['package.json']).toBe('config');
  });
  it('dependencyGraph: modules with imports/importedBy', () => {
    const src = data.dependencyGraph.modules.find((m) => m.path === 'src');
    const tests = data.dependencyGraph.modules.find((m) => m.path === 'tests');
    expect(tests.imports).toContain('src');
    expect(src.importedBy).toContain('tests');
  });
  it('dependencyGraph: hot files ranked by change count', () => {
    expect(data.dependencyGraph.hotFiles[0].path).toBe('src/util.ts');
    expect(data.dependencyGraph.hotFiles[0].changeCount).toBeGreaterThanOrEqual(3);
  });
  it('dependencyGraph: critical files ranked by import count', () => {
    const paths = data.dependencyGraph.criticalFiles.map((f) => f.path);
    expect(paths).toContain('src/util.ts');
  });
  it('history: commits with style detection', () => {
    expect(data.history.recentCommits.length).toBeGreaterThanOrEqual(3);
    expect(data.history.recentCommits[0]).toHaveProperty('sha');
    expect(data.history.recentCommits[0]).toHaveProperty('subject');
    expect(data.history.commitMessageStyle.conventionalCommits).toBe(true);
  });
  it('pullRequests null when noPrs', () => {
    expect(data.pullRequests).toBeNull();
  });
  it('--no-graph skips the graph', () => {
    const d = gatherInitData(repo.dir, { noPrs: true, noGraph: true });
    expect(d.dependencyGraph).toBeNull();
  });
  it('honors .anchorignore', () => {
    writeFiles(repo.dir, { '.anchorignore': 'docs/**\n' });
    commitAll(repo.dir, 'chore: add anchorignore');
    const d = gatherInitData(repo.dir, { noPrs: true });
    expect(d.structure.topLevelDirs).not.toContain('docs');
  });
  it('normalizes rename paths in hot files', () => {
    repo.git('mv', 'src/util.ts', 'src/helper.ts');
    commitAll(repo.dir, 'refactor: rename util to helper');
    const d = gatherInitData(repo.dir, { noPrs: true });
    const paths = d.dependencyGraph.hotFiles.map((f) => f.path);
    expect(paths.some((p) => p.includes('=>') || p.includes('{'))).toBe(false);
    repo.git('mv', 'src/helper.ts', 'src/util.ts');
    commitAll(repo.dir, 'refactor: rename back');
  });
});
