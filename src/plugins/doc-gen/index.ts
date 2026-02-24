import { OrchestraPlugin } from '../../types';
import { AgentRole } from '../../services/agentService';
import { createFileAgentPlugin } from '../../services/pluginAgentFactory';

export const generateDocumentation = async (filePath: string): Promise<void> => {
  await plugin.action(filePath);
};

const plugin: OrchestraPlugin = createFileAgentPlugin({
  name: 'Documentation Generator',
  description: 'Generate or improve documentation using a Technical Writer agent',
  command: 'doc-gen',
  argName: 'path',
  argDescription: 'Path to the file to document',
  role: AgentRole.TECHNICAL_WRITER,
  buildTask: ({ fileName }) =>
    `Analyze the following content and improve the documentation. 
If it is code, generate a markdown API reference or usage guide. 
If it is a markdown file, improve the structure, clarity, and completeness.

File Name: ${fileName}
`
});

export default plugin;
