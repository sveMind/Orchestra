import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { extractCodeBlock } from '../../utils/codeExtractor';
import { createBranch, commitChanges, pushChanges, buildBranchName } from '../../services/gitService';
import { runMergeCandidates } from '../../services/agentOrchestrator';
import { inferLanguageFromExtension } from '../../services/languageUtils';
import { scanDependencies, fixDependenciesAndCreatePR } from './dependencyScan';
import { scanCodebase } from './codebaseScan';
import { handleScanOutput } from './reportUtils';
import { buildSingleFileAnalysisTask, buildFixTask } from './prompts';
import { readOpengrepArtifact, findingsGroupedByModule, severityScore } from '../../utils/pluginArtifacts';

const renderSastSection = (dirPath: string): { text: string; hasIssues: boolean } => {
  const artifact = readOpengrepArtifact(dirPath);
  if (!artifact || !Array.isArray(artifact.results) || artifact.results.length === 0) {
    return {
      text: '## 🔍 Static Analysis (Opengrep)\n\nNo opengrep SAST findings were found in `.orchestra/opengrep-findings.json`. If you have not yet run `orchestra static-analysis <repo>` against this repository, consider running it first to populate this section with code-level SAST issues.\n\n',
      hasIssues: false
    };
  }
  const findings = artifact.results;
  const sev: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    const sc = severityScore(f);
    const k = sc === 3 ? 'HIGH' : sc === 2 ? 'MEDIUM' : sc === 1 ? 'LOW' : 'INFO';
    sev[k] += 1;
  }
  const lines: string[] = [];
  lines.push('## 🔍 Static Analysis (Opengrep)');
  lines.push('');
  lines.push(`SAST findings produced by \`orchestra static-analysis\` on \`${artifact.generatedAt || new Date().toISOString()}\`.`);
  lines.push(`  - **Total findings:** ${findings.length}`);
  lines.push(`  - 🔴 **HIGH / ERROR:** ${sev.HIGH}`);
  lines.push(`  - 🟠 **MEDIUM / WARNING:** ${sev.MEDIUM}`);
  lines.push(`  - 🟡 **LOW / INFO:** ${sev.LOW}`);
  lines.push(`  - ⚪ **Other:** ${sev.INFO}`);
  if (artifact.errors && artifact.errors.length) lines.push(`  - ⚠️  Parse/scan errors during sast scan: ${artifact.errors.length}`);
  lines.push('');
  lines.push('### Findings by module (top 30)');
  lines.push('');
  lines.push('| Module | Findings | 🔴 HIGH | 🟠 MEDIUM | 🟡 LOW | ⚪ Other |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  const groups = findingsGroupedByModule(findings, { moduleDepth: 3 });
  for (const g of groups.slice(0, 30)) {
    lines.push(`| \`${g.module.replace(/\|/g, '\\|')}\` | ${g.findings.length} | ${g.bySeverity['HIGH'] || g.bySeverity['ERROR'] || 0} | ${g.bySeverity['MEDIUM'] || g.bySeverity['WARNING'] || 0} | ${g.bySeverity['LOW'] || g.bySeverity['INFO'] || 0} | ${g.bySeverity['UNKNOWN'] || g.bySeverity['OTHER'] || 0} |`);
  }
  if (groups.length > 30) lines.push(`\n_Showing 30 of ${groups.length} modules — see STATIC_ANALYSIS_REPORT.md for full detail._`);
  lines.push('');
  lines.push('### Individual findings (first 30, truncated for PR comment size)');
  lines.push('');
  lines.push('| # | Severity | Rule | File:Line | Message |');
  lines.push('|---:|---|---|---|---|');
  for (let i = 0; i < Math.min(30, findings.length); i++) {
    const f = findings[i];
    const sc = severityScore(f);
    const sevEmoji = sc === 3 ? '🔴' : sc === 2 ? '🟠' : sc === 1 ? '🟡' : '⚪';
    const rule = (f as any).check_id || (f.extra && (f.extra as any).metadata && (f.extra.metadata as any).id) || '-';
    const loc = `${f.path}:${f.start?.line ?? 0}`;
    const msg = (f.extra && (f.extra.message || f.extra.lines)) || '-';
    const safeMsg = String(msg).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 220);
    lines.push(`| ${i + 1} | ${sevEmoji} | \`${String(rule).replace(/\|/g, '\\|')}\` | \`${loc}\` | ${safeMsg} |`);
  }
  lines.push('');
  lines.push(`> 📘 Tip: Run \`orchestra static-analysis ${dirPath} issues-per-finding\` to create per-finding VCS issues with auto-close when they are resolved, or \`orchestra static-analysis ${dirPath} comment\` to append to this PR comment with linkable finding IDs.`);
  lines.push('');
  return { text: lines.join('\n'), hasIssues: findings.length > 0 };
};

export const scanDirectoryForVulnerabilities = async (dirPath: string, mode: string = 'report'): Promise<void> => {
  console.log(`\n🕵️‍♂️ Starting comprehensive security scan on repository: ${dirPath}\n`);

  let reportSections: string[] = ['# Security & Vulnerability Report\n'];
  reportSections.push(`*Scan Date: ${new Date().toISOString().split('T')[0]}*\n`);

  let hasIssues = false;

  const depResults = await scanDependencies(dirPath);
  reportSections.push(depResults.text);
  if (mode === 'pr' || mode === 'autofix') {
    await fixDependenciesAndCreatePR(dirPath, depResults.text);
  }
  if (depResults.hasIssues) hasIssues = true;

  const codeResults = await scanCodebase(dirPath);
  reportSections.push(codeResults.text);
  if (codeResults.hasIssues) hasIssues = true;

  const sastSection = renderSastSection(dirPath);
  reportSections.push(sastSection.text);
  if (sastSection.hasIssues) hasIssues = true;

  const finalReport = reportSections.join('\n');
  await handleScanOutput(dirPath, mode, finalReport, hasIssues);
};

export const scanForVulnerabilities = async (filePath: string, applyFix: boolean = false): Promise<void> => {
  console.log(`Scanning for vulnerabilities in: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File or directory not found: ${filePath}`);
      return;
    }

    if (fs.lstatSync(filePath).isDirectory()) {
       await scanDirectoryForVulnerabilities(filePath);
       return;
    }

    let contentToScan = fs.readFileSync(filePath, 'utf-8');
    const codeLanguage = inferLanguageFromExtension(filePath);

    const task = buildSingleFileAnalysisTask(contentToScan);
    const analysis = await consultAgentRouted(AgentRole.SECURITY_ENGINEER, task, '');

    if (analysis.includes('NO_ISSUES')) {
        console.log('No significant vulnerabilities found.');
        return;
    }

    console.log('\n--- Vulnerability Analysis ---\n');
    console.log(analysis);

    console.log('\nGenerating fix suggestion from multiple developers...');
    const baseFixTask = buildFixTask(contentToScan, analysis);

    const devPromises: Promise<string>[] = [];
    const devAgentsCount = 2;
    for (let i = 0; i < devAgentsCount; i++) {
        const devTask = `${baseFixTask}\n\nYou are Developer ${i + 1}.`;
        devPromises.push(
            consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, devTask, '')
        );
    }

    const devFixes = await Promise.all(devPromises);
    const candidateFixes = devFixes
        .map(f => extractCodeBlock(f) || f)
        .filter(f => !!f) as string[];

    let fixSuggestion = '';

    if (candidateFixes.length === 0) {
        console.warn('No valid fix candidates extracted from developer agents. Falling back to single-agent fix.');
        const singleFix = await consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, baseFixTask, '');
        fixSuggestion = singleFix;
    } else if (candidateFixes.length === 1) {
        fixSuggestion = candidateFixes[0];
    } else {
        const mergedFix = await runMergeCandidates(
            AgentRole.SOFTWARE_ENGINEER,
            'Multiple developers have proposed fixes for the security vulnerabilities. Combine the best aspects into a single, secure refactored file. Return only the final full file content.',
            candidateFixes,
            codeLanguage
        );
        fixSuggestion = mergedFix;
    }

    console.log('\n--- Suggested Fix ---\n');
    console.log(fixSuggestion);

    const fixedCode = extractCodeBlock(fixSuggestion) || fixSuggestion;
    if (fixedCode) {
        const backupPath = `${filePath}.bak`;
        fs.writeFileSync(backupPath, contentToScan);
        console.log(`\nOriginal file backed up to: ${backupPath}`);
        
        fs.writeFileSync(filePath, fixedCode);
        console.log(`✅ Fix applied to: ${filePath}`);
    } else {
        console.warn('Could not extract code from AI response. Fix not applied automatically.');
    }

    const issueTitle = `Security Vulnerability Detected in ${filePath.split('/').pop()}`;
    const issueBody = `
## Vulnerability Report
${analysis}

## Applied Fix
The following changes were applied automatically by Orchestra:

\`\`\`${codeLanguage}
${fixedCode || fixSuggestion}
\`\`\`

*Reported by Orchestra Security Agent*
    `;

    console.log('\nCreating Issue...');
    const vcs = VcsFactory.getProvider();
    
    let issueUrl: string | null = null;
    const existingIssueId = await vcs.findIssueByTitle(issueTitle);
    
    if (existingIssueId) {
       console.log(`ℹ️ Issue already exists (#${existingIssueId}). Adding report as comment.`);
       await vcs.addComment(existingIssueId, `### Security Fix Applied\n\n${issueBody}`);
       issueUrl = `Issue #${existingIssueId}`;
    } else {
       issueUrl = await vcs.createIssue(issueTitle, issueBody, ['security', 'orchestra', 'auto-fixed']);
       if (issueUrl) console.log(`Issue created successfully: ${issueUrl}`);
    }
        
    if (fixedCode) {
        const fileName = filePath.split('/').pop();
        const branchName = buildBranchName('fix-security', fileName || '');
        
        try {
            console.log(`\nInitiating Git workflow for fix...`);
            await createBranch(branchName);
            await commitChanges(`fix(security): resolve vulnerabilities in ${fileName}`, [filePath]);
            await pushChanges(branchName);
            
            const prUrl = await vcs.createPullRequest(
                `Security Fix: ${fileName}`,
                branchName,
                'main',
                `Fixes ${issueUrl}\n\nAutomated security fix applied by Orchestra.`
            );
            
            if (prUrl) {
                console.log(`Pull Request created successfully: ${prUrl}`);
            }
        } catch (gitError) {
            console.error('Git workflow failed (might be running locally without upstream):', gitError);
        }
    }

  } catch (error) {
    console.error('Error scanning for vulnerabilities:', error);
  }
};

const plugin: OrchestraPlugin = {
  name: 'Vulnerability Scanner',
  description: 'Scan codebase and lock files for vulnerabilities and bad practices.',
  command: 'vuln-scan',
  args: [
    { name: 'path', description: 'Path to the code file or directory (defaults to current directory)', required: false },
    { name: 'mode', description: 'Output mode: report | issue | comment | pr | autofix (default: report)', required: false }
  ],
  action: async (targetPath?: string, targetMode?: string) => {
    const p = targetPath && typeof targetPath === 'string' ? targetPath : process.cwd();
    const mode = targetMode && typeof targetMode === 'string' ? targetMode.toLowerCase() : 'report';
    
    if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
      await scanDirectoryForVulnerabilities(p, mode);
    } else {
      await scanForVulnerabilities(p, true);
    }
  }
};

export default plugin;
