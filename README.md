# 🤖 Orchestra

**Orchestra** is an advanced, AI-driven DevOps assistant designed to automate your software development lifecycle. Built with a modular plugin architecture and powered by a multi-agent AI system, Orchestra acts as your virtual team of experts—handling everything from project planning to quality assurance.

## 🚀 Key Features

### 🧠 Intelligent Auto-Pilot
The flagship feature of Orchestra. It monitors your workspace for changes and dynamically orchestrates the right agents to handle them.
- **Context-Aware**: Analyzes git diffs to understand *what* changed (logic vs. docs vs. config).
- **Dynamic Pipelines**: Automatically triggers Unit Tests, Security Scans, or Documentation updates based on the nature of the change.
- **Zero Config**: Just run it, and it figures out what needs to be done.

### 👥 Multi-Agent Collaboration
Orchestra simulates a real agile team using specialized AI personas:
- **Software Architect**: Analyzes code structure and determines pipeline strategies.
- **QA Automation Engineer**: Writes robust unit and integration tests (Jest, etc.).
- **Security Engineer**: Scans code for vulnerabilities and suggests secure fixes.
- **Product Manager**: Breaks down requirements into user stories and business value.
- **Scrum Master**: Organizes tasks and manages agile process simulation.
- **Technical Writer**: Generates and improves documentation.
- **UX Designer**: Provides usability guidelines for frontend tasks.

### 🔌 Modular Plugin System
Orchestra is built on a flexible plugin architecture, allowing for easy extension. Current plugins include:
- **`test-gen`**: Generates unit tests for specific files.
- **`vuln-scan`**: Performs AI-based security analysis and auto-patching.
- **`project-manager`**: Simulates an agile sprint planning session from a simple prompt.
- **`doc-gen`**: Auto-generates API references and improves READMEs.
- **`release-notes`**: Generates professional release notes from git history.

---

## 🛠️ Installation

### Option 1: NPM Package (Recommended)

You can install Orchestra globally to use it across any project:

```bash
npm install -g orchestra
```

Or run it directly with `npx`:

```bash
npx orchestra --help
```

### Option 2: Source Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/Orchestra.git
   cd Orchestra
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Link locally (Optional):**
   ```bash
   npm link
   ```

### Configuration

Create a `.env` file in the root directory (or where you run Orchestra):

```env
# Default: OpenAI
OPENAI_API_KEY=sk-your-api-key

# Option: OpenRouter (Cost Effective)
# OPENAI_API_KEY=sk-or-v1-your-openrouter-key
# AI_BASE_URL=https://openrouter.ai/api/v1
# AI_MODEL=deepseek/deepseek-coder:free

GITHUB_TOKEN=your-github-token (Optional, for Issue creation)
```

---

## 💻 Usage

### 1. Auto-Pilot Mode (Recommended)
Let Orchestra decide what to do based on your current work.
```bash
orchestra auto
# OR
npm start -- auto
```

### 2. Project Management Simulation
Have the AI team breakdown a new feature idea into actionable tasks and GitHub Issues.
```bash
orchestra project-manager "Build a new user dashboard with dark mode"
# OR
orchestra project-manager ./requirements.md
```

### 3. Vulnerability Scanning
Scan a specific file for security flaws and get auto-generated fix suggestions.
```bash
orchestra vuln-scan src/services/auth.ts
```

### 4. Unit Test Generation
Manually trigger test generation for a file.
```bash
orchestra test-gen src/utils/math.ts
```

### 5. Documentation Generation
Improve existing docs or generate new API references.
```bash
orchestra doc-gen src/services/api.ts
```

### 6. Release Notes
Generate release notes based on git tags and commits.
```bash
orchestra release-notes v1.2.0
```

---

## 🌍 Deployment Options

Orchestra can be easily integrated into your CI/CD pipelines.

### 📚 Integration Guides
*   **[Pipeline Overview](docs/PIPELINES.md)** - Learn about available agents and commands.
*   **[GitHub Actions](docs/GITHUB_ACTIONS.md)** - Detailed examples for GitHub workflows.
*   **[GitLab CI](docs/GITLAB_CI.md)** - Configuration guide for GitLab CI/CD.
*   **[Integration Configuration](docs/INTEGRATIONS.md)** - Configure multiple providers (GitLab, Azure, Jira).

### Quick Example: GitHub Action
```yaml
name: Orchestra Auto-Pilot
on: [push]
jobs:
  orchestra:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx orchestra-svemind auto
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Webhook Server
Run Orchestra as a standalone server that listens for GitHub Webhooks.
```bash
orchestra server
```

---

## 🏗️ Architecture

Orchestra uses a **Plugin-based Architecture** where each capability is a standalone module in `src/plugins`. The core system handles:
- **CLI Parsing** (Commander)
- **Plugin Loading** (Dynamic Imports)
- **Agent Service** (OpenAI Integration & Persona Management)
- **Git Service** (Change detection & History)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
