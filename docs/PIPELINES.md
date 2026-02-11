# AutoBot Pipeline Agents

AutoBot provides a suite of AI-powered agents designed to automate various stages of your software development lifecycle. These agents can be integrated into your CI/CD pipelines to handle tasks ranging from code review to security scanning.

## 🤖 Available Agents

### 1. Auto-Pilot (`auto`)
**The "Set and Forget" Agent.**
Auto-Pilot analyzes changed files in your workspace and automatically determines the best actions to take. It acts as an orchestrator, dispatching other agents as needed.
*   **Use Case:** Run on every push to automatically generate tests, scan for vulnerabilities, or update docs based on what changed.
*   **Command:** `autobot auto`

### 2. Vulnerability Scanner (`vuln-scan`)
**The Security Engineer.**
Scans code for security flaws using AI analysis, reports findings, and can even automatically apply fixes and raise PRs.
*   **Use Case:** Scheduled nightly scans or pre-merge checks.
*   **Command:** `autobot vuln-scan <path_to_file_or_dir>`

### 3. PR Reviewer (`pr-review`)
**The Product Owner & Senior Dev Duo.**
Fetches a Pull Request, analyzes the diff, and posts a comprehensive review comment covering both product requirements and code quality.
*   **Use Case:** Trigger on `pull_request` events.
*   **Command:** `autobot pr-review <pr_number>`

### 4. Dev Cycle (`dev-cycle`)
**The Dev-QA Loop.**
Orchestrates a feedback loop where a "Developer Agent" writes code and a "QA Agent" reviews it. They iterate until the code is approved, then generate tests and raise a PR.
*   **Use Case:** Automated feature implementation from a ticket.
*   **Command:** `autobot dev-cycle <file_path> "<task_description>"`

### 5. Agile Workflow (`agile`)
**The Full Scrum Team.**
Takes an issue, has a "Product Manager" refine requirements, a "Scrum Master" break it into tasks, and then triggers the Dev Cycle for implementation.
*   **Use Case:** Trigger when a new issue is labeled `autobot`.
*   **Command:** `autobot agile <issue_number> "<issue_title>"`

### 6. Release Notes (`release-notes`)
**The Technical Writer.**
Analyzes git commits since the last tag and generates professional release notes, creating a GitHub/GitLab Release automatically.
*   **Use Case:** Trigger on tag creation or deployment.
*   **Command:** `autobot release-notes <version>`

### 7. Code Fixer (`fix`)
**The Refactoring Specialist.**
Applies AI-driven fixes or refactoring to a specific file based on instructions.
*   **Use Case:** Fixing linter errors or applying specific refactors.
*   **Command:** `autobot fix <file_path> "[instruction]"`

### 8. Project Manager (`project-manager`)
**The Planner.**
Takes a high-level requirement (or a README) and breaks it down into a detailed backlog of issues using a team of AI agents (Architect, QA, Security).
*   **Use Case:** Project initialization.
*   **Command:** `autobot project-manager <requirement_or_file> "[instruction]"`

### 9. Test Generator (`test-gen`)
**The QA Engineer.**
Generates comprehensive unit tests (Jest) for a given file.
*   **Use Case:** Ensuring test coverage for legacy code or new features.
*   **Command:** `autobot test-gen <file_path>`

### 10. Documentation Generator (`doc-gen`)
**The Docs Specialist.**
Generates or improves documentation for code files or markdown documents.
*   **Use Case:** Keeping docs up to date with code changes.
*   **Command:** `autobot doc-gen <file_path>`

---

## 🔧 General Usage in Pipelines

To use AutoBot in any pipeline:

1.  **Install AutoBot:** Ensure `autobot` is installed and available in your path (e.g., `npm install -g autobot-svemind` or run via `npx`).
2.  **Set Environment Variables:** Configure the necessary API keys (OpenAI/Gemini/Ollama) and VCS tokens (GitHub/GitLab/Azure).
3.  **Run Commands:** Execute the desired agent command in your pipeline steps.

See specific guides for:
- [GitHub Actions](GITHUB_ACTIONS.md)
- [GitLab CI](GITLAB_CI.md)
