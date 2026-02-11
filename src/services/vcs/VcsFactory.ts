import { VcsProvider, IssueProvider, CodeProvider } from './VcsProvider';
import { GitHubProvider } from './GitHubProvider';
import { GitLabProvider } from './GitLabProvider';
import { AzureDevOpsProvider } from './AzureDevOpsProvider';
import { AutoBotProvider } from './AutoBotProvider';
import { JiraProvider } from './JiraProvider';
import dotenv from 'dotenv';

dotenv.config();

class CompositeProvider implements VcsProvider {
    constructor(private issueProvider: IssueProvider, private codeProvider: CodeProvider) {}

    // IssueProvider methods -> Delegate to issueProvider
    createIssue(title: string, body: string, labels?: string[]): Promise<string | null> {
        return this.issueProvider.createIssue(title, body, labels);
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
        
        // Auto-detect AutoBot service if token is present and no other provider is explicitly set
        if (!vcsType && process.env.AUTOBOT_TOKEN) {
            vcsType = 'autobot';
        }
        vcsType = vcsType || 'github';

        let codeProvider: VcsProvider; // VcsProvider implements CodeProvider
        switch (vcsType.toLowerCase()) {
            case 'autobot':
                console.log('🔌 Using AutoBot Service Provider (VCS)');
                codeProvider = new AutoBotProvider();
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
