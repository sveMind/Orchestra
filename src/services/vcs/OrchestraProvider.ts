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
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            const response = await this.client.get(`/projects/${this.projectId}`);
            return response.data.defaultBranch || 'main';
        } catch (error) {
            console.error('Error fetching Orchestra default branch:', error);
            throw error;
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues`, {
                title,
                body,
                labels,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating Orchestra issue:', error);
            throw error;
        }
    }

    async listIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<{ number: number; title: string; state: string }[]> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
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
            throw error;
        }
    }

    async findIssueByTitle(title: string): Promise<number | null> {
        if (!this.isConfigured()) return null;
        try {
            const response = await this.client.get(`/projects/${this.projectId}/issues`, {
                params: { state: 'open', search: title }
            });
            const exactMatch = response.data.find((i: any) => i.title.trim().toLowerCase() === title.trim().toLowerCase());
            return exactMatch ? exactMatch.number : null;
        } catch (error) {
            console.warn('Error finding Orchestra issue by title:', error);
            return null;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
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
            throw error;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/comments`, {
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error adding Orchestra comment:', error);
            throw error;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/labels`, {
                labels,
            });
        } catch (error) {
            console.error('Error adding Orchestra labels:', error);
            throw error;
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            const response = await this.client.get(`/projects/${this.projectId}/pull-requests/${pullNumber}/diff`);
            return response.data.diff;
        } catch (error) {
            console.error('Error fetching Orchestra PR diff:', error);
            throw error;
        }
    }

    async mergePullRequest(pullNumber: number): Promise<boolean> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            await this.client.post(`/projects/${this.projectId}/pull-requests/${pullNumber}/merge`);
            return true;
        } catch (error) {
            console.error('Error merging Orchestra PR:', error);
            throw error;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('Orchestra not configured. Missing ORCHESTRA_TOKEN.');
        try {
            const response = await this.client.post(`/projects/${this.projectId}/releases`, {
                tagName,
                name,
                body,
            });
            return response.data.url;
        } catch (error) {
            console.error('Error creating Orchestra release:', error);
            throw error;
        }
    }
}
