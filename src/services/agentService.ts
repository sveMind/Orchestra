import { generateCompletion } from './aiService';

export enum AgentRole {
    UX_DESIGNER = 'UX Designer',
    SOFTWARE_ENGINEER = 'Software Engineer',
    PRODUCT_MANAGER = 'Product Manager',
    SCRUM_MASTER = 'Scrum Master',
    ARCHITECT = 'Software Architect',
    SECURITY_ENGINEER = 'Security Engineer',
    QA_ENGINEER = 'QA Automation Engineer',
    TECHNICAL_WRITER = 'Technical Writer',
    DEVOPS_ENGINEER = 'DevOps Engineer'
}

const ROLE_PROMPTS: Record<AgentRole, string> = {
    [AgentRole.UX_DESIGNER]: 'You are an expert UX Designer. Focus on user experience, usability, accessibility, and user flows. Stay strictly within UX guidance; do not modify code, configuration, or external systems.',
    [AgentRole.SOFTWARE_ENGINEER]: 'You are a Senior Software Engineer. Focus on clean, efficient, maintainable, and bug-free code implementation. Respect the given task and context boundaries; do not change unrelated files, features, or requirements and never make assumptions that contradict the provided instructions.',
    [AgentRole.PRODUCT_MANAGER]: 'You are a Product Manager. Focus on business value, requirements, prioritization, and acceptance criteria. Keep your plans short, structured, and easy to scan. Do not redefine product strategy beyond what the requirement and context describe.',
    [AgentRole.SCRUM_MASTER]: 'You are a Scrum Master. Focus on process, agile methodologies, removing blockers, and team coordination. Provide concise lists of tasks or steps instead of long paragraphs. Do not alter technical designs or code-level details.',
    [AgentRole.ARCHITECT]: 'You are a Software Architect. Focus on system design, scalability, patterns, and structural integrity. Summarize your architecture in brief, structured bullet points and stay at architecture level, avoiding low-level implementation decisions unless explicitly requested.',
    [AgentRole.SECURITY_ENGINEER]: 'You are a Security Engineer. Focus on vulnerability analysis, secure coding practices, and risk mitigation. Do not introduce new features or business logic outside the scope of the given context.',
    [AgentRole.QA_ENGINEER]: 'You are a QA Automation Engineer. Focus on writing comprehensive, robust, and maintainable unit and integration tests. Ensure high code coverage and edge case handling while only testing the behaviors described in the requirements and context.',
    [AgentRole.TECHNICAL_WRITER]: 'You are an expert Technical Writer. Focus on clarity, conciseness, and accuracy. Create well-structured documentation, API guides, and READMEs that are easy to understand for the target audience. Do not invent non-existing features or APIs; document only what the context describes.',
    [AgentRole.DEVOPS_ENGINEER]: 'You are a DevOps Engineer. Focus on CI/CD pipelines, infrastructure as code (GitHub Actions, Docker, Kubernetes), and automation efficiency. Suggest and implement improvements to the build, test, and release processes. Ensure pipelines are robust, secure, and fast.'
};

export const AGENT_ICONS: Record<AgentRole, string> = {
    [AgentRole.UX_DESIGNER]: '🎨',
    [AgentRole.SOFTWARE_ENGINEER]: '👨‍💻',
    [AgentRole.PRODUCT_MANAGER]: '👔',
    [AgentRole.SCRUM_MASTER]: '🔄',
    [AgentRole.ARCHITECT]: '🏗️',
    [AgentRole.SECURITY_ENGINEER]: '🛡️',
    [AgentRole.QA_ENGINEER]: '🧪',
    [AgentRole.TECHNICAL_WRITER]: '📝',
    [AgentRole.DEVOPS_ENGINEER]: '🔧'
};

export const getAgentIcon = (role: AgentRole): string => AGENT_ICONS[role] || '🤖';

export const selectAgentRole = async (task: string, context: string = ''): Promise<AgentRole> => {
    const roles = Object.values(AgentRole);
    const shortContext = context.length > 2500 ? context.slice(0, 2500) : context;

    const routerSystem = 'You are a routing system. Output strict JSON only.';
    const routerPrompt = `Choose the best single role for the request.\n\nAllowed roles:\n${roles.map(r => `- ${r}`).join('\n')}\n\nRequest:\n${task}\n\nContext:\n${shortContext}\n\nOutput JSON: {"role":"<one allowed role>"}\n`;

    try {
        const raw = await generateCompletion(routerPrompt, routerSystem);
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : raw) as { role?: string };
        const chosen = parsed.role;
        if (chosen && roles.includes(chosen as AgentRole)) {
            return chosen as AgentRole;
        }
    } catch {
    }

    return AgentRole.SOFTWARE_ENGINEER;
};

export const consultAgent = async (role: AgentRole, task: string, context: string = ''): Promise<string> => {
    console.log(`🤖 Consulting Agent: ${role}...`);
    
    const systemPrompt = `${ROLE_PROMPTS[role]}\n\nYou are collaborating in a multi-agent environment. Be concise and professional. Always respect the task description, do not exceed the requested scope, and avoid making irreversible or destructive decisions.`;
    
    const prompt = `
    Task: ${task}
    
    Context:
    ${context}
    
    Provide your expert input.
    `;

    return await generateCompletion(prompt, systemPrompt);
};

export const consultAgentRouted = async (preferredRole: AgentRole, task: string, context: string = ''): Promise<string> => {
    const mode = (process.env.ORCHESTRA_ROLE_ROUTING || 'auto').toLowerCase();
    if (mode === 'auto') {
        const role = await selectAgentRole(task, context);
        return await consultAgent(role, task, context);
    }
    return await consultAgent(preferredRole, task, context);
};
