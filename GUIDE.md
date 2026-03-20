# 📖 Orchestra: Setup and Pipeline Guide

This guide covers how to initialize your repository with Orchestra and how to integrate it into your CI/CD pipelines using NPM.

## 🏁 1. Initialize Your Repository

The easiest way to get started is to use the `init` command. This will automatically detect your CI environment and generate the necessary workflow configuration files.

### Steps:

1.  Navigate to the root of your project.
2.  Run the initialization command:

    ```bash
    npx orchestra-ai-devops init
    ```

### What Happens?

*   **GitHub Actions**: It creates `.github/workflows/orchestra.yml` and `.github/workflows/orchestra-continuous-loop.yml`.
*   **GitLab CI**: It checks for `.gitlab-ci.yml` and suggests the configuration to add.
*   **Azure DevOps**: It provides guidance for `azure-pipelines.yml`.

---

## 🚀 2. Running Orchestra in Pipelines via NPM

While using the Docker image is robust, you might prefer to run Orchestra directly via NPM, especially if you want to use a specific Node.js version or integrate it into an existing Node.js build step.

### A. GitHub Actions (NPM Method)

Instead of using the Docker action, you can install Orchestra as a dev dependency or use `npx`.

**Example Workflow: `.github/workflows/orchestra-npm.yml`**

```yaml
name: Orchestra CI (NPM)

on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main]

jobs:
  orchestra-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Important for git diff analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Option 1: Install globally (Recommended for speed if cached)
      - name: Install Orchestra
        run: npm install -g orchestra-ai-devops

      # Option 2: Use NPX directly (Slower, but no install step needed)
      # run: npx orchestra-ai-devops@latest --help

      - name: Run PR Review (on Pull Requests)
        if: github.event_name == 'pull_request'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          AI_MODEL: openrouter/auto
          AI_BASE_URL: https://openrouter.ai/api/v1
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: orchestra pr-review ${{ github.event.pull_request.number }}

      - name: Run Auto-Pilot (on Push)
        if: github.event_name == 'push'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          AI_MODEL: openrouter/auto
          AI_BASE_URL: https://openrouter.ai/api/v1
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: orchestra auto
```

### B. GitLab CI (NPM Method)

**Example Job: `.gitlab-ci.yml`**

```yaml
stages:
  - test

orchestra_review:
  stage: test
  image: node:20
  script:
    - npm install -g orchestra-ai-devops
    - orchestra pr-review $CI_MERGE_REQUEST_IID
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
    GITLAB_TOKEN: $CI_JOB_TOKEN # Or a Personal Access Token
```

---

## 🛠️ 3. Running Specific Commands

You can run specific Orchestra agents for targeted tasks in your pipeline.

### 🔍 Automated PR Review
Analyze code changes for quality, security, and bugs.

```bash
npx orchestra-ai-devops pr-review <PR_NUMBER>
```

### 🛡️ Vulnerability Scan
Scan specific files or the whole repo for security issues.

```bash
npx orchestra-ai-devops vuln-scan ./src
```

### 🧪 Unit Test Generation
Automatically generate unit tests for a specific file.

```bash
npx orchestra-ai-devops test-gen ./src/utils/helper.ts
```

### 📝 Documentation Generation
Update README or generate API docs.

```bash
npx orchestra-ai-devops doc-gen ./src
```

### ♾️ Continuous Mode
Run Orchestra in an infinite loop to autonomously manage the project (e.g., in a long-running job).

```bash
npx orchestra-ai-devops continuous ./README.md
```
