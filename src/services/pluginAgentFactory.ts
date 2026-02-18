import fs from 'fs';
import path from 'path';
import { AutoBotPlugin } from '../types';
import { consultAgent, AgentRole } from './agentService';
import { extractCodeBlock } from '../utils/codeExtractor';

export type FileAgentPluginConfig = {
    name: string;
    description: string;
    command: string;
    argName?: string;
    argDescription?: string;
    extraArgs?: { name: string; description: string; required?: boolean }[];
    role: AgentRole;
    buildTask: (params: { fileName: string; filePath: string; extraArgs?: any[] }) => string;
    includeContentInContext?: boolean;
    extractCodeBlock?: boolean;
    outputToFile?: (params: {
        originalPath: string;
        originalContent: string;
        aiResponse: string;
        extractedContent?: string;
        fileName: string;
        extraArgs?: any[];
    }) => Promise<void> | void;
};

export const createFileAgentPlugin = (config: FileAgentPluginConfig): AutoBotPlugin => {
    return {
        name: config.name,
        description: config.description,
        command: config.command,
        args: [
            {
                name: config.argName || 'path',
                description: config.argDescription || 'Path to the file',
                required: true
            },
            ...(config.extraArgs || [])
        ],
        action: async (...args: any[]): Promise<void> => {
            const filePath = args[0];
            const extraArgs = args.slice(1);

            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const fileName = path.basename(filePath);

            const task = config.buildTask({ fileName, filePath, extraArgs });
            const context = config.includeContentInContext === false ? '' : content;

            const aiResponse = await consultAgent(config.role, task, context);

            const extractedContent = config.extractCodeBlock
                ? (extractCodeBlock(aiResponse) || aiResponse)
                : undefined;

            if (config.outputToFile) {
                await config.outputToFile({
                    originalPath: filePath,
                    originalContent: content,
                    aiResponse,
                    extractedContent,
                    fileName,
                    extraArgs
                });
            } else {
                console.log(aiResponse);
            }
        }
    };
};
