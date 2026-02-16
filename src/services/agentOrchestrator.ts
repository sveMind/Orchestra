import { AgentRole, consultAgent } from './agentService';

export type AgentExchange = {
    role: AgentRole;
    message: string;
};

export const runParallelAgents = async (
    exchanges: { role: AgentRole; task: string; context: string }[]
): Promise<AgentExchange[]> => {
    const promises = exchanges.map(async ({ role, task, context }) => {
        const message = await consultAgent(role, task, context);
        return { role, message };
    });
    return Promise.all(promises);
};

export const runFacilitatedDiscussion = async (
    facilitator: AgentRole,
    participants: AgentExchange[],
    topic: string
): Promise<string> => {
    const transcript = participants
        .map(
            (p, index) =>
                `${index + 1}. ${p.role}:\n${p.message}`
        )
        .join('\n\n');

    const task = `Facilitate a concise, structured discussion between these agents about: "${topic}". Each agent has already shared their view. Summarize areas of agreement, disagreements, and produce a short "Team Agreement" that they all would sign off on. Output only the final summary and Team Agreement, no raw transcript.`;

    const context = `Agent Inputs:\n\n${transcript}`;

    return await consultAgent(facilitator, task, context);
};

export const runMergeCandidates = async (
    role: AgentRole,
    taskDescription: string,
    candidates: string[],
    language: string
): Promise<string> => {
    const formatted = candidates
        .map(
            (code, index) =>
                `Implementation ${index + 1}:\n\`\`\`${language}\n${code}\n\`\`\``
        )
        .join('\n\n');

    const task = `${taskDescription}\n\nImplementations:\n\n${formatted}`;

    return await consultAgent(role, task, '');
};

