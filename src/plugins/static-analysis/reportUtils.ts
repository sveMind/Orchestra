import fs from 'fs';
import path from 'path';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { readCiPrContext } from '../../services/ciContext';
import { OpengrepFinding } from './opengrepRunner';
import {
  UsageTrackerState,
  ScanHistoryEntry,
  readUsageState,
  writeUsageState,
  fingerprintOf,
  issueTitleFor,
  labelForFinding,
  buildFindingBody,
  classifySeverity,
  ISSUE_LABEL_PREFIX,
} from './usageTracker';

export interface PerFindingIssueResult {
  created: number;
  updated: number;
  closed: number;
}

export const buildMarkdownReport = (findings: OpengrepFinding[], scanRoot: string): string => {
  const sections: string[] = ['## Findings\n'];

  const deduped = dedupeFindings(findings);
  if (deduped.length === 0) {
    sections.push('✅ No static analysis issues detected.\n');
    return sections.join('\n');
  }

  const byFile = new Map<string, OpengrepFinding[]>();
  for (const f of deduped) {
    const key = f.path || f.file || '(unknown)';
    const arr = byFile.get(key) || [];
    arr.push(f);
    byFile.set(key, arr);
  }

  const sortedFiles = Array.from(byFile.keys()).sort((a, b) => a.localeCompare(b));
  const badge = (sev: string) => {
    const s = (sev || '').toUpperCase();
    if (s.includes('ERROR') || s === 'HIGH' || s === 'CRITICAL') return '🔴 **ERROR**';
    if (s.includes('WARN') || s === 'MEDIUM') return '🟠 **WARNING**';
    if (s.includes('INFO') || s === 'LOW') return '🟡 **INFO**';
    return '⚪ UNKNOWN';
  };

  for (const file of sortedFiles) {
    const fileFindings = byFile.get(file) || [];
    const rel = path.isAbsolute(file) ? path.relative(scanRoot, file) : file;
    sections.push(`### 📄 \`${rel || file}\`\n`);

    fileFindings.sort((a, b) => {
      const la = a.start?.line ?? 0;
      const lb = b.start?.line ?? 0;
      return la - lb;
    });

    for (const f of fileFindings) {
      const ruleId = f.check_id || f.rule_id || 'unknown-rule';
      const sev = f.extra?.severity || f.severity || 'UNKNOWN';
      const msg = f.extra?.message || f.message || '(no message)';
      const line = f.start?.line ?? '?';
      const col = f.start?.col ?? '?';
      const lines = (f.extra?.lines || f.lines || '').trim();
      const fix = f.extra?.fix;
      const fp = fingerprintOf(f);

      sections.push(`#### Rule: \`${ruleId}\`\n`);
      sections.push(`- **Severity:** ${badge(sev)}`);
      sections.push(`- **Location:** Line ${line}, Col ${col}`);
      sections.push(`- **Fingerprint:** \`${fp}\``);
      sections.push(`- **Message:** ${msg}\n`);

      if (lines) {
        const snippet = lines.split('\n').map(l => `    ${l}`).join('\n').slice(0, 800);
        sections.push('```\n' + snippet + '\n```\n');
      }
      if (fix) {
        sections.push('**Suggested fix:**\n\n```\n' + String(fix).slice(0, 600) + '\n```\n');
      }
    }
  }

  return sections.join('\n');
};

const dedupeFindings = (findings: OpengrepFinding[]): OpengrepFinding[] => {
  const seen = new Map<string, OpengrepFinding>();
  for (const f of findings) {
    const fp = fingerprintOf(f);
    if (!seen.has(fp)) seen.set(fp, f);
  }
  return Array.from(seen.values());
};

interface ReportOutputParams {
  dirPath: string;
  mode: string;
  report: string;
  hasIssues: boolean;
  reportFileName: string;
  issueTitle: string;
  issueLabels: string[];
  prCommentHeader: string;
  successMessage: string;
  findings: OpengrepFinding[];
  scanRoot: string;
  scanStats: { scannedFiles: number; totalRules: number; durationMs: number };
  rulesPath: string | undefined;
  targetPath: string;
}

export const handleFindingIssues = async (
  findings: OpengrepFinding[],
  scanRoot: string,
  baseLabels: string[]
): Promise<PerFindingIssueResult> => {
  const result: PerFindingIssueResult = { created: 0, updated: 0, closed: 0 };
  let vcs: any = null;
  try {
    vcs = VcsFactory.getProvider();
  } catch {
    return result;
  }
  if (!vcs) return result;

  const deduped = dedupeFindings(findings);
  const liveTitles = new Set<string>();
  for (const f of deduped) {
    liveTitles.add(issueTitleFor(f, scanRoot).trim());
  }

  let allOpen: Array<{ number: number; title: string; state: string }> = [];
  try {
    allOpen = (await vcs.listIssues('open')) || [];
  } catch {
    allOpen = [];
  }

  const safpOpen = allOpen.filter(i => {
    const t = i.title || '';
    return t.includes(ISSUE_LABEL_PREFIX) || t.startsWith('[SA]');
  });
  const managed = Array.from(new Map(safpOpen.map(i => [i.number, i])).values());

  const managedMap = new Map<string, typeof managed[number]>();
  for (const i of managed) managedMap.set(i.title.trim(), i);

  for (const f of deduped) {
    const title = issueTitleFor(f, scanRoot).trim();
    const fp = fingerprintOf(f);
    const body = buildFindingBody(f, scanRoot, fp);
    const labels = Array.from(new Set([...baseLabels, labelForFinding(f)]));
    try {
      const existing = managedMap.get(title);
      if (existing) {
        const updateBody =
          `### Rescanned finding still present\n\n` +
          `**Severity:** ${f.extra?.severity || f.severity || 'UNKNOWN'}\n` +
          `**File:** \`${(f.path || f.file || '')}\` at line ${f.start?.line ?? '?'}\n\n` +
          body.split('---')[0].trim();
        try { await vcs.addComment(existing.number, updateBody); } catch { /* best-effort */ }
        result.updated += 1;
      } else {
        const url = await vcs.createIssue(title, body, labels);
        if (url) result.created += 1;
      }
    } catch (e) {
      console.warn(`  ⚠️ issue update/create failed for ${f.check_id || f.rule_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const issue of managed) {
    const t = issue.title.trim();
    if (!liveTitles.has(t)) {
      try {
        const ok = await vcs.closeIssue(
          issue.number,
          `Auto-closing: fingerprint no longer detected in latest Orchestra static analysis run on ${new Date().toISOString().split('T')[0]}.`
        );
        if (ok) result.closed += 1;
      } catch (e) {
        console.warn(`  ⚠️ close failed for #${issue.number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return result;
};

export const recordScanInUsage = (
  root: string,
  entry: Omit<ScanHistoryEntry, 'timestamp' | 'closedCount' | 'createdCount' | 'updatedCount'>,
  perFinding: PerFindingIssueResult,
  findings: OpengrepFinding[]
): UsageTrackerState => {
  const state = readUsageState(root);
  const timestamp = new Date().toISOString();
  state.firstScanAt = state.firstScanAt ?? timestamp;
  state.lastScanAt = timestamp;
  state.totalScans += 1;
  state.totalFindingsEver += entry.findingsTotal;
  state.totalIssuesCreated += perFinding.created;
  state.totalIssuesClosed += perFinding.closed;
  state.rulesRunTotal += entry.totalRules;
  state.filesScannedTotal += entry.scannedFiles;
  for (const f of findings) {
    const sev = classifySeverity((f.extra?.severity || f.severity || '') as string);
    state.bySeverityLifetime[sev] += 1;
  }
  const historyEntry: ScanHistoryEntry = {
    ...entry,
    timestamp,
    closedCount: perFinding.closed,
    createdCount: perFinding.created,
    updatedCount: perFinding.updated,
  };
  state.history = [...(state.history || []), historyEntry].slice(-200);
  writeUsageState(root, state);
  return state;
};

const buildUsageSection = (state: UsageTrackerState, latest: ScanHistoryEntry | null): string => {
  if (!latest && state.totalScans === 0) return '';
  const lines: string[] = [];
  lines.push('## Usage & Scan History\n');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Scans Run (total) | ${state.totalScans} |`);
  lines.push(`| First Scan | ${state.firstScanAt || 'n/a'} |`);
  lines.push(`| Last Scan | ${state.lastScanAt || 'n/a'} |`);
  lines.push(`| Total Files Scanned | ${state.filesScannedTotal} |`);
  lines.push(`| Total Rules Executed | ${state.rulesRunTotal} |`);
  lines.push(`| Total Findings (all time) | ${state.totalFindingsEver} |`);
  lines.push(`| Issues Opened (total) | ${state.totalIssuesCreated} |`);
  lines.push(`| Issues Closed (total) | ${state.totalIssuesClosed} |\n`);
  lines.push('#### Lifetime Findings by Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 ERROR | ${state.bySeverityLifetime.ERROR} |`);
  lines.push(`| 🟠 WARNING | ${state.bySeverityLifetime.WARNING} |`);
  lines.push(`| 🟡 INFO | ${state.bySeverityLifetime.INFO} |`);
  lines.push(`| ⚪ UNKNOWN | ${state.bySeverityLifetime.UNKNOWN} |\n`);
  if (latest) {
    lines.push('#### Latest Run Summary');
    lines.push('');
    lines.push(`- Target: \`${latest.target}\``);
    lines.push(`- Mode: \`${latest.mode}\``);
    lines.push(`- Duration: ${(latest.durationMs / 1000).toFixed(2)}s`);
    lines.push(`- Findings: ${latest.findingsTotal} (ERROR ${latest.bySeverity.ERROR}, WARNING ${latest.bySeverity.WARNING}, INFO ${latest.bySeverity.INFO})`);
    lines.push(`- Issues opened/updated/closed: ${latest.createdCount}/${latest.updatedCount}/${latest.closedCount}`);
  }
  if (state.history.length > 0) {
    lines.push('');
    lines.push('#### Recent History');
    lines.push('');
    lines.push('| When | Target | Mode | Findings | Created | Updated | Closed |');
    lines.push('|------|--------|------|----------|---------|---------|--------|');
    for (const h of state.history.slice(-8).reverse()) {
      const tgt = h.target.length > 48 ? '…' + h.target.slice(-45) : h.target;
      lines.push(`| ${h.timestamp.replace('T', ' ').slice(0, 19)} | \`${tgt}\` | ${h.mode} | ${h.findingsTotal} | ${h.createdCount} | ${h.updatedCount} | ${h.closedCount} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
};

export const handleReportOutput = async (params: ReportOutputParams): Promise<void> => {
  const {
    dirPath,
    mode,
    report,
    hasIssues,
    reportFileName,
    issueTitle,
    issueLabels,
    prCommentHeader,
    successMessage,
    findings,
    scanRoot,
    scanStats,
    rulesPath,
    targetPath,
  } = params;

  const startMs = Date.now();

  let vcs: any = null;
  try {
    vcs = VcsFactory.getProvider();
  } catch {
    vcs = null;
  }

  const dedupedFindings = dedupeFindings(findings);

  let perFinding: PerFindingIssueResult = { created: 0, updated: 0, closed: 0 };
  if (hasIssues && (mode === 'issue' || mode === 'issues-per-finding') && vcs) {
    const realStart = Date.now();
    console.log('📋 Opening / updating per-finding issues...');
    perFinding = await handleFindingIssues(dedupedFindings, scanRoot, issueLabels);
    console.log(`✅ Issues: +${perFinding.created} created, ~${perFinding.updated} updated, -${perFinding.closed} closed. (${(Date.now() - realStart) / 1000}s)`);
  }

  const bySeverity: UsageTrackerState['bySeverityLifetime'] = { ERROR: 0, WARNING: 0, INFO: 0, UNKNOWN: 0 };
  for (const f of dedupedFindings) {
    const sev = classifySeverity((f.extra?.severity || f.severity || '') as string);
    bySeverity[sev] += 1;
  }

  const state = recordScanInUsage(scanRoot, {
    target: targetPath,
    rulesPath: rulesPath || null,
    mode,
    scannedFiles: scanStats.scannedFiles,
    totalRules: scanStats.totalRules,
    findingsTotal: dedupedFindings.length,
    bySeverity,
    durationMs: scanStats.durationMs + (Date.now() - startMs),
  }, perFinding, dedupedFindings);

  const latest = state.history[state.history.length - 1] || null;
  const usageSection = buildUsageSection(state, latest);
  const finalReport = [report, usageSection].filter(Boolean).join('\n\n') + (usageSection ? '\n' : '');

  const writeLocalReport = () => {
    const reportPath = path.join(dirPath, reportFileName);
    fs.writeFileSync(reportPath, finalReport);
    console.log(`\n✅ ${successMessage} Report generated at: ${reportPath}`);
  };

  if (!hasIssues) {
    writeLocalReport();
    console.log('No significant issues found. Modes issue/comment skipped.');
    return;
  }

  if (mode === 'report') {
    writeLocalReport();
    return;
  }

  if (!vcs) {
    writeLocalReport();
    console.log('\n⚠️ No VCS provider configured. Writing report locally.');
    return;
  }

  if (mode === 'issues-per-finding') {
    writeLocalReport();
    return;
  }

  if (mode === 'issue') {
    writeLocalReport();
    const existing = await vcs.findIssueByTitle(issueTitle);
    if (existing) {
      console.log(`ℹ️ An open issue already exists (#${existing}). Appending latest scan as a comment.`);
      await vcs.addComment(existing, `${prCommentHeader}\n\nOpened/updated/closed per-finding issues: ${perFinding.created}/${perFinding.updated}/${perFinding.closed}\n\n${finalReport}`);
      console.log('✅ Comment added to existing issue.');
    } else {
      console.log('Creating summary issue...');
      const url = await vcs.createIssue(issueTitle, finalReport, issueLabels);
      if (url) console.log(`✅ Issue created successfully: ${url}`);
      else console.log('❌ Failed to create issue.');
    }
    return;
  }

  if (mode === 'comment') {
    writeLocalReport();
    const prContext = readCiPrContext();
    if (prContext) {
      console.log(`Commenting on PR #${prContext.prNumber}...`);
      await vcs.addComment(prContext.prNumber, `${prCommentHeader}\n\n${finalReport}`);
      console.log('✅ Comment posted to PR.');
    } else {
      console.log('❌ Mode is "comment" but no CI PR context found. Keeping local report.');
    }
    return;
  }

  writeLocalReport();
};
