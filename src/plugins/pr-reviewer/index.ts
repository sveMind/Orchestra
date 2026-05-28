import { OrchestraPlugin } from '../../types';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { parseUnifiedDiffByFile } from '../../utils/diffUtils';
import { extractJsonObjectFromText } from '../../utils/jsonUtils';

type ReviewFeedback = {
  file: string;
  line?: number;
  severity: 'info' | 'warning' | 'critical';
  comment: string;
};

type PrReviewResult = {
  summary: string;
  walkthrough: string[];
  poem: string;
  files: { path: string; summary: string }[];
  feedback: ReviewFeedback[];
  approved: boolean;
};

export const runPRReview = async (pullNumber: number): Promise<void> => {
  console.log(`\n🕵️‍♂️ Starting PR Review for PR #${pullNumber}...`);

  const vcs = VcsFactory.getProvider();
  const diff = await vcs.getPullRequestDiff(pullNumber);

  if (!diff) {
    console.error('Failed to fetch PR diff.');
    return;
  }

  const { changedFiles, diffsByFile } = parseUnifiedDiffByFile(diff);

  // We want to send a manageable chunk to the AI.
  // We'll concatenate the diffs but truncate each file's diff if it's too large,
  // and truncate the overall diff to fit in typical context windows (~20k chars).
  const maxDiffPerFile = 3000;
  const parts: string[] = [];
  
  for (const file of changedFiles) {
    let d = diffsByFile.get(file) || '';
    if (d.length > maxDiffPerFile) {
      d = d.substring(0, maxDiffPerFile) + '\n... [Diff truncated for size]';
    }
    parts.push(`File: ${file}\n${d}`);
  }

  let combinedDiff = parts.join('\n\n');
  if (combinedDiff.length > 25000) {
    combinedDiff = combinedDiff.substring(0, 25000) + '\n... [Overall diff truncated for size]';
  }

  const task = [
    'You are an expert Senior Software Engineer and Code Reviewer.',
    'Review the following Pull Request diff and provide a comprehensive, highly structured review.',
    '',
    'Your goals:',
    '1. Summarize the overall intent of the PR.',
    '2. Provide a high-level Walkthrough of the changes (bullet points).',
    '3. Write a fun, 4-line poem about the changes.',
    '4. Briefly summarize what changed in each file.',
    '5. Provide actionable feedback (bugs, security issues, performance, code quality).',
    '6. Decide if the PR is approved or needs changes.',
    '',
    'Output strict JSON ONLY in the following format:',
    '{',
    '  "summary": "Overall summary of the PR...",',
    '  "walkthrough": ["Added feature X", "Fixed bug Y in module Z"],',
    '  "poem": "A fun 4-line poem...",',
    '  "files": [{ "path": "src/index.ts", "summary": "Added xyz" }],',
    '  "feedback": [{ "file": "src/index.ts", "line": 42, "severity": "warning", "comment": "Possible memory leak..." }],',
    '  "approved": true',
    '}',
    '',
    'PR Diff:',
    combinedDiff
  ].join('\n');

  console.log('🤖 Analyzing diff and generating review report...');
  const aiResponse = await consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, task, '');
  
  const parsed = extractJsonObjectFromText(aiResponse) as Partial<PrReviewResult> | null;

  if (!parsed || !parsed.summary) {
    console.error('Failed to parse AI review response or response was incomplete.');
    // Fallback to a simple comment if JSON fails
    await vcs.addComment(pullNumber, `### 🤖 Orchestra PR Review\n\nFailed to generate a structured review. Raw output:\n\n${aiResponse}`);
    return;
  }

  const isApproved = parsed.approved !== false;
  const statusIcon = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'Approved' : 'Changes Requested';

  const formatFeedback = (fb: ReviewFeedback[]) => {
    if (!fb || fb.length === 0) return 'No major issues found. Great job! 👍';
    return fb.map(f => {
      const lineRef = f.line ? ` (Line ${f.line})` : '';
      const sevIcon = f.severity === 'critical' ? '🛑' : f.severity === 'warning' ? '⚠️' : 'ℹ️';
      return `- **${f.file}**${lineRef}: ${sevIcon} ${f.comment}`;
    }).join('\n');
  };

  const formatFiles = (files: { path: string; summary: string }[]) => {
    if (!files || files.length === 0) return 'No files processed.';
    return files.map(f => `| \`${f.path}\` | ${f.summary} |`).join('\n');
  };

  const walkthroughText = parsed.walkthrough && parsed.walkthrough.length
    ? parsed.walkthrough.map(w => `- ${w}`).join('\n')
    : '- No walkthrough generated.';

  const finalReport = [
    `## 🤖 Orchestra PR Review: ${statusIcon} **${statusText}**`,
    '',
    `### 📝 Summary`,
    parsed.summary,
    '',
    `### 🚶 Walkthrough`,
    walkthroughText,
    '',
    `### 📄 Changes`,
    '| File | Summary |',
    '|------|---------|',
    formatFiles(parsed.files || []),
    '',
    `### 💬 Feedback`,
    formatFeedback(parsed.feedback || []),
    '',
    `### 🎭 Poem`,
    `> *${(parsed.poem || '').replace(/\n/g, '*\n> *')}*`
  ].join('\n');

  await vcs.addComment(pullNumber, finalReport);
  console.log(`✅ PR Review posted successfully (Status: ${statusText}).`);
};

const plugin: OrchestraPlugin = {
  name: 'PR Reviewer',
  description: 'Automated CodeRabbit-style PR Review by Dev Agent',
  command: 'pr-review',
  args: [
    { name: 'prNumber', description: 'Pull Request Number', required: true }
  ],
  action: async (prNumber: string) => {
    await runPRReview(Number(prNumber));
  }
};

export default plugin;
