import { VcsProvider } from './VcsProvider';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class OrchestraProvider implements VcsProvider {
    private client: AxiosInstance;
    private token: string | undefined;
    private projectId: string | undefined;
    private baseUrl: string;

    constructor() {
        this.token = process.env.ORCHESTRA_TOKEN;
        this.projectId = process.env.ORCHESTRA_PROJECT_ID || 'default';
        this.baseUrl = process.env.ORCHESTRA_URL || 'https://orchestra.swemind.com/api/v1';

        if (!this.token) {
            console.warn('Warning: ORCHESTRA_TOKEN is not set. Orchestra service features will not work.');
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.token || ''}`,
                'Content-Type': 'application/json',
            },
        });
    }

    private isConfigured(): boolean {
        return !!this.token;
    }

    async getDefaultBranch(): Promise<string> {
        if (!this.isConfigured()) return 'main';
        try {
            const response = await this.client.get(`/projects/${this.projectId}`);
            return response.data.defaultBranch || 'main';
        } catch (error) {
            console.error('Error fetching Orchestra default branch:', error);
            return 'main';
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] Issue Created: ${title}`);
            return 'https://orchestra.swemind.com/mock/issue/123';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues`, {
                title,
                body,
                labels,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating Orchestra issue:', error);
            return null;
        }
    }

    async listIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<{ number: number; title: string; state: string }[]> {
        if (!this.isConfigured()) {
            return [
                { number: 1, title: 'Mock Issue 1', state: 'open' },
                { number: 2, title: 'Mock Issue 2', state: 'closed' }
            ];
        }
        try {
            const response = await this.client.get(`/projects/${this.projectId}/issues`, {
                params: { state }
            });
            return response.data.map((issue: any) => ({
                number: issue.number,
                title: issue.title,
                state: issue.state
            }));
        } catch (error) {
            console.error('Error listing Orchestra issues:', error);
            return [];
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] PR Created: ${title} (${head} -> ${base})`);
            return 'https://orchestra.swemind.com/mock/pr/456';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/pull-requests`, {
                title,
                head,
                base,
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating Orchestra PR:', error);
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] Comment added to #${issueNumber}: ${body.substring(0, 50)}...`);
            return 'https://orchestra.swemind.com/mock/issue/123#comment';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/comments`, {
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error adding Orchestra comment:', error);
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] Added labels to #${issueNumber}: ${labels.join(', ')}`);
            return;
        }
        try {
            await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/labels`, {
                labels,
            });
        } catch (error) {
            console.error('Error adding Orchestra labels:', error);
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) {
            return 'diff --git a/src/index.ts b/src/index.ts...';
        }
        try {
            const response = await this.client.get(`/projects/${this.projectId}/pull-requests/${pullNumber}/diff`);
            return response.data.diff;
        } catch (error) {
            console.error('Error fetching Orchestra PR diff:', error);
            return null;
        }
    }

    async mergePullRequest(pullNumber: number): Promise<boolean> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] Merged PR #${pullNumber}`);
            return true;
        }
        try {
            await this.client.post(`/projects/${this.projectId}/pull-requests/${pullNumber}/merge`);
            return true;
        } catch (error) {
            console.error('Error merging Orchestra PR:', error);
            return false;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK ORCHESTRA] Release Created: ${name} (${tagName})`);
            return 'https://orchestra.swemind.com/mock/release/v1.0.0';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/releases`, {
                tagName,
                name,
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating Orchestra release:', error);
            return null;
        }
    }
}
