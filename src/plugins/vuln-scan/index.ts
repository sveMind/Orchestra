import { AutoBotPlugin } from '../../types';
import fs from 'fs';
import { consultAgent, AgentRole } from '../../services/agentService';
import { createIssue } from '../../services/githubService';
import { extractCodeBlock } from '../../utils/codeExtractor';

export const scanForVulnerabilities = async (filePath: string, applyFix: boolean = false): Promise<void> => {
  console.log(`Scanning for vulnerabilities in: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File or directory not found: ${filePath}`);
      return;
    }

    let contentToScan = '';
    if (fs.lstatSync(filePath).isDirectory()) {
       console.warn('Directory scanning is experimental. Please point to a specific file.');
       return;
    } else {
       contentToScan = fs.readFileSync(filePath, 'utf-8');
    }

    // Step 1: Security Engineer analyzes
    const analysis = await consultAgent(
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

    // Step 2: Software Engineer generates fix
    console.log('\nGenerating fix suggestion...');
    const fixSuggestion = await consultAgent(
        AgentRole.SOFTWARE_ENGINEER,
        'Based on the security analysis, provide the FULL refactored file content that fixes the vulnerabilities. Wrap the code in a markdown code block (```).',
        `Original Code:\n${contentToScan}\n\nAnalysis:\n${analysis}`
    );

    console.log('\n--- Suggested Fix ---\n');
    console.log(fixSuggestion);

    // Step 3: Apply Fix (if requested or default behavior)
    // For now, we'll check if the user passed a flag or if we just want to do it safely.
    // The user asked "write a fix", so let's do it with a backup.
    
    const fixedCode = extractCodeBlock(fixSuggestion);
    if (fixedCode) {
        const backupPath = `${filePath}.bak`;
        fs.writeFileSync(backupPath, contentToScan);
        console.log(`\nOriginal file backed up to: ${backupPath}`);
        
        fs.writeFileSync(filePath, fixedCode);
        console.log(`✅ Fix applied to: ${filePath}`);
    } else {
        console.warn('Could not extract code from AI response. Fix not applied automatically.');
    }

    // Step 4: Create GitHub Issue
    const issueTitle = `Security Vulnerability Detected in ${filePath.split('/').pop()}`;
    const issueBody = `
## Vulnerability Report
${analysis}

## Applied Fix
The following changes were applied automatically by AutoBot:

\`\`\`typescript
${fixedCode || fixSuggestion}
\`\`\`

*Reported by AutoBot Security Agent*
    `;

    console.log('\nCreating GitHub Issue...');
    const issueUrl = await createIssue(issueTitle, issueBody, ['security', 'autobot', 'auto-fixed']);
    
    if (issueUrl) {
        console.log(`Issue created successfully: ${issueUrl}`);
    } else {
        console.log('Failed to create GitHub issue (check API configuration).');
    }

  } catch (error) {
    console.error('Error scanning for vulnerabilities:', error);
  }
};

const plugin: AutoBotPlugin = {
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
