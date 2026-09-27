import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  expectedTestFilePath,
  pickSubDirHints,
  selectSourceTargets,
  rankEndpoints,
  DEFAULT_SOURCE_EXTS,
  runTestSuite,
  testsPlugin,
} from './index';
import { generateTests } from '../test-gen';
import type { RepoSignals } from '../../services/repoScan';

jest.mock('../test-gen', () => ({
  generateTests: jest.fn().mockResolvedValue(undefined),
}));

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-tests-plugin-'));

const buildSignals = (overrides: Partial<RepoSignals> = {}): RepoSignals => ({
  changedFiles: [],
  topLevelDirs: [],
  topLevelFiles: [],
  hasPackageJson: false,
  hasOrchestraLikeLayout: false,
  nodeApiHints: null,
  languages: [],
  appType: 'unknown',
  frontend: { detected: false, kinds: [], files: [] },
  backend: { detected: false, kinds: [], files: [] },
  embedded: { detected: false, kinds: [], files: [] },
  apiEndpoints: [],
  dockerfilePath: null,
  dockerfile: { baseImage: '', packages: [] },
  dockerComposeFiles: [],
  nginxFiles: [],
  pipelineFiles: [],
  k8sFiles: [],
  helmFiles: [],
  terraformFiles: [],
  openApiSpecFiles: [],
  nativeBuild: { kind: 'none', files: [], hasSources: false },
  ...overrides,
}));

describe('expectedTestFilePath', () => {
  test('produces jest-style .test.ts / .test.js', () => {
    expect(expectedTestFilePath('/repo/src/foo.ts', '.ts')).toBe('/repo/src/foo.test.ts');
    expect(expectedTestFilePath('/repo/src/bar.js', '.js')).toBe('/repo/src/bar.test.js');
    expect(expectedTestFilePath('/repo/src/ui/button.tsx', '.tsx')).toBe('/repo/src/ui/button.test.tsx');
  });

  test('produces pytest-style test_*.py', () => {
    expect(expectedTestFilePath('/repo/app/routes.py', '.py')).toBe('/repo/app/test_routes.py');
  });

  test('produces C-style <name>_test.c / <name>_test.cpp', () => {
    expect(expectedTestFilePath('/repo/lib/calc.c', '.c')).toBe('/repo/lib/calc_test.c');
    expect(expectedTestFilePath('/repo/lib/utils.cpp', '.cpp')).toBe('/repo/lib/utils_test.cpp');
    expect(expectedTestFilePath('/repo/lib/util.h', '.h')).toBe('/repo/lib/util_test.h');
  });
});

describe('pickSubDirHints', () => {
  test('picks backend-only when top-level `backend` dir exists', () => {
    const s = buildSignals({ topLevelDirs: ['backend', 'node_modules'] });
    const hints = pickSubDirHints(s, 'backend');
    expect(hints.map(h => `${h.label}:${h.hint}`)).toEqual(['backend:backend']);
  });

  test('picks frontend-only when top-level `frontend` dir exists', () => {
    const s = buildSignals({ topLevelDirs: ['frontend'] });
    s.topLevelDirs = ['frontend'];
    const hints = pickSubDirHints(s, 'frontend');
    expect(hints.map(h => h.label)).toEqual(['frontend']);
    expect(hints[0].hint).toBe('frontend');
  });

  test('scope=all with signals that have frontend+backend detected -> falls back to scanning from repo root', () => {
    const s = buildSignals({
      topLevelDirs: ['src'],
      frontend: { detected: true, kinds: ['react'], files: [] },
      backend: { detected: true, kinds: ['express'], files: [] },
    });
    const hints = pickSubDirHints(s, 'all');
    expect(hints.map(h => h.label)).toEqual(expect.arrayContaining(['frontend', 'backend']));
  });
});

describe('rankEndpoints', () => {
  test('assigns endpoint-hit source files ranked higher', () => {
    const ep = [
      { method: 'GET', path: '/x', source: 'src/api/a.js' },
      { method: 'POST', path: '/x', source: 'src/api/a.js' },
      { method: 'GET', path: '/y', source: 'src/api/b.js' },
    ];
    const map = rankEndpoints(ep, '/repo');
    expect(map.get(path.resolve('/repo/src/api/a.js'))).toBe(10);
    expect(map.get(path.resolve('/repo/src/api/b.js'))).toBe(5);
  });
});

describe('selectSourceTargets', () => {
  test('picks source files, orders by endpoint score then path', () => {
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'frontend'), { recursive: true });

    const a = path.join(repo, 'backend', 'routes.ts');
    const b = path.join(repo, 'backend', 'util.ts');
    const c = path.join(repo, 'frontend', 'Button.tsx');
    fs.writeFileSync(a, 'export const r = Router();\nr.get("/x", ...)');
    fs.writeFileSync(b, 'export const add = (a: number, b: number) => a + b;');
    fs.writeFileSync(c, "export const Button = () => null;");

    const rel = (p: string) => path.relative(repo, p).replace(/\\/g, '/');

    const signals = buildSignals({
      topLevelDirs: ['backend', 'frontend'],
      appType: 'fullstack',
      backend: { detected: true, kinds: ['custom-api'], files: [] },
      frontend: { detected: true, kinds: ['react'], files: [] },
      apiEndpoints: [
        { method: 'GET', path: '/x', source: rel(a) },
        { method: 'POST', path: '/x', source: rel(a) },
      ],
    });

    const { selected, targetTestFiles, skippedExistingTests, skippedLargeFiles } = selectSourceTargets(repo, signals, {
      scope: 'all',
      maxFiles: 10,
      concurrency: 1,
      skipWithTests: true,
      dryRun: false,
    });

    expect(selected.map(s => s.relPath)).toEqual([rel(a), rel(c), rel(b)]);
    expect(selected[0].area).toBe('backend');
    expect(targetTestFiles[a]).toBe(a.replace(/\.ts$/, '.test.ts'));
    expect(skippedExistingTests).toBe(0);
    expect(skippedLargeFiles).toBe(0);
  });

  test('skips files that already have tests written tests when skipWithTests=true', () => {
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
    const a = path.join(repo, 'backend', 'x.ts');
    const existingTest = path.join(repo, 'backend', 'x.test.ts');
    fs.writeFileSync(a, 'export const a = 1;');
    fs.writeFileSync(existingTest, "describe('x', () => {});");

    const signals = buildSignals({
      topLevelDirs: ['backend'],
      backend: { detected: true, kinds: ['backend'], files: [] },
    });
    const { selected, skippedExistingTests } = selectSourceTargets(repo, signals, {
      scope: 'backend',
      maxFiles: 10,
      concurrency: 1,
      skipWithTests: true,
      dryRun: false,
    });
    expect(selected).toHaveLength(0);
    expect(skippedExistingTests).toBe(1);
  });

  test('respects maxFiles cap and honors frameworkHint presence (no-op for extension-based overridden when filter on hint', () => {
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    for (let i = 0; i < 10; i += 1) {
      fs.writeFileSync(path.join(repo, 'src', `f${i}.ts`), `export const f${i} = () => {};`);
    }
    const signals = buildSignals({
      topLevelDirs: ['src'],
      backend: { detected: true, kinds: ['backend'], files: [] },
      appType: 'backend',
    });
    const { selected } = selectSourceTargets(repo, signals, {
      scope: 'all',
      maxFiles: 3,
      concurrency: 1,
      skipWithTests: false,
      dryRun: false,
    });
    expect(selected).toHaveLength(3);
  });
});

describe('runTestSuite (dry run and smoke call flow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('dry run prints plan without calling generateTests', async () => {
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
    const a = path.join(repo, 'backend', 'a.ts');
    fs.writeFileSync(a, 'export const hello = () => {};');
    const signals = buildSignals({
      topLevelDirs: ['backend'],
      backend: { detected: true, kinds: ['backend'], files: [] },
    });
    const summary = await runTestSuite(repo, {
      scope: 'all',
      maxFiles: 5,
      concurrency: 1,
      skipWithTests: true,
      dryRun: true,
    });
    expect(summary.selected).toHaveLength(1);
    expect(summary.generated).toHaveLength(0);
    expect(summary.failed).toHaveLength(0);
    expect(generateTests).not.toHaveBeenCalled();
  });

  test('live run calls generateTests with framework hint when provided', async () => {
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
    const a = path.join(repo, 'backend', 'a.ts');
    fs.writeFileSync(a, 'export const a = () => 1;');

    await runTestSuite(repo, {
      scope: 'backend',
      maxFiles: 1,
      concurrency: 1,
      dryRun: false,
      skipWithTests: true,
      frameworkHint: 'jest',
    });

    expect(generateTests).toHaveBeenCalledTimes(1);
    expect(generateTests).toHaveBeenCalledWith(a, 'jest');
  });

  test('surfaces failures in summary.failed when generateTests throws', async () => {
    (generateTests as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const repo = tmpDir();
    fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
    const a = path.join(repo, 'backend', 'b.ts');
    fs.writeFileSync(a, 'export const b = 1;');
    const summary = await runTestSuite(repo, {
      scope: 'backend',
      maxFiles: 1,
      concurrency: 1,
      skipWithTests: true,
      dryRun: false,
    });
    expect(summary.generated).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].error).toContain('boom');
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('plugin metadata', () => {
  test('exports a registerable plugin for CLI auto-discovery', () => {
    expect(testsPlugin.command).toBe('tests');
    expect(testsPlugin.description).toContain('frontend');
    expect(testsPlugin.description).toContain('backend');
    expect(typeof testsPlugin.action).toBe('function');
    expect(Array.isArray(testsPlugin.args)).toBe(true);
  });
});
