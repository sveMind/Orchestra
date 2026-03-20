import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import path from 'path';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { extractCodeBlock } from '../../utils/codeExtractor';
import { createBranch, commitChanges, pushChanges, checkoutBranch, buildBranchName } from '../../services/gitService';
import { runMergeCandidates } from '../../services/agentOrchestrator';
import { inferLanguageFromExtension } from '../../services/languageUtils';

export const scanForVulnerabilities = async (filePath: string, applyFix: boolean = false): Promise<void> => {
  console.log(`Scanning for vulnerabilities in: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File or directory not found: ${filePath}`);
      return;
    }

    let contentToScan = '';
    const codeLanguage = inferLanguageFromExtension(filePath);
    if (fs.lstatSync(filePath).isDirectory()) {
       console.warn('Directory scanning is experimental. Please point to a specific file.');
       return;
    } else {
       contentToScan = fs.readFileSync(filePath, 'utf-8');
    }

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

    // Step 3: Apply Fix (if requested or default behavior)
    // For now, we'll check if the user passed a flag or if we just want to do it safely.
    // The user asked "write a fix", so let's do it with a backup.
    
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

    // Step 4: Create Issue
    const issueTitle = `Security Vulnerability Detected in ${filePath.split('/').pop()}`;
    const issueBody = `
## Vulnerability Report
${analysis}

## Applied Fix
The following changes were applied automatically by Orchestra:


${fixedCode || fixSuggestion}


*Reported by Orchestra Security Agent*
    `;

    console.log('\nCreating Issue...');
    const vcs = VcsFactory.getProvider();
    const issueUrl = await vcs.createIssue(issueTitle, issueBody, ['security', 'orchestra', 'auto-fixed']);
    
    if (issueUrl) {
        console.log(`Issue created successfully: ${issueUrl}`);
        
        // Step 5: Create Branch and PR
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
                    'main', // Assuming main is the base branch
                    `Fixes ${issueUrl}\n\nAutomated security fix applied by Orchestra.`
                );
                
                if (prUrl) {
                    console.log(`Pull Request created successfully: ${prUrl}`);
                }
                
                // Switch back to main? Or stay? In CI it doesn't matter much.
                // await checkoutBranch('main'); 
            } catch (gitError) {
                console.error('Git workflow failed (might be running locally without upstream):', gitError);
            }
        }
    } else {
        console.log('Failed to create issue (check API configuration).');
    }

  } catch (error) {
    console.error('Error scanning for vulnerabilities:', error);
  }
};

const plugin: OrchestraPlugin = {
  name: 'Vulnerability Scanner',
  description: 'Scan for vulnerabilities using AI and apply fixes',
  command: 'vuln-scan',
  args: [
    { name: 'path', description: 'Path to the code file or directory', required: true }
  ],
  action: async (path: string) => {
    await scanForVulnerabilities(path, true);
  }
};

export default plugin;
