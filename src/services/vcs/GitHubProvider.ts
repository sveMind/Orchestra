import { VcsProvider } from './VcsProvider';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

export class GitHubProvider implements VcsProvider {
    private octokit: Octokit;
    private owner: string | undefined;
    private repo: string | undefined;
    private token: string | undefined;

    constructor() {
        this.token = process.env.GITHUB_TOKEN;
        this.owner = process.env.GITHUB_OWNER;
        this.repo = process.env.GITHUB_REPO;

        // Fallback for GitHub Actions
        if ((!this.owner || !this.repo) && process.env.GITHUB_REPOSITORY) {
            const [repoOwner, repoName] = process.env.GITHUB_REPOSITORY.split('/');
            this.owner = this.owner || repoOwner;
            this.repo = this.repo || repoName;
        }

        if (!this.token) {
            // Warn but wait for usage to crash
        }

        this.octokit = new Octokit({
            auth: this.token,
        });
    }

    private isConfigured(): boolean {
        return !!(this.token && this.owner && this.repo);
    }

    async getDefaultBranch(): Promise<string> {
        if (!this.isConfigured()) throw new Error('GitHub not configured. Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO.');
        try {
            const { data } = await this.octokit.repos.get({
                owner: this.owner!,
                repo: this.repo!,
            });
            return data.default_branch;
        } catch (error) {
            console.error('Error fetching default branch:', error);
            throw error;
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const response = await this.octokit.issues.create({
                owner: this.owner!,
                repo: this.repo!,
                title,
                body,
                labels,
            });
            return response.data.html_url;
        } catch (error) {
            console.error('Error creating GitHub issue:', error);
            throw error;
        }
    }

    async listIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<{ number: number; title: string; state: string }[]> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const { data } = await this.octokit.issues.listForRepo({
                owner: this.owner!,
                repo: this.repo!,
                state,
                per_page: 100
            });
            return data.map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state
            }));
        } catch (error) {
            console.error('Error listing GitHub issues:', error);
            throw error;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const response = await this.octokit.pulls.create({
                owner: this.owner!,
                repo: this.repo!,
                title,
                head,
                base,
                body,
            });
            return response.data.html_url;
        } catch (error) {
            console.error('Error creating Pull Request:', error);
            throw error;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const response = await this.octokit.issues.createComment({
                owner: this.owner!,
                repo: this.repo!,
                issue_number: issueNumber,
                body,
            });
            return response.data.html_url;
        } catch (error) {
            console.error('Error adding comment:', error);
            throw error;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            await this.octokit.issues.addLabels({
                owner: this.owner!,
                repo: this.repo!,
                issue_number: issueNumber,
                labels,
            });
        } catch (error) {
            console.error('Error adding labels:', error);
            throw error;
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const response = await this.octokit.pulls.get({
                owner: this.owner!,
                repo: this.repo!,
                pull_number: pullNumber,
                mediaType: {
                    format: 'diff'
                }
            });
            return response.data as unknown as string;
        } catch (error) {
            console.error('Error fetching PR diff:', error);
            throw error;
        }
    }

    async mergePullRequest(pullNumber: number): Promise<boolean> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            await this.octokit.pulls.merge({
                owner: this.owner!,
                repo: this.repo!,
                pull_number: pullNumber,
            });
            return true;
        } catch (error) {
            console.error('Error merging GitHub PR:', error);
            throw error;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitHub not configured.');
        try {
            const response = await this.octokit.repos.createRelease({
                owner: this.owner!,
                repo: this.repo!,
                tag_name: tagName,
                name,
                body,
            });
            return response.data.html_url;
        } catch (error) {
            console.error('Error creating GitHub release:', error);
            throw error;
        }
    }
}
