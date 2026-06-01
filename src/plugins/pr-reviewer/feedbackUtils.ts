import { PrReviewResult, ReviewFeedback } from './types';

export const mergeFeedback = (devParsed: Partial<PrReviewResult>, qaParsed: { feedback?: ReviewFeedback[] } | null): ReviewFeedback[] => {
  const combinedFeedback = [...(devParsed.feedback || [])];
  if (qaParsed && qaParsed.feedback && Array.isArray(qaParsed.feedback)) {
    for (const fb of qaParsed.feedback) {
      combinedFeedback.push({
        ...fb,
        comment: `**(QA)** ${fb.comment}`
      });
    }
  }
  return combinedFeedback;
};

export const formatReviewReport = (devParsed: Partial<PrReviewResult>, combinedFeedback: ReviewFeedback[]): string => {
  const isApproved = devParsed.approved !== false;
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

  const walkthroughText = devParsed.walkthrough && devParsed.walkthrough.length
    ? devParsed.walkthrough.map(w => `- ${w}`).join('\n')
    : '- No walkthrough generated.';

  return [
    `## 🤖 Orchestra PR Review: ${statusIcon} **${statusText}**`,
    '',
    `### 📝 Summary`,
    devParsed.summary || 'No summary provided.',
    '',
    `### 🚶 Walkthrough`,
    walkthroughText,
    '',
    `### 📄 Changes`,
    '| File | Summary |',
    '|------|---------|',
    formatFiles(devParsed.files || []),
    '',
    `### 💬 Feedback`,
    formatFeedback(combinedFeedback),
    '',
    `### 🎭 Poem`,
    `> *${(devParsed.poem || '').replace(/\n/g, '*\n> *')}*`
  ].join('\n');
};
