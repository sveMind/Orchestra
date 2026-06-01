import { OrchestraPlugin } from '../../types';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { parseUnifiedDiffByFile } from '../../utils/diffUtils';
import { extractJsonObjectFromText } from '../../utils/jsonUtils';
import { readCiPrContext } from '../../services/ciContext';
import { scanRepoSignals } from '../../services/repoScan';
import { PrReviewResult, ReviewFeedback } from './types';
import { buildDevReviewTask, buildQaReviewTask } from './prompts';
import { mergeFeedback, formatReviewReport } from './feedbackUtils';

export const runPRReview = async (pullNumber?: number): Promise<void> => {
  let prNumber = pullNumber;
  
  if (!prNumber) {
    const ciContext = readCiPrContext();
    if (ciContext && ciContext.prNumber) {
      prNumber = ciContext.prNumber;
      console.log(`\n🕵️‍♂️ Detected CI PR context. Starting PR Review for PR #${prNumber}...`);
    } else {
      console.error('No PR number provided and no CI PR context detected.');
      return;
    }
  } else {
    console.log(`\n🕵️‍♂️ Starting PR Review for PR #${prNumber}...`);
  }

  const vcs = VcsFactory.getProvider();
  const diff = await vcs.getPullRequestDiff(prNumber);

  if (!diff) {
    console.error('Failed to fetch PR diff.');
    return;
  }

  // Scan local repo for context if running from a cloned workspace
  let repoSignals;
  try {
    repoSignals = scanRepoSignals(process.cwd());
  } catch (err) {
    console.warn('Could not scan repository signals. Proceeding without repo context.');
  }

  const { changedFiles, diffsByFile } = parseUnifiedDiffByFile(diff);

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

  const devTask = buildDevReviewTask(combinedDiff, repoSignals);
  const qaTask = buildQaReviewTask(combinedDiff, repoSignals);

  console.log('🤖 Analyzing diff with Dev and QA agents in parallel...');
  
  const [devResponse, qaResponse] = await Promise.all([
    consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, devTask, ''),
    consultAgentRouted(AgentRole.QA_ENGINEER, qaTask, '')
  ]);
  
  const devParsed = extractJsonObjectFromText(devResponse) as Partial<PrReviewResult> | null;
  const qaParsed = extractJsonObjectFromText(qaResponse) as { feedback?: ReviewFeedback[] } | null;

  if (!devParsed || !devParsed.summary) {
    console.error('Failed to parse AI review response or response was incomplete.');
    await vcs.addComment(prNumber, `### 🤖 Orchestra PR Review\n\nFailed to generate a structured review. Raw output:\n\n${devResponse}`);
    return;
  }

  const combinedFeedback = mergeFeedback(devParsed, qaParsed);
  const finalReport = formatReviewReport(devParsed, combinedFeedback);

  await vcs.addComment(prNumber, finalReport);
  console.log(`✅ PR Review posted successfully.`);
};

const plugin: OrchestraPlugin = {
  name: 'PR Reviewer',
  description: 'Automated CodeRabbit-style PR Review by Dev & QA Agents',
  command: 'pr-review',
  args: [
    { name: 'prNumber', description: 'Pull Request Number (optional if in CI)', required: false }
  ],
  action: async (prNumber?: string) => {
    await runPRReview(prNumber ? Number(prNumber) : undefined);
  }
};

export default plugin;
