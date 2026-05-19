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
Use the provided action definition:

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: ./path/to/orchestra/action # If local
    # OR if published: uses: sveMind/Orchestra@v1
    with:
      command: 'pr-review'
      args: '${{ github.event.pull_request.number }}'
      openrouter_api_key: ${{ secrets.OPENROUTER_API_KEY }}
      ai_model: openrouter/auto
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

## 🏗️ SaaS Deployment (GitHub App)

Orchestra can also run as a hosted service (like Snyk): you deploy one web server, users install your GitHub App, and GitHub sends events to your server via webhooks.

### What gets deployed
- A public HTTPS service running `orchestra server` (Express webhook server).
- A workspace volume/disk for temporary repo clones.
- Environment variables on the server (not in customer repos).

### How it connects to GitHub
1. You create a GitHub App and set its Webhook URL to your deployment (example: `https://your-domain.com/webhooks/github`).
2. A user installs the GitHub App on one or more repos.
3. GitHub delivers webhook events that include an `installation.id`.
4. Orchestra mints a short-lived installation token and uses it to clone/push/open PRs as `Orchestra[bot]`.

### Required server environment variables (GitHub App)
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM; when stored as env, newlines are commonly encoded as `\n`)
- `GITHUB_WEBHOOK_SECRET` (must match the GitHub App webhook secret)
- AI config: `OPENAI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`

### Do I need a separate login page?
Not to get started.

- If your SaaS behavior is “install the GitHub App and it starts working”, you can run without a UI. GitHub’s App installation flow is effectively the “authorization step”.
- You need a login page/UI when you want per-tenant configuration (routing rules, model selection, billing, allow/deny lists, Jira connection, etc.). In that case the usual pattern is: user signs in with GitHub OAuth, then links/installs the GitHub App.

### Is it coupled to the deployed application?
Yes, by design:
- Your GitHub App’s webhook URL points at your deployed server.
- If your server is down or the URL changes, events won’t be delivered until it’s restored/updated.

---

## 🤝 Contributing

Contributions are welcome! Please submit a Pull Request.

## 📄 License

ISC
