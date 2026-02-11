export interface IssueProvider {
    createIssue(title: string, body: string, labels?: string[]): Promise<string | null>;
    addComment(issueNumber: number, body: string): Promise<string | null>;
    addLabels(issueNumber: number, labels: string[]): Promise<void>;
}

export interface CodeProvider {
    getDefaultBranch(): Promise<string>;
    createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null>;
    getPullRequestDiff(pullNumber: number): Promise<string | null>;
    createRelease(tagName: string, name: string, body: string): Promise<string | null>;
}

export interface VcsProvider extends IssueProvider, CodeProvider {}
