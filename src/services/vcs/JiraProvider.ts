import { IssueProvider } from './VcsProvider';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class JiraProvider implements IssueProvider {
    private client: AxiosInstance;
    private host: string;
    private email: string;
    private apiToken: string;
    private projectKey: string;

    constructor() {
        this.host = process.env.JIRA_HOST || '';
        this.email = process.env.JIRA_EMAIL || '';
        this.apiToken = process.env.JIRA_API_TOKEN || '';
        this.projectKey = process.env.JIRA_PROJECT_KEY || '';

        if (this.host && (!this.email || !this.apiToken || !this.projectKey)) {
             console.warn('Warning: JIRA_HOST is set but missing JIRA_EMAIL, JIRA_API_TOKEN, or JIRA_PROJECT_KEY.');
        }

        const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');

        this.client = axios.create({
            baseURL: `https://${this.host}/rest/api/3`,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
    }

    private isConfigured(): boolean {
        return !!(this.host && this.email && this.apiToken && this.projectKey);
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK JIRA] Issue Created: ${title} in project ${this.projectKey || 'MOCK'}`);
            return `https://${this.host || 'mock.atlassian.net'}/browse/${this.projectKey || 'MOCK'}-123`;
        }
        try {
            const response = await this.client.post('/issue', {
                fields: {
                    project: {
                        key: this.projectKey,
                    },
                    summary: title,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: body,
                                    },
                                ],
                            },
                        ],
                    },
                    issuetype: {
                        name: 'Task',
                    },
                    labels: labels,
                },
            });
            return `https://${this.host}/browse/${response.data.key}`;
        } catch (error) {
            console.error('Error creating Jira issue:', error);
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        // Note: Jira uses string keys (PROJECT-123), but interface expects number.
        // We will assume issueNumber is the ID part if purely numeric, or we might need to change interface.
        // For now, assuming standard numeric ID part isn't enough for Jira key "PROJ-123".
        // Limitation: AutoBot currently assumes integer issue IDs (GitHub/GitLab style).
        // Workaround: We'll construct the key using the project key.
        
        const issueKey = `${this.projectKey}-${issueNumber}`;

        if (!this.isConfigured()) {
            console.log(`[MOCK JIRA] Comment added to ${issueKey}: ${body.substring(0, 50)}...`);
            return `https://${this.host || 'mock.atlassian.net'}/browse/${issueKey}`;
        }
        try {
            const response = await this.client.post(`/issue/${issueKey}/comment`, {
                body: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: body,
                                },
                            ],
                        },
                    ],
                },
            });
            return response.data.self; // Jira API returns self link, not web link directly in all cases
        } catch (error) {
            console.error('Error adding Jira comment:', error);
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        const issueKey = `${this.projectKey}-${issueNumber}`;
        if (!this.isConfigured()) {
            console.log(`[MOCK JIRA] Added labels to ${issueKey}: ${labels.join(', ')}`);
            return;
        }
        try {
            await this.client.put(`/issue/${issueKey}`, {
                fields: {
                    labels: labels
                }
            });
        } catch (error) {
            console.error('Error adding Jira labels:', error);
        }
    }
}
