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
npx orchestra-ai-devops create-plugin my-new-feature
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
npm install -g orchestra-ai-devops
```

Or run it directly with `npx`:

```bash
npx orchestra-ai-devops --help
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
# OpenRouter (Recommended)
# OPENAI_API_KEY=sk-or-v1-your-openrouter-key
# AI_MODEL=openrouter/auto
# AI_BASE_URL=https://openrouter.ai/api/v1

# Optional: identify requests as coming from this tool (useful in OpenRouter analytics)
# ORCHESTRA_APP_NAME=Orchestra
# ORCHESTRA_APP_URL=https://github.com/your-org/your-repo
# ORCHESTRA_SOURCE=ci:github-actions

# OpenAI (Alternative)
# OPENAI_API_KEY=sk-your-openai-key
# AI_MODEL=gpt-4o-mini

# Agent role routing
# ORCHESTRA_ROLE_ROUTING=auto   # default; Orchestra chooses best role per request
# ORCHESTRA_ROLE_ROUTING=prefer # use each plugin’s preferred role

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
You can run Orchestra in GitHub Actions via the NPM package (recommended), or via a published GitHub Action.

**Option A: NPM package (recommended)**

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  - run: npx orchestra-ai-devops pr-review ${{ github.event.pull_request.number }}
    env:
      OPENAI_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      AI_MODEL: openrouter/auto
      AI_BASE_URL: https://openrouter.ai/api/v1
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Documentation Agent (doc-gen) with OpenRouter

Run the documentation agent in CI to update repo docs only when needed. For the repo-wide mode, pass the repo root path (`.`). Default mode is `changed` (skips when there are no changes).

If you use GitHub Environments, you can store `OPENROUTER_API_KEY` in an environment named `Orchestra` and set `environment: Orchestra` on the job.

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  - run: npx orchestra-ai-devops doc-gen .
    env:
      ORCHESTRA_ROLE_ROUTING: prefer
      OPENAI_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      AI_MODEL: openrouter/auto
      AI_BASE_URL: https://openrouter.ai/api/v1
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

To generate a best-practice documentation structure (creates/standardizes docs like Requirements, Environment, Docker and flags duplicates), use:

```yaml
- run: npx orchestra-ai-devops doc-gen . structure
```

If you want CI to fail when documentation updates were produced (instead of silently changing files), add:

```yaml
- name: Fail if docs changed
  run: git diff --exit-code
```

**Option B: GitHub Action**

If you publish this repo as a GitHub Action, `owner/repo@v1` refers to the git ref (tag/branch) for that action and uses its `action.yml`.

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
