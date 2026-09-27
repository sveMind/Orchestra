import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import path from 'path';
import { runOpengrepScan, OpengrepFinding } from './opengrepRunner';
import { buildMarkdownReport, handleReportOutput } from './reportUtils';
import { classifySeverity } from './usageTracker';

type SeverityCount = { ERROR: number; WARNING: number; INFO: number; UNKNOWN: number };

const countSeverities = (findings: OpengrepFinding[]): SeverityCount => {
  const counts: SeverityCount = { ERROR: 0, WARNING: 0, INFO: 0, UNKNOWN: 0 };
  for (const f of findings) {
    const s = classifySeverity((f.extra?.severity || f.severity || '') as string);
    counts[s] += 1;
  }
  return counts;
};

export const runStaticAnalysis = async (
  targetPath: string,
  rulesPath?: string,
  outputMode: string = 'report'
): Promise<void> => {
  const resolvedPath = path.resolve(targetPath || process.cwd());
  const isDirectory = fs.existsSync(resolvedPath) && fs.lstatSync(resolvedPath).isDirectory();
  const scanRoot = isDirectory ? resolvedPath : path.dirname(resolvedPath);

  console.log(`\n🔍 Starting Static Analysis with Opengrep on: ${resolvedPath}\n`);

  const startedAt = Date.now();
  let scanResult: Awaited<ReturnType<typeof runOpengrepScan>>;
  try {
    scanResult = await runOpengrepScan(resolvedPath, rulesPath);
  } catch (error) {
    console.error('❌ Opengrep scan failed:', error instanceof Error ? error.message : String(error));
    console.log('\n💡 Tip: Install opengrep with: curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash');
    console.log('   Or point OPENGREP_BIN=/path/to/opengrep (or SEMGREP_BIN=...) at an existing binary.');
    return;
  }
  const durationMs = Date.now() - startedAt;

  const findings = scanResult.results || [];
  const errors = scanResult.errors || [];
  const stats = scanResult.stats || { scannedFiles: 0, totalRules: 0 };

  console.log(`📊 Scan complete: ${findings.length} finding(s), ${errors.length} error(s), scanned ${stats.scannedFiles} file(s) with ${stats.totalRules} rule(s). (${(durationMs / 1000).toFixed(2)}s)`);

  const reportSections: string[] = ['# Static Analysis Report\n'];
  reportSections.push(`*Scan Date: ${new Date().toISOString().split('T')[0]}*`);
  reportSections.push(`*Target: ${resolvedPath}*`);
  if (rulesPath) reportSections.push(`*Rules: ${rulesPath}*\n`);
  else reportSections.push('*Rules: built-in Orchestra defaults*\n');

  reportSections.push('## Scan Summary\n');
  reportSections.push('| Metric | Value |');
  reportSections.push('|--------|-------|');
  reportSections.push(`| Files Scanned | ${stats.scannedFiles} |`);
  reportSections.push(`| Rules Applied | ${stats.totalRules} |`);
  reportSections.push(`| Total Findings | ${findings.length} |`);

  const severityCounts = countSeverities(findings);
  reportSections.push(`| 🔴 ERROR | ${severityCounts.ERROR} |`);
  reportSections.push(`| 🟠 WARNING | ${severityCounts.WARNING} |`);
  reportSections.push(`| 🟡 INFO | ${severityCounts.INFO} |`);
  reportSections.push(`| ⚪ UNKNOWN | ${severityCounts.UNKNOWN} |\n`);

  if (findings.length > 0) {
    reportSections.push(buildMarkdownReport(findings, scanRoot));
  } else {
    reportSections.push('## Findings\n');
    reportSections.push('✅ No static analysis issues detected.\n');
  }

  if (errors.length > 0) {
    reportSections.push('## Scan Errors\n');
    for (const err of errors) {
      const t = err.type || 'Error';
      const lvl = err.level || 'unknown';
      const msg = err.message || err.short_msg || err.long_msg || JSON.stringify(err);
      reportSections.push(`- **${t}** (${lvl}): ${msg}`);
    }
    reportSections.push('');
  }

  const finalReport = reportSections.join('\n');
  const hasIssues = findings.length > 0 || errors.length > 0;

  const orchestraDir = path.join(scanRoot, '.orchestra');
  try {
    if (!fs.existsSync(orchestraDir)) fs.mkdirSync(orchestraDir, { recursive: true });
    const bySeverity: Record<string, number> = { ERROR: severityCounts.ERROR, WARNING: severityCounts.WARNING, INFO: severityCounts.INFO, UNKNOWN: severityCounts.UNKNOWN };
    const artifact: any = {
      generatedAt: new Date().toISOString(),
      results: findings,
      paths: { scanned: scanResult.paths || [scanRoot] },
      errors: errors,
      bySeverity,
      scanDurationMs: durationMs,
      scanStats: stats
    };
    fs.writeFileSync(path.join(orchestraDir, 'opengrep-findings.json'), JSON.stringify(artifact, null, 2));
  } catch {}

  await handleReportOutput({
    dirPath: scanRoot,
    mode: (outputMode || 'report').toLowerCase(),
    report: finalReport,
    hasIssues,
    reportFileName: 'STATIC_ANALYSIS_REPORT.md',
    issueTitle: 'Static Analysis Findings',
    issueLabels: ['static-analysis', 'opengrep', 'orchestra', 'auto-scan'],
    prCommentHeader: '### 🔍 Orchestra Static Analysis\n',
    successMessage: 'Static analysis complete!',
    findings,
    scanRoot,
    scanStats: {
      scannedFiles: stats.scannedFiles,
      totalRules: stats.totalRules,
      durationMs,
    },
    rulesPath,
    targetPath: resolvedPath,
  });
};

const plugin: OrchestraPlugin = {
  name: 'Static Analysis',
  description: 'Run static code analysis using Opengrep (Semgrep-compatible), open per-finding VCS issues, auto-close resolved findings, and keep scan usage history.',
  command: 'static-analysis',
  args: [
    { name: 'path', description: 'Path to the code file or directory (defaults to current directory)', required: false },
    { name: 'rules', description: 'Path to opengrep rules file or directory (optional; uses built-in rules if omitted)', required: false },
    { name: 'mode', description: 'Output mode: report | issue | issues-per-finding | comment (default: report). issue opens a summary issue + per-finding issues; issues-per-finding only opens/closes per-finding issues.', required: false },
  ],
  action: async (targetPath?: string, rulesPath?: string, targetMode?: string) => {
    const p = targetPath && typeof targetPath === 'string' ? targetPath : process.cwd();
    const rules = rulesPath && typeof rulesPath === 'string' && rulesPath.length > 0 ? rulesPath : undefined;
    let mode = targetMode && typeof targetMode === 'string' ? targetMode.toLowerCase() : 'report';
    if (!['report', 'issue', 'issues-per-finding', 'comment'].includes(mode)) mode = 'report';
    await runStaticAnalysis(p, rules, mode);
  },
};

export default plugin;
