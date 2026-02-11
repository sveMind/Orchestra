import { VcsProvider } from './VcsProvider';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class GitLabProvider implements VcsProvider {
    private client: AxiosInstance;
    private projectId: string | undefined;
    private token: string | undefined;
    private baseUrl: string;

    constructor() {
        this.token = process.env.GITLAB_TOKEN;
        this.projectId = process.env.GITLAB_PROJECT_ID;
        this.baseUrl = process.env.GITLAB_URL || 'https://gitlab.com/api/v4';

        if (!this.token) {
            console.warn('Warning: GITLAB_TOKEN is not set. GitLab features will not work.');
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'PRIVATE-TOKEN': this.token || '',
            },
        });
    }

    private isConfigured(): boolean {
        return !!(this.token && this.projectId);
    }

    async getDefaultBranch(): Promise<string> {
        if (!this.isConfigured()) return 'main';
        try {
            const response = await this.client.get(`/projects/${this.projectId}`);
            return response.data.default_branch;
        } catch (error) {
            console.error('Error fetching GitLab default branch:', error);
            return 'main';
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITLAB] Issue Created: ${title}`);
            return 'https://gitlab.com/mock/repo/-/issues/123';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues`, {
                title,
                description: body,
                labels: labels.join(','),
            });
            return response.data.web_url;
        } catch (error) {
            console.error('Error creating GitLab issue:', error);
            return null;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITLAB] Merge Request Created: ${title} (${head} -> ${base})`);
            return 'https://gitlab.com/mock/repo/-/merge_requests/456';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/merge_requests`, {
                source_branch: head,
                target_branch: base,
                title,
                description: body,
            });
            return response.data.web_url;
        } catch (error) {
            console.error('Error creating GitLab MR:', error);
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITLAB] Comment added to #${issueNumber}: ${body.substring(0, 50)}...`);
            return 'https://gitlab.com/mock/repo/-/issues/123#note_456';
        }
        try {
            // Note: GitLab uses generic "notes" for issues and MRs. Assuming issueNumber corresponds to an Issue IID.
            const response = await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/notes`, {
                body,
            });
            return `https://gitlab.com/mock/repo/-/issues/${issueNumber}#note_${response.data.id}`;
        } catch (error) {
            console.error('Error adding GitLab comment:', error);
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITLAB] Added labels to #${issueNumber}: ${labels.join(', ')}`);
            return;
        }
        try {
            // GitLab requires PUT to update issue labels (replacing or adding depends on API usage)
            // Simpler: Use add_labels param
            await this.client.put(`/projects/${this.projectId}/issues/${issueNumber}`, {
                add_labels: labels.join(','),
            });
        } catch (error) {
            console.error('Error adding GitLab labels:', error);
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) {
            return 'diff --git a/src/index.ts b/src/index.ts...';
        }
        try {
            const response = await this.client.get(`/projects/${this.projectId}/merge_requests/${pullNumber}/diffs`);
            // This returns JSON objects of diffs, not raw diff text.
            // Simplified for now.
            return JSON.stringify(response.data); 
        } catch (error) {
            console.error('Error fetching GitLab MR diff:', error);
            return null;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK GITLAB] Release Created: ${name} (${tagName})`);
            return 'https://gitlab.com/mock/repo/-/releases/v1.0.0';
        }
        try {
            const response = await this.client.post(`/projects/${this.projectId}/releases`, {
                tag_name: tagName,
                name,
                description: body,
            });
            return response.data._links.self;
        } catch (error) {
            console.error('Error creating GitLab release:', error);
            return null;
        }
    }
}
