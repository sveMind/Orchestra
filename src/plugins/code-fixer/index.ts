import { AutoBotPlugin } from '../../types';
import fs from 'fs';
import { consultAgent, AgentRole } from '../../services/agentService';
import { extractCodeBlock } from '../../utils/codeExtractor';

export const fixCode = async (filePath: string, instruction?: string): Promise<void> => {
  console.log(`Analyzing ${filePath} for fixes...`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const task = instruction || 'Fix any bugs, logical errors, or code smells in the following code.';

    // Step 1: Software Engineer analyzes and fixes
    const fixSuggestion = await consultAgent(
        AgentRole.SOFTWARE_ENGINEER,
        `Task: ${task}
        
        Instructions:
        1. Analyze the code provided below.
        2. Apply the necessary fixes or refactoring based on the task.
        3. Output the FULL corrected file content.
        4. Wrap the code in a markdown code block (e.g., \`\`\`typescript ... \`\`\`).
        5. Do not output partial code.
        `,
        content
    );

    const fixedCode = extractCodeBlock(fixSuggestion);

    if (fixedCode) {
        if (fixedCode === content.trim()) {
            console.log('No changes needed.');
            return;
        }

        const backupPath = `${filePath}.bak`;
        fs.writeFileSync(backupPath, content);
        console.log(`\nOriginal file backed up to: ${backupPath}`);
        
        fs.writeFileSync(filePath, fixedCode);
        console.log(`✅ Applied fix to: ${filePath}`);
    } else {
        console.warn('Could not extract code from AI response.');
        console.log('AI Response:', fixSuggestion);
    }

  } catch (error) {
    console.error('Error applying fix:', error);
  }
};

const plugin: AutoBotPlugin = {
  name: 'Code Fixer',
  description: 'Apply AI-driven fixes or refactoring to a file',
  command: 'fix',
  args: [
    { name: 'path', description: 'Path to the file to fix', required: true },
    { name: 'instruction', description: 'Specific instruction (e.g., "Fix the null pointer exception")', required: false }
  ],
  action: async (path: string, instruction?: string) => {
    // Commander passes args differently if variadic or optional.
    // If instruction is the command object, it means it wasn't provided.
    if (typeof instruction === 'object') instruction = undefined;
    await fixCode(path, instruction);
  }
};

export default plugin;
