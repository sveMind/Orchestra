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
- **DevOps Engineer**: Improves CI/CD pipelines, infrastructure as code, and automation efficiency.

### 🔌 Modular Plugin System
Orchestra is built on a flexible plugin architecture, allowing for easy extension. Current plugins include:
- **`test-gen`**: Generates unit tests for specific files.
- **`vuln-scan`**: Performs AI-based security analysis and auto-patching.
- **`project-manager`**: Simulates an agile sprint planning session from a simple prompt.
- **`doc-gen`**: Auto-generates API references and improves READMEs.
- **`release-notes`**: Generates professional release notes from git history.

## 🔌 Extending Orchestra (Plugins)

Orchestra is designed to be easily extensible. You can add new commands and capabilities by creating plugins.

### Quick Start
To create a new plugin, run:

```bash
npx orchestra create-plugin my-new-feature
```

This will scaffold a new plugin in `src/plugins/my-new-feature`.

For detailed instructions, see [PLUGINS.md](./PLUGINS.md).

## 📖 Setup & Pipeline Guide

For detailed instructions on initializing a repository and integrating Orchestra into your CI/CD pipelines via NPM, see the [Setup & Pipeline Guide](./GUIDE.md).

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

### 2. CI/CD Integration

Orchestra is designed to run in any CI/CD pipeline.

#### GitHub Actions
Use the provided action definition:

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: ./path/to/orchestra/action # If local
    # OR if published: uses: sveMind/Orchestra@v1
    with:
      command: 'pr-review'
      args: '${{ github.event.pull_request.number }}'
      openai_api_key: ${{ secrets.OPENAI_API_KEY }}
      github_token: ${{ secrets.GITHUB_TOKEN }}
```

#### GitLab CI / Azure Pipelines / Jenkins
Use the Docker image for universal compatibility:

```bash
docker run --rm \
  -v $(pwd):/app/work \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e GITHUB_TOKEN=$GITHUB_TOKEN \
  orchestra-ai \
  pr-review 123
```

Orchestra automatically detects the CI environment (GitHub Actions, GitLab CI, Azure DevOps) and configures the appropriate VCS provider.

---

## 🤝 Contributing

Contributions are welcome! Please submit a Pull Request.

## 📄 License

ISC
