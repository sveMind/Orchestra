import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { FrameworkAutoDetect } from './frameworkDetect';

export type TestCaseOutcome = 'passed' | 'failed' | 'skipped' | 'error' | 'timeout' | 'unknown';

export type TestResultFinding = {
  id: string;
  testFilePath: string;
  suite: string | null;
  testName: string;
  fullyQualifiedName: string;
  outcome: TestCaseOutcome;
  durationMs: number | null;
  failureMessage?: string | null;
  failureLine?: number | null;
  failureStack?: string | null;
  framework: string;
  language: string;
  generatedByTestGen: boolean;
  raw?: unknown;
};

export type TestRunSummary = {
  generatedAt: string;
  repoRoot: string;
  target: string | null;
  framework: string;
  frameworkConfidence: number;
  evidence: string[];
  invocations: Array<{
    command: string;
    args: string[];
    cwd: string;
    exitCode: number | null;
    stdoutHead: string;
    stderrHead: string;
    durationMs: number;
  }>;
  testsGenerated: number;
  testsDiscovered: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  testsErrored: number;
  unknown: number;
  totalDurationMs: number;
  findings: TestResultFinding[];
  errors: string[];
  coverage?: { pct: number | null; statements: number | null; branches: number | null; lines: number | null; functions: number | null };
};

const orchestraDir = (root: string): string => {
  const p = path.join(root, '.orchestra');
  try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch {}
  return p;
};

const head = (s: string, n = 2000): string => (s || '').slice(0, n);

export const runTestFrameworkOrBestEffort = async (
  repoRoot: string,
  target: string | null,
  det: FrameworkAutoDetect,
  opts: { dryRun?: boolean; timeoutMs?: number } = {}
): Promise<TestRunSummary> => {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const start = Date.now();
  const summary: TestRunSummary = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    target,
    framework: det.framework,
    frameworkConfidence: det.confidence,
    evidence: det.evidence,
    invocations: [],
    testsGenerated: 0,
    testsDiscovered: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsSkipped: 0,
    testsErrored: 0,
    unknown: 0,
    totalDurationMs: 0,
    findings: [],
    errors: []
  };

  const runOnce = async (bin: string, args: string[], desc: string): Promise<{ exitCode: number | null; stdout: string; stderr: string; durationMs: number; fileOutputs: string[] }> => {
    const invokedAt = Date.now();
    const argsFull = [...args];
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    const fileOutputsBefore = new Set<string>();
    const orch = orchestraDir(repoRoot);
    for (const f of fs.readdirSync(orch)) fileOutputsBefore.add(path.join(orch, f));
    try {
      exitCode = await new Promise<number>((resolve, reject) => {
        try {
          const child = spawn(bin, argsFull, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, CI: 'true', NODE_ENV: 'test', PYTHONIOENCODING: 'utf-8' } });
          let done = false;
          const tm = setTimeout(() => {
            if (done) return;
            done = true;
            try { child.kill('SIGTERM'); } catch {}
            stderr += `\n[orchestra test-gen runner] timed out after ${timeoutMs}ms`;
            resolve(-99);
          }, timeoutMs);
          child.stdout!.on('data', (d) => { stdout += String(d); });
          child.stderr!.on('data', (d) => { stderr += String(d); });
          child.on('error', (err) => { if (done) return; done = true; clearTimeout(tm); reject(err); });
          child.on('close', (code) => { if (done) return; done = true; clearTimeout(tm); resolve(typeof code === 'number' ? code : -1); });
        } catch (err) { reject(err); }
      });
    } catch (err) {
      stderr += `\n[orchestra test-gen runner] error launching ${bin} ${desc}: ${err instanceof Error ? err.message : String(err)}`;
      exitCode = -2;
    }
    const fileOutputsAfter: string[] = [];
    try {
      for (const f of fs.readdirSync(orch)) {
        const abs = path.join(orch, f);
        if (!fileOutputsBefore.has(abs)) fileOutputsAfter.push(abs);
      }
    } catch {}
    return { exitCode, stdout, stderr, durationMs: Date.now() - invokedAt, fileOutputs: fileOutputsAfter };
  };

  if (!opts.dryRun) {
    try {
      const jsonArgs = [...det.runnerArgsTemplate, ...(det.reporterArgsForJson || [])];
      const res = await runOnce(det.runnerBin, jsonArgs, `${det.framework}-json`);
      summary.invocations.push({ command: det.runnerBin, args: jsonArgs, cwd: repoRoot, exitCode: res.exitCode, stdoutHead: head(res.stdout, 1000), stderrHead: head(res.stderr, 1000), durationMs: res.durationMs });
      const findings = await parseTestArtifacts(det, res.stdout, res.stderr, res.fileOutputs, repoRoot);
      summary.findings = findings;
    } catch (err) {
      summary.errors.push(`runner invoke failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const f of summary.findings) {
    summary.testsDiscovered += 1;
    switch (f.outcome) {
      case 'passed': summary.testsPassed += 1; break;
      case 'failed': summary.testsFailed += 1; break;
      case 'skipped': summary.testsSkipped += 1; break;
      case 'error':
      case 'timeout': summary.testsErrored += 1; break;
      default: summary.unknown += 1;
    }
  }
  summary.totalDurationMs = Date.now() - start;
  return summary;
};

const parseTestArtifacts = async (det: FrameworkAutoDetect, stdout: string, stderr: string, fileOutputs: string[], repoRoot: string): Promise<TestResultFinding[]> => {
  // Prefer written JSON files over stdout. Go test writes JSON to stdout.
  const candidates: string[] = [];
  for (const f of fileOutputs) candidates.push(f);
  // Also check conventional paths that may pre-exist (or be written regardless of our invocations).
  const orch = orchestraDir(repoRoot);
  for (const known of ['jest-results.json', 'pytest.json', 'pytest-report.json', 'rspec.json', 'phpunit.json']) {
    const abs = path.join(orch, known);
    try { if (fs.existsSync(abs) && !candidates.includes(abs)) candidates.push(abs); } catch {}
  }

  const all: TestResultFinding[] = [];
  const seenIds = new Set<string>();
  const push = (f: TestResultFinding) => {
    const id = `${det.framework}:${f.testFilePath}:${f.fullyQualifiedName}:${f.outcome}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);
    all.push(f);
  };

  if (det.jsonOutputType === 'jest' || det.jsonOutputType === 'vitest') {
    for (const fp of candidates) {
      try {
        const text = fs.readFileSync(fp, 'utf8');
        const obj = JSON.parse(text);
        if (obj && Array.isArray(obj.testResults)) {
          for (const tr of obj.testResults as any[]) {
            const testFile = tr.testFilePath || tr.name || '';
            const asn = Array.isArray(tr.assertionResults) ? tr.assertionResults : [];
            for (const r of asn) {
              const outcome = jestOutcome(r.status);
              const suite = (Array.isArray(r.ancestorTitles) && r.ancestorTitles.length ? r.ancestorTitles.join(' › ') : null) as string | null;
              push({
                id: `${testFile}:${r.fullName}`,
                testFilePath: toRepoRel(testFile, repoRoot),
                suite,
                testName: r.title || '',
                fullyQualifiedName: r.fullName || `${suite || ''} ${r.title || ''}`.trim(),
                outcome,
                durationMs: typeof r.duration === 'number' ? r.duration : null,
                failureMessage: Array.isArray(r.failureMessages) && r.failureMessages[0] ? String(r.failureMessages[0]).slice(0, 4000) : null,
                failureLine: null,
                failureStack: Array.isArray(r.failureMessages) && r.failureMessages.length > 1 ? r.failureMessages.join('\n').slice(0, 8000) : null,
                framework: det.framework,
                language: det.language,
                generatedByTestGen: /(test|spec)\./.test(toRepoRel(testFile, repoRoot)) || false,
                raw: r
              });
            }
          }
        }
      } catch {}
    }
  }

  if (det.jsonOutputType === 'gotest') {
    // go test -json: one JSON object per line
    const lines = (stdout || '').split(/\r?\n/).filter(Boolean);
    const perKey = new Map<string, any>();
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (!ev || ev.Action === 'output' || typeof ev.Package !== 'string') continue;
        const key = `${ev.Package || ''}::${ev.Test || '_PACKAGE_'}`;
        const prev = perKey.get(key) || { packages: new Set<string>(), tests: new Set<string>(), events: [] as any[] };
        prev.packages.add(ev.Package);
        if (ev.Test) prev.tests.add(ev.Test);
        prev.events.push(ev);
        perKey.set(key, prev);
      } catch {}
    }
    for (const [key, data] of perKey.entries()) {
      const [pkg, tn] = key.split('::');
      if (!tn || tn === '_PACKAGE_') continue;
      const outcome = goTestOutcome(data.events);
      const last = data.events[data.events.length - 1];
      const outputs: string[] = [];
      for (const ev of data.events) if (ev.Action === 'output') outputs.push(String(ev.Output || ''));
      const combined = outputs.join('');
      push({
        id: key,
        testFilePath: `${pkg}/*_test.go`,
        suite: pkg,
        testName: tn,
        fullyQualifiedName: `${pkg}#${tn}`,
        outcome,
        durationMs: typeof last?.Elapsed === 'number' ? Math.round(last.Elapsed * 1000) : null,
        failureMessage: outcome === 'failed' ? combined.slice(0, 4000) : null,
        failureLine: null,
        failureStack: outcome === 'failed' ? combined.slice(0, 8000) : null,
        framework: 'go',
        language: 'go',
        generatedByTestGen: true,
        raw: data.events
      });
    }
  }

  if (det.jsonOutputType === 'cargo') {
    const lines = (stdout || '').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (!ev || ev.type !== 'test') continue;
        if (ev.event !== 'ok' && ev.event !== 'failed' && ev.event !== 'ignored') continue;
        const name = String(ev.name || '');
        const outcome: TestCaseOutcome = ev.event === 'ok' ? 'passed' : ev.event === 'ignored' ? 'skipped' : 'failed';
        push({
          id: `cargo:${name}`,
          testFilePath: ev.executable || 'src/tests',
          suite: ev.suite || null,
          testName: name,
          fullyQualifiedName: name,
          outcome,
          durationMs: typeof ev.exec_time === 'number' ? Math.round(ev.exec_time * 1000) : null,
          failureMessage: null,
          failureLine: null,
          failureStack: null,
          framework: 'cargo',
          language: 'rs',
          generatedByTestGen: true,
          raw: ev
        });
      } catch {}
    }
  }

  if (det.jsonOutputType === 'pytest') {
    for (const fp of candidates) {
      try {
        const obj = JSON.parse(fs.readFileSync(fp, 'utf8'));
        const tests = obj && (Array.isArray(obj.tests) ? obj.tests : Array.isArray(obj.results) ? obj.results : []);
        for (const t of tests) {
          const out = pyOutcome(t.outcome || t.nodeid);
          const name = String(t.nodeid || t.test || '');
          push({
            id: name,
            testFilePath: name.split('::')[0] || '',
            suite: (t.keywords && Array.isArray(t.keywords) ? t.keywords : []).slice(0, 6).join(',') || null,
            testName: name.split('::').slice(-1)[0] || name,
            fullyQualifiedName: name,
            outcome: out,
            durationMs: typeof t.duration === 'number' ? Math.round(t.duration * 1000) : null,
            failureMessage: (t.call && (t.call.longrepr || t.call.crash)) ? String(t.call.longrepr || `${t.call.crash?.path || ''}:${t.call.crash?.lineno || ''} ${t.call.crash?.message || ''}`).slice(0, 4000) : null,
            failureLine: null,
            failureStack: null,
            framework: 'pytest',
            language: 'py',
            generatedByTestGen: true,
            raw: t
          });
        }
      } catch {}
    }
  }

  // If we still have nothing, fall back to cheap stdout heuristics so the markdown report still has something
  if (all.length === 0) {
    const lower = `${stdout || ''}\n${stderr || ''}`;
    const rxPass = lower.match(/\b(\d+)\s+(?:passed|ok|pass)/g) || [];
    const rxFail = lower.match(/\b(\d+)\s+(?:failed|FAIL|error|not ok)\b/g) || [];
    const rxSkip = lower.match(/\b(\d+)\s+(?:skipped|skip|pending|ignored)\b/g) || [];
    const total = Math.max(sumNum(rxPass), sumNum(rxFail), sumNum(rxSkip));
    if (total > 0) {
      for (let i = 0; i < sumNum(rxPass); i++) all.push(dummyFinding(det, 'passed', `stdout-pass-${i}`));
      for (let i = 0; i < sumNum(rxFail); i++) all.push(dummyFinding(det, 'failed', `stdout-fail-${i}`));
      for (let i = 0; i < sumNum(rxSkip); i++) all.push(dummyFinding(det, 'skipped', `stdout-skip-${i}`));
    }
  }

  return all.sort((a, b) => a.testFilePath.localeCompare(b.testFilePath) || a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
};

const toRepoRel = (absOrLike: string, repoRoot: string): string => {
  if (!absOrLike) return '';
  try {
    if (path.isAbsolute(absOrLike)) return path.relative(repoRoot, absOrLike).split(path.sep).join('/');
  } catch {}
  return String(absOrLike).split(path.sep).join('/');
};

const jestOutcome = (s: string): TestCaseOutcome => {
  switch ((s || '').toLowerCase()) {
    case 'passed':
    case 'pass': return 'passed';
    case 'failed':
    case 'fail': return 'failed';
    case 'skipped':
    case 'pending':
    case 'todo': return 'skipped';
    case 'error':
    case 'errored': return 'error';
    case 'timeout': return 'timeout';
    default: return 'unknown';
  }
};

const goTestOutcome = (events: any[]): TestCaseOutcome => {
  for (let i = events.length - 1; i >= 0; i--) {
    const a = events[i]?.Action;
    if (a === 'pass') return 'passed';
    if (a === 'fail') return 'failed';
    if (a === 'skip') return 'skipped';
  }
  return 'unknown';
};

const pyOutcome = (o: string): TestCaseOutcome => {
  switch ((o || '').toLowerCase()) {
    case 'passed':
    case 'pass': return 'passed';
    case 'failed':
    case 'failure':
    case 'fail': return 'failed';
    case 'skipped':
    case 'skip': return 'skipped';
    case 'error': return 'error';
    default: return 'unknown';
  }
};

const sumNum = (arr: RegExpMatchArray | string[]): number => {
  let s = 0;
  for (const m of arr) {
    const n = /(\d+)/.exec(String(m));
    if (n) s += parseInt(n[1], 10);
  }
  return s;
};

const dummyFinding = (det: FrameworkAutoDetect, outcome: TestCaseOutcome, id: string): TestResultFinding => ({
  id,
  testFilePath: 'stdout-summary',
  suite: null,
  testName: id,
  fullyQualifiedName: id,
  outcome,
  durationMs: null,
  framework: det.framework,
  language: det.language,
  generatedByTestGen: false
});

export const writeTestArtifactSummary = (repoRoot: string, summary: TestRunSummary): string => {
  const abs = path.join(orchestraDir(repoRoot), 'test-results.json');
  const strippedFindings = summary.findings.map(f => {
    const { raw, ...rest } = f;
    void raw;
    return rest;
  });
  const payload = { ...summary, findings: strippedFindings };
  fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + '\n');
  return abs;
};
