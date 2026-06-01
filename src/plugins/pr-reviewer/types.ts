export type ReviewFeedback = {
  file: string;
  line?: number;
  severity: 'info' | 'warning' | 'critical';
  comment: string;
};

export type PrReviewResult = {
  summary: string;
  walkthrough: string[];
  poem: string;
  files: { path: string; summary: string }[];
  feedback: ReviewFeedback[];
  approved: boolean;
};
