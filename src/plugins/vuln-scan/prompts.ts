export const buildDependencyAnalysisTask = (auditOutput: string): string => {
  return [
    'You are analyzing the output of a dependency vulnerability scan (e.g. npm audit, pip audit).',
    'Summarize the key vulnerabilities, the affected packages, and provide concrete steps to fix them (e.g. commands to run).',
    'If there are no vulnerabilities or the output is empty/invalid, state "No dependency vulnerabilities found."',
    'Format your response cleanly in Markdown.',
    '',
    'Scan Output:',
    auditOutput
  ].join('\n');
};

export const buildCodebaseAnalysisTask = (combinedContent: string): string => {
  return [
    'You are a Senior Security Engineer.',
    'Review the following codebase sample for security vulnerabilities (e.g. SQL Injection, XSS, hardcoded secrets, unsafe evals) and bad coding practices.',
    'Provide a structured markdown report identifying the file, the issue, the severity, and a recommendation on how to fix it.',
    'If no issues are found, explicitly state "No significant security issues found in the scanned files."',
    '',
    'Codebase Sample:',
    combinedContent
  ].join('\n');
};

export const buildSingleFileAnalysisTask = (contentToScan: string): string => {
  return [
    'Analyze the provided code for security vulnerabilities.',
    'If issues found, list them clearly. If none, strictly say "NO_ISSUES".',
    '',
    'Code:',
    contentToScan
  ].join('\n');
};

export const buildFixTask = (contentToScan: string, analysis: string): string => {
  return [
    'Based on the security analysis, provide ONLY the FULL refactored file content that fixes the vulnerabilities.',
    'Do not include explanations or markdown formatting.',
    '',
    'Original Code:',
    contentToScan,
    '',
    'Analysis:',
    analysis
  ].join('\n');
};
