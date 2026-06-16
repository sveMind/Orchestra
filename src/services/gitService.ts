import simpleGit, { SimpleGit } from 'simple-git';

let git: SimpleGit = simpleGit();

export const setWorkingDirectory = (path: string) => {
    git = simpleGit(path);
};

export const cloneRepo = async (repoUrl: string, localPath: string): Promise<void> => {
    try {
        await simpleGit().clone(repoUrl, localPath);
        git = simpleGit(localPath);
    } catch (error) {
        console.error(`Error cloning repo ${repoUrl}:`, error);
        throw error;
    }
};

export const getChangedFiles = async (): Promise<string[]> => {
  try {
    const status = await git.status();
    // Combine modified, created, renamed, and untracked files
    const changedFiles = [
      ...status.modified,
      ...status.created,
      ...status.renamed.map(file => file.to),
      ...status.not_added,
    ];
    return changedFiles;
  } catch (error) {
    console.error('Error getting changed files from git:', error);
    return [];
  }
};

export const getCommitsSince = async (tagOrCommit: string): Promise<string[]> => {
  try {
    const options = tagOrCommit ? { from: tagOrCommit, to: 'HEAD' } : { n: 50 };
    const log = await git.log(options);
    return log.all.map(commit => `${commit.hash.substring(0, 7)} - ${commit.message} (${commit.author_name})`);
  } catch (error) {
    console.error(`Error getting commits since ${tagOrCommit}:`, error);
    return [];
  }
};

export const getLatestTag = async (): Promise<string> => {
  try {
    const tags = await git.tags();
    return tags.latest || '';
  } catch (error) {
    console.error('Error getting latest tag:', error);
    return '';
  }
};

export const getPreviousTag = async (currentTag: string): Promise<string> => {
    try {
        // Try to find the tag before the current one using git describe
        const result = await git.raw(['describe', '--abbrev=0', '--tags', `${currentTag}^`]);
        return result.trim();
    } catch (error) {
        console.warn(`Could not find previous tag for ${currentTag}. Returning empty.`);
        return '';
    }
};


export const getDiff = async (filePath: string): Promise<string> => {
    try {
        return await git.diff([filePath]);
    } catch (error) {
        console.error(`Error getting diff for ${filePath}:`, error);
        return '';
    }
}

export const getHeadSha = async (): Promise<string> => {
  try {
    const sha = await git.raw(['rev-parse', 'HEAD']);
    return String(sha || '').trim();
  } catch {
    return '';
  }
};

export const getMergeBase = async (refA: string, refB: string): Promise<string> => {
  try {
    const sha = await git.raw(['merge-base', refA, refB]);
    return String(sha || '').trim();
  } catch {
    return '';
  }
};

export const remoteBranchExists = async (branchName: string): Promise<boolean> => {
  try {
    await git.raw(['show-ref', '--verify', `refs/remotes/origin/${branchName}`]);
    return true;
  } catch {
    return false;
  }
};

const slugifyBranchPart = (input: string): string => {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40);
};

export const buildBranchName = (kind: string, context?: string): string => {
    const parts: string[] = ['orchestra', kind];
    if (context) {
        const slug = slugifyBranchPart(context);
        if (slug) {
            parts.push(slug);
        }
    }
    const suffix = Date.now().toString(36);
    return `${parts.join('/')}-${suffix}`;
};

export const createBranch = async (branchName: string): Promise<void> => {
    try {
        await git.checkoutLocalBranch(branchName);
        console.log(`Created and checked out branch: ${branchName}`);
    } catch (error) {
        console.error(`Error creating branch ${branchName}:`, error);
        throw error;
    }
};

export const checkoutBranch = async (branchName: string): Promise<void> => {
    try {
        await git.checkout(branchName);
        console.log(`Checked out branch: ${branchName}`);
    } catch (error) {
        console.error(`Error checking out branch ${branchName}:`, error);
        throw error;
    }
};

export const fetchOrigin = async (): Promise<void> => {
    try {
        await git.fetch(['origin', '--prune']);
    } catch (error) {
        console.error('Error fetching from origin:', error);
        throw error;
    }
};

export const createBranchFrom = async (branchName: string, startPoint: string): Promise<void> => {
    try {
        await git.checkoutBranch(branchName, startPoint);
        console.log(`Created and checked out branch: ${branchName} (from ${startPoint})`);
    } catch (error) {
        console.error(`Error creating branch ${branchName} from ${startPoint}:`, error);
        throw error;
    }
};

export const getCurrentBranch = async (): Promise<string> => {
    try {
        const info = await git.branch();
        return info.current;
    } catch (error) {
        console.error('Error reading current branch:', error);
        return '';
    }
};

export const ensureCommitIdentity = async (name: string, email: string): Promise<void> => {
    try {
        const status = await git.status();
        if (status && status.current) {
            await git.addConfig('user.name', name);
            await git.addConfig('user.email', email);
        }
    } catch {
    }
};

export const commitChanges = async (message: string, files: string[] = ['.']): Promise<void> => {
    try {
        await git.add(files);
        await git.commit(message);
        console.log(`Committed changes: ${message}`);
    } catch (error) {
        console.error(`Error committing changes:`, error);
        throw error;
    }
};

export const pushChanges = async (branchName: string): Promise<void> => {
    try {
        const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
        if (token && process.env.AZURE_ORG_URL) {
            // Azure devops uses https://<token>@dev.azure.com/...
            const originUrl = await git.remote(['get-url', 'origin']);
            if (originUrl) {
                const cleanUrl = String(originUrl).trim().replace(/^https?:\/\//, '');
                const authUrl = `https://${token}@${cleanUrl}`;
                await git.push(authUrl, branchName, { '--set-upstream': null });
                console.log(`Pushed changes to ${branchName}`);
                return;
            }
        }
        await git.push('origin', branchName, { '--set-upstream': null });
        console.log(`Pushed changes to ${branchName}`);
    } catch (error) {
        console.error(`Error pushing changes to ${branchName}:`, error);
        throw error;
    }
};

export const pushChangesForceWithLease = async (branchName: string): Promise<void> => {
  try {
    const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
    if (token && process.env.AZURE_ORG_URL) {
        const originUrl = await git.remote(['get-url', 'origin']);
        if (originUrl) {
            const cleanUrl = String(originUrl).trim().replace(/^https?:\/\//, '');
            const authUrl = `https://${token}@${cleanUrl}`;
            await git.push(authUrl, branchName, { '--set-upstream': null, '--force-with-lease': null });
            console.log(`Force-pushed changes to ${branchName}`);
            return;
        }
    }
    await git.push('origin', branchName, { '--set-upstream': null, '--force-with-lease': null });
    console.log(`Force-pushed changes to ${branchName}`);
  } catch (error) {
    console.error(`Error force-pushing changes to ${branchName}:`, error);
    throw error;
  }
};
