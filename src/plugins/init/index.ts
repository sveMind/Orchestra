import { OrchestraPlugin } from '../../types';
import fs from 'fs';
import path from 'path';

const readRepoUrl = (rootDir: string): string | undefined => {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    if (pkg.repository && typeof pkg.repository === 'object' && pkg.repository.url) {
      return String(pkg.repository.url);
    }
    if (typeof pkg.repository === 'string') {
      return pkg.repository;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const detectPlatforms = (rootDir: string): { github: boolean; gitlab: boolean } => {
  const repoUrl = readRepoUrl(rootDir) || '';
  const hasGitHubDir = fs.existsSync(path.join(rootDir, '.github'));
  const hasGitLabCi = fs.existsSync(path.join(rootDir, '.gitlab-ci.yml'));

  const github = hasGitHubDir || repoUrl.includes('github.com');
  const gitlab = hasGitLabCi || repoUrl.toLowerCase().includes('gitlab');

  if (!github && !gitlab) {
    return { github: true, gitlab: false };
  }

  return { github, gitlab };
};

const continuousWorkflowContent = `name: Orchestra Continuous Loop

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 * * * *' # Run every hour
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  orchestra-continuous:
    runs-on: ubuntu-latest
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - run: npm ci
      - run: npm run build
      
      - name: Run Orchestra Continuous Mode
        env:
          VCS_PROVIDER: github
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: node dist/index.js continuous ./README.md
`;

const githubWorkflowContent = `name: Orchestra

on:
  push:
    branches: [ main ]
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  orchestra-auto:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - run: npm run build

      - name: Run Orchestra Auto-Pilot
        env:
          VCS_PROVIDER: github
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_OWNER: \${{ github.repository_owner }}
          GITHUB_REPO: \${{ github.event.repository.name }}
        run: npx orchestra auto

  orchestra-pr-review:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - run: npm run build

      - name: Run Orchestra PR Reviewer
        env:
          VCS_PROVIDER: github
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_OWNER: \${{ github.repository_owner }}
          GITHUB_REPO: \${{ github.event.repository.name }}
        run: npx orchestra pr-review \${{ github.event.pull_request.number }}
`;

const gitlabJobContent = `orchestra_auto:
  image: node:20
  stage: test
  script:
    - npm ci
    - npm run build
    - npx orchestra auto
  variables:
    VCS_PROVIDER: gitlab
    GITLAB_TOKEN: \${CI_JOB_TOKEN}
    GITLAB_PROJECT_ID: \${CI_PROJECT_ID}
  only:
    - branches

orchestra_pr_review:
  image: node:20
  stage: test
  script:
    - npm ci
    - npm run build
    - npx orchestra pr-review \${CI_MERGE_REQUEST_IID}
  variables:
    VCS_PROVIDER: gitlab
    GITLAB_TOKEN: \${CI_JOB_TOKEN}
    GITLAB_PROJECT_ID: \${CI_PROJECT_ID}
  only:
    - merge_requests
`;

const initPipelines = async (): Promise<void> => {
  const rootDir = process.cwd();
  const platforms = detectPlatforms(rootDir);

  console.log('Detected CI targets:', platforms);

  if (platforms.github) {
    const workflowsDir = path.join(rootDir, '.github', 'workflows');
    const workflowPath = path.join(workflowsDir, 'orchestra.yml');

    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    if (fs.existsSync(workflowPath)) {
      console.log(`GitHub workflow already exists at ${workflowPath}. Skipping creation.`);
    } else {
      fs.writeFileSync(workflowPath, githubWorkflowContent);
      console.log(`Created GitHub Actions workflow at ${workflowPath}`);
    }

    // Create Continuous Loop Workflow
    const continuousWorkflowPath = path.join(workflowsDir, 'orchestra-continuous-loop.yml');
    if (fs.existsSync(continuousWorkflowPath)) {
      console.log(`Continuous Loop workflow already exists at ${continuousWorkflowPath}. Skipping creation.`);
    } else {
      fs.writeFileSync(continuousWorkflowPath, continuousWorkflowContent);
      console.log(`Created Continuous Loop workflow at ${continuousWorkflowPath}`);
    }
  }

  if (platforms.gitlab) {
    const gitlabCiPath = path.join(rootDir, '.gitlab-ci.yml');

    if (fs.existsSync(gitlabCiPath)) {
      console.log(`.gitlab-ci.yml already exists at ${gitlabCiPath}.`);
      console.log('You can add the following job manually:');
      console.log(gitlabJobContent);
    } else {
      fs.writeFileSync(gitlabCiPath, gitlabJobContent);
      console.log(`Created GitLab CI file at ${gitlabCiPath}`);
    }
  }

  if (!platforms.github && !platforms.gitlab) {
    console.log('No specific CI platform detected. Created a default GitHub workflow.');
  }
};

const plugin: OrchestraPlugin = {
  name: 'Init Pipelines',
  description: 'Initialize CI pipelines (GitHub/GitLab) for full Orchestra workflow',
  command: 'init',
  args: [],
  action: async () => {
    await initPipelines();
  }
};

export default plugin;

