import { AutoBotPlugin } from '../../types';
import { consultAgent, AgentRole } from '../../services/agentService';
import { extractCodeBlock } from '../../utils/codeExtractor';
import fs from 'fs';
import path from 'path';

export const generateTests = async (filePath: string): Promise<void> => {
    console.log(`Generating tests for: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const testContent = await consultAgent(
        AgentRole.QA_ENGINEER,
        `Generate unit tests for the following code. 
        Use Jest syntax. 
        Include edge cases.
        Return the FULL test file content wrapped in a markdown code block.
        File Name: ${fileName}
        `,
        content
    );

    const code = extractCodeBlock(testContent);
    if (code) {
        // Simple logic to determine test file name
        // e.g., utils.ts -> utils.test.ts
        const ext = path.extname(filePath);
        const testFile = filePath.replace(ext, `.test${ext}`);
        
        fs.writeFileSync(testFile, code);
        console.log(`✅ Tests generated: ${testFile}`);
    } else {
        console.warn('Failed to extract test code from AI response.');
        console.log('AI Response:', testContent);
    }
};

const plugin: AutoBotPlugin = {
    name: 'Test Generator',
    description: 'Generate unit tests for a file',
    command: 'test-gen',
    args: [
        { name: 'path', description: 'File path', required: true }
    ],
    action: async (path: string) => {
        await generateTests(path);
    }
};

export default plugin;
