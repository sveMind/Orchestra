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

export const runDemoMode = async (input: string): Promise<void> => {
    console.log(`\n🎬 Starting Orchestra Demo Workflow...\n`);
    
    let requirement = input;
    
    // Simulate separate repository creation if input is not a file
    if (!fs.existsSync(input)) {
        console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Creating detailed project description in a separate repository...`);
        
        // 1. Generate detailed requirements from high-level input
        const detailedReadme = await consultAgentRouted(
            AgentRole.PRODUCT_MANAGER,
            `Create a detailed README.md for a software project based on this high-level request: "${input}".
            Include:
            - Project Title & Description
            - Key Features
            - Technical Stack Recommendations
            - User Stories
            - Acceptance Criteria`,
            ''
        );

        // 2. Create simulated repo/workspace
        const workspaceDir = path.join(process.cwd(), 'demo-workspace');
        if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
        
        const readmePath = path.join(workspaceDir, 'README.md');
        fs.writeFileSync(readmePath, detailedReadme);
        
        console.log(`📄 Created project description at: ${readmePath}`);
        requirement = detailedReadme;
    } else {
        console.log(`📖 Reading requirements from: ${input}`);
        requirement = fs.readFileSync(input, 'utf-8');
    }

    const vcs = VcsFactory.getProvider();
    
    // --- Step 1: Project Planning ---
    console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} [Project Planner] Initiating Project Planning...`);

    const pmAnalysis = await consultAgentRouted(
        AgentRole.PRODUCT_MANAGER,
        'Analyze this requirement. Break it down into clear acceptance criteria and business value.',
        requirement
    );
    console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} PM Analysis:\n${pmAnalysis.substring(0, 200)}...`);

    const architectDesign = await consultAgentRouted(
        AgentRole.ARCHITECT,
        'Based on the requirements, outline the technical architecture.',
        pmAnalysis
    );
    console.log(`\n${getAgentIcon(AgentRole.ARCHITECT)} Architecture:\n${architectDesign.substring(0, 200)}...`);

    // Team Huddle
    console.log(`\n👥 Gathering Team Input...`);
    const [devInput, qaInput] = await Promise.all([
        consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, 'Identify implementation challenges.', `${pmAnalysis}\n${architectDesign}`),
        consultAgentRouted(AgentRole.QA_ENGINEER, 'Outline testing strategy. Ensure 80% code coverage.', pmAnalysis)
    ]);

    const teamDiscussion = await runFacilitatedDiscussion(
        AgentRole.SCRUM_MASTER,
        [
            { role: AgentRole.PRODUCT_MANAGER, message: pmAnalysis },
            { role: AgentRole.ARCHITECT, message: architectDesign },
            { role: AgentRole.SOFTWARE_ENGINEER, message: devInput },
            { role: AgentRole.QA_ENGINEER, message: qaInput }
        ],
        'Project planning and task breakdown'
    );

    // Create Tasks
    const tasksRaw = await consultAgentRouted(
        AgentRole.SCRUM_MASTER,
        'Break this project down into a list of actionable tasks. Output as a JSON list of objects with "title" and "description" fields. No extra text.',
        `Requirements:\n${pmAnalysis}\n\nArchitecture:\n${architectDesign}\n\nDiscussion:\n${teamDiscussion}`
    );

    let tasks: { title: string; description: string }[] = [];
    try {
        const jsonMatch = tasksRaw.match(/\[.*\]/s);
        if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0]);
        } else {
            // Fallback parsing
            tasks = tasksRaw.split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => ({ 
                    title: line.replace('-', '').trim(), 
                    description: 'Implement this task based on project plan.' 
                }));
        }
    } catch (e) {
        console.error('Failed to parse tasks JSON. Using simplified fallback.');
        tasks = [{ title: 'Implement Core Features', description: 'Implement the main requirements.' }];
    }

    console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Generated ${tasks.length} tasks.`);

    // Create Project Plan Issue
    const planBody = `# Project Plan\n\n## Requirements\n${pmAnalysis}\n\n## Architecture\n${architectDesign}\n\n## Tasks\n${tasks.map(t => `- ${t.title}`).join('\n')}`;
    const planUrl = await vcs.createIssue(`Project Plan: ${input.substring(0, 30)}...`, planBody, ['orchestra-plan']);
    console.log(`📅 Project Plan Issue Created: ${planUrl}`);

    // --- Step 2: Execution Loop ---
    for (const [index, task] of tasks.entries()) {
        console.log(`\n---------------------------------------------------`);
        console.log(`🔄 Processing Task ${index + 1}/${tasks.length}: ${task.title}`);
        console.log(`---------------------------------------------------`);

        // 1. Create Issue
        // Assign to agents with tags (using labels as proxy for assignment)
        const labels = ['orchestra-task', 'assign:dev-agent', 'assign:qa-agent'];
        const issueUrl = await vcs.createIssue(task.title, task.description, labels);
        const issueNumber = issueUrl ? parseInt(issueUrl.split('/').pop() || '0', 10) : 0; // Simplified extraction
        
        console.log(`📝 Issue Created: #${issueNumber} - ${task.title}`);
        console.log(`🏷️  Assigned to: ${getAgentIcon(AgentRole.SOFTWARE_ENGINEER)} Dev, ${getAgentIcon(AgentRole.QA_ENGINEER)} QA via tags: ${labels.join(', ')}`);

        // 2. Develop & Test
        const safeTitle = getFeatureSlugFromTitle(task.title);
        const languageHint = inferLanguageFromText(`${task.title}\n${task.description}`);
        const fileExt = getExtensionForLanguage(languageHint);
        const targetFile = path.join(process.cwd(), 'src', 'features', `${safeTitle}${fileExt}`);
        
        // Ensure dir exists
        const dir = path.dirname(targetFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const robustTask = `Task: ${task.title}
Description: ${task.description}
Architecture: ${architectDesign.substring(0, 500)}
Constraint: Ensure all new code has unit tests with at least 80% coverage.
Constraint: Ensure seamless integration with existing components.`;

        const prUrl = await runDevCycle(
            robustTask, 
            targetFile, 
            issueNumber
        );

        if (!prUrl) {
            console.error(`❌ Failed to generate PR for task: ${task.title}. Skipping.`);
            continue;
        }

        const prNumber = extractPrNumber(prUrl);
        if (!prNumber) {
            console.error(`❌ Failed to parse PR number from URL: ${prUrl}. Skipping review.`);
            continue;
        }

        // 3. PR Review
        console.log(`\n${getAgentIcon(AgentRole.PRODUCT_MANAGER)} Starting PR Review for #${prNumber}...`);
        
        // Request Scrum Master to add reviewers (Simulated by log/comment)
        console.log(`${getAgentIcon(AgentRole.SCRUM_MASTER)} [Scrum Master] Adding additional developer reviewers as requested...`);
        await vcs.addComment(prNumber, `${getAgentIcon(AgentRole.SCRUM_MASTER)} Added additional reviewers: Senior Dev Agent, Security Agent.`);
        
        // Run the actual review logic
        await runPRReview(prNumber);

        // 4. Merge
        console.log(`\n${getAgentIcon(AgentRole.SCRUM_MASTER)} Merging PR #${prNumber}...`);
        const merged = await vcs.mergePullRequest(prNumber);
        
        if (merged) {
            console.log(`✅ PR #${prNumber} Merged Successfully.`);
            await vcs.addComment(issueNumber, `✅ Task Complete. PR #${prNumber} merged.`);

            // 5. Documentation
            console.log(`\n${getAgentIcon(AgentRole.TECHNICAL_WRITER)} Generating Documentation...`);
            await generateDocumentation(targetFile);
            console.log(`📚 Documentation updated for ${targetFile}`);
        } else {
            console.error(`❌ Failed to merge PR #${prNumber}.`);
        }
    }

    console.log(`\n🎉 Product Development Workflow Completed!`);
};

const plugin: OrchestraPlugin = {
    name: 'Demo Mode',
    description: 'Runs the full Orchestra Demo Workflow: Plan -> Code -> Review -> Merge',
    command: 'demo',
    args: [
        { name: 'input', description: 'Path to requirements file (README.md) or description string', required: true }
    ],
    action: async (input: string) => {
        await runDemoMode(input);
    }
};

export default plugin;
