
import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import path from 'path';

const plugin: OrchestraPlugin = {
  name: 'Plugin Creator',
  description: 'Scaffold a new Orchestra plugin',
  command: 'create-plugin',
  args: [
    { name: 'pluginName', description: 'Name of the new plugin (kebab-case)', required: true }
  ],
  action: async (pluginName: string) => {
    // Validate name
    if (!/^[a-z0-9-]+$/.test(pluginName)) {
      console.error('❌ Plugin name must be kebab-case (lowercase, numbers, hyphens only).');
      return;
    }

    // Determine target directory
    // If running from source, we might be in the root.
    // We try to find 'src/plugins'.
    const srcPlugins = path.join(process.cwd(), 'src', 'plugins');
    
    if (!fs.existsSync(srcPlugins)) {
      console.error(`❌ Could not find 'src/plugins' directory. Are you in the Orchestra root?`);
      console.log('To create a local plugin for your project, this feature is coming soon.');
      return;
    }

    const pluginDir = path.join(srcPlugins, pluginName);

    if (fs.existsSync(pluginDir)) {
      console.error(`❌ Plugin '${pluginName}' already exists.`);
      return;
    }

    // Create directory
    fs.mkdirSync(pluginDir, { recursive: true });

    // Create index.ts
    const template = `
import { OrchestraPlugin } from '../../types';

const plugin: OrchestraPlugin = {
  name: '${pluginName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}',
  description: 'Description for ${pluginName}',
  command: '${pluginName}',
  args: [
    // { name: 'argName', description: 'Description', required: true }
  ],
  action: async (...args) => {
    console.log('🚀 ${pluginName} plugin is running!');
    console.log('Args:', args);
  }
};

export default plugin;
`;

    fs.writeFileSync(path.join(pluginDir, 'index.ts'), template.trim());

    console.log(`✅ Plugin '${pluginName}' created successfully!`);
    console.log(`📂 Location: ${pluginDir}`);
    console.log(`\nTo test it:`);
    console.log(`1. Run 'npm run build'`);
    console.log(`2. Run 'npx orchestra ${pluginName}'`);
  }
};

export default plugin;
