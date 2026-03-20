
import { OrchestraPlugin } from '../../types';
import { consultAgentRouted, AgentRole, getAgentIcon } from '../../services/agentService';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { runFacilitatedDiscussion } from '../../services/agentOrchestrator';
import { runDevCycle } from '../dev-cycle';
import { runPRReview } from '../pr-reviewer';
import { generateDocumentation } from '../doc-gen';
import fs from 'fs';
import path from 'path';
import { getFeatureSlugFromTitle, inferLanguageFromText, getExtensionForLanguage } from '../../services/languageUtils';

// Helper to parse PR number from URL
const extractPrNumber = (url: string): number | null => {
    const match = url.match(/\/pull\/(\d+)/) || url.match(/\/merge_requests\/(\d+)/) || url.match(/\/pullrequest\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
};

// Helper to check for existing issues
const getOpenIssues = async (vcs: any): Promise<any[]> => {
    try {
        // Assuming listIssues returns { number, title, state }
        const issues = await vcs.listIssues('open');
        return issues.filter((i: any) => i.state !== 'closed' && i.state !== 'done');
    } catch (e) {
        console.error('Failed to list issues:', e);
        return [];
    }
};

export const runContinuousMode = async (input: string): Promise<void> => {
    console.log(`\n♾️  Starting Orchestra Continuous Development Loop...\n`);
    
    let requirement = '';
    const readmePath = path.resolve(input);

    if (fs.existsSync(readmePath)) {
        console.log(`📖 Monitoring requirements from: ${readmePath}`);
        requirement = fs.readFileSync(readmePath, 'utf-8');
    } else {
        console.log(`⚠️  Requirement file not found at ${readmePath}. Proceeding with empty requirements.`);
    }

    const vcs = VcsFactory.getProvider();
    let loopCount = 0;

    // Infinite Loop
    while (true) {
        try {
            loopCount++;
            console.log(`\n🔄 [Loop ${loopCount}] Checking for work...`);

            // 1. Check for Open Issues
            let openIssues = await getOpenIssues(vcs);
            console.log(`📋 Found ${openIssues.length} open issues.`);

            // 2. If no issues, generate work
            if (openIssues.length === 0) {
                console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Backlog empty. Generating new tasks...`);
                
                // Re-read README in case it changed
                if (fs.existsSync(readmePath)) {
                    requirement = fs.readFileSync(readmePath, 'utf-8');
                }

                // Consult PM for Feature Tasks
                const pmSuggestions = await consultAgentRouted(
                    AgentRole.PRODUCT_MANAGER,
                    'Review the project requirements and current codebase. Suggest 1-2 critical tasks to implement next. If the project is complete, suggest improvements or refactoring. Output JSON list of objects with "title" and "description".',
                    `Requirements:\n${requirement}`
                );

                // Consult DevOps for Pipeline Tasks
                const devopsSuggestions = await consultAgentRouted(
                    AgentRole.DEVOPS_ENGINEER,
                    'Review the CI/CD pipelines (.github/workflows) and project structure. Suggest 1 task to improve automation, security, or build speed. Output JSON list of objects with "title" and "description".',
                    'Project Context: Standard Node.js/TypeScript project.'
                );

                // Parse and create issues
                const newTasks = [];
                try {
                    const pmTasks = JSON.parse(pmSuggestions.match(/\[.*\]/s)?.[0] || '[]');
                    const devopsTasks = JSON.parse(devopsSuggestions.match(/\[.*\]/s)?.[0] || '[]');
                    newTasks.push(...pmTasks, ...devopsTasks);
                } catch (e) {
                    console.error('Failed to parse agent suggestions. Creating fallback task.');
                    newTasks.push({ title: 'Refactor Codebase', description: 'General code quality improvement.' });
                }

                if (newTasks.length === 0) {
                    console.log('😴 No new tasks generated. Sleeping for 10 seconds...');
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }

                for (const task of newTasks) {
                    const labels = ['orchestra-auto'];
                    if (task.title.toLowerCase().includes('pipeline') || task.title.toLowerCase().includes('ci/cd')) {
                        labels.push('assign:devops-agent');
                    } else {
                        labels.push('assign:dev-agent');
                    }
                    
                    const url = await vcs.createIssue(task.title, task.description, labels);
                    console.log(`✨ Created Issue: ${task.title} (${url})`);
                }

                // Refresh issue list
                openIssues = await getOpenIssues(vcs);
            }

            // 3. Process One Issue
            if (openIssues.length > 0) {
                const issue = openIssues[0]; // Pick the first one
                console.log(`\n🚀 Processing Issue #${issue.number}: ${issue.title}`);

                // Fetch full issue details (simulated by using title)
                // Ideally we'd have vcs.getIssue(issue.number)
                
                // Assign Agents
                const isDevOpsTask = issue.title.toLowerCase().includes('pipeline') || issue.title.toLowerCase().includes('ci/cd');
                const primaryAgent = isDevOpsTask ? AgentRole.DEVOPS_ENGINEER : AgentRole.SOFTWARE_ENGINEER;
                
                console.log(`👷 Assigned to: ${getAgentIcon(primaryAgent)} ${primaryAgent}`);

                // Planning
                const plan = await consultAgentRouted(
                    primaryAgent,
                    `Create a plan to resolve this issue: "${issue.title}".`,
                    `Issue #${issue.number}`
                );

                // Execution (Dev Cycle)
                // Determine target file
                let targetFile = '';
                if (isDevOpsTask) {
                    const safeTitle = getFeatureSlugFromTitle(issue.title);
                    targetFile = path.join(process.cwd(), '.github', 'workflows', `${safeTitle}.yml`);
                } else {
                    const safeTitle = getFeatureSlugFromTitle(issue.title);
                    targetFile = path.join(process.cwd(), 'src', 'features', `${safeTitle}.ts`);
                }
                
                // Ensure dir exists
                const dir = path.dirname(targetFile);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                // Run Dev Cycle
                const prUrl = await runDevCycle(
                    `Task: ${issue.title}\nPlan: ${plan}`,
                    targetFile,
                    issue.number
                );

                if (prUrl) {
                    const prNumber = extractPrNumber(prUrl);
                    if (prNumber) {
                        // PR Review
                        console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Starting PR Review for #${prNumber}...`);
                        await runPRReview(prNumber);

                        // Merge
                        console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Merging PR #${prNumber}...`);
                        const merged = await vcs.mergePullRequest(prNumber);

                        if (merged) {
                            console.log(`✅ Issue #${issue.number} Resolved.`);
                            await vcs.addComment(issue.number, `✅ Fixed in PR #${prNumber}`);
                            // Close issue logic would go here if available: await vcs.closeIssue(issue.number);
                            
                            // Documentation
                            if (!isDevOpsTask) {
                                await generateDocumentation(targetFile);
                            }
                        }
                    }
                } else {
                    console.log(`⚠️  No PR created for Issue #${issue.number}. Moving to next.`);
                }
            }
            
            // Sleep briefly to avoid rate limits
            console.log('⏳ Cooling down...');
            await new Promise(r => setTimeout(r, 5000));

        } catch (error) {
            console.error('❌ Error in Continuous Loop:', error);
            console.log('🔄 Retrying in 10 seconds...');
            await new Promise(r => setTimeout(r, 10000));
        }
    }
};

const plugin: OrchestraPlugin = {
    name: 'Continuous Mode',
    description: 'Run Orchestra in a continuous loop, managing issues and DevOps tasks.',
    command: 'continuous',
    args: [
        { name: 'input', description: 'Path to requirements/README file', required: true }
    ],
    action: async (input) => {
        await runContinuousMode(input);
    }
};

export default plugin;
