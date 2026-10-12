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
| `test-gen`         | Generate (AI) + run tests across 12 frameworks, write `TEST_REPORT.md`, manage per-test VCS issues with auto-close. |
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
- **Artifacts written per run:** `sbom.spdx.json` (SPDX 2.3), `sbom.cyclonedx.json` (CycloneDX 1.5), `sbom.md` (human-readable ecosystem + scope tables, manifest sources, warnings). When a license policy is applied it also writes `.orchestra/sbom-license-policy.json` so downstream plugins can surface the compact summary.
- **License policy engine:** A `.licenserc.json` (or `license-policy.json`, `.github/license-policy.json`, or `package.json#licensePolicy`) file drives per-component verdicts, with CLI overrides:
  - `allow: [...]` → explicit allow-list (SPDX IDs; glob patterns like `*BSD*` accepted). Anything not here is DENIED when the allow-list is non-empty.
  - `deny: [...]` → explicit deny-list (e.g. `AGPL-3.0-only`, `*GPL-3.0*`). Anything matched is blocked regardless of the allow-list.
  - `copyleftWarn`, `copyleftAllow` → warn or allow weak/strong/network copyleft.
  - `unknownWarn`, `unknownDeny` → unknown license expressions (non-SPDX) default to warn.
  - `proprietaryWarn`, `proprietaryDeny` → proprietary `PROPRIETARY/UNLICENSED/CLOSED-SOURCE` flags.
  - `requireLicenseForAll` → DENY any component with a missing `license` field.
  - `overrides` → per-package or per-package+version exceptions: `{ "<ecosystem>:<name>@<ver>": "ALLOWED"|"DENIED"|"WARN_COPYLEFT"|"WARN_UNKNOWN" }`.
  - **CLI overrides:** `--policy-file=<path>`, `--no-policy` (skip evaluation), `--copyleft-warn=on|off`, `--copyleft-deny` (demote strong/network copyleft warnings to deny), `--unknown-deny`, `--require-license`.
  - **Verdicts are persisted**: SPDX `licenseConcluded` / `licenseDeclared` + an `OTHER` externalRef with attribution strings; CycloneDX components get `orchestra:license:*` properties (`verdict`, `normalized`, `copyleft`, `proprietary`, `denied`, `warning`, `reason`).
- **Options:** `--include-nested-node-modules` to walk nested packages, `--include-test=false` to skip dev/test scopes.
- **Modes:**
  - `report` – Default. Writes artifacts locally, emits console summary, and prints a blocking-item notice when DENIED components exist so CI shell wrappers can grep and fail.
  - `issue` – Opens one umbrella "SBOM Report — …" VCS issue plus closes stale summary issues (fingerprinted by deterministic title + byline). License-denied components are surfaced inside the issue body as a **⚠️ License Violations** subsection.
  - `issues-per-component` – Opens one VCS issue per deduplicated (ecosystem+name+version) component (title: `[SBOM]🟩[NPM:prod] pkg v1.2.3 (fp1234567890)`) and closes managed issues when a component is upgraded or removed.
  - `comment` – In CI, posts the report as a PR comment (still writes the three files). The comment header carries a compact license-policy summary line.
- **Cross-plugin visibility:** The `.orchestra/sbom-license-policy.json` artifact is consumed automatically:
  - **vuln-scan** → `SECURITY_REPORT.md` adds `## ⚖️ License Compliance (SBOM)` with denied + warning tables; flips `hasIssues=true` on denies so issue/comment modes post.
  - **doc-gen** → PR comment carries `#### ⚖️ SBOM License Policy` line + top-15 denied components next to the doc coverage table.
- **Determinism:** Every component issue title embeds a fingerprint of ecosystem+name+version+scope+source-manifest so reruns reconcile without duplicating; stale-managed titles that aren't present in the latest SBOM are closed via the existing IssueProvider.closeIssue pipeline.

### Test Generator Plugin
```bash
orchestra test-gen <path> <framework> <mode> [options]
```
- **AI test file generation (per source file):** When `<path>` is a single source file, an LLM generates/extends a test file next to it. Framework auto-detects from repo manifests; supported prompt builders: **Jest**, **Vitest**, **Mocha**, **pytest**, **Go testing**, **Cargo/Rust**, **RSpec**, **PHPUnit**, **JUnit 5 (Java/Kotlin)**, **xUnit .NET (C#)**, **plain C assert.h**.
- **Whole-repo suite runner (best-effort):** When `<path>` is a directory (or omitted), the plugin runs the detected test framework with JSON reporters (`jest --json`, `vitest --reporter=json`, `pytest --json`, `go test -json`, `cargo test --format json -Zunstable-options`, `rspec --format json`, etc.), parses their output into a unified findings list, and writes:
  - `TEST_REPORT.md` – human summary + per-finding detail (failures first).
  - `.orchestra/test-results.json` – machine-readable results, safe-read by the other plugins via `readTestArtifact()`.
  - `.orchestra/test-gen-usage.json` – rolling 200-entry history of all test-gen runs (targets, modes, counts, errors, durations).
- **Options:** `--dry-run` (build JSON args, skip spawn), `--no-run` (AI-only: no test binary invocation), `--timeout=60` / `--timeout-ms=120000` (per-runner timeout).
- **Modes:**
  - `report` – Default. Writes `TEST_REPORT.md` + `.orchestra/test-results.json` + usage history.
  - `issue` – Opens one umbrella VCS issue: `Orchestra Test Report — <framework> · N/M failing`. Also creates per-test issues for every discovered case, fingerprinted by title so reruns comment instead of duplicating.
  - `issues-per-test` – Only creates/updates/closes per-test VCS issues; skips the summary issue. Managed titles start with `[TEST]` so they are reconciled on every rerun: tests that no longer fail (or are gone) get closed via the existing IssueProvider.closeIssue pipeline.
  - `comment` – In CI, posts `TEST_REPORT.md` (clipped to ~6 KB) as a PR comment. Still writes local artifacts + usage history.
- **Cross-plugin visibility:** Results are surfaced automatically by the other plugins when present:
  - SBOM.md header bullet + `🧪 Orchestra test-gen results` section with failing-tests table.
  - vuln-scan `SECURITY_REPORT.md` adds a `## 🧪 Test Results (<framework>)` section with a failing-tests table (so one security report = dep vulns + codebase vulns + SAST + tests).
  - doc-gen PR comment adds `#### 🧪 Test results (orchestra test-gen)` with the first 15 failing tests so reviewers can see code + docs + security + tests state together.

## 📦 Publishing Your Plugin

Currently, plugins are part of the core repository. To share your plugin:

1.  Fork the repository.
2.  Create your plugin in `src/plugins/`.
3.  Submit a Pull Request!

We welcome contributions!
