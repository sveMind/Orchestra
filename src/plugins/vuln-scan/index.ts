import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { extractCodeBlock } from '../../utils/codeExtractor';
import { createBranch, commitChanges, pushChanges, buildBranchName } from '../../services/gitService';
import { runMergeCandidates } from '../../services/agentOrchestrator';
import { inferLanguageFromExtension } from '../../services/languageUtils';

import { readCiPrContext } from '../../services/ciContext';

const walkDir = (dir: string, ignored: Set<string>, exts: Set<string>, filesList: string[] = []) => {
  if (filesList.length > 50) return filesList; // hard limit to avoid token explosion
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return filesList;
  }

  for (const entry of entries) {
    if (filesList.length > 50) break;
    if (entry.name.startsWith('.')) continue;
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, ignored, exts, filesList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.has(ext)) {
        filesList.push(fullPath);
      }
    }
  }
  return filesList;
};

export const scanDirectoryForVulnerabilities = async (dirPath: string, mode: string = 'report'): Promise<void> => {
  console.log(`\n🕵️‍♂️ Starting comprehensive security scan on repository: ${dirPath}\n`);

  let reportSections: string[] = ['# Security & Vulnerability Report\n'];
  reportSections.push(`*Scan Date: ${new Date().toISOString().split('T')[0]}*\n`);

  let hasIssues = false;
  let summary = '';

  // 1. Dependency Check (npm audit for lock files)
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    console.log('📦 Scanning package dependencies (npm audit)...');
    let auditOutput = '';
    try {
      auditOutput = execSync('npm audit --json', { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : '';
    }

    if (auditOutput) {
      console.log('🤖 Analyzing dependency vulnerabilities...');
      const depAnalysis = await consultAgentRouted(
        AgentRole.SECURITY_ENGINEER,
        'You are analyzing the output of `npm audit --json`. Summarize the key vulnerabilities, the affected packages, and provide concrete steps to fix them (e.g. commands to run). If there are no vulnerabilities or the JSON is empty/invalid, state "No dependency vulnerabilities found." Format your response cleanly in Markdown.',
        auditOutput.substring(0, 20000)
      );
      reportSections.push('## Dependency Vulnerabilities\n');
      reportSections.push(depAnalysis + '\n');
      if (!depAnalysis.toLowerCase().includes('no dependency vulnerabilities found')) {
        hasIssues = true;
        summary += 'Dependency vulnerabilities detected.\n';
      }
    } else {
      reportSections.push('## Dependency Vulnerabilities\n\nNo `npm audit` output available or no vulnerabilities found.\n');
    }
  } else {
    reportSections.push('## Dependency Vulnerabilities\n\nNo `package.json` found. Dependency scanning skipped.\n');
  }

  // 2. Codebase Scan for Bad Practices
  console.log('🔎 Scanning codebase for bad practices and security flaws...');
  const ignored = new Set(['node_modules', 'dist', 'build', 'coverage', 'out', 'public']);
  const exts = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.cs']);
  const sourceFiles = walkDir(dirPath, ignored, exts);

  if (sourceFiles.length === 0) {
    reportSections.push('## Codebase Security Analysis\n\nNo source files found to scan.\n');
  } else {
    console.log(`Found ${sourceFiles.length} source files to sample.`);
    
    let combinedContent = '';
    let charsUsed = 0;
    const MAX_CHARS = 40000;

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (charsUsed + content.length > MAX_CHARS) {
          combinedContent += `\n\n--- ${path.relative(dirPath, file)} ---\n[Truncated due to size limits]`;
          break;
        }
        combinedContent += `\n\n--- ${path.relative(dirPath, file)} ---\n${content}`;
        charsUsed += content.length;
      } catch {
        continue;
      }
    }

    console.log('🤖 Analyzing source code...');
    const codeAnalysis = await consultAgentRouted(
      AgentRole.SECURITY_ENGINEER,
      'You are a Senior Security Engineer. Review the following codebase sample for security vulnerabilities (e.g. SQL Injection, XSS, hardcoded secrets, unsafe evals) and bad coding practices. Provide a structured markdown report identifying the file, the issue, the severity, and a recommendation on how to fix it. If no issues are found, explicitly state "No significant security issues found in the scanned files."',
      combinedContent
    );

    reportSections.push('## Codebase Security Analysis\n');
    reportSections.push(codeAnalysis + '\n');
    if (!codeAnalysis.toLowerCase().includes('no significant security issues found')) {
      hasIssues = true;
      summary += 'Codebase vulnerabilities detected.\n';
    }
  }

  // 3. Output Handling based on mode
  const finalReport = reportSections.join('\n');
  
  if (mode === 'report' || !hasIssues) {
    const reportPath = path.join(dirPath, 'SECURITY_REPORT.md');
    fs.writeFileSync(reportPath, finalReport);
    console.log(`\n✅ Security scan complete! Report generated at: ${reportPath}`);
    if (!hasIssues) console.log('No significant issues found. Modes issue/pr/comment skipped.');
    return;
  }

  const vcs = VcsFactory.getProvider();
  
  if (mode === 'issue') {
    const title = 'Security Vulnerability Scan Results';
    const existingIssue = await vcs.findIssueByTitle(title);
    
    if (existingIssue) {
      console.log(`ℹ️ An open issue already exists for security scans (#${existingIssue}). Adding report as a comment instead.`);
      await vcs.addComment(existingIssue, `### 🕵️‍♂️ Orchestra Security Scan Update\n\n${finalReport}`);
      console.log('✅ Comment added to existing issue.');
    } else {
      console.log('Creating security issue...');
      const issueUrl = await vcs.createIssue(title, finalReport, ['security', 'orchestra', 'auto-scan']);
      if (issueUrl) console.log(`✅ Issue created successfully: ${issueUrl}`);
      else console.log('❌ Failed to create issue.');
    }
  } 
  else if (mode === 'comment') {
    const prContext = readCiPrContext();
    if (prContext) {
      console.log(`Commenting on PR #${prContext.prNumber}...`);
      await vcs.addComment(prContext.prNumber, `### 🕵️‍♂️ Orchestra Security Scan\n\n${finalReport}`);
      console.log('✅ Comment posted to PR.');
    } else {
      console.log('❌ Mode is "comment" but no CI PR context found. Writing to local report instead.');
      const reportPath = path.join(dirPath, 'SECURITY_REPORT.md');
      fs.writeFileSync(reportPath, finalReport);
    }
  }
  else if (mode === 'pr') {
    const title = 'Security Vulnerability Scan Results';
    console.log('Mode "pr" selected for full repo scan. This mode is better suited for single-file scans. Attempting to report issue...');
    const existingIssue = await vcs.findIssueByTitle(title);
    
    if (existingIssue) {
      console.log(`ℹ️ An open issue already exists for security scans (#${existingIssue}). Adding report as a comment instead.`);
      await vcs.addComment(existingIssue, `### 🕵️‍♂️ Orchestra Security Scan Update\n\n${finalReport}`);
    } else {
      const issueUrl = await vcs.createIssue(title, finalReport, ['security', 'orchestra', 'auto-scan']);
      if (issueUrl) console.log(`✅ Issue created successfully: ${issueUrl}`);
    }
  }
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

    const analysis = await consultAgentRouted(
        AgentRole.SECURITY_ENGINEER, 
        'Analyze the provided code for security vulnerabilities. If issues found, list them clearly. If none, strictly say "NO_ISSUES".', 
        contentToScan
    );

    if (analysis.includes('NO_ISSUES')) {
        console.log('No significant vulnerabilities found.');
        return;
    }

    console.log('\n--- Vulnerability Analysis ---\n');
    console.log(analysis);

    console.log('\nGenerating fix suggestion from multiple developers...');
    const baseFixTask = `Based on the security analysis, provide ONLY the FULL refactored file content that fixes the vulnerabilities.
Do not include explanations or markdown formatting.`;

    const devPromises: Promise<string>[] = [];
    const devAgentsCount = 2;
    for (let i = 0; i < devAgentsCount; i++) {
        const devTask = `${baseFixTask}\n\nYou are Developer ${i + 1}.`;
        devPromises.push(
            consultAgentRouted(
                AgentRole.SOFTWARE_ENGINEER,
                devTask,
                `Original Code:\n${contentToScan}\n\nAnalysis:\n${analysis}`
            )
        );
    }

    const devFixes = await Promise.all(devPromises);
    const candidateFixes = devFixes
        .map(f => extractCodeBlock(f) || f)
        .filter(f => !!f) as string[];

    let fixSuggestion = '';

    if (candidateFixes.length === 0) {
        console.warn('No valid fix candidates extracted from developer agents. Falling back to single-agent fix.');
        const singleFix = await consultAgentRouted(
            AgentRole.SOFTWARE_ENGINEER,
            baseFixTask,
            `Original Code:\n${contentToScan}\n\nAnalysis:\n${analysis}`
        );
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
       // Simulated issue URL for the log
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
    { name: 'mode', description: 'Output mode: report | issue | comment | pr (default: report)', required: false }
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
