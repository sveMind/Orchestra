import { AutoBotPlugin } from '../../types';
import { consultAgent, AgentRole } from '../../services/agentService';
import { getPullRequestDiff, addComment } from '../../services/githubService';

export const runPRReview = async (pullNumber: number): Promise<void> => {
    console.log(`\n🕵️‍♂️ Starting PR Review for PR #${pullNumber}...`);

    const diff = await getPullRequestDiff(pullNumber);
    
    if (!diff) {
        console.error('Failed to fetch PR diff.');
        return;
    }

    // Step 1: Product Owner Review (Validation)
    console.log('🤖 Product Owner is reviewing...');
    const poReview = await consultAgent(
        AgentRole.PRODUCT_MANAGER,
        `Review the following code changes (diff) and verify if they align with general product quality standards.
        
        Diff:
        ${diff.substring(0, 3000)}... (truncated if too long)
        
        Output:
        - Assessment of functionality based on code changes.
        - Any obvious missing requirements?
        - Is it "APPROVED" or "NEEDS WORK"?
        `,
        ''
    );

    // Step 2: Developer Review (Code Quality)
    console.log('🤖 Senior Developer is reviewing...');
    const devReview = await consultAgent(
        AgentRole.SOFTWARE_ENGINEER,
        `Review the following code changes (diff) for code quality, bugs, and best practices.
        
        Diff:
        ${diff.substring(0, 3000)}... (truncated if too long)
        
        Output:
        - Code Quality Score (1-10)
        - Potential Bugs or Security Issues
        - Refactoring Suggestions
        - Is it "APPROVED" or "CHANGES REQUESTED"?
        `,
        ''
    );

    const finalReport = `### 🤖 AutoBot PR Review

#### 👔 Product Owner Review
${poReview}

#### 👨‍💻 Tech Review
${devReview}
`;

    await addComment(pullNumber, finalReport);
    console.log('✅ PR Review posted.');
};

const plugin: AutoBotPlugin = {
    name: 'PR Reviewer',
    description: 'Automated PR Review by PM and Dev Agents',
    command: 'pr-review',
    args: [
        { name: 'prNumber', description: 'Pull Request Number', required: true }
    ],
    action: async (prNumber: string) => {
        await runPRReview(Number(prNumber));
    }
};

export default plugin;
