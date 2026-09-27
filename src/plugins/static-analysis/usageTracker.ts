import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { OpengrepFinding } from './opengrepRunner';

export const ISSUE_LABEL_PREFIX = 'safp:';

export interface FindingKey {
  fingerprint: string;
  ruleId: string;
  file: string;
  line: number;
  severity: string;
  message: string;
}

export interface ScanHistoryEntry {
  timestamp: string;
  target: string;
  rulesPath: string | null;
  mode: string;
  scannedFiles: number;
  totalRules: number;
  findingsTotal: number;
  bySeverity: { ERROR: number; WARNING: number; INFO: number; UNKNOWN: number };
  closedCount: number;
  createdCount: number;
  updatedCount: number;
  durationMs: number;
}

export interface UsageTrackerState {
  firstScanAt: string | null;
  lastScanAt: string | null;
  totalScans: number;
  totalFindingsEver: number;
  totalIssuesCreated: number;
  totalIssuesClosed: number;
  rulesRunTotal: number;
  filesScannedTotal: number;
  bySeverityLifetime: { ERROR: number; WARNING: number; INFO: number; UNKNOWN: number };
  history: ScanHistoryEntry[];
}

const DEFAULT_STATE: UsageTrackerState = {
  firstScanAt: null,
  lastScanAt: null,
  totalScans: 0,
  totalFindingsEver: 0,
  totalIssuesCreated: 0,
  totalIssuesClosed: 0,
  rulesRunTotal: 0,
  filesScannedTotal: 0,
  bySeverityLifetime: { ERROR: 0, WARNING: 0, INFO: 0, UNKNOWN: 0 },
  history: [],
};

const statePath = (root: string): string => {
  const dir = path.join(root, '.orchestra');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'static-analysis-usage.json');
};

export const readUsageState = (root: string): UsageTrackerState => {
  const p = statePath(root);
  if (!fs.existsSync(p)) return { ...DEFAULT_STATE, history: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      ...DEFAULT_STATE,
      ...raw,
      bySeverityLifetime: { ...DEFAULT_STATE.bySeverityLifetime, ...(raw.bySeverityLifetime || {}) },
      history: Array.isArray(raw.history) ? raw.history.slice(-200) : [],
    };
  } catch {
    return { ...DEFAULT_STATE, history: [] };
  }
};

export const writeUsageState = (root: string, state: UsageTrackerState): void => {
  const p = statePath(root);
  state.history = (state.history || []).slice(-200);
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
};

export const fingerprintOf = (f: OpengrepFinding): string => {
  const ruleId = f.check_id || f.rule_id || 'unknown';
  const file = f.path || f.file || '';
  const line = f.start?.line ?? 0;
  const msg = (f.extra?.message || f.message || '').trim().replace(/\s+/g, ' ');
  const hunk = (f.extra?.lines || f.lines || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  const raw = `${ruleId}\n${file}\n${line}\n${msg}\n${hunk}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
};

export const issueTitleFor = (f: OpengrepFinding, scanRoot: string): string => {
  const ruleId = f.check_id || f.rule_id || 'unknown';
  const file = f.path || f.file || '';
  const rel = path.isAbsolute(file) ? path.relative(scanRoot, file) : file;
  const line = f.start?.line ?? '?';
  const sev = ((f.extra?.severity || f.severity || '') as string).toUpperCase().replace(/[^A-Z]/g, '') || 'UNKNOWN';
  const fp = fingerprintOf(f);
  return `[SA][${sev}] ${ruleId} @ ${rel}:${line}  (${fp})`;
};

export const labelForFinding = (f: OpengrepFinding): string => {
  const ruleId = (f.check_id || f.rule_id || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const sev = ((f.extra?.severity || f.severity || 'UNKNOWN') as string).toUpperCase();
  return `${ISSUE_LABEL_PREFIX}${ruleId}:${sev}`;
};

export const buildFindingBody = (
  f: OpengrepFinding,
  scanRoot: string,
  fingerprint: string
): string => {
  const ruleId = f.check_id || f.rule_id || 'unknown-rule';
  const file = f.path || f.file || '';
  const rel = path.isAbsolute(file) ? path.relative(scanRoot, file) : file;
  const line = f.start?.line ?? '?';
  const col = f.start?.col ?? '?';
  const sev = (f.extra?.severity || f.severity || 'UNKNOWN') as string;
  const msg = (f.extra?.message || f.message || '') as string;
  const lines = ((f.extra?.lines || f.lines || '') as string).trim();
  const fix = f.extra?.fix;

  const blocks: string[] = [];
  blocks.push(`### Static Analysis Finding\n`);
  blocks.push(`- **Fingerprint:** \`${fingerprint}\``);
  blocks.push(`- **Rule ID:** \`${ruleId}\``);
  blocks.push(`- **Severity:** ${sev.toUpperCase()}`);
  blocks.push(`- **File:** \`${rel || file}\``);
  blocks.push(`- **Line / Col:** ${line} / ${col}\n`);
  blocks.push(`#### Message\n${msg}\n`);
  if (lines) {
    blocks.push(`#### Code Snippet\n\`\`\`\n${lines.slice(0, 1500)}\n\`\`\`\n`);
  }
  if (fix) {
    blocks.push(`#### Suggested Fix\n\`\`\`\n${String(fix).slice(0, 1000)}\n\`\`\`\n`);
  }
  blocks.push(`---\n_Auto-opened by Orchestra Static Analysis plugin. Do not edit the fingerprint suffix in the issue title — it is used to auto-close resolved findings on future runs._`);
  return blocks.join('\n');
};

export const classifySeverity = (sevRaw: string): keyof UsageTrackerState['bySeverityLifetime'] => {
  const s = (sevRaw || '').toUpperCase();
  if (s.includes('ERROR') || s === 'HIGH' || s === 'CRITICAL') return 'ERROR';
  if (s.includes('WARN') || s === 'MEDIUM') return 'WARNING';
  if (s.includes('INFO') || s === 'LOW') return 'INFO';
  return 'UNKNOWN';
};
