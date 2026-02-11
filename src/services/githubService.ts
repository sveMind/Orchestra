import { VcsFactory } from './vcs/VcsFactory';

export const getDefaultBranch = async (): Promise<string> => {
    return VcsFactory.getProvider().getDefaultBranch();
};

export const createIssue = async (title: string, body: string, labels: string[] = []): Promise<string | null> => {
    return VcsFactory.getProvider().createIssue(title, body, labels);
};

export const createPullRequest = async (title: string, head: string, base: string, body: string): Promise<string | null> => {
    return VcsFactory.getProvider().createPullRequest(title, head, base, body);
};

export const addComment = async (issueNumber: number, body: string): Promise<string | null> => {
    return VcsFactory.getProvider().addComment(issueNumber, body);
};

export const addLabels = async (issueNumber: number, labels: string[]): Promise<void> => {
    return VcsFactory.getProvider().addLabels(issueNumber, labels);
};

export const getPullRequestDiff = async (pullNumber: number): Promise<string | null> => {
    return VcsFactory.getProvider().getPullRequestDiff(pullNumber);
};

export const createRelease = async (tagName: string, name: string, body: string): Promise<string | null> => {
    return VcsFactory.getProvider().createRelease(tagName, name, body);
};
