import { VcsProvider } from './VcsProvider';
import * as azdev from 'azure-devops-node-api';
import * as wa from 'azure-devops-node-api/WorkItemTrackingApi';
import * as ga from 'azure-devops-node-api/GitApi';
import { JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import dotenv from 'dotenv';

dotenv.config();

export class AzureDevOpsProvider implements VcsProvider {
    private connection: azdev.WebApi | null = null;
    private workItemApi: wa.IWorkItemTrackingApi | null = null;
    private gitApi: ga.IGitApi | null = null;
    
    private orgUrl: string | undefined;
    private token: string | undefined;
    private project: string | undefined;
    private repoId: string | undefined; // Usually repo name or ID

    constructor() {
        this.orgUrl = process.env.AZURE_ORG_URL;
        this.token = process.env.AZURE_PERSONAL_ACCESS_TOKEN;
        this.project = process.env.AZURE_PROJECT;
        this.repoId = process.env.AZURE_REPO;

        if (!this.token || !this.orgUrl) {
            console.warn('Warning: AZURE_PERSONAL_ACCESS_TOKEN or AZURE_ORG_URL is not set.');
        } else {
            const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
            this.connection = new azdev.WebApi(this.orgUrl, authHandler);
        }
    }

    private async init() {
        if (this.connection && !this.workItemApi) {
            this.workItemApi = await this.connection.getWorkItemTrackingApi();
            this.gitApi = await this.connection.getGitApi();
        }
    }

    private isConfigured(): boolean {
        return !!(this.connection && this.project && this.repoId);
    }

    async getDefaultBranch(): Promise<string> {
        if (!this.isConfigured()) return 'main';
        await this.init();
        try {
            // Azure Repos usually use 'main' or 'master'
            const repo = await this.gitApi?.getRepository(this.repoId!, this.project);
            return repo?.defaultBranch?.replace('refs/heads/', '') || 'main';
        } catch (error) {
            console.error('Error fetching Azure default branch:', error);
            return 'main';
        }
    }

    async createIssue(title: string, body: string, labels: string[] = []): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] Work Item Created: ${title}`);
            return 'https://dev.azure.com/mock/project/_workitems/edit/123';
        }
        await this.init();
        try {
            const patchDocument: JsonPatchDocument = [
                {
                    op: 'add',
                    path: '/fields/System.Title',
                    value: title,
                },
                {
                    op: 'add',
                    path: '/fields/System.Description',
                    value: body,
                },
                {
                    op: 'add',
                    path: '/fields/System.Tags',
                    value: labels.join('; '),
                }
            ];
            // "Task" or "User Story" depends on process template. defaulting to Task.
            const workItem = await this.workItemApi?.createWorkItem({}, patchDocument, this.project!, 'Task');
            return workItem?._links?.html?.href || null;
        } catch (error) {
            console.error('Error creating Azure Work Item:', error);
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
         await this.init();
         try {
             let whereClause = "[System.TeamProject] = @project AND [System.WorkItemType] = 'Task'";
             
             if (state === 'open') {
                 whereClause += " AND [System.State] NOT IN ('Closed', 'Done', 'Removed', 'Cut')";
             } else if (state === 'closed') {
                 whereClause += " AND [System.State] IN ('Closed', 'Done', 'Removed', 'Cut')";
             }
             
             const wiql = `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE ${whereClause}`;
             
             const result = await this.workItemApi?.queryByWiql({ query: wiql }, { project: this.project });
             
             if (!result?.workItems || result.workItems.length === 0) {
                 return [];
             }
             
             const ids = result.workItems.map(wi => wi.id).filter((id): id is number => id !== undefined);
             if (ids.length === 0) return [];

             const workItems = await this.workItemApi?.getWorkItems(ids, ['System.Id', 'System.Title', 'System.State']);
             
             return (workItems || []).map(wi => ({
                 number: wi.id!,
                 title: wi.fields?.['System.Title'] || 'No Title',
                 state: wi.fields?.['System.State'] || 'Unknown'
             }));
         } catch (error) {
             console.error('Error listing Azure Work Items:', error);
             return [];
         }
    }

    async createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] PR Created: ${title}`);
            return 'https://dev.azure.com/mock/project/_git/repo/pullrequest/456';
        }
        await this.init();
        try {
            const pr = await this.gitApi?.createPullRequest({
                sourceRefName: `refs/heads/${head}`,
                targetRefName: `refs/heads/${base}`,
                title: title,
                description: body,
            }, this.repoId!, this.project);
            return (pr as any)?.repository?.webUrl ? `${(pr as any).repository.webUrl}/pullrequest/${pr?.pullRequestId}` : null;
        } catch (error) {
            console.error('Error creating Azure PR:', error);
            return null;
        }
    }

    async addComment(issueNumber: number, body: string): Promise<string | null> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] Comment added to Work Item #${issueNumber}: ${body.substring(0, 50)}...`);
            return 'https://dev.azure.com/mock/project/_workitems/edit/123';
        }
        await this.init();
        try {
            const patchDocument: JsonPatchDocument = [
                {
                    op: 'add',
                    path: '/fields/System.History',
                    value: body,
                }
            ];
            const workItem = await this.workItemApi?.updateWorkItem({}, patchDocument, issueNumber, this.project!);
            return workItem?._links?.html?.href || null;
        } catch (error) {
            console.error('Error adding comment to Azure Work Item:', error);
            return null;
        }
    }

    async addLabels(issueNumber: number, labels: string[]): Promise<void> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] Added tags to #${issueNumber}: ${labels.join(', ')}`);
            return;
        }
        await this.init();
        try {
            // Azure uses "Tags" field, semi-colon separated. Need to get existing tags first to append.
            const workItem = await this.workItemApi?.getWorkItem(issueNumber, ['System.Tags']);
            const existingTags = workItem?.fields?.['System.Tags'] || '';
            const newTags = labels.filter(l => !existingTags.includes(l)).join('; ');
            
            if (newTags) {
                const patchDocument: JsonPatchDocument = [
                    {
                        op: 'add',
                        path: '/fields/System.Tags',
                        value: existingTags ? `${existingTags}; ${newTags}` : newTags,
                    }
                ];
                await this.workItemApi?.updateWorkItem({}, patchDocument, issueNumber, this.project!);
            }
        } catch (error) {
            console.error('Error adding tags to Azure Work Item:', error);
        }
    }

    async getPullRequestDiff(pullNumber: number): Promise<string | null> {
        // Azure API for diffs is complex (commit based). Returning mock or simplified.
        return 'Azure DevOps diff retrieval not fully implemented in this version.';
    }

    async mergePullRequest(pullNumber: number): Promise<boolean> {
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] Merged PR #${pullNumber}`);
            return true;
        }
        await this.init();
        try {
            // Status 3 is Completed
            await this.gitApi?.updatePullRequest(
                { status: 3 as any }, 
                this.repoId!, 
                pullNumber,
                this.project
            );
            return true;
        } catch (error) {
            console.error('Error merging Azure PR:', error);
            return false;
        }
    }

    async createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        // Azure Pipelines usually handles releases, or Tags in Repos.
        // We can create a Tag.
        if (!this.isConfigured()) {
            console.log(`[MOCK AZURE] Tag Created: ${name} (${tagName})`);
            return 'https://dev.azure.com/mock/project/_git/repo/tags';
        }
        // Implementation of Git Tag creation via API is omitted for brevity but possible.
        return null;
    }
}
