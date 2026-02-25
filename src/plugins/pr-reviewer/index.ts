import { OrchestraPlugin } from '../../types';
import { consultAgent, AgentRole } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { runParallelAgents, runFacilitatedDiscussion } from '../../services/agentOrchestrator';

export const runPRReview = async (pullNumber: number): Promise<void> => {
    console.log(`\n🕵️‍♂️ Starting PR Review for PR #${pullNumber}...`);

    const vcs = VcsFactory.getProvider();
    const diff = await vcs.getPullRequestDiff(pullNumber);
    
    if (!diff) {
        console.error('Failed to fetch PR diff.');
        return;
    }

    const truncatedDiff = diff.substring(0, 3000);

    console.log('🤖 Product Owner, Senior Developer, and Security Engineer are reviewing in parallel...');
    const [poExchange, devExchange, secExchange] = await runParallelAgents([
        {
            role: AgentRole.PRODUCT_MANAGER,
            task: `Review the following code changes (diff) and verify if they align with general product quality standards.
            
            Diff:
            ${truncatedDiff}
            
            Output:
            - Assessment of functionality based on code changes.
            - Any obvious missing requirements?
            - Is it "APPROVED" or "NEEDS WORK"?
            `,
            context: ''
        },
        {
            role: AgentRole.SOFTWARE_ENGINEER,
            task: `Review the following code changes (diff) for code quality, bugs, and best practices.
            
            Diff:
            ${truncatedDiff}
            
            Output:
            - Code Quality Score (1-10)
            - Potential Bugs or Security Issues
            - Refactoring Suggestions
            - Is it "APPROVED" or "CHANGES REQUESTED"?
            `,
            context: ''
        },
        {
            role: AgentRole.SECURITY_ENGINEER,
            task: `Review the following code changes (diff) for security vulnerabilities.
            
            Diff:
            ${truncatedDiff}
            
            Output:
            - Security Risk Assessment (Low/Medium/High)
            - Vulnerabilities found
            - Mitigation suggestions
            - Is it "APPROVED" or "CHANGES REQUESTED"?
            `,
            context: ''
        }
    ]);

    const teamSummary = await runFacilitatedDiscussion(
        AgentRole.SCRUM_MASTER,
        [poExchange, devExchange, secExchange],
        'Pull Request review and readiness decision'
    );

    const finalReport = `### 🤖 Orchestra PR Review

#### 👔 Product Owner Review
${poExchange.message}

#### 👨‍💻 Tech Review
${devExchange.message}

#### 🛡️ Security Review
${secExchange.message}

#### 🧠 Team Summary
${teamSummary}
`;

    await vcs.addComment(pullNumber, finalReport);
    console.log('✅ PR Review posted.');
};

const plugin: OrchestraPlugin = {
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
