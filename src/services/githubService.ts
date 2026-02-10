import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const githubToken = process.env.GITHUB_TOKEN;
let owner = process.env.GITHUB_OWNER;
let repo = process.env.GITHUB_REPO;

// Fallback for GitHub Actions
if ((!owner || !repo) && process.env.GITHUB_REPOSITORY) {
    const [repoOwner, repoName] = process.env.GITHUB_REPOSITORY.split('/');
    owner = owner || repoOwner;
    repo = repo || repoName;
}

if (!githubToken) {
  console.warn('Warning: GITHUB_TOKEN is not set. GitHub features will not work.');
}

const octokit = new Octokit({
  auth: githubToken,
});

export const createIssue = async (title: string, body: string, labels: string[] = []): Promise<string | null> => {
    if (!githubToken || !owner || !repo) {
        console.log(`[MOCK GITHUB] Issue Created: ${title}`);
        console.log(`[MOCK GITHUB] Body Preview: ${body.substring(0, 50)}...`);
        return 'https://github.com/mock/repo/issues/123';
    }

    try {
        const response = await octokit.issues.create({
            owner,
            repo,
            title,
            body,
            labels,
        });
        return response.data.html_url;
    } catch (error) {
        console.error('Error creating GitHub issue:', error);
        return null;
    }
};

export const createPullRequest = async (title: string, head: string, base: string, body: string): Promise<string | null> => {
    if (!githubToken || !owner || !repo) {
        console.log(`[MOCK GITHUB] PR Created: ${title} (${head} -> ${base})`);
        return 'https://github.com/mock/repo/pull/456';
    }

    try {
        const response = await octokit.pulls.create({
            owner,
            repo,
            title,
            head,
            base,
            body,
        });
        return response.data.html_url;
    } catch (error) {
        console.error('Error creating Pull Request:', error);
        return null;
    }
};

export const addComment = async (issueNumber: number, body: string): Promise<string | null> => {
    if (!githubToken || !owner || !repo) {
        console.log(`[MOCK GITHUB] Comment added to #${issueNumber}: ${body.substring(0, 50)}...`);
        return 'https://github.com/mock/repo/issues/123#comment-456';
    }

    try {
        const response = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body,
        });
        return response.data.html_url;
    } catch (error) {
        console.error('Error adding comment:', error);
        return null;
    }
};
