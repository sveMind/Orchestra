import { OrchestraPlugin } from '../../types';

const plugin: OrchestraPlugin = {
  name: 'My New Feature',
  description: 'Description for my-new-feature',
  command: 'my-new-feature',
  args: [
    // { name: 'argName', description: 'Description', required: true }
  ],
  action: async (...args) => {
    console.log('🚀 my-new-feature plugin is running!');
    console.log('Args:', args);
  }
};

export default plugin;