export interface IssueProvider {
    createIssue(title: string, body: string, labels?: string[]): Promise<string | null>;
    listIssues(state?: 'open' | 'closed' | 'all'): Promise<{ number: number; title: string; state: string }[]>;
    /** Find an open issue by exact title match (to prevent duplicates) */
    findIssueByTitle(title: string): Promise<number | null>;
    addComment(issueNumber: number, body: string): Promise<string | null>;
    addLabels(issueNumber: number, labels: string[]): Promise<void>;
    /** Close an issue. Returns true if the provider reports the operation as successful. */
    closeIssue(issueNumber: number, closeReason?: string): Promise<boolean>;
}

export interface CodeProvider {
    getDefaultBranch(): Promise<string>;
    createPullRequest(title: string, head: string, base: string, body: string): Promise<string | null>;
    getPullRequestDiff(pullNumber: number): Promise<string | null>;
    mergePullRequest(pullNumber: number): Promise<boolean>;
    createRelease(tagName: string, name: string, body: string): Promise<string | null>;
}

export interface VcsProvider extends IssueProvider, CodeProvider {}
