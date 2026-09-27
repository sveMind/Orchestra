import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  fingerprintOf,
  issueTitleFor,
  labelForFinding,
  buildFindingBody,
  classifySeverity,
  readUsageState,
  writeUsageState,
  ISSUE_LABEL_PREFIX,
} from './usageTracker';
import { recordScanInUsage } from './reportUtils';
import type { OpengrepFinding } from './opengrepRunner';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'safp-usage-'));

const mkFinding = (overrides: Partial<any> & { line?: number; fix?: any } = {}) => {
  const { raw, line, fix, severity, message, lines, path, check_id, ...rest } = overrides as any;
  return {
    check_id: check_id || 'rule-1',
    path: path || '/repo/src/a.ts',
    start: { line: (line ?? 42) as number | undefined, col: 3 },
    extra: {
      message: message || 'some finding message',
      severity: severity || 'WARNING',
      lines: lines || '  const x = 1;',
      fix,
    },
    ...rest,
  } as OpengrepFinding;
};

describe('fingerprintOf', () => {
  test('deterministic over identical inputs', () => {
    const f = mkFinding();
    expect(fingerprintOf(f)).toMatch(/^[a-f0-9]{16}$/);
    expect(fingerprintOf(f)).toBe(fingerprintOf(mkFinding()));
  });

  test('differs when rule id changes', () => {
    const a = mkFinding({ check_id: 'a' });
    const b = mkFinding({ check_id: 'b' });
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });

  test('differs when line changes but stays same if only metadata changes', () => {
    const base = mkFinding({ check_id: 'x', line: 1, message: 'm', lines: 'code line' });
    const moved = mkFinding({ check_id: 'x', line: 2, message: 'm', lines: 'code line' });
    expect(fingerprintOf(base)).not.toBe(fingerprintOf(moved));
  });

  test('whitespace in message/hunk is normalized so trivial indent changes do not flip fingerprint', () => {
    const a = mkFinding({ message: 'a    b', lines: '  foo\n  bar\n' });
    const b = mkFinding({ message: 'a b', lines: 'foo\nbar' });
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
  });
});

describe('issueTitleFor / labelForFinding / buildFindingBody', () => {
  test('title encodes [SA][SEV] prefix + relative path + fingerprint suffix', () => {
    const f = mkFinding({
      check_id: 'xss-innerhtml',
      path: '/repo/src/pages/home.tsx',
      severity: 'ERROR',
      line: 17,
    });
    const t = issueTitleFor(f, '/repo');
    expect(t).toContain('[SA][ERROR]');
    expect(t).toContain('xss-innerhtml');
    expect(t).toContain('@ src/pages/home.tsx:17');
    expect(t).toContain(fingerprintOf(f));
  });

  test('severity falls back to UNKNOWN when severity is missing', () => {
    const f = mkFinding({ check_id: 'r', path: '/repo/a.ts', severity: '' });
    delete (f as any).extra.severity;
    const t = issueTitleFor(f, '/repo');
    expect(t).toContain('[SA][UNKNOWN]');
  });

  test('labelForFinding prefixes safp and includes rule + severity', () => {
    const label = labelForFinding(mkFinding({ check_id: 'rule/x', severity: 'WARNING' }));
    expect(label.startsWith(ISSUE_LABEL_PREFIX)).toBe(true);
    expect(label).toContain('rule-x:WARNING');
  });

  test('buildFindingBody embeds fingerprint, rule, file path, severity, snippet, and fix', () => {
    const f = mkFinding({
      check_id: 'bad-eval',
      path: '/repo/src/calc.ts',
      severity: 'ERROR',
      message: 'Avoid eval()',
      lines: '  const r = eval(user);',
      fix: '  const r = parseExpression(user);',
    });
    const fp = fingerprintOf(f);
    const body = buildFindingBody(f, '/repo', fp);
    expect(body).toContain(fp);
    expect(body).toContain('`bad-eval`');
    expect(body).toContain('`src/calc.ts`');
    expect(body).toContain('ERROR');
    expect(body).toContain('Avoid eval()');
    expect(body).toContain('const r = eval(user);');
    expect(body).toContain('parseExpression(user);');
    expect(body).toContain('fingerprint suffix in the issue title');
  });
});

describe('classifySeverity', () => {
  test('maps severity strings into buckets', () => {
    expect(classifySeverity('ERROR')).toBe('ERROR');
    expect(classifySeverity('error')).toBe('ERROR');
    expect(classifySeverity('critical')).toBe('ERROR');
    expect(classifySeverity('High')).toBe('ERROR');
    expect(classifySeverity('warn')).toBe('WARNING');
    expect(classifySeverity('WARNING')).toBe('WARNING');
    expect(classifySeverity('medium')).toBe('WARNING');
    expect(classifySeverity('info')).toBe('INFO');
    expect(classifySeverity('LOW')).toBe('INFO');
    expect(classifySeverity('')).toBe('UNKNOWN');
    expect(classifySeverity('note')).toBe('UNKNOWN');
  });
});

describe('readUsageState / writeUsageState / recordScanInUsage', () => {
  test('readUsageState returns default state when no file exists', () => {
    const d = tmpDir();
    const st = readUsageState(d);
    expect(st.totalScans).toBe(0);
    expect(st.firstScanAt).toBeNull();
    expect(st.history).toEqual([]);
    expect(st.bySeverityLifetime).toEqual({ ERROR: 0, WARNING: 0, INFO: 0, UNKNOWN: 0 });
  });

  test('writeUsageState persists and readUsageState round-trips', () => {
    const d = tmpDir();
    const stamp = new Date().toISOString();
    const st = {
      firstScanAt: stamp,
      lastScanAt: stamp,
      totalScans: 1,
      totalFindingsEver: 3,
      totalIssuesCreated: 2,
      totalIssuesClosed: 1,
      rulesRunTotal: 20,
      filesScannedTotal: 5,
      bySeverityLifetime: { ERROR: 1, WARNING: 1, INFO: 1, UNKNOWN: 0 },
      history: [
        {
          timestamp: stamp,
          target: '/repo/src',
          rulesPath: null,
          mode: 'report',
          scannedFiles: 5,
          totalRules: 20,
          findingsTotal: 3,
          bySeverity: { ERROR: 1, WARNING: 1, INFO: 1, UNKNOWN: 0 },
          closedCount: 1,
          createdCount: 2,
          updatedCount: 0,
          durationMs: 1234,
        },
      ],
    };
    writeUsageState(d, st);
    const got = readUsageState(d);
    expect(got.firstScanAt).toBe(stamp);
    expect(got.totalScans).toBe(1);
    expect(got.bySeverityLifetime.WARNING).toBe(1);
    expect(got.history.length).toBe(1);
    expect(got.history[0].mode).toBe('report');
  });

  test('recordScanInUsage accumulates counters and appends history', () => {
    const d = tmpDir();
    const f1 = mkFinding({ check_id: 'a', severity: 'ERROR' });
    const f2 = mkFinding({ check_id: 'b', severity: 'WARNING' });
    const f3 = mkFinding({ check_id: 'c', severity: 'INFO' });

    recordScanInUsage(
      d,
      {
        target: '/repo/src',
        rulesPath: '/repo/rules.yaml',
        mode: 'issue',
        scannedFiles: 10,
        totalRules: 25,
        findingsTotal: 3,
        bySeverity: { ERROR: 1, WARNING: 1, INFO: 1, UNKNOWN: 0 },
        durationMs: 100,
      },
      { created: 3, updated: 0, closed: 0 },
      [f1, f2, f3]
    );

    const st = readUsageState(d);
    expect(st.totalScans).toBe(1);
    expect(st.firstScanAt).toBeTruthy();
    expect(st.lastScanAt).toBe(st.firstScanAt);
    expect(st.totalFindingsEver).toBe(3);
    expect(st.totalIssuesCreated).toBe(3);
    expect(st.totalIssuesClosed).toBe(0);
    expect(st.rulesRunTotal).toBe(25);
    expect(st.filesScannedTotal).toBe(10);
    expect(st.bySeverityLifetime.ERROR).toBe(1);
    expect(st.bySeverityLifetime.WARNING).toBe(1);
    expect(st.bySeverityLifetime.INFO).toBe(1);
    expect(st.history.length).toBe(1);
    expect(st.history[0].rulesPath).toBe('/repo/rules.yaml');
    expect(st.history[0].createdCount).toBe(3);

    // second run
    recordScanInUsage(
      d,
      {
        target: '/repo/src',
        rulesPath: null,
        mode: 'report',
        scannedFiles: 8,
        totalRules: 20,
        findingsTotal: 1,
        bySeverity: { ERROR: 0, WARNING: 1, INFO: 0, UNKNOWN: 0 },
        durationMs: 50,
      },
      { created: 0, updated: 0, closed: 2 },
      [mkFinding({ check_id: 'd', severity: 'WARNING' })]
    );

    const st2 = readUsageState(d);
    expect(st2.totalScans).toBe(2);
    expect(st2.totalFindingsEver).toBe(3 + 1);
    expect(st2.totalIssuesClosed).toBe(2);
    expect(st2.filesScannedTotal).toBe(18);
    expect(st2.rulesRunTotal).toBe(45);
    expect(st2.bySeverityLifetime.WARNING).toBe(2);
    expect(st2.history.length).toBe(2);
  });

  test('history is capped at 200 entries', () => {
    const d = tmpDir();
    for (let i = 0; i < 210; i++) {
      recordScanInUsage(
        d,
        {
          target: `/t/${i}`,
          rulesPath: null,
          mode: 'report',
          scannedFiles: 1,
          totalRules: 1,
          findingsTotal: 0,
          bySeverity: { ERROR: 0, WARNING: 0, INFO: 0, UNKNOWN: 0 },
          durationMs: 1,
        },
        { created: 0, updated: 0, closed: 0 },
        []
      );
    }
    const st = readUsageState(d);
    expect(st.history.length).toBe(200);
    // Most recent kept
    expect(st.history[st.history.length - 1].target).toBe('/t/209');
    // Oldest dropped
    expect(st.history[0].target).toBe('/t/10');
  });
});
