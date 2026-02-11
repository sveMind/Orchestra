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
            console.warn('Warning: GITHUB_TOKEN is not set. GitHub features will not work.');
        }

        this.octokit = new Octokit({
            auth: this.token,
        });
    }

    private isConfigured(): boolean {
        return !!(this.token && this.owner && this.repo);
    }

    async getDefaultBranch(): Promise<string> {
        if (!this.isConfigured()) return 'main';
        try {
            const { data } = await this.octokit.repos.get({
                owner: this.owner!,
                repo: this.repo!,
            });
            return data.default_branch;
        } catch (error) {
            console.error('Error fetching default branch:', error);
            return 'main';
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITHUB] Issue Created: ${title}`);
            return 'https://github.com/mock/repo/issues/123';
        }
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
            return null;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITHUB] PR Created: ${title} (${head} -> ${base})`);
            return 'https://github.com/mock/repo/pull/456';
        }
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
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITHUB] Comment added to #${issueNumber}: ${body.substring(0, 50)}...`);
            return 'https://github.com/mock/repo/issues/123#comment-456';
        }
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
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITHUB] Added labels to #${issueNumber}: ${labels.join(', ')}`);
            return;
        }
        try {
            await this.octokit.issues.addLabels({
                owner: this.owner!,
                repo: this.repo!,
                issue_number: issueNumber,
                labels,
            });
        } catch (error) {
            console.error('Error adding labels:', error);
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) {
            return 'diff --git a/src/index.ts b/src/index.ts\nindex 83a040e..d00491f 100644\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,5 +1,5 @@\n-console.log("Hello");\n+console.log("Hello World");';
        }
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
            return null;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITHUB] Release Created: ${name} (${tagName})`);
            return 'https://github.com/mock/repo/releases/tag/v1.0.0';
        }
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
            return null;
        }
    }
}
