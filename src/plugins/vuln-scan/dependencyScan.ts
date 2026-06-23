import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { buildDependencyAnalysisTask } from './prompts';
import { createBranch, commitChanges, pushChanges, buildBranchName, getChangedFiles, setWorkingDirectory } from '../../services/gitService';
import { VcsFactory } from '../../services/vcs/VcsFactory';

const findDotnetTargets = (dirPath: string): string[] => {
  const targets: string[] = [];
  const stack = [dirPath];
  let visitedDirs = 0;
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visitedDirs++;
    if (visitedDirs > 1000) break;

    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj') continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.sln') || entry.name.endsWith('.csproj')) {
          targets.push(fullPath);
        }
      }
    }
  }
  // Prioritize sln files
  const sln = targets.filter(t => t.endsWith('.sln'));
  return sln.length > 0 ? sln : targets;
};

export const scanDependencies = async (dirPath: string): Promise<{ text: string, hasIssues: boolean }> => {
  let reportText = '';
  let hasIssues = false;

  const packageJsonPath = path.join(dirPath, 'package.json');
  let auditOutputCombined = '';

  if (fs.existsSync(packageJsonPath)) {
    console.log('📦 Scanning Node.js package dependencies in root (npm audit)...');
    try {
      auditOutputCombined += execSync('npm audit --json', { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutputCombined += err.stdout ? err.stdout.toString() : '';
    }
  } else {
    const stack = [dirPath];
    let visitedDirs = 0;
    while (stack.length) {
      const dir = stack.pop();
      if (!dir) continue;
      visitedDirs++;
      if (visitedDirs > 1000) break;

      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj') continue;
          stack.push(fullPath);
        } else if (entry.isFile() && entry.name === 'package.json') {
          console.log(`📦 Scanning Node.js package dependencies in ${dir} (npm audit)...`);
          try {
            auditOutputCombined += execSync('npm audit --json', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString() + '\n\n';
          } catch (err: any) {
            auditOutputCombined += err.stdout ? err.stdout.toString() + '\n\n' : '';
          }
        }
      }
    }
  }

  if (auditOutputCombined.trim()) {
    const { text, issues } = await analyzeDepOutput(auditOutputCombined);
    reportText += `## Node.js Dependencies\n\n${text}\n\n`;
    if (issues) hasIssues = true;
  }

  const requirementsTxtPath = path.join(dirPath, 'requirements.txt');
  if (fs.existsSync(requirementsTxtPath)) {
    console.log('📦 Scanning Python dependencies (safety)...');
    let auditOutput = '';
    try {
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

  const goModPath = path.join(dirPath, 'go.mod');
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

  const dotnetTargets = findDotnetTargets(dirPath);
  if (dotnetTargets.length > 0) {
    console.log('📦 Scanning .NET dependencies (dotnet list package --vulnerable)...');
    for (const target of dotnetTargets) {
      let auditOutput = '';
      try {
        auditOutput = execSync(`dotnet list "${target}" package --vulnerable`, { cwd: dirPath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      } catch (err: any) {
        auditOutput = err.stdout ? err.stdout.toString() : '';
      }
      if (auditOutput && auditOutput.includes('has the following vulnerable packages')) {
        const { text, issues } = await analyzeDepOutput(auditOutput);
        reportText += `## .NET Dependencies (${path.basename(target)})\n\n${text}\n\n`;
        if (issues) hasIssues = true;
      }
    }
  }

  if (!reportText) {
    reportText = '## Dependency Vulnerabilities\n\nNo supported dependency files found or no issues detected. Dependency scanning skipped.\n';
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

export const fixDependenciesAndCreatePR = async (dirPath: string, reportText: string): Promise<void> => {
  console.log('🤖 Attempting to auto-fix dependency vulnerabilities...');
  
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      console.log('Running npm audit fix...');
      execSync('npm audit fix', { cwd: dirPath, stdio: 'ignore' });
    } catch (e) {
      console.warn('npm audit fix returned non-zero, continuing to check changes.');
    }
  } else {
    // Monorepo support: Check all package.json files in subdirectories
    const stack = [dirPath];
    let visitedDirs = 0;
    while (stack.length) {
      const dir = stack.pop();
      if (!dir) continue;
      visitedDirs++;
      if (visitedDirs > 1000) break;

      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj') continue;
          stack.push(fullPath);
        } else if (entry.isFile() && entry.name === 'package.json') {
          try {
            console.log(`Running npm audit fix in ${fullPath}...`);
            execSync('npm audit fix', { cwd: dir, stdio: 'ignore' });
          } catch (e) {
            console.warn(`npm audit fix returned non-zero in ${dir}, continuing to check changes.`);
          }
        }
      }
    }
  }

  // TODO: Add auto-fix commands for Python, Go, and .NET if viable.
  // For now, we rely on npm audit fix as the primary automated fixer,
  // or any other package manager commands that can safely auto-update.

  try {
    setWorkingDirectory(dirPath);
    const changed = await getChangedFiles();
    if (changed.length === 0) {
      console.log('No files changed after auto-fix attempts.');
      return;
    }

    const branchName = buildBranchName('fix-deps-security', 'update');
    console.log(`Changes detected. Creating PR branch: ${branchName}`);

    await createBranch(branchName);
    await commitChanges('fix(security): auto-update dependencies to resolve vulnerabilities', changed);
    await pushChanges(branchName);

    console.log('🤖 Generating PR description from the updated files...');
    const prDescriptionTask = [
      'You are a Security Engineer preparing a Pull Request description.',
      'The automated security system just updated package dependencies to fix vulnerabilities.',
      'Based on the original vulnerability report below, write a concise but professional Pull Request description explaining what was updated.',
      '',
      'Original Report:',
      reportText
    ].join('\n');
    
    const prDescription = await consultAgentRouted(AgentRole.SECURITY_ENGINEER, prDescriptionTask, '');

    const vcs = VcsFactory.getProvider();
    const prUrl = await vcs.createPullRequest(
      'Security Fix: Update Dependencies',
      branchName,
      'main', // Assume main, or we could fetch default branch
      `### Automated Dependency Security Update\n\n${prDescription}\n\n*Automated security fix applied by Orchestra.*`
    );

    if (prUrl) {
      console.log(`✅ Pull Request created successfully for dependency updates: ${prUrl}`);
    }
  } catch (error) {
    console.error('Failed to create dependency update PR:', error);
  }
};