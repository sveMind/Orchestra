import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const githubToken = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

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
