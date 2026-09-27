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
npx orchestra-ai-devops awesome "My Project"
```

## 🛠️ Best Practices

1.  **Use Services**: Leverage `src/services/` for common tasks:
    *   `agentService`: Consult AI agents.
    *   `vcs/VcsFactory`: Interact with GitHub/GitLab/Azure.
    *   `aiService`: Direct LLM access.
2.  **Error Handling**: Wrap your main logic in `try/catch` blocks (though the core catches unhandled errors, it's good practice).
3.  **Logging**: Use `console.log` with emojis for user-friendly output.
4.  **Types**: Keep strict typing.

## 🧰 Built-in Plugins

Orchestra ships with a growing set of ready-to-use plugins:

| Command            | Purpose                                                                    |
|--------------------|----------------------------------------------------------------------------|
| `test-gen`         | Generate unit tests (Jest / pytest / plain C) for a source file.           |
| `doc-gen`          | Update repository documentation + inline code comments based on changes.  |
| `vuln-scan`        | Scan codebase and lock files for vulnerabilities + bad practices.         |
| `static-analysis`  | SAST via Opengrep/Semgrep rules, fingerprinted issues, auto-close + usage history. |
| `sbom`             | Generate an SPDX 2.3 + CycloneDX 1.5 SBOM for all components in every supported ecosystem (npm/pnpm/yarn, pip/poetry/pipenv, go, cargo, gem, composer, maven/gradle, nuget). |
| `pr-reviewer`      | AI-powered PR review with line-level feedback.                            |
| `release-notes`    | Generate changelog / release notes from git history.                      |
| `dev-cycle`        | Automate a local develop → test → commit loop.                             |
| `code-fixer`       | Auto-fix common linter / type / build errors.                              |
| `init`             | Bootstrap Orchestra configuration in a new repository.                    |
| `plugin-creator`   | Scaffold a new plugin folder with boilerplate.                             |

### Static Analysis Modes (`mode`)
```bash
orchestra static-analysis <path> [rules] <mode>
```
- `report` – Default. Writes `STATIC_ANALYSIS_REPORT.md` locally, plus scan usage history in `.orchestra/static-analysis-usage.json`.
- `issue` – Opens one VCS issue per fingerprinted finding, auto-closes issues for resolved findings, and opens a single summary issue with the full report.
- `issues-per-finding` – Only creates/updates/closes per-finding VCS issues; skips the summary issue.
- `comment` – In CI, posts the report as a PR comment (still writes local report + usage history).

### SBOM Plugin
```bash
orchestra sbom <path> <mode> [options]
```
- **Ecosystems parsed:** Node.js (npm / pnpm / yarn lockfiles), Python (requirements.txt, Pipfile, pyproject.toml, poetry.lock), Go (go.mod + go.sum), Rust (Cargo.toml / Cargo.lock), Ruby (Gemfile / Gemfile.lock), PHP (composer.json / composer.lock), Java (pom.xml, build.gradle[.kts]), .NET (.csproj / packages.lock.json).
- **Artifacts written per run:** `sbom.spdx.json` (SPDX 2.3), `sbom.cyclonedx.json` (CycloneDX 1.5), `sbom.md` (human-readable ecosystem + scope tables, manifest sources, warnings).
- **Options:** `--include-nested-node-modules` to walk nested packages, `--include-test=false` to skip dev/test scopes.
- **Modes:**
  - `report` – Default. Writes the three artifacts locally + emits a console summary.
  - `issue` – Opens one umbrella "SBOM Report — …" VCS issue plus closes stale summary issues (fingerprinted by deterministic title + byline).
  - `issues-per-component` – Opens one VCS issue per deduplicated (ecosystem+name+version) component (title: `[SBOM]🟩[NPM:prod] pkg v1.2.3 (fp1234567890)`) and closes managed issues when a component is upgraded or removed.
  - `comment` – In CI, posts the report as a PR comment (still writes the three files).
- **Determinism:** Every component issue title embeds a fingerprint of ecosystem+name+version+scope+source-manifest so reruns reconcile without duplicating; stale-managed titles that aren't present in the latest SBOM are closed via the existing IssueProvider.closeIssue pipeline.

## 📦 Publishing Your Plugin

Currently, plugins are part of the core repository. To share your plugin:

1.  Fork the repository.
2.  Create your plugin in `src/plugins/`.
3.  Submit a Pull Request!

We welcome contributions!
