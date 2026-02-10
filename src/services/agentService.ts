import { generateCompletion } from './aiService';

export enum AgentRole {
    UX_DESIGNER = 'UX Designer',
    SOFTWARE_ENGINEER = 'Software Engineer',
    PRODUCT_MANAGER = 'Product Manager',
    SCRUM_MASTER = 'Scrum Master',
    ARCHITECT = 'Software Architect',
    SECURITY_ENGINEER = 'Security Engineer',
    QA_ENGINEER = 'QA Automation Engineer',
    TECHNICAL_WRITER = 'Technical Writer'
}

const ROLE_PROMPTS: Record<AgentRole, string> = {
    [AgentRole.UX_DESIGNER]: 'You are an expert UX Designer. Focus on user experience, usability, accessibility, and user flows.',
    [AgentRole.SOFTWARE_ENGINEER]: 'You are a Senior Software Engineer. Focus on clean, efficient, maintainable, and bug-free code implementation.',
    [AgentRole.PRODUCT_MANAGER]: 'You are a Product Manager. Focus on business value, requirements, prioritization, and acceptance criteria.',
    [AgentRole.SCRUM_MASTER]: 'You are a Scrum Master. Focus on process, agile methodologies, removing blockers, and team coordination.',
    [AgentRole.ARCHITECT]: 'You are a Software Architect. Focus on system design, scalability, patterns, and structural integrity.',
    [AgentRole.SECURITY_ENGINEER]: 'You are a Security Engineer. Focus on vulnerability analysis, secure coding practices, and risk mitigation.',
    [AgentRole.QA_ENGINEER]: 'You are a QA Automation Engineer. Focus on writing comprehensive, robust, and maintainable unit and integration tests. Ensure high code coverage and edge case handling.',
    [AgentRole.TECHNICAL_WRITER]: 'You are an expert Technical Writer. Focus on clarity, conciseness, and accuracy. Create well-structured documentation, API guides, and READMEs that are easy to understand for the target audience.'
};

export const consultAgent = async (role: AgentRole, task: string, context: string = ''): Promise<string> => {
    console.log(`🤖 Consulting Agent: ${role}...`);
    
    const systemPrompt = `${ROLE_PROMPTS[role]}\n\nYou are collaborating in a multi-agent environment. Be concise and professional.`;
    
    const prompt = `
    Task: ${task}
    
    Context:
    ${context}
    
    Provide your expert input.
    `;

    return await generateCompletion(prompt, systemPrompt);
};
