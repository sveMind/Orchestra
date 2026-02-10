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

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/AutoBot.git
   cd AutoBot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   # Default: OpenAI
   OPENAI_API_KEY=sk-your-api-key
   
   # Option: OpenRouter (Cost Effective)
   # OPENAI_API_KEY=sk-or-v1-your-openrouter-key
   # AI_BASE_URL=https://openrouter.ai/api/v1
   # AI_MODEL=deepseek/deepseek-coder:free  # or anthropic/claude-3-haiku, etc.

   GITHUB_TOKEN=your-github-token (Optional, for Issue creation)
   ```

---

## 🌍 Deployment Options

### 1. GitHub Action (CI/CD Pipeline)
Integrate AutoBot directly into your GitHub Actions workflow to run automatically on every push.

Create `.github/workflows/autobot.yml`:
```yaml
name: AutoBot Pipeline
on: [push]
jobs:
  autobot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: ./ # Or your-repo/AutoBot@main
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Webhook Server
Run AutoBot as a standalone server that listens for GitHub Webhooks.
```bash
# Start the server (Listens on port 3000)
npm start -- server
```
- Configure your GitHub Repository Webhook settings to point to your server URL (e.g., `http://your-server.com/webhook`).
- AutoBot will clone the repo on every push, run the analysis, and perform actions.

---

## 💻 Usage

### 1. Auto-Pilot Mode (Recommended)
Let AutoBot decide what to do based on your current work.
```bash
npm start -- auto
```

### 2. Project Management Simulation
Have the AI team breakdown a new feature idea into actionable tasks and GitHub Issues.
```bash
npm start -- project-manager "Build a new user dashboard with dark mode"
# OR from a file
npm start -- project-manager ./requirements.md
```

### 3. Vulnerability Scanning
Scan a specific file for security flaws and get auto-generated fix suggestions.
```bash
npm start -- vuln-scan src/services/auth.ts
```

### 4. Unit Test Generation
Manually trigger test generation for a file.
```bash
npm start -- test-gen src/utils/math.ts
```

### 5. Documentation Generation
Improve existing docs or generate new API references.
```bash
npm start -- doc-gen src/services/api.ts
```

### 6. Release Notes
Generate release notes based on git tags and commits.
```bash
npm start -- release-notes v1.2.0
```

---

## 🏗️ Architecture

AutoBot uses a **Plugin-based Architecture** where each capability is a standalone module in `src/plugins`. The core system handles:
- **CLI Parsing** (Commander)
- **Plugin Loading** (Dynamic Imports)
- **Agent Service** (OpenAI Integration & Persona Management)
- **Git Service** (Change detection & History)

This structure makes it easy for the community to add new skills to AutoBot.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
