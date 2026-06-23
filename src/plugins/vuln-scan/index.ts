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

export const scanDirectoryForVulnerabilities = async (dirPath: string, mode: string = 'report'): Promise<void> => {
  console.log(`\n🕵️‍♂️ Starting comprehensive security scan on repository: ${dirPath}\n`);

  let reportSections: string[] = ['# Security & Vulnerability Report\n'];
  reportSections.push(`*Scan Date: ${new Date().toISOString().split('T')[0]}*\n`);

  let hasIssues = false;

  const depResults = await scanDependencies(dirPath);
  reportSections.push(depResults.text);
  if (depResults.hasIssues) {
    hasIssues = true;
    if (mode === 'pr' || mode === 'autofix') {
      await fixDependenciesAndCreatePR(dirPath, depResults.text);
    }
  }

  const codeResults = await scanCodebase(dirPath);
  reportSections.push(codeResults.text);
  if (codeResults.hasIssues) hasIssues = true;

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
