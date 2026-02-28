# 🔌 Orchestra Plugin Development Guide

Orchestra is designed with a modular architecture, making it easy to extend its capabilities. Whether you want to add a new AI agent, integrate with a different tool, or automate a specific workflow, you can do it by creating a plugin.

## 🏗️ Architecture

All plugins reside in the `src/plugins` directory. Each plugin is a self-contained folder with an `index.ts` file that exports an object adhering to the `OrchestraPlugin` interface.

### The `OrchestraPlugin` Interface

```typescript
export interface OrchestraPlugin {
  name: string;        // Display name of the plugin
  description: string; // Short description shown in help
  command: string;     // The CLI command to trigger this plugin (e.g., 'my-plugin')
  args?: {             // Optional arguments for the command
    name: string;
    description: string;
    required?: boolean;
  }[];
  action: (...args: any[]) => Promise<void>; // The main logic function
}
```

## 🚀 Creating a New Plugin

### Step 1: Create the Directory

Create a new folder in `src/plugins/` with your plugin name (kebab-case recommended).

```bash
mkdir src/plugins/my-awesome-feature
```

### Step 2: Implement the Plugin

Create `src/plugins/my-awesome-feature/index.ts`:

```typescript
import { OrchestraPlugin } from '../../types';

const plugin: OrchestraPlugin = {
  name: 'My Awesome Feature',
  description: 'Does something amazing with AI.',
  command: 'awesome',
  args: [
    { name: 'target', description: 'Target to apply awesomeness to', required: true }
  ],
  action: async (target) => {
    console.log(`🚀 Unleashing awesomeness on ${target}!`);
    // Your logic here...
    // You can import services like consultAgent, VcsFactory, etc.
  }
};

export default plugin;
```

### Step 3: Test It

Rebuild the project and run your new command:

```bash
npm run build
npx orchestra awesome "My Project"
```

## 🛠️ Best Practices

1.  **Use Services**: Leverage `src/services/` for common tasks:
    *   `agentService`: Consult AI agents.
    *   `vcs/VcsFactory`: Interact with GitHub/GitLab/Azure.
    *   `aiService`: Direct LLM access.
2.  **Error Handling**: Wrap your main logic in `try/catch` blocks (though the core catches unhandled errors, it's good practice).
3.  **Logging**: Use `console.log` with emojis for user-friendly output.
4.  **Types**: Keep strict typing.

## 📦 Publishing Your Plugin

Currently, plugins are part of the core repository. To share your plugin:

1.  Fork the repository.
2.  Create your plugin in `src/plugins/`.
3.  Submit a Pull Request!

We welcome contributions!
