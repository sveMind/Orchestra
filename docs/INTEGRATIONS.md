# AutoBot Integrations Guide

AutoBot is designed to be platform-agnostic, supporting multiple Version Control Systems (VCS) and Issue Tracking systems. This guide explains how to configure AutoBot to work with your preferred tools.

## 🚀 Quick Start

AutoBot uses environment variables to determine which services to connect to. You can mix and match providers (e.g., Jira for issues, GitHub for code).

### Common Scenarios

**1. Pure GitHub (Default)**
```bash
# No special configuration needed beyond standard tokens
export GITHUB_TOKEN=your_token
export GITHUB_OWNER=your_org
export GITHUB_REPO=your_repo
```

**2. Pure GitLab**
```bash
export VCS_PROVIDER=gitlab
export GITLAB_TOKEN=your_token
export GITLAB_PROJECT_ID=12345
```

**3. Jira (Issues) + GitHub (Code)**
```bash
# Code Provider
export VCS_PROVIDER=github
export GITHUB_TOKEN=your_token
# ...

# Issue Provider
export ISSUE_PROVIDER=jira
export JIRA_HOST=your-company.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=your_jira_token
export JIRA_PROJECT_KEY=PROJ
```

---

## 🛠 Supported Providers

### 1. GitHub
The default provider for both code and issues.
*   **Env Var**: `VCS_PROVIDER=github` (or unset)
*   **Required Variables**:
    *   `GITHUB_TOKEN`: Personal Access Token (PAT) with `repo` scope.
    *   `GITHUB_OWNER`: Organization or username.
    *   `GITHUB_REPO`: Repository name.

### 2. GitLab
Supports GitLab SaaS (gitlab.com) and Self-Hosted instances.
*   **Env Var**: `VCS_PROVIDER=gitlab`
*   **Required Variables**:
    *   `GITLAB_TOKEN`: Personal Access Token with `api` scope.
    *   `GITLAB_PROJECT_ID`: The numeric ID or URL-encoded path of your project (e.g., `123` or `mygroup%2Fmyproject`).
*   **Optional Variables**:
    *   `GITLAB_URL`: Base URL for API (default: `https://gitlab.com/api/v4`).

### 3. Azure DevOps
Supports Azure DevOps Services.
*   **Env Var**: `VCS_PROVIDER=azure` (or `ado`)
*   **Required Variables**:
    *   `AZURE_PERSONAL_ACCESS_TOKEN`: PAT with Code (Read & Write) and Work Items (Read & Write) permissions.
    *   `AZURE_ORG_URL`: URL to your organization (e.g., `https://dev.azure.com/myorg`).
    *   `AZURE_PROJECT`: Project name.
    *   `AZURE_REPO`: Repository name (or ID).

### 4. Jira (Issue Tracking Only)
Can be used in combination with any VCS provider. When enabled, AutoBot will create issues and comments in Jira instead of your VCS.
*   **Env Var**: `ISSUE_PROVIDER=jira`
*   **Required Variables**:
    *   `JIRA_HOST`: Your Jira Cloud domain (e.g., `mycompany.atlassian.net`).
    *   `JIRA_EMAIL`: The email address associated with your Jira account.
    *   `JIRA_API_TOKEN`: An API token generated from Atlassian Account settings.
    *   `JIRA_PROJECT_KEY`: The key of the Jira project to create issues in (e.g., `PROJ`).

### 5. AutoBot Service
Our native hosted service for managing tasks and code.
*   **Env Var**: `VCS_PROVIDER=autobot` (or automatically detected if `AUTOBOT_TOKEN` is set and no other provider is specified).
*   **Required Variables**:
    *   `AUTOBOT_TOKEN`: Your AutoBot API token.
    *   `AUTOBOT_PROJECT_ID`: Your project ID.

---

## 🧩 Plugin Support

AutoBot's internal plugins (like `agile-workflow`, `dev-cycle`) automatically use the configured providers.

*   **Agile Workflow**: Will create stories/tasks in Jira (if configured) or GitHub/GitLab Issues.
*   **Dev Cycle**: Will check PRs on GitHub/GitLab/Azure and link them to issues in Jira/GitHub/GitLab.
*   **Vuln Scan**: Will report vulnerabilities as issues in your configured Issue Provider.

No additional configuration is needed for plugins; they simply use the global provider configuration.
