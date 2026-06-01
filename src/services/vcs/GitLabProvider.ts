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
            // Warn but wait for usage to crash
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
        if (!this.isConfigured()) throw new Error('GitLab not configured. Missing GITLAB_TOKEN or GITLAB_PROJECT_ID.');
        try {
            const response = await this.client.get(`/projects/${this.projectId}`);
            return response.data.default_branch;
        } catch (error) {
            console.error('Error fetching GitLab default branch:', error);
            throw error;
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            const response = await this.client.post(`/projects/${this.projectId}/issues`, {
                title,
                description: body,
                labels: labels.join(','),
            });
            return response.data.web_url;
        } catch (error) {
            console.error('Error creating GitLab issue:', error);
            throw error;
        }
    }

    async listIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<{ number: number; title: string; state: string }[]> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            const gitlabState = state === 'all' ? 'all' : (state === 'open' ? 'opened' : 'closed');
            const response = await this.client.get(`/projects/${this.projectId}/issues`, {
                params: { state: gitlabState }
            });
            return response.data.map((issue: any) => ({
                number: issue.iid,
                title: issue.title,
                state: issue.state // opened, closed
            }));
        } catch (error) {
            console.error('Error listing GitLab issues:', error);
            throw error;
        }
    }

    async findIssueByTitle(title: string): Promise<number | null> {
        if (!this.isConfigured()) return null;
        try {
            const response = await this.client.get(`/projects/${this.projectId}/issues`, {
                params: { 
                    state: 'opened',
                    search: title,
                    in: 'title'
                }
            });
            
            const exactMatch = response.data.find((i: any) => i.title.trim().toLowerCase() === title.trim().toLowerCase());
            if (exactMatch) {
                return exactMatch.iid;
            }
            return null;
        } catch (error) {
            console.warn('Error finding GitLab issue by title:', error);
            return null;
        }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
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
            throw error;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            // Note: GitLab uses generic "notes" for issues and MRs. Assuming issueNumber corresponds to an Issue IID.
            const response = await this.client.post(`/projects/${this.projectId}/issues/${issueNumber}/notes`, {
                body,
            });
            return null; 
        } catch (error) {
            console.error('Error adding GitLab comment:', error);
            throw error;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            // GitLab requires PUT to update issue labels (replacing or adding depends on API usage)
            // Simpler: Use add_labels param
            await this.client.put(`/projects/${this.projectId}/issues/${issueNumber}`, {
                add_labels: labels.join(','),
            });
        } catch (error) {
            console.error('Error adding GitLab labels:', error);
            throw error;
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            const response = await this.client.get(`/projects/${this.projectId}/merge_requests/${pullNumber}/diffs`);
            // This returns JSON objects of diffs, not raw diff text.
            // Simplified for now.
            return JSON.stringify(response.data); 
        } catch (error) {
            console.error('Error fetching GitLab MR diff:', error);
            throw error;
        }
    }

    async mergePullRequest(pullNumber: number): Promise<boolean> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            await this.client.put(`/projects/${this.projectId}/merge_requests/${pullNumber}/merge`);
            return true;
        } catch (error) {
            console.error('Error merging GitLab MR:', error);
            throw error;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) throw new Error('GitLab not configured.');
        try {
            const response = await this.client.post(`/projects/${this.projectId}/releases`, {
                tag_name: tagName,
                name,
                description: body,
            });
            return response.data._links.self;
        } catch (error) {
            console.error('Error creating GitLab release:', error);
            throw error;
        }
    }
}
