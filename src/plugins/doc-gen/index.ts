import { AutoBotPlugin } from '../../types';
import { consultAgent, AgentRole } from '../../services/agentService';
import fs from 'fs';
import path from 'path';

export const generateDocumentation = async (filePath: string): Promise<void> => {
  console.log(`Generating documentation for: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const docContent = await consultAgent(
        AgentRole.TECHNICAL_WRITER,
        `Analyze the following content and improve the documentation. 
        If it's code, generate a markdown API reference or usage guide. 
        If it's a markdown file (like README), improve the structure, clarity, and completeness.
        
        File Name: ${fileName}
        `,
        content
    );

    console.log('\n--- Generated Documentation ---\n');
    console.log(docContent);

    // Optional: Write to file
    // const docFileName = `${fileName}.generated.md`;
    // fs.writeFileSync(docFileName, docContent);
    // console.log(`\nSaved to ${docFileName}`);

  } catch (error) {
    console.error('Error generating documentation:', error);
  }
};

const plugin: AutoBotPlugin = {
  name: 'Documentation Generator',
  description: 'Generate or improve documentation using a Technical Writer agent',
  command: 'doc-gen',
  args: [
    { name: 'path', description: 'Path to the file to document', required: true }
  ],
  action: async (path: string) => {
    await generateDocumentation(path);
  }
};

export default plugin;
