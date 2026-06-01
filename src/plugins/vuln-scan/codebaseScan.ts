import fs from 'fs';
import path from 'path';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { buildCodebaseAnalysisTask } from './prompts';

export const walkDir = (dir: string, ignored: Set<string>, exts: Set<string>, filesList: string[] = []) => {
  if (filesList.length > 50) return filesList; 
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

export const scanCodebase = async (dirPath: string): Promise<{ text: string, hasIssues: boolean }> => {
  console.log('🔎 Scanning codebase for bad practices and security flaws...');
  const ignored = new Set(['node_modules', 'dist', 'build', 'coverage', 'out', 'public']);
  const exts = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.cs', '.php', '.rb', '.c', '.cpp', '.h']);
  const sourceFiles = walkDir(dirPath, ignored, exts);

  if (sourceFiles.length === 0) {
    return { text: '## Codebase Security Analysis\n\nNo source files found to scan.\n', hasIssues: false };
  }

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
  const task = buildCodebaseAnalysisTask(combinedContent);
  const codeAnalysis = await consultAgentRouted(AgentRole.SECURITY_ENGINEER, task, '');

  const hasIssues = !codeAnalysis.toLowerCase().includes('no significant security issues found');
  return { text: `## Codebase Security Analysis\n\n${codeAnalysis}\n`, hasIssues };
};