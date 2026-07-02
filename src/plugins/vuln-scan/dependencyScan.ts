import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { buildDependencyAnalysisTask } from './prompts';
import { createBranch, commitChanges, pushChanges, buildBranchName, getChangedFiles, setWorkingDirectory, ensureCommitIdentity } from '../../services/gitService';
import { VcsFactory } from '../../services/vcs/VcsFactory';

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'dist', '.git']);

const walkRepo = (dirPath: string, onFile: (filePath: string) => void): void => {
  const stack = [dirPath];
  let visitedDirs = 0;

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visitedDirs += 1;
    if (visitedDirs > 2000) break;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) onFile(fullPath);
    }
  }
};

const findFilesByBaseName = (dirPath: string, fileName: string): string[] => {
  const files = new Set<string>();
  walkRepo(dirPath, fullPath => {
    if (path.basename(fullPath) === fileName) files.add(fullPath);
  });
  return Array.from(files).sort();
};

const findNpmPackageDirs = (dirPath: string): string[] => {
  const dirs = new Set<string>();
  for (const filePath of findFilesByBaseName(dirPath, 'package.json')) {
    dirs.add(path.dirname(filePath));
  }
  return Array.from(dirs).sort();
};

const findDotnetTargets = (dirPath: string): string[] => {
  const targets: string[] = [];
  walkRepo(dirPath, fullPath => {
    if (fullPath.endsWith('.sln') || fullPath.endsWith('.csproj')) targets.push(fullPath);
  });
  const sln = targets.filter(t => t.endsWith('.sln'));
  return sln.length > 0 ? Array.from(new Set(sln)).sort() : Array.from(new Set(targets)).sort();
};

const findDotnetProjects = (dirPath: string): string[] => {
  const projects: string[] = [];
  walkRepo(dirPath, fullPath => {
    if (fullPath.endsWith('.csproj')) projects.push(fullPath);
  });
  return Array.from(new Set(projects)).sort();
};

const extractVulnerableDotnetPackages = (auditOutput: string): string[] => {
  const matches = new Set<string>();
  const lineRe = /^\s*[> ]\s*([A-Za-z0-9_.-]+)\s+\d+(?:\.\d+)*(?:[-+A-Za-z0-9.]*)?/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(auditOutput))) {
    matches.add(m[1]);
  }
  return Array.from(matches).sort();
};

const findPythonRequirementFiles = (dirPath: string): string[] => {
  const files: string[] = [];
  walkRepo(dirPath, fullPath => {
    const base = path.basename(fullPath);
    if (base === 'requirements.txt') files.push(fullPath);
  });
  return Array.from(new Set(files)).sort();
};

const findGoModuleDirs = (dirPath: string): string[] => {
  const dirs = new Set<string>();
  for (const filePath of findFilesByBaseName(dirPath, 'go.mod')) {
    dirs.add(path.dirname(filePath));
  }
  return Array.from(dirs).sort();
};

const getLatestPythonVersion = (packageName: string): string => {
  try {
    const output = execSync(`python3 -m pip index versions "${packageName}"`, {
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    const latestLine = output.match(/LATEST:\s*([^\s]+)/i);
    if (latestLine) return latestLine[1].trim();
    const availableLine = output.match(/Available versions:\s*([^\n]+)/i);
    if (availableLine) {
      const first = availableLine[1].split(',')[0]?.trim();
      return first || '';
    }
    return '';
  } catch {
    return '';
  }
};

const updatePinnedRequirementsFile = (requirementsPath: string): boolean => {
  const original = fs.readFileSync(requirementsPath, 'utf-8');
  const updated = original
    .split(/\r?\n/)
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const match = trimmed.match(/^([A-Za-z0-9_.-]+)==([^\s#]+)$/);
      if (!match) return line;
      const latest = getLatestPythonVersion(match[1]);
      if (!latest || latest === match[2]) return line;
      return `${match[1]}==${latest}`;
    })
    .join('\n');

  if (updated === original) return false;
  fs.writeFileSync(requirementsPath, updated);
  return true;
};

export const scanDependencies = async (dirPath: string): Promise<{ text: string, hasIssues: boolean }> => {
  let reportText = '';
  let hasIssues = false;

  const npmDirs = findNpmPackageDirs(dirPath);
  if (npmDirs.length > 0) {
    let auditOutputCombined = '';
    for (const dir of npmDirs) {
      console.log(`📦 Scanning Node.js package dependencies in ${dir} (npm audit)...`);
      try {
        auditOutputCombined += `\n\n--- npm audit (${dir}) ---\n\n`;
        auditOutputCombined += execSync('npm audit --json', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      } catch (err: any) {
        auditOutputCombined += err.stdout ? err.stdout.toString() : '';
      }
    }

    const { text, issues } = await analyzeDepOutput(auditOutputCombined);
    reportText += `## Node.js Dependencies\n\n${text}\n\n`;
    if (issues) hasIssues = true;
  }

  const requirementsFiles = findPythonRequirementFiles(dirPath);
  for (const requirementsTxtPath of requirementsFiles) {
    console.log(`📦 Scanning Python dependencies in ${requirementsTxtPath} (safety)...`);
    let auditOutput = '';
    try {
      auditOutput = execSync(`safety check -r "${path.basename(requirementsTxtPath)}" --full-report`, {
        cwd: path.dirname(requirementsTxtPath),
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : 'Safety tool not installed or failed.';
    }

    if (auditOutput && !auditOutput.includes('not installed')) {
        const { text, issues } = await analyzeDepOutput(auditOutput);
        reportText += `## Python Dependencies (${path.relative(dirPath, requirementsTxtPath)})\n\n${text}\n\n`;
        if (issues) hasIssues = true;
    }
  }

  const goModuleDirs = findGoModuleDirs(dirPath);
  for (const goDir of goModuleDirs) {
    console.log(`📦 Scanning Go dependencies in ${goDir} (govulncheck)...`);
    let auditOutput = '';
    try {
      auditOutput = execSync('govulncheck ./...', { cwd: goDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (err: any) {
      auditOutput = err.stdout ? err.stdout.toString() : 'govulncheck not installed or failed.';
    }

    if (auditOutput && !auditOutput.includes('not installed')) {
        const { text, issues } = await analyzeDepOutput(auditOutput);
        reportText += `## Go Dependencies (${path.relative(dirPath, goDir) || '.'})\n\n${text}\n\n`;
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
  
  const npmDirs = findNpmPackageDirs(dirPath);
  for (const dir of npmDirs) {
    try {
      console.log(`Running npm audit fix in ${dir}...`);
      execSync('npm audit fix', { cwd: dir, stdio: 'ignore' });
    } catch (e) {
      console.warn(`npm audit fix returned non-zero in ${dir}, continuing to check changes.`);
    }
  }

  const requirementsFiles = findPythonRequirementFiles(dirPath);
  for (const requirementsPath of requirementsFiles) {
    try {
      console.log(`Updating pinned Python requirements in ${requirementsPath}...`);
      updatePinnedRequirementsFile(requirementsPath);
    } catch (e) {
      console.warn(`Python requirements update failed for ${requirementsPath}, continuing.`, e);
    }
  }

  const goModuleDirs = findGoModuleDirs(dirPath);
  for (const goDir of goModuleDirs) {
    try {
      console.log(`Running Go dependency updates in ${goDir}...`);
      execSync('go get -u ./...', { cwd: goDir, stdio: 'ignore' });
      execSync('go mod tidy', { cwd: goDir, stdio: 'ignore' });
    } catch (e) {
      console.warn(`Go dependency update failed in ${goDir}, continuing.`);
    }
  }

  const dotnetProjects = findDotnetProjects(dirPath);
  for (const projectPath of dotnetProjects) {
    try {
      const auditOutput = execSync(`dotnet list "${projectPath}" package --vulnerable`, {
        cwd: path.dirname(projectPath),
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString();
      const vulnerablePackages = extractVulnerableDotnetPackages(auditOutput);
      for (const pkg of vulnerablePackages) {
        try {
          console.log(`Updating .NET package ${pkg} in ${projectPath}...`);
          execSync(`dotnet add "${projectPath}" package "${pkg}"`, {
            cwd: path.dirname(projectPath),
            stdio: 'ignore'
          });
        } catch {
          console.warn(`Failed to update .NET package ${pkg} in ${projectPath}, continuing.`);
        }
      }
    } catch {
      // No vulnerable packages or command failed; skip project.
    }
  }

  try {
    setWorkingDirectory(dirPath);
    await ensureCommitIdentity('orchestra-bot', 'orchestra-bot@users.noreply.github.com');
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
