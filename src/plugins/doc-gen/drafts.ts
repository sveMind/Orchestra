import path from 'path';
import type { NativeBuildKind, RepoSignals } from './types';
import { getRepoRelPosix } from './docUtils';

export const buildArchitectureDoc = (signals: RepoSignals): string => {
  const lines: string[] = ['# Architecture', ''];

  lines.push('## Overview');
  lines.push(`- App type: ${signals.appType}`);
  lines.push(`- Languages: ${signals.languages.join(', ') || '(unknown)'}`);
  lines.push('');

  if (signals.frontend.detected) {
    lines.push('## Frontend');
    lines.push(`- Detected: yes (${signals.frontend.kinds.join(', ') || 'unknown'})`);
    lines.push('');
  }

  if (signals.backend.detected) {
    lines.push('## Backend');
    lines.push(`- Detected: yes (${signals.backend.kinds.join(', ') || 'unknown'})`);
    lines.push(`- Endpoints (heuristic): ${signals.apiEndpoints.length}`);
    lines.push('');
  }

  if (signals.embedded.detected) {
    lines.push('## Embedded');
    lines.push(`- Detected: yes (${signals.embedded.kinds.join(', ') || 'unknown'})`);
    lines.push('');
  }

  if (signals.dockerfilePath || signals.dockerComposeFiles.length) {
    lines.push('## Containers');
    lines.push('- Docker is present. See Docker documentation for build/run instructions.');
    lines.push('');
  }

  if (signals.pipelineFiles.length) {
    lines.push('## CI/CD');
    lines.push('- CI pipelines are present. See Pipelines documentation for what runs and required secrets.');
    lines.push('');
  }

  lines.push('## Repository Layout');
  lines.push('- Describe key directories and how code is organized (frontend/backend/shared, services, packages, etc.).');
  lines.push('');

  lines.push('## System Diagram (Mermaid)');
  lines.push('```mermaid');
  lines.push('graph TD');
  lines.push('  Client --> API');
  lines.push('  API --> Database');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
};

export const buildLocalSetupDoc = (signals: RepoSignals): string => {
  const lines: string[] = ['# Local Setup', ''];

  if (signals.hasPackageJson) {
    lines.push('## JavaScript/TypeScript');
    lines.push('```bash');
    lines.push('npm ci');
    lines.push('npm test');
    lines.push('```');
    lines.push('');
  }

  if (signals.nativeBuild.kind !== 'none' || signals.nativeBuild.hasSources) {
    lines.push('## C/C++');
    lines.push('See the Build documentation for compile/test commands.');
    lines.push('');
  }

  lines.push('## Environment Variables');
  lines.push('- Document the environment variables required to run, test, and deploy this repository.');
  lines.push('- Prefer listing required variables explicitly and explaining defaults and where values come from.');

  return lines.join('\n');
};

export const buildNginxDoc = (repoRoot: string, nginxFiles: string[]): string => {
  return [
    '# Nginx',
    '',
    '## Files',
    nginxFiles.length ? nginxFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n') : '- (none detected)',
    '',
    '## Notes',
    '- Document how Nginx is used (reverse proxy, static hosting, TLS termination) and how to run it locally/CI.',
    '- Prefer pointing to the canonical config file(s) rather than copying config blocks into docs.'
  ].join('\n');
};

export const buildKubernetesDoc = (repoRoot: string, k8sFiles: string[]): string => {
  return [
    '# Kubernetes',
    '',
    '## Manifests',
    k8sFiles.length ? k8sFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n') : '- (none detected)',
    '',
    '## Apply',
    '```bash',
    'kubectl apply -f <manifest>',
    '```'
  ].join('\n');
};

export const buildTerraformDoc = (repoRoot: string, tfFiles: string[]): string => {
  return [
    '# Terraform',
    '',
    '## Files',
    tfFiles.length ? tfFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n') : '- (none detected)',
    '',
    '## Usage',
    '```bash',
    'terraform init',
    'terraform plan',
    'terraform apply',
    '```'
  ].join('\n');
};

export const buildHelmDoc = (repoRoot: string, helmFiles: string[]): string => {
  return [
    '# Helm',
    '',
    '## Chart Files',
    helmFiles.length ? helmFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n') : '- (none detected)',
    '',
    '## Install/Upgrade',
    '```bash',
    'helm upgrade --install <release> <chart>',
    '```'
  ].join('\n');
};

export const buildApiDoc = (signals: RepoSignals): string => {
  const lines: string[] = ['# API', ''];

  if (signals.nodeApiHints) {
    lines.push('## Node.js Interface');
    if (signals.nodeApiHints.main) lines.push(`- main: \`${signals.nodeApiHints.main}\``);
    if (signals.nodeApiHints.types) lines.push(`- types: \`${signals.nodeApiHints.types}\``);
    if (signals.nodeApiHints.exports.length) {
      lines.push('');
      lines.push('### Package Exports');
      for (const e of signals.nodeApiHints.exports) lines.push(`- \`${e}\``);
    }
    if (signals.nodeApiHints.bin.length) {
      lines.push('');
      lines.push('### CLI Entrypoints');
      for (const b of signals.nodeApiHints.bin) lines.push(`- \`${b}\``);
    }
    lines.push('');
    lines.push('## Usage');
    lines.push('- Describe the public API surface and provide minimal examples based on the actual exports and CLI entrypoints.');
    lines.push('- Prefer linking to canonical docs and source files instead of copying large code blocks.');
    return lines.join('\n');
  }

  if (signals.nativeBuild.kind !== 'none' || signals.nativeBuild.hasSources) {
    lines.push('## Native Interface');
    lines.push('- Describe the public headers, libraries, binaries, and their usage.');
    lines.push('- Link to the Build documentation for compile/test instructions.');
    return lines.join('\n');
  }

  if (signals.apiEndpoints && signals.apiEndpoints.length) {
    lines.push('## REST API');
    lines.push('- Document the REST API endpoints, expected request formats, and response payloads.');
    lines.push('- Ensure you format the documentation as Markdown, do NOT output raw JSON objects.');
    return lines.join('\n');
  }

  lines.push('- Document the repository’s public API surface (CLI, libraries, services).');
  lines.push('- Ensure you format the documentation as Markdown, do NOT output raw JSON objects.');
  return lines.join('\n');
};

export const buildPipelinesDoc = (repoRoot: string, pipelineFiles: string[]): string => {
  return [
    '# Pipelines',
    '',
    '## Files',
    pipelineFiles.length ? pipelineFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n') : '- (none detected)',
    '',
    '## What Runs Where',
    '- Document which workflows run on pull requests vs pushes vs tags.',
    '- Document required secrets, permissions, and expected outputs/artifacts.',
    '',
    '## Local Equivalents',
    '- Document local commands that correspond to CI checks (lint, test, build).'
  ].join('\n');
};

export const buildNativeBuildDoc = (repoRoot: string, native: { kind: NativeBuildKind; files: string[] }): string => {
  const filesList = native.files.length
    ? native.files.map(f => `- \`${getRepoRelPosix(repoRoot, f)}\``).join('\n')
    : '- (none detected)';

  if (native.kind === 'cmake') {
    return [
      '# Build',
      '',
      '## Build System',
      '- CMake',
      '',
      '## Files',
      filesList,
      '',
      '## Build',
      '```bash',
      'cmake -S . -B build',
      'cmake --build build',
      '```',
      '',
      '## Test',
      '```bash',
      'ctest --test-dir build',
      '```'
    ].join('\n');
  }

  if (native.kind === 'meson') {
    return [
      '# Build',
      '',
      '## Build System',
      '- Meson',
      '',
      '## Files',
      filesList,
      '',
      '## Build',
      '```bash',
      'meson setup build',
      'meson compile -C build',
      '```',
      '',
      '## Test',
      '```bash',
      'meson test -C build',
      '```'
    ].join('\n');
  }

  if (native.kind === 'bazel') {
    return [
      '# Build',
      '',
      '## Build System',
      '- Bazel',
      '',
      '## Files',
      filesList,
      '',
      '## Build',
      '```bash',
      'bazel build //...',
      '```',
      '',
      '## Test',
      '```bash',
      'bazel test //...',
      '```'
    ].join('\n');
  }

  if (native.kind === 'make') {
    return [
      '# Build',
      '',
      '## Build System',
      '- Make',
      '',
      '## Files',
      filesList,
      '',
      '## Build',
      '```bash',
      'make',
      '```',
      '',
      '## Test',
      '```bash',
      'make test',
      '```'
    ].join('\n');
  }

  return [
    '# Build',
    '',
    '## Overview',
    'This repository contains native (C/C++) source code.',
    '',
    '## Files',
    filesList,
    '',
    '## Notes',
    '- Document the build system (CMake/Make/Meson/Bazel) and required system packages here.'
  ].join('\n');
};

export function buildOpenApiDoc(repoRoot: string, specFiles: string[]): string;
export function buildOpenApiDoc(
  repoRoot: string,
  specFiles: string[],
  preferredSpecRel: string,
  endpoints: Array<{ method: string; path: string; source: string }>
): string;
export function buildOpenApiDoc(
  repoRoot: string,
  specFiles: string[],
  preferredSpecRel: string = '',
  endpoints: Array<{ method: string; path: string; source: string }> = []
): string {
  const specList =
    specFiles.length > 0
      ? specFiles.map(p => `- \`${getRepoRelPosix(repoRoot, p)}\``).join('\n')
      : preferredSpecRel
        ? `- \`${preferredSpecRel}\``
        : '- (none detected)';

  const endpointList = endpoints.length
    ? endpoints
        .slice(0, 40)
        .map(e => `- ${e.method} ${e.path}`)
        .join('\n')
    : '- (no endpoints detected)';

  return [
    '# OpenAPI',
    '',
    '## Specification Files',
    specList,
    '',
    '## Detected Endpoints (Heuristic)',
    endpointList,
    '',
    '## Swagger / API Docs',
    '- Use the OpenAPI spec as the source of truth for the API surface.',
    '- Render it with Swagger UI / Redoc (choose one) and document where it is published.',
    '',
    '## Notes',
    '- Keep paths, methods, request/response schemas, and auth requirements accurate.',
    '- If this repository has both frontend and backend (fullstack), ensure the OpenAPI spec matches the actual backend routes.'
  ].join('\n');
}

const inferNodeMajorFromImage = (baseImage: string): string => {
  const m = String(baseImage || '').match(/^node:(\d+)(?:[.-][^\s]+)?$/i);
  return m ? m[1] : '';
};

export const buildRequirementsDoc = (params: {
  docker: { baseImage: string; packages: string[] };
  hasPackageJson: boolean;
  nativeBuild: { kind: NativeBuildKind; files: string[]; hasSources: boolean };
  languages?: string[];
}): string => {
  const runtimeLines: string[] = [];
  const systemLines: string[] = [];
  const packageManagerCmds: string[] = [];
  
  const langs = (params.languages || []).map(l => l.toLowerCase());

  if (params.hasPackageJson || langs.includes('javascript') || langs.includes('typescript')) {
    const nodeMajor = inferNodeMajorFromImage(params.docker.baseImage);
    const nodeLine = nodeMajor ? `- Node.js ${nodeMajor} (recommended)` : `- Node.js (LTS recommended)`;
    if (!runtimeLines.includes(nodeLine)) {
      runtimeLines.push(nodeLine);
      runtimeLines.push('- npm (bundled with Node.js) or yarn/pnpm');
      packageManagerCmds.push('```bash\n# Node.js dependencies\nnpm install\n```');
    }
  }

  if (langs.includes('python')) {
    runtimeLines.push('- Python 3.9+');
    runtimeLines.push('- pip or poetry/pipenv');
    packageManagerCmds.push('```bash\n# Python dependencies\npip install -r requirements.txt\n```');
  }

  if (langs.includes('go')) {
    runtimeLines.push('- Go 1.18+');
    packageManagerCmds.push('```bash\n# Go dependencies\ngo mod download\n```');
  }
  
  if (langs.includes('java')) {
    runtimeLines.push('- Java (JDK 11+)');
    packageManagerCmds.push('```bash\n# Java dependencies\n./gradlew build  # or mvn install\n```');
  }
  
  if (langs.includes('c#')) {
    runtimeLines.push('- .NET SDK');
    packageManagerCmds.push('```bash\n# .NET dependencies\ndotnet restore\n```');
  }

  if (params.nativeBuild.hasSources || params.nativeBuild.kind !== 'none') {
    runtimeLines.push('- C/C++ compiler toolchain (clang or gcc)');
    if (params.nativeBuild.kind === 'cmake') systemLines.push('- cmake');
    if (params.nativeBuild.kind === 'meson') systemLines.push('- meson');
    if (params.nativeBuild.kind === 'bazel') systemLines.push('- bazel');
    if (params.nativeBuild.kind === 'make') systemLines.push('- make');
  }

  const dockerPkgs = Array.from(new Set(params.docker.packages)).sort();
  for (const p of dockerPkgs) systemLines.push(`- ${p}`);

  if (!systemLines.length) {
    systemLines.push('- git (recommended)');
  }

  if (!runtimeLines.length) {
    runtimeLines.push('- (project runtime not detected; document required runtimes here)');
  }

  return [
    '# Install Requirements',
    '',
    '## Overview',
    '- Provide a deep dive into the prerequisites required to build, run, and test this project.',
    '- Explain *why* these dependencies are needed based on the architecture.',
    '',
    '## Runtime',
    ...runtimeLines,
    '',
    '## System Packages',
    ...Array.from(new Set(systemLines)),
    '',
    '## Package Managers',
    ...(packageManagerCmds.length ? packageManagerCmds : ['- Document how to install language-specific dependencies here.']),
    '',
    '## Install System Tools (Examples)',
    'Adjust package names as needed for your OS and the specific toolchain used by this repository.',
    '',
    '### macOS (Homebrew)',
    '```bash',
    'brew install git',
    '```',
    '',
    '### Ubuntu/Debian',
    '```bash',
    'sudo apt-get update',
    'sudo apt-get install -y git',
    '```',
    '',
    '### Windows',
    '```powershell',
    'winget install Git.Git',
    '```',
    '',
    '## CI',
    '- Document required secrets and permissions in the Pipelines documentation.',
    '',
    '## Commands',
    '- Add the common build/test commands for this repository here.'
  ].join('\n');
};

export const buildEnvironmentDoc = (): string => {
  return [
    '# Environment',
    '',
    '## Runtime',
    '- Document required environment variables and configuration needed to run and test this repository.',
    '',
    '## CI/CD',
    '- Document secrets and environment variables required by CI pipelines.',
    '',
    '## AI (Optional)',
    '- If this repository uses AI tooling in CI, document required keys and providers here.'
  ].join('\n');
};

export const buildDockerDoc = (params: { dockerfilePath: string; docker: { baseImage: string; packages: string[] } }): string => {
  const base = params.docker.baseImage ? `- Base image: \`${params.docker.baseImage}\`` : '- Base image: (not detected)';
  const pkgs = params.docker.packages.length ? params.docker.packages.map(p => `- ${p}`).join('\n') : '- (none detected)';
  const relDockerfile = path.basename(params.dockerfilePath) === 'Dockerfile' ? 'Dockerfile' : params.dockerfilePath;

  return [
    '# Docker',
    '',
    '## Overview',
    `This repository includes a Dockerfile (\`${relDockerfile}\`).`,
    '',
    '## Install',
    '- Docker Desktop / Engine: https://docs.docker.com/get-docker/',
    '- Docker Compose: https://docs.docker.com/compose/',
    '',
    '## Image Details',
    base,
    '',
    '### System Packages',
    pkgs,
    '',
    '## Build',
    '```bash',
    'docker build -t <image-name> .',
    '```',
    '',
    '## Run',
    '- Document how to run the container for this repository, including required env vars and ports.'
  ].join('\n');
};
