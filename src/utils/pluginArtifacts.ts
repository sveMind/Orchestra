import fs from 'fs';
import path from 'path';

export type OpengrepResultFinding = {
  check_id?: string;
  path: string;
  start: { line: number; col?: number; offset?: number };
  end: { line: number; col?: number; offset?: number };
  extra?: {
    severity?: string;
    message?: string;
    lines?: string;
    metadata?: Record<string, any>;
    fix?: string;
  };
};

export type OpengrepArtifact = {
  generatedAt?: string;
  results: OpengrepResultFinding[];
  paths: { scanned?: string[] };
  errors: any[];
  bySeverity?: Record<string, number>;
  scanDurationMs?: number;
};

export type TestResultFinding = {
  id: string;
  testFilePath: string;
  suite: string | null;
  testName: string;
  fullyQualifiedName: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'error' | 'timeout' | 'unknown';
  durationMs: number | null;
  failureMessage?: string | null;
  failureLine?: number | null;
  failureStack?: string | null;
  framework: string;
  language: string;
  generatedByTestGen: boolean;
};

export type TestArtifact = {
  generatedAt: string;
  repoRoot: string;
  target: string | null;
  framework: string;
  frameworkConfidence: number;
  evidence: string[];
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
  invocations?: Array<{ command: string; args: string[]; exitCode: number | null; durationMs: number }>;
};

export type SbomArtifactPaths = {
  spdx: string | null;
  cdx: string | null;
  report: string | null;
};

export type SbomLicenseSummary = {
  loadedFrom: string | null;
  componentsScanned: number;
  licensedComponents: number;
  unlicensedComponents: number;
  denied: number;
  warnings: number;
  copyleftWarnings: number;
  unknownWarnings: number;
  proprietaryWarnings: number;
  allowed: number;
  skipped: number;
  denyListHit: Array<{ ecosystem: string; name: string; version: string | null; license: string | null; reason: string; remediation?: string }>;
  warnListHit: Array<{ ecosystem: string; name: string; version: string | null; license: string | null; verdict: string; reason: string }>;
};

const orchestraDir = (repoRoot: string): string => path.join(repoRoot, '.orchestra');

const readJsonSafe = <T>(abs: string): T | null => {
  try {
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const readOpengrepArtifact = (repoRoot: string): OpengrepArtifact | null => {
  const candidates = [
    path.join(orchestraDir(repoRoot), 'opengrep-findings.json'),
    path.join(repoRoot, 'opengrep-report.json'),
    path.join(repoRoot, 'opengrep.json'),
    path.join(repoRoot, '.opengrep-report.json')
  ];
  for (const c of candidates) {
    const data = readJsonSafe<OpengrepArtifact>(c);
    if (data && Array.isArray(data.results)) return data;
  }
  return null;
};

export const readStaticAnalysisReportMarkdown = (repoRoot: string): string | null => {
  const candidates = [
    path.join(repoRoot, 'STATIC_ANALYSIS_REPORT.md'),
    path.join(orchestraDir(repoRoot), 'static-analysis-report.md')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
    } catch {}
  }
  return null;
};

export const readSbomArtifacts = (repoRoot: string): SbomArtifactPaths & { componentsCount: number | null } => {
  const spdx = path.join(repoRoot, 'sbom.spdx.json');
  const cdx = path.join(repoRoot, 'sbom.cyclonedx.json');
  const report = path.join(repoRoot, 'sbom.md');
  let componentsCount: number | null = null;
  const cdxData = readJsonSafe<any>(cdx);
  if (cdxData && Array.isArray(cdxData.components)) componentsCount = cdxData.components.length;
  return {
    spdx: fs.existsSync(spdx) ? spdx : null,
    cdx: fs.existsSync(cdx) ? cdx : null,
    report: fs.existsSync(report) ? report : null,
    componentsCount
  };
};

export const readSecurityReportMarkdown = (repoRoot: string): string | null => {
  const p = path.join(repoRoot, 'SECURITY_REPORT.md');
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
};

export const readSbomLicenseSummary = (repoRoot: string): SbomLicenseSummary | null => {
  const cand = [path.join(orchestraDir(repoRoot), 'sbom-license-policy.json'), path.join(repoRoot, 'sbom-license-policy.json')];
  for (const c of cand) {
    const d = readJsonSafe<LicensePolicyReportSafe>(c);
    if (d && typeof d.summary === 'object') return mapLicensePolicyToSummary(d);
  }
  const cdxPath = path.join(repoRoot, 'sbom.cyclonedx.json');
  const cdx = readJsonSafe<any>(cdxPath);
  if (!cdx || !Array.isArray(cdx.components)) return null;
  // Extract aggregated license data if present; best-effort (plugin prefers writing machine JSON above, fallback to zero summary with present files)
  const total = cdx.components.length;
  let licensed = 0;
  for (const comp of cdx.components) {
    if (Array.isArray(comp.licenses) && comp.licenses.length > 0) licensed += 1;
    if (comp.license) licensed += 1;
  }
  return {
    loadedFrom: null,
    componentsScanned: total,
    licensedComponents: licensed,
    unlicensedComponents: total - licensed,
    denied: 0,
    warnings: 0,
    copyleftWarnings: 0,
    unknownWarnings: 0,
    proprietaryWarnings: 0,
    allowed: total,
    skipped: 0,
    denyListHit: [],
    warnListHit: []
  };
};
type LicensePolicyReportSafe = {
  policy?: { loadedFrom?: string | null };
  componentsScanned?: number;
  licensedComponents?: number;
  unlicensedComponents?: number;
  summary?: { allowed?: number; denied?: number; copyleftWarnings?: number; unknownWarnings?: number; proprietaryWarnings?: number; skipped?: number };
  denied?: Array<{ component?: any; match?: any; verdict: string; reason: string; remediation?: string }>;
  warnings?: Array<{ component?: any; match?: any; verdict: string; reason: string }>;
};
const mapLicensePolicyToSummary = (d: LicensePolicyReportSafe): SbomLicenseSummary => {
  const summary = d.summary || {};
  const denyListHit: SbomLicenseSummary['denyListHit'] = (d.denied || []).slice(0, 100).map(v => ({
    ecosystem: String(v.component?.ecosystem || ''),
    name: String(v.component?.name || ''),
    version: v.component?.version || null,
    license: (v.match?.normalized || v.component?.license || null) as string | null,
    reason: v.reason || '',
    remediation: v.remediation
  }));
  const warnListHit: SbomLicenseSummary['warnListHit'] = (d.warnings || []).slice(0, 100).map(v => ({
    ecosystem: String(v.component?.ecosystem || ''),
    name: String(v.component?.name || ''),
    version: v.component?.version || null,
    license: (v.match?.normalized || v.component?.license || null) as string | null,
    verdict: String(v.verdict || 'WARN_UNKNOWN'),
    reason: v.reason || ''
  }));
  return {
    loadedFrom: d.policy?.loadedFrom || null,
    componentsScanned: d.componentsScanned || 0,
    licensedComponents: d.licensedComponents || 0,
    unlicensedComponents: d.unlicensedComponents || 0,
    denied: summary.denied || 0,
    warnings: (d.warnings || []).length,
    copyleftWarnings: summary.copyleftWarnings || 0,
    unknownWarnings: summary.unknownWarnings || 0,
    proprietaryWarnings: summary.proprietaryWarnings || 0,
    allowed: summary.allowed || 0,
    skipped: summary.skipped || 0,
    denyListHit,
    warnListHit
  };
};

export const readTestArtifact = (repoRoot: string): TestArtifact | null => {
  const candidates = [
    path.join(orchestraDir(repoRoot), 'test-results.json')
  ];
  for (const c of candidates) {
    const d = readJsonSafe<TestArtifact>(c);
    if (d && Array.isArray(d.findings)) return d;
  }
  return null;
};

export const findingsGroupedByModule = (
  findings: OpengrepResultFinding[],
  opts: { moduleDepth?: number; repoRoot?: string } = {}
): Array<{ module: string; findings: OpengrepResultFinding[]; bySeverity: Record<string, number> }> => {
  const depth = typeof opts.moduleDepth === 'number' ? opts.moduleDepth : 2;
  const groups = new Map<string, { findings: OpengrepResultFinding[]; bySeverity: Record<string, number> }>();
  for (const f of findings) {
    const segments = String(f.path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    let key = segments.slice(0, depth).join('/') || path.basename(String(f.path || 'unknown'));
    if (!key) key = 'unknown';
    const g = groups.get(key) || { findings: [], bySeverity: {} };
    g.findings.push(f);
    const sev = String((f.extra && f.extra.severity) || 'UNKNOWN').toUpperCase();
    g.bySeverity[sev] = (g.bySeverity[sev] || 0) + 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries()).map(([module, v]) => ({ module, findings: v.findings, bySeverity: v.bySeverity }))
    .sort((a, b) => b.findings.length - a.findings.length || a.module.localeCompare(b.module));
};

export const severityScore = (f: OpengrepResultFinding): number => {
  const s = String((f.extra && f.extra.severity) || '').toUpperCase();
  if (s === 'ERROR' || s.startsWith('HIGH') || s.startsWith('CRITICAL')) return 3;
  if (s === 'WARNING' || s.startsWith('MEDIUM')) return 2;
  if (s === 'INFO' || s.startsWith('LOW')) return 1;
  return 0;
};
