import { RepoSignals } from '../../services/repoScan';

export const buildDevReviewTask = (combinedDiff: string, signals?: RepoSignals): string => {
  const repoContext = signals ? buildRepoContextSummary(signals) : '';
  
  return [
    'You are an expert Senior Software Engineer and Code Reviewer.',
    'Review the following Pull Request diff and provide a comprehensive, highly structured review.',
    repoContext ? `\nRepository Context:\n${repoContext}\n` : '',
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
};

export const buildQaReviewTask = (combinedDiff: string, signals?: RepoSignals): string => {
  const repoContext = signals ? buildRepoContextSummary(signals) : '';
  
  return [
    'You are an expert Senior QA Engineer.',
    'Review the following Pull Request diff focusing STRICTLY on testing, edge cases, and QA.',
    repoContext ? `\nRepository Context:\n${repoContext}\n` : '',
    'Your goals:',
    '1. Identify missing test coverage for new logic.',
    '2. Identify edge cases that the developer might have missed.',
    '3. Review any test files modified/added for fragile assertions or bad testing practices.',
    '',
    'Output strict JSON ONLY in the following format:',
    '{',
    '  "feedback": [{ "file": "src/index.ts", "line": 42, "severity": "warning", "comment": "Missing unit test for the null edge case..." }]',
    '}',
    '',
    'PR Diff:',
    combinedDiff
  ].join('\n');
};

const buildRepoContextSummary = (signals: RepoSignals): string => {
  const parts: string[] = [];
  if (signals.languages.length > 0) parts.push(`Languages: ${signals.languages.join(', ')}`);
  if (signals.appType !== 'unknown') parts.push(`App Type: ${signals.appType}`);
  if (signals.hasPackageJson) parts.push('Node.js package detected.');
  if (signals.dockerfilePath) parts.push('Docker containerized.');
  return parts.join(' | ');
};
