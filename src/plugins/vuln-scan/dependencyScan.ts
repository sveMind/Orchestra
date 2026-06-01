import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { buildDependencyAnalysisTask } from './prompts';

export const scanDependencies = async (dirPath: string): Promise<{ text: string, hasIssues: boolean }> => {
  let reportText = '';
  let hasIssues = false;

  const packageJsonPath = path.join(dirPath, 'package.json');
  const requirementsTxtPath = path.join(dirPath, 'requirements.txt');
  const goModPath = path.join(dirPath, 'go.mod');

  if (fs.existsSync(packageJsonPath)) {
    console.log('📦 Scanning Node.js package dependencies (npm audit)...');
    let auditOutput = '';
    try {
      auditOutput = execSync('npm audit --json', { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : '';
    }
    
    const { text, issues } = await analyzeDepOutput(auditOutput);
    reportText += `## Node.js Dependencies\n\n${text}\n\n`;
    if (issues) hasIssues = true;
  }

  if (fs.existsSync(requirementsTxtPath)) {
    console.log('📦 Scanning Python dependencies (safety)...');
    let auditOutput = '';
    try {
      // Best effort pip safety check if installed, otherwise skip
      auditOutput = execSync('safety check -r requirements.txt --full-report', { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : 'Safety tool not installed or failed.';
    }
    
    if (auditOutput && !auditOutput.includes('not installed')) {
        const { text, issues } = await analyzeDepOutput(auditOutput);
        reportText += `## Python Dependencies\n\n${text}\n\n`;
        if (issues) hasIssues = true;
    }
  }

  if (fs.existsSync(goModPath)) {
    console.log('📦 Scanning Go dependencies (govulncheck)...');
    let auditOutput = '';
    try {
      auditOutput = execSync('govulncheck ./...', { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : 'govulncheck not installed or failed.';
    }
    
    if (auditOutput && !auditOutput.includes('not installed')) {
        const { text, issues } = await analyzeDepOutput(auditOutput);
        reportText += `## Go Dependencies\n\n${text}\n\n`;
        if (issues) hasIssues = true;
    }
  }

  if (!reportText) {
    reportText = '## Dependency Vulnerabilities\n\nNo supported dependency files (package.json, requirements.txt, go.mod) found. Dependency scanning skipped.\n';
  }

  return { text: reportText, hasIssues };
};

const analyzeDepOutput = async (auditOutput: string): Promise<{ text: string, issues: boolean }> => {
  if (!auditOutput) return { text: 'No output available or no vulnerabilities found.', issues: false };
  
  console.log('🤖 Analyzing dependency vulnerabilities...');
  const task = buildDependencyAnalysisTask(auditOutput.substring(0, 20000));
  const depAnalysis = await consultAgentRouted(AgentRole.SECURITY_ENGINEER, task, '');
  
  const issues = !depAnalysis.toLowerCase().includes('no dependency vulnerabilities found');
  return { text: depAnalysis, issues };
};