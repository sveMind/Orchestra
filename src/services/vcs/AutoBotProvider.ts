import { VcsProvider } from './VcsProvider';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class AutoBotProvider implements VcsProvider {
    private client: AxiosInstance;
    private token: string | undefined;
    private projectId: string | undefined;
    private baseUrl: string;

    constructor() {
        this.token = process.env.AUTOBOT_TOKEN;
        this.projectId = process.env.AUTOBOT_PROJECT_ID || 'default';
        this.baseUrl = process.env.AUTOBOT_URL || 'https://autobot.swemind.com/api/v1';

        if (!this.token) {
            console.warn('Warning: AUTOBOT_TOKEN is not set. AutoBot service features will not work.');
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
            console.error('Error fetching AutoBot default branch:', error);
            return 'main';
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AUTOBOT] Issue Created: ${title}`);
            return 'https://autobot.swemind.com/mock/issue/123';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues`, {
                title,
                body,
                labels,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating AutoBot issue:', error);
            return null;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AUTOBOT] PR Created: ${title} (${head} -> ${base})`);
            return 'https://autobot.swemind.com/mock/pr/456';
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
            console.error('Error creating AutoBot PR:', error);
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AUTOBOT] Comment added to #${issueNumber}: ${body.substring(0, 50)}...`);
            return 'https://autobot.swemind.com/mock/issue/123#comment';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/comments`, {
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error adding AutoBot comment:', error);
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AUTOBOT] Added labels to #${issueNumber}: ${labels.join(', ')}`);
            return;
        }
        try {
            await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/labels`, {
                labels,
            });
        } catch (error) {
            console.error('Error adding AutoBot labels:', error);
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
            console.error('Error fetching AutoBot PR diff:', error);
            return null;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AUTOBOT] Release Created: ${name} (${tagName})`);
            return 'https://autobot.swemind.com/mock/release/v1.0.0';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/releases`, {
                tagName,
                name,
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating AutoBot release:', error);
            return null;
        }
    }
}
