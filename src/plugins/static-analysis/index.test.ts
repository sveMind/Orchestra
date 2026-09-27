import staticAnalysisPlugin, { runStaticAnalysis } from './index';
import * as opengrepRunner from './opengrepRunner';
import * as vcsMod from '../../services/vcs/VcsFactory';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('./opengrepRunner', () => ({ runOpengrepScan: jest.fn() }));

const makeVcs = (overrides: Record<string, any> = {}) => {
  const issues: Map<number, { number: number; title: string; state: string }> = new Map();
  let seq = 100;
  const vcs: Record<string, any> = {
    listIssues: jest.fn(async () => Array.from(issues.values())),
    findIssueByTitle: jest.fn(async (t: string) => {
      for (const i of issues.values()) if (i.title === t) return i.number;
      return null;
    }),
    createIssue: jest.fn(async (title: string, body: string, labels: string[]) => {
      const n = seq++;
      issues.set(n, { number: n, title, state: 'open' });
      return `https://example/issues/${n}`;
    }),
    addComment: jest.fn(async () => 'https://example/comments/1'),
    addLabels: jest.fn(async () => undefined),
    closeIssue: jest.fn(async () => true),
    ...overrides,
  };
  return { vcs, issues };
};

let originalGetProviderSpy: jest.SpyInstance | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  originalGetProviderSpy = jest.spyOn(vcsMod.VcsFactory, 'getProvider' as any);
});
afterEach(() => {
  if (originalGetProviderSpy) originalGetProviderSpy.mockRestore();
});

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'staticanalysis-'));

const mockFinding = (opts: Partial<any> = {}) => ({
  check_id: opts.check_id || 'typescript-eval',
  path: opts.path,
  start: { line: opts.line ?? 12, col: opts.col ?? 4 },
  end: { line: opts.line ?? 12, col: 30 },
  extra: {
    message: opts.message || 'Avoid eval()',
    severity: opts.severity || 'ERROR',
    lines: opts.lines || 'const res = eval(x);',
  },
  ...opts.raw,
});

describe('static-analysis plugin metadata', () => {
  test('exports expected command metadata including issues-per-finding mode', () => {
    expect(staticAnalysisPlugin.command).toBe('static-analysis');
    expect(typeof staticAnalysisPlugin.action).toBe('function');
    expect(Array.isArray(staticAnalysisPlugin.args)).toBe(true);
    expect(staticAnalysisPlugin.args!.map((a: any) => a.name)).toEqual(['path', 'rules', 'mode']);
    expect(staticAnalysisPlugin.name).toBe('Static Analysis');
    expect(staticAnalysisPlugin.description).toContain('Opengrep');
    const modeArg = staticAnalysisPlugin.args!.find((a: any) => a.name === 'mode')!;
    expect(modeArg.description).toContain('issues-per-finding');
  });
});

describe('report generation', () => {
  test('writes a report with summary table + findings section + usage section', async () => {
    const dir = tmpDir();
    const f = mockFinding({ path: path.join(dir, 'src', 'bad.ts'), line: 12 });
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [f],
      errors: [],
      stats: { scannedFiles: 3, totalRules: 20, findingsCount: 1 },
    });
    await runStaticAnalysis(dir, undefined, 'report');
    const reportPath = path.join(dir, 'STATIC_ANALYSIS_REPORT.md');
    expect(fs.existsSync(reportPath)).toBe(true);
    const r = fs.readFileSync(reportPath, 'utf8');
    expect(r).toContain('# Static Analysis Report');
    expect(r).toContain('| Files Scanned | 3 |');
    expect(r).toContain('| 🔴 ERROR | 1 |');
    expect(r).toContain('#### Rule: `typescript-eval`');
    expect(r).toContain('- **Fingerprint:**');
    expect(r).toContain('## Usage & Scan History');
    expect(r).toContain('| Scans Run (total) | 1 |');
    expect(r).toContain('| Total Findings (all time) | 1 |');
  });

  test('writes "no issues" report but still records usage', async () => {
    const dir = tmpDir();
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [],
      errors: [],
      stats: { scannedFiles: 10, totalRules: 20 },
    });
    await runStaticAnalysis(dir, undefined, 'report');
    const r = fs.readFileSync(path.join(dir, 'STATIC_ANALYSIS_REPORT.md'), 'utf8');
    expect(r).toContain('✅ No static analysis issues detected');
    const usage = JSON.parse(fs.readFileSync(path.join(dir, '.orchestra', 'static-analysis-usage.json'), 'utf8'));
    expect(usage.totalScans).toBe(1);
    expect(usage.totalFindingsEver).toBe(0);
    expect(usage.history.length).toBe(1);
    expect(usage.lastScanAt).toBeTruthy();
  });

  test('usage file aggregates totals across successive scans', async () => {
    const dir = tmpDir();
    const base = { scannedFiles: 2, totalRules: 20, findingsCount: 1 };
    const f = mockFinding({ path: path.join(dir, 'src', 'a.ts'), severity: 'WARNING', line: 1 });
    (opengrepRunner.runOpengrepScan as jest.Mock)
      .mockResolvedValueOnce({ results: [f], errors: [], stats: base })
      .mockResolvedValueOnce({ results: [f, { ...f, check_id: 'x', severity: 'INFO' }], errors: [], stats: base });
    await runStaticAnalysis(dir, undefined, 'report');
    await runStaticAnalysis(dir, undefined, 'report');
    const usage = JSON.parse(fs.readFileSync(path.join(dir, '.orchestra', 'static-analysis-usage.json'), 'utf8'));
    expect(usage.totalScans).toBe(2);
    expect(usage.totalFindingsEver).toBe(1 + 2);
    expect(usage.rulesRunTotal).toBe(40);
    expect(usage.filesScannedTotal).toBe(4);
    expect(usage.history.length).toBe(2);
    expect(usage.bySeverityLifetime.WARNING).toBe(2);
    expect(usage.bySeverityLifetime.INFO).toBe(1);
  });
});

describe('issue mode / fingerprint-based issue management', () => {
  test('mode=issue creates per-finding issues + summary issue + closes stale ones', async () => {
    const dir = tmpDir();
    const { vcs } = makeVcs();
    originalGetProviderSpy!.mockReturnValue(vcs);
    const f1 = mockFinding({ path: path.join(dir, 'src', 'a.ts'), line: 1, check_id: 'x', severity: 'WARNING'});
    const f2 = mockFinding({ path: path.join(dir, 'src', 'b.ts'), line: 5, check_id: 'y', severity: 'ERROR'});
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [f1, f2],
      errors: [],
      stats: { scannedFiles: 2, totalRules: 20 },
    });
    await runStaticAnalysis(dir, undefined, 'issue');
    // 2 per-finding + 1 summary issue created, 0 closed (none stale)
    expect(vcs.createIssue).toHaveBeenCalledTimes(3);
    expect(vcs.closeIssue).not.toHaveBeenCalled();

    // Second run: f2 is fixed (finding)
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [f1],
      errors: [],
      stats: { scannedFiles: 2, totalRules: 20 },
    });
    // Add one of the open issues list to simulate already existing
    await runStaticAnalysis(dir, undefined, 'issue');
    // One should close f2, since it's no longer present
    expect(vcs.closeIssue).toHaveBeenCalled();
    expect(vcs.createIssue).toHaveBeenCalledTimes(4);
  });

  test('mode=issues-per-finding does not open a summary issue but does close stale', async () => {
    const dir = tmpDir();
    const { vcs } = makeVcs();
    originalGetProviderSpy!.mockReturnValue(vcs);
    const f = mockFinding({ path: path.join(dir, 'src', 'a.ts'), line: 1, check_id: 'z'});
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [f],
      errors: [],
      stats: { scannedFiles: 1, totalRules: 20 },
    });
    await runStaticAnalysis(dir, undefined, 'issues-per-finding');
    // Only 1 per-finding issue, no summary issue
    expect(vcs.createIssue).toHaveBeenCalledTimes(1);
  });

  test('plugin.action defaults path defaults to process.cwd + unknown mode maps to report', async () => {
    (opengrepRunner.runOpengrepScan as jest.Mock).mockResolvedValueOnce({
      results: [],
      errors: [],
      stats: { scannedFiles: 0, totalRules: 0 },
    });
    const dir = tmpDir();
    const prev = process.cwd();
    try {
      process.chdir(dir);
      await staticAnalysisPlugin.action(undefined, undefined, 'bogus-mode');
      expect(opengrepRunner.runOpengrepScan).toHaveBeenCalledWith(dir, undefined);
      expect(fs.existsSync(path.join(dir, 'STATIC_ANALYSIS_REPORT.md'))).toBe(true);
    } finally {
      process.chdir(prev);
    }
  });
});
