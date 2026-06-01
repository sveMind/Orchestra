import fs from 'fs';
import path from 'path';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { readCiPrContext } from '../../services/ciContext';

export const handleScanOutput = async (dirPath: string, mode: string, finalReport: string, hasIssues: boolean): Promise<void> => {
  if (mode === 'report' || !hasIssues) {
    const reportPath = path.join(dirPath, 'SECURITY_REPORT.md');
    fs.writeFileSync(reportPath, finalReport);
    console.log(`\n✅ Security scan complete! Report generated at: ${reportPath}`);
    if (!hasIssues) console.log('No significant issues found. Modes issue/pr/comment skipped.');
    return;
  }

  const vcs = VcsFactory.getProvider();
  
  if (mode === 'issue' || mode === 'pr') {
    const title = 'Security Vulnerability Scan Results';
    if (mode === 'pr') {
        console.log('Mode "pr" selected for full repo scan. Attempting to report issue...');
    }
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
};