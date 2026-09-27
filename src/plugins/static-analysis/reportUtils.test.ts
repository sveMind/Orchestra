import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vcsMod from '../../services/vcs/VcsFactory';
import * as ciContext from '../../services/ciContext';
import {
  buildMarkdownReport,
  handleReportOutput,
  handleFindingIssues,
} from './reportUtils';
import type { OpengrepFinding } from './opengrepRunner';
import { issueTitleFor, readUsageState, fingerprintOf } from './usageTracker';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'safp-reportutils-'));

const mkFinding = (o: Partial<any> = {}): OpengrepFinding => ({
  check_id: o.check_id || 'rule',
  path: o.path || '/repo/src/a.ts',
  start: { line: o.line ?? 10, col: 2 },
  extra: {
    message: o.message || 'a finding',
    severity: o.severity || 'WARNING',
    lines: o.lines || '  let x = 1;',
    fix: o.fix,
  },
  ...(o.raw || {}),
});

describe('buildMarkdownReport', () => {
  test('renders per-file grouping with rule block, fingerprint, snippet, and suggested fix', () => {
    const f = mkFinding({
      check_id: 'bad-eval',
      path: '/repo/src/x.ts',
      line: 11,
      severity: 'ERROR',
      message: 'Avoid eval()',
      lines: '  const r = eval(x);',
      fix: '  const r = parse(x);',
    });
    const md = buildMarkdownReport([f], '/repo');
    expect(md).toContain('## Findings');
    expect(md).toContain('### 📄 `src/x.ts`');
    expect(md).toContain('#### Rule: `bad-eval`');
    expect(md).toContain('🔴 **ERROR**');
    expect(md).toContain('Line 11, Col 2');
    expect(md).toContain(`- **Fingerprint:** \`${fingerprintOf(f)}\``);
    expect(md).toContain('Avoid eval()');
    expect(md).toContain('const r = eval(x);');
    expect(md).toContain('**Suggested fix:**');
    expect(md).toContain('parse(x);');
  });

  test('deduplicates identical fingerprints so the same finding twice renders once', () => {
    const a = mkFinding({ path: '/repo/src/a.ts', line: 1, check_id: 'r' });
    const b = mkFinding({ path: '/repo/src/a.ts', line: 1, check_id: 'r' });
    const md = buildMarkdownReport([a, b], '/repo');
    const matches = md.match(/#### Rule: `r`/g) || [];
    expect(matches.length).toBe(1);
  });

  test('empty findings emit the success banner', () => {
    expect(buildMarkdownReport([], '/repo')).toContain('✅ No static analysis issues detected.');
  });
});

const makeFakeVcs = (seed: Array<{ number: number; title: string }> = []) => {
  const issuesMap = new Map<number, { number: number; title: string; state: string }>();
  for (const s of seed) issuesMap.set(s.number, { ...s, state: 'open' });
  let seq = 1000;
  const createdCalls: Array<any> = [];
  const commentCalls: Array<any> = [];
  const closedCalls: Array<any> = [];
  return {
    vcs: {
      listIssues: jest.fn(async (_state?: any) => Array.from(issuesMap.values())),
      findIssueByTitle: jest.fn(async (t: string) => {
        for (const i of issuesMap.values()) if (i.title === t) return i.number;
        return null;
      }),
      createIssue: jest.fn(async (title: string, body: string, labels: string[]) => {
        const n = seq++;
        issuesMap.set(n, { number: n, title, state: 'open' });
        createdCalls.push({ title, body, labels, number: n });
        return `https://example/issues/${n}`;
      }),
      addComment: jest.fn(async (n: number, body: string) => {
        commentCalls.push({ n, body });
        return `https://example/comments/${n}`;
      }),
      closeIssue: jest.fn(async (n: number, reason?: string) => {
        closedCalls.push({ n, reason });
        const i = issuesMap.get(n);
        if (i) i.state = 'closed';
        return true;
      }),
      addLabels: jest.fn(async () => {}),
    } as any,
    issuesMap,
    createdCalls,
    commentCalls,
    closedCalls,
  };
};

describe('handleFindingIssues', () => {
  test('creates one issue per live finding and closes stale managed issues', async () => {
    const live = [
      mkFinding({ path: '/repo/src/a.ts', check_id: 'a', line: 1 }),
      mkFinding({ path: '/repo/src/b.ts', check_id: 'b', line: 2 }),
    ];
    const staleTitle = issueTitleFor(
      mkFinding({ path: '/repo/src/c.ts', check_id: 'c', line: 3 }),
      '/repo'
    );
    const { createdCalls, closedCalls, issuesMap } = makeFakeVcs([
      { number: 1, title: staleTitle },
      { number: 2, title: '[SA][WARNING] some-old-finding @ x/y:1 (abcdef)' },
      { number: 3, title: 'unrelated issue' }, // ignored: no [SA] or safp: prefix
    ]);
    const res = await handleFindingIssues(live, '/repo', ['base']);
    expect(res.created).toBe(2);
    expect(res.updated).toBe(0);
    // closes #1 (stale fingerprint) and #2 (orphaned [SA] title). ignores #3.
    expect(res.closed).toBe(2);
    expect(createdCalls.map(c => c.labels[0])).toEqual(expect.arrayContaining(['base']));
    expect(createdCalls.length).toBe(2);
    expect(closedCalls.map(c => c.n).sort()).toEqual([1, 2]);
    // also verifies stale one is marked closed in state
    expect(issuesMap.get(1)!.state).toBe('closed');
  });

  test('updates existing issue when same finding fingerprint re-occurs (addComment instead of create)', async () => {
    const f = mkFinding({ path: '/repo/src/a.ts', check_id: 'a', line: 7 });
    const t = issueTitleFor(f, '/repo');
    const { createdCalls, commentCalls } = makeFakeVcs([{ number: 42, title: t }]);
    const res = await handleFindingIssues([f], '/repo', []);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);
    expect(createdCalls.length).toBe(0);
    expect(commentCalls.length).toBe(1);
    expect(commentCalls[0].n).toBe(42);
    expect(commentCalls[0].body).toContain('Rescanned finding still present');
  });

  test('handles missing VCS gracefully (no crash, zero counts)', async () => {
    jest.spyOn(vcsMod.VcsFactory, 'getProvider' as any).mockImplementation(() => {
      throw new Error('no vcs');
    });
    try {
      const res = await handleFindingIssues([mkFinding()], '/repo', []);
      expect(res).toEqual({ created: 0, updated: 0, closed: 0 });
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('handleReportOutput end-to-end', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(vcsMod.VcsFactory, 'getProvider' as any);
  });
  afterEach(() => spy.mockRestore());

  const findings = [
    mkFinding({ check_id: 'a', line: 1 }),
    mkFinding({ check_id: 'b', line: 2, severity: 'ERROR' }),
  ];

  test('mode=report writes report + usage file and emits Usage & Scan History section', async () => {
    const root = tmpDir();
    const issueFile = path.join(root, 'STATIC_ANALYSIS_REPORT.md');
    await handleReportOutput({
      dirPath: root,
      mode: 'report',
      report: '# header\n',
      hasIssues: true,
      reportFileName: 'STATIC_ANALYSIS_REPORT.md',
      issueTitle: 'Static Analysis Findings',
      issueLabels: ['x'],
      prCommentHeader: '### Header',
      successMessage: 'ok',
      findings,
      scanRoot: root,
      scanStats: { scannedFiles: 10, totalRules: 20, durationMs: 40 },
      rulesPath: undefined,
      targetPath: root,
    });
    const md = fs.readFileSync(issueFile, 'utf8');
    expect(md).toContain('## Usage & Scan History');
    expect(md).toContain('| Scans Run (total) | 1 |');
    expect(md).toContain('#### Lifetime Findings by Severity');
    expect(md).toContain('#### Latest Run Summary');
    expect(md).toContain('| When | Target | Mode | Findings |');
    const u = readUsageState(root);
    expect(u.totalScans).toBe(1);
    expect(u.bySeverityLifetime.WARNING).toBe(1);
    expect(u.bySeverityLifetime.ERROR).toBe(1);
  });

  test('mode=issue runs per-finding pipeline + opens a summary issue, appending on reruns', async () => {
    const root = tmpDir();
    const { vcs, createdCalls, commentCalls } = makeFakeVcs();
    spy.mockReturnValue(vcs);
    await handleReportOutput({
      dirPath: root,
      mode: 'issue',
      report: '# summary\nbody\n',
      hasIssues: true,
      reportFileName: 'STATIC_ANALYSIS_REPORT.md',
      issueTitle: 'Static Analysis Findings',
      issueLabels: ['base'],
      prCommentHeader: '### H',
      successMessage: 'ok',
      findings,
      scanRoot: root,
      scanStats: { scannedFiles: 2, totalRules: 20, durationMs: 10 },
      rulesPath: undefined,
      targetPath: root,
    });
    // 2 per-finding issues + 1 summary issue
    expect(createdCalls.length).toBe(3);
    expect(createdCalls[2].title).toBe('Static Analysis Findings');

    // rerun with same findings -> 0 new issues, summary issue reused via comment
    vcs.findIssueByTitle.mockImplementation(async (t: string) => {
      const sum = createdCalls.find(c => c.title === t);
      return sum ? sum.number : null;
    });
    commentCalls.length = 0;
    await handleReportOutput({
      dirPath: root,
      mode: 'issue',
      report: '# summary 2\n',
      hasIssues: true,
      reportFileName: 'STATIC_ANALYSIS_REPORT.md',
      issueTitle: 'Static Analysis Findings',
      issueLabels: ['base'],
      prCommentHeader: '### H',
      successMessage: 'ok',
      findings,
      scanRoot: root,
      scanStats: { scannedFiles: 2, totalRules: 20, durationMs: 10 },
      rulesPath: undefined,
      targetPath: root,
    });
    // only one new issue created: the two per-finding ones already exist, so they should only get commented on
    expect(createdCalls.length).toBe(4);
    // at least one addComment for update of existing per-finding issue + one for summary reuse
    expect(commentCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('mode=comment posts to PR when CI context is set, writes file regardless', async () => {
    const root = tmpDir();
    const { vcs, commentCalls } = makeFakeVcs();
    spy.mockReturnValue(vcs);
    const prSpy = jest.spyOn(ciContext, 'readCiPrContext').mockReturnValueOnce({ prNumber: 7, sha: 'abc' } as any);
    try {
      await handleReportOutput({
        dirPath: root,
        mode: 'comment',
        report: '# r\n',
        hasIssues: true,
        reportFileName: 'STATIC_ANALYSIS_REPORT.md',
        issueTitle: 'Static Analysis Findings',
        issueLabels: [],
        prCommentHeader: '### Header',
        successMessage: 'ok',
        findings: [mkFinding()],
        scanRoot: root,
        scanStats: { scannedFiles: 1, totalRules: 1, durationMs: 1 },
        rulesPath: undefined,
        targetPath: root,
      });
      expect(fs.existsSync(path.join(root, 'STATIC_ANALYSIS_REPORT.md'))).toBe(true);
      expect(commentCalls.length).toBe(1);
      expect(commentCalls[0].n).toBe(7);
      expect(commentCalls[0].body).toContain('### Header');
    } finally {
      prSpy.mockRestore();
    }
  });

  test('issues-per-finding: opens/closes per-finding, does NOT create a summary issue', async () => {
    const root = tmpDir();
    const { vcs, createdCalls } = makeFakeVcs();
    spy.mockReturnValue(vcs);
    await handleReportOutput({
      dirPath: root,
      mode: 'issues-per-finding',
      report: '# r\n',
      hasIssues: true,
      reportFileName: 'STATIC_ANALYSIS_REPORT.md',
      issueTitle: 'Static Analysis Findings',
      issueLabels: [],
      prCommentHeader: '### H',
      successMessage: 'ok',
      findings,
      scanRoot: root,
      scanStats: { scannedFiles: 1, totalRules: 20, durationMs: 1 },
      rulesPath: undefined,
      targetPath: root,
    });
    // only per-finding count (2), not the summary
    expect(createdCalls.length).toBe(2);
    for (const c of createdCalls) expect(c.title).not.toBe('Static Analysis Findings');
  });
});
