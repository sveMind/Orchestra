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

const detectPlatforms = (rootDir: string): { github: boolean; gitlab: boolean; azure: boolean } => {
  const repoUrl = readRepoUrl(rootDir) || '';
  const hasGitHubDir = fs.existsSync(path.join(rootDir, '.github'));
  const hasGitLabCi = fs.existsSync(path.join(rootDir, '.gitlab-ci.yml'));
  const hasAzurePipelines = fs.existsSync(path.join(rootDir, 'azure-pipelines.yml')) || fs.existsSync(path.join(rootDir, 'azure-pipelines.yaml'));

  const github = hasGitHubDir || repoUrl.includes('github.com');
  const gitlab = hasGitLabCi || repoUrl.toLowerCase().includes('gitlab');
  const azure = hasAzurePipelines || repoUrl.toLowerCase().includes('dev.azure.com') || repoUrl.toLowerCase().includes('visualstudio.com');

  if (!github && !gitlab && !azure) {
    return { github: true, gitlab: false, azure: false };
  }

  return { github, gitlab, azure };
};

const githubDocsWorkflowContent = `name: Orchestra Docs

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: write
  pull-requests: write

jobs:
  orchestra-docs:
    runs-on: ubuntu-latest
    environment: Orchestra
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: \${{ github.head_ref }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Orchestra doc-gen
        run: npx orchestra-ai-devops doc-gen . structure
        env:
          VCS_PROVIDER: github
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          AI_MODEL: openrouter/auto
          AI_BASE_URL: https://openrouter.ai/api/v1
          ORCHESTRA_ROLE_ROUTING: prefer
          ORCHESTRA_DOCS_PR: '1'
`;

const gitlabDocsJobContent = `orchestra_docs:
  image: node:20
  stage: test
  script:
    - npx orchestra-ai-devops doc-gen . structure
  variables:
    VCS_PROVIDER: gitlab
    OPENAI_API_KEY: \${OPENROUTER_API_KEY}
    AI_MODEL: openrouter/auto
    AI_BASE_URL: https://openrouter.ai/api/v1
    ORCHESTRA_ROLE_ROUTING: prefer
  only:
    - merge_requests
`;

const azureDocsJobContent = `trigger: none
pr:
  branches:
    include:
      - '*'

jobs:
- job: OrchestraDocs
  pool:
    vmImage: 'ubuntu-latest'
  steps:
  - checkout: self
    persistCredentials: true
    fetchDepth: 0
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
  - script: |
      npx orchestra-ai-devops doc-gen . structure
    env:
      VCS_PROVIDER: azure
      AZURE_PERSONAL_ACCESS_TOKEN: $(System.AccessToken)
      AZURE_ORG_URL: $(System.CollectionUri)
      AZURE_PROJECT: $(System.TeamProject)
      AZURE_REPO: $(Build.Repository.Name)
      OPENAI_API_KEY: $(OPENROUTER_API_KEY)
      AI_MODEL: openrouter/auto
      AI_BASE_URL: https://openrouter.ai/api/v1
      ORCHESTRA_ROLE_ROUTING: prefer
    displayName: 'Run Orchestra doc-gen'
`;

const hasGitHubWorkflows = (rootDir: string): boolean => {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return false;
  try {
    const entries = fs.readdirSync(workflowsDir);
    return entries.some(e => e.endsWith('.yml') || e.endsWith('.yaml'));
  } catch {
    return false;
  }
};

const initPipelines = async (): Promise<void> => {
  const rootDir = process.cwd();
  const platforms = detectPlatforms(rootDir);

  console.log('Detected CI targets:', platforms);

  if (platforms.github) {
    const workflowsDir = path.join(rootDir, '.github', 'workflows');
    const docsWorkflowPath = path.join(workflowsDir, 'orchestra-docs.yml');

    if (!fs.existsSync(workflowsDir)) fs.mkdirSync(workflowsDir, { recursive: true });

    const anyWorkflows = hasGitHubWorkflows(rootDir);

    if (fs.existsSync(docsWorkflowPath)) {
      console.log(`Docs workflow already exists at ${docsWorkflowPath}. Skipping creation.`);
    } else if (!anyWorkflows) {
      fs.writeFileSync(docsWorkflowPath, githubDocsWorkflowContent);
      console.log(`Created GitHub Actions docs workflow at ${docsWorkflowPath}`);
    } else {
      fs.writeFileSync(docsWorkflowPath, githubDocsWorkflowContent);
      console.log(`Added GitHub Actions docs workflow at ${docsWorkflowPath}`);
    }
  }

  if (platforms.gitlab) {
    const gitlabCiPath = path.join(rootDir, '.gitlab-ci.yml');

    if (fs.existsSync(gitlabCiPath)) {
      console.log(`.gitlab-ci.yml already exists at ${gitlabCiPath}.`);
      console.log('You can add the following job manually:');
      console.log(gitlabDocsJobContent);
    } else {
      fs.writeFileSync(gitlabCiPath, gitlabDocsJobContent);
      console.log(`Created GitLab CI file at ${gitlabCiPath}`);
    }
  }

  if (platforms.azure) {
    const azureCiPath = path.join(rootDir, 'azure-pipelines.yml');
    
    if (fs.existsSync(azureCiPath)) {
      console.log(`azure-pipelines.yml already exists at ${azureCiPath}.`);
      console.log('You can add the following job manually:');
      console.log(azureDocsJobContent);
    } else {
      fs.writeFileSync(azureCiPath, azureDocsJobContent);
      console.log(`Created Azure DevOps pipeline at ${azureCiPath}`);
    }
  }

  if (!platforms.github && !platforms.gitlab && !platforms.azure) {
    const workflowsDir = path.join(rootDir, '.github', 'workflows');
    const docsWorkflowPath = path.join(workflowsDir, 'orchestra-docs.yml');
    if (!fs.existsSync(workflowsDir)) fs.mkdirSync(workflowsDir, { recursive: true });
    if (fs.existsSync(docsWorkflowPath)) {
      console.log(`Docs workflow already exists at ${docsWorkflowPath}. Skipping creation.`);
    } else {
      fs.writeFileSync(docsWorkflowPath, githubDocsWorkflowContent);
      console.log(`Created GitHub Actions docs workflow at ${docsWorkflowPath}`);
    }
  }
};

const plugin: OrchestraPlugin = {
  name: 'Init Pipelines',
  description: 'Initialize CI pipelines (GitHub/GitLab/Azure) for documentation updates with Orchestra',
  command: 'init',
  args: [],
  action: async () => {
    await initPipelines();
  }
};

export default plugin;