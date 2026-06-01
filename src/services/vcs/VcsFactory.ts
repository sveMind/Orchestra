import { VcsProvider, IssueProvider, CodeProvider } from './VcsProvider';
import { GitHubProvider } from './GitHubProvider';
import { GitLabProvider } from './GitLabProvider';
import { AzureDevOpsProvider } from './AzureDevOpsProvider';
import { OrchestraProvider } from './OrchestraProvider';
import { JiraProvider } from './JiraProvider';
import dotenv from 'dotenv';

dotenv.config();

class CompositeProvider implements VcsProvider {
    constructor(private issueProvider: IssueProvider, private codeProvider: CodeProvider) {}

    // IssueProvider methods -> Delegate to issueProvider
    createIssue(title: string, body: string, labels?: string[]): Promise<string | null> {
        return this.issueProvider.createIssue(title, body, labels);
    }
    listIssues(state?: 'open' | 'closed' | 'all'): Promise<{ number: number; title: string; state: string }[]> {
        return this.issueProvider.listIssues(state);
    }
    findIssueByTitle(title: string): Promise<number | null> {
        return this.issueProvider.findIssueByTitle(title);
    }
    addComment(issueNumber: number, body: string): Promise<string | null> {
        return this.issueProvider.addComment(issueNumber, body);
    }
    addLabels(issueNumber: number, labels: string[]): Promise<void> {
        return this.issueProvider.addLabels(issueNumber, labels);
    }

    // CodeProvider methods -> Delegate to codeProvider
    getDefaultBranch(): Promise<string> {
        return this.codeProvider.getDefaultBranch();
    }
    createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null> {
        return this.codeProvider.createPullRequest(title, head, base, body);
    }
    getPullRequestDiff(pullNumber: number): Promise<string | null> {
        return this.codeProvider.getPullRequestDiff(pullNumber);
    }
    mergePullRequest(pullNumber: number): Promise<boolean> {
        return this.codeProvider.mergePullRequest(pullNumber);
    }
    createRelease(tagName: string, name: string, body: string): Promise<string | null> {
        return this.codeProvider.createRelease(tagName, name, body);
    }
}

export class VcsFactory {
    private static instance: VcsProvider;

    public static getProvider(): VcsProvider {
        if (this.instance) return this.instance;

        // 1. Determine Code Provider (VCS)
        let vcsType = process.env.VCS_PROVIDER;
        
        // Auto-detect CI Environment if not explicitly set
        if (!vcsType) {
            if (process.env.GITHUB_ACTIONS) {
                vcsType = 'github';
            } else if (process.env.GITLAB_CI) {
                vcsType = 'gitlab';
            } else if (process.env.TF_BUILD || process.env.AZURE_HTTP_USER_AGENT) {
                vcsType = 'azure';
            }
        }
        
        // Auto-detect Orchestra service if token is present and no other provider is explicitly set
        if (!vcsType && process.env.ORCHESTRA_TOKEN) {
            vcsType = 'orchestra';
        }
        vcsType = vcsType || 'github';

        let codeProvider: VcsProvider; // VcsProvider implements CodeProvider
        switch (vcsType.toLowerCase()) {
            case 'orchestra':
                console.log('🔌 Using Orchestra Service Provider (VCS)');
                codeProvider = new OrchestraProvider();
                break;
            case 'gitlab':
                console.log('🔌 Using GitLab Provider');
                codeProvider = new GitLabProvider();
                break;
            case 'azure':
            case 'azure-devops':
            case 'ado':
                console.log('🔌 Using Azure DevOps Provider');
                codeProvider = new AzureDevOpsProvider();
                break;
            case 'github':
            default:
                console.log('🔌 Using GitHub Provider');
                codeProvider = new GitHubProvider();
                break;
        }

        // 2. Determine Issue Provider
        const issueType = process.env.ISSUE_PROVIDER;
        
        if (issueType === 'jira') {
            console.log('🔌 Using Jira for Issue Tracking');
            const jiraProvider = new JiraProvider();
            this.instance = new CompositeProvider(jiraProvider, codeProvider);
        } else {
            // Default: Use the same provider for both
            this.instance = codeProvider;
        }

        return this.instance;
    }
}
