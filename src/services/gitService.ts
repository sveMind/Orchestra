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
    const log = await git.log({ from: tagOrCommit, to: 'HEAD' });
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

export const getDiff = async (filePath: string): Promise<string> => {
    try {
        return await git.diff([filePath]);
    } catch (error) {
        console.error(`Error getting diff for ${filePath}:`, error);
        return '';
    }
}

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
        await git.push('origin', branchName, { '--set-upstream': null });
        console.log(`Pushed changes to ${branchName}`);
    } catch (error) {
        console.error(`Error pushing changes to ${branchName}:`, error);
        throw error;
    }
};
