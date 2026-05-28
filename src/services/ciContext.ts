import fs from 'fs';

export type CiPrContext = {
  prNumber: number;
  headRef: string;
  baseRef: string;
  isFork: boolean;
};

export const readGitHubPrContext = (): CiPrContext | null => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repoFullName = process.env.GITHUB_REPOSITORY || '';

  if (!eventPath || !fs.existsSync(eventPath)) return null;

  try {
    const raw = fs.readFileSync(eventPath, 'utf-8');
    const parsed = JSON.parse(raw) as any;
    const pr = parsed && parsed.pull_request ? parsed.pull_request : null;
    if (!pr || typeof pr.number !== 'number') return null;

    const headRef = String(pr.head?.ref || '').trim();
    const baseRef = String(pr.base?.ref || '').trim();
    if (!headRef || !baseRef) return null;

    const headRepoFullName = String(pr.head?.repo?.full_name || '').trim();
    const isFork = !!(repoFullName && headRepoFullName && headRepoFullName !== repoFullName);

    return { prNumber: pr.number, headRef, baseRef, isFork };
  } catch {
    return null;
  }
};

export const readGitLabPrContext = (): CiPrContext | null => {
  const prIid = process.env.CI_MERGE_REQUEST_IID;
  if (!prIid) return null;

  const headRef = process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || '';
  const baseRef = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || '';
  
  const sourceProjectId = process.env.CI_MERGE_REQUEST_SOURCE_PROJECT_ID;
  const targetProjectId = process.env.CI_MERGE_REQUEST_PROJECT_ID;
  const isFork = !!(sourceProjectId && targetProjectId && sourceProjectId !== targetProjectId);

  if (!headRef || !baseRef) return null;

  return {
    prNumber: parseInt(prIid, 10),
    headRef,
    baseRef,
    isFork
  };
};

export const readAzurePrContext = (): CiPrContext | null => {
  const prId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
  if (!prId) return null;

  let headRef = process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH || '';
  let baseRef = process.env.SYSTEM_PULLREQUEST_TARGETBRANCH || '';

  // Azure gives refs like refs/heads/feature or feature. Let's clean it up.
  headRef = headRef.replace(/^refs\/heads\//, '');
  baseRef = baseRef.replace(/^refs\/heads\//, '');

  const isForkStr = String(process.env.SYSTEM_PULLREQUEST_ISFORK || '').toLowerCase();
  const isFork = isForkStr === 'true' || isForkStr === '1';

  if (!headRef || !baseRef) return null;

  return {
    prNumber: parseInt(prId, 10),
    headRef,
    baseRef,
    isFork
  };
};

export const readCiPrContext = (): CiPrContext | null => {
  if (process.env.GITHUB_ACTIONS) {
    return readGitHubPrContext();
  }
  if (process.env.GITLAB_CI) {
    return readGitLabPrContext();
  }
  if (process.env.TF_BUILD || process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI) {
    return readAzurePrContext();
  }
  return null;
};

