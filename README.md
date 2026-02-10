# 🤖 AutoBot

**AutoBot** is an advanced, AI-driven DevOps assistant designed to automate your software development lifecycle. Built with a modular plugin architecture and powered by a multi-agent AI system, AutoBot acts as your virtual team of experts—handling everything from project planning to quality assurance.

## 🚀 Key Features

### 🧠 Intelligent Auto-Pilot
The flagship feature of AutoBot. It monitors your workspace for changes and dynamically orchestrates the right agents to handle them.
- **Context-Aware**: Analyzes git diffs to understand *what* changed (logic vs. docs vs. config).
- **Dynamic Pipelines**: Automatically triggers Unit Tests, Security Scans, or Documentation updates based on the nature of the change.
- **Zero Config**: Just run it, and it figures out what needs to be done.

### 👥 Multi-Agent Collaboration
AutoBot simulates a real agile team using specialized AI personas:
- **Software Architect**: Analyzes code structure and determines pipeline strategies.
- **QA Automation Engineer**: Writes robust unit and integration tests (Jest, etc.).
- **Security Engineer**: Scans code for vulnerabilities and suggests secure fixes.
- **Product Manager**: Breaks down requirements into user stories and business value.
- **Scrum Master**: Organizes tasks and manages agile process simulation.
- **Technical Writer**: Generates and improves documentation.
- **UX Designer**: Provides usability guidelines for frontend tasks.

### 🔌 Modular Plugin System
AutoBot is built on a flexible plugin architecture, allowing for easy extension. Current plugins include:
- **`test-gen`**: Generates unit tests for specific files.
- **`vuln-scan`**: Performs AI-based security analysis and auto-patching.
- **`project-manager`**: Simulates an agile sprint planning session from a simple prompt.
- **`doc-gen`**: Auto-generates API references and improves READMEs.
- **`release-notes`**: Generates professional release notes from git history.

---

## 🛠️ Installation

### Option 1: NPM Package (Recommended)

You can install AutoBot globally to use it across any project:

```bash
npm install -g autobot
```

Or run it directly with `npx`:

```bash
npx autobot --help
```

### Option 2: Source Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/AutoBot.git
   cd AutoBot
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

Create a `.env` file in the root directory (or where you run AutoBot):

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
Let AutoBot decide what to do based on your current work.
```bash
autobot auto
# OR
npm start -- auto
```

### 2. Project Management Simulation
Have the AI team breakdown a new feature idea into actionable tasks and GitHub Issues.
```bash
autobot project-manager "Build a new user dashboard with dark mode"
# OR
autobot project-manager ./requirements.md
```

### 3. Vulnerability Scanning
Scan a specific file for security flaws and get auto-generated fix suggestions.
```bash
autobot vuln-scan src/services/auth.ts
```

### 4. Unit Test Generation
Manually trigger test generation for a file.
```bash
autobot test-gen src/utils/math.ts
```

### 5. Documentation Generation
Improve existing docs or generate new API references.
```bash
autobot doc-gen src/services/api.ts
```

### 6. Release Notes
Generate release notes based on git tags and commits.
```bash
autobot release-notes v1.2.0
```

---

## 🌍 Deployment Options

### 1. GitHub Action (CI/CD Pipeline)
Integrate AutoBot directly into your GitHub Actions workflow.

Create `.github/workflows/autobot.yml`:
```yaml
name: AutoBot Pipeline
on: [push]
jobs:
  autobot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npx autobot auto
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Webhook Server
Run AutoBot as a standalone server that listens for GitHub Webhooks.
```bash
autobot server
```
- Configure your GitHub Repository Webhook settings to point to your server URL.
- AutoBot will clone the repo on every push, run the analysis, and perform actions.

---

## 🏗️ Architecture

AutoBot uses a **Plugin-based Architecture** where each capability is a standalone module in `src/plugins`. The core system handles:
- **CLI Parsing** (Commander)
- **Plugin Loading** (Dynamic Imports)
- **Agent Service** (OpenAI Integration & Persona Management)
- **Git Service** (Change detection & History)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
