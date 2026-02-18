import { AutoBotPlugin } from '../../types';
import { AgentRole } from '../../services/agentService';
import { createFileAgentPlugin } from '../../services/pluginAgentFactory';
import fs from 'fs';
import path from 'path';

export const generateTests = async (filePath: string): Promise<void> => {
    await plugin.action(filePath);
};

const plugin: AutoBotPlugin = createFileAgentPlugin({
    name: 'Test Generator',
    description: 'Generate unit tests for a file',
    command: 'test-gen',
    argName: 'path',
    argDescription: 'File path',
    extraArgs: [
        {
            name: 'framework',
            description: 'Test framework: jest | pytest | c (optional)',
            required: false
        }
    ],
    role: AgentRole.QA_ENGINEER,
    buildTask: ({ fileName, filePath, extraArgs }) => {
        const ext = path.extname(filePath).toLowerCase();
        const rawFramework = extraArgs && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : '';

        let framework: 'jest' | 'pytest' | 'c' = 'jest';

        if (rawFramework.includes('py')) {
            framework = 'pytest';
        } else if (rawFramework === 'c') {
            framework = 'c';
        } else if (!rawFramework) {
            if (ext === '.py') {
                framework = 'pytest';
            } else if (ext === '.c' || ext === '.h') {
                framework = 'c';
            } else {
                framework = 'jest';
            }
        }

        if (framework === 'pytest') {
            return `Generate pytest unit tests for the following Python code.
Include edge cases.
Use idiomatic pytest style (functions or classes as appropriate).
Return ONLY the FULL test file content, with no explanations or markdown formatting.
File Name: ${fileName}
`;
        }

        if (framework === 'c') {
            return `Generate C unit tests for the following C code.
Use plain C tests with a main function that runs all tests and reports failures via assertions.
Do not rely on external testing libraries.
Return ONLY the FULL test file content, with no explanations or markdown formatting.
File Name: ${fileName}
`;
        }

        return `Generate Jest unit tests for the following JavaScript/TypeScript code.
Use modern Jest syntax.
Include edge cases.
Return ONLY the FULL test file content, with no explanations or markdown formatting.
File Name: ${fileName}
`;
    },
    extractCodeBlock: true,
    outputToFile: ({ originalPath, extractedContent, aiResponse, extraArgs }) => {
        const finalContent = extractedContent || aiResponse;
        if (!finalContent) {
            console.warn('Failed to obtain test code from AI response.');
            console.log('AI Response:', aiResponse);
            return;
        }

        const ext = path.extname(originalPath);
        const rawFramework = extraArgs && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : '';
        const lowerExt = ext.toLowerCase();

        let framework: 'jest' | 'pytest' | 'c' = 'jest';

        if (rawFramework.includes('py')) {
            framework = 'pytest';
        } else if (rawFramework === 'c') {
            framework = 'c';
        } else if (!rawFramework) {
            if (lowerExt === '.py') {
                framework = 'pytest';
            } else if (lowerExt === '.c' || lowerExt === '.h') {
                framework = 'c';
            } else {
                framework = 'jest';
            }
        }

        let testFile: string;

        if (framework === 'pytest') {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext);
            testFile = path.join(dir, `test_${base}${ext}`);
        } else if (framework === 'c') {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext || '.c');
            const finalExt = lowerExt || '.c';
            testFile = path.join(dir, `${base}_test${finalExt}`);
        } else {
            testFile = originalPath.replace(ext, `.test${ext}`);
        }

        fs.writeFileSync(testFile, finalContent);
        console.log(`✅ Tests generated (${framework}): ${testFile}`);
    }
});

export default plugin;
