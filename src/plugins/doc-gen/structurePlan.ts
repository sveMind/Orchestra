import path from 'path';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { extractJsonObjectFromText } from '../../utils/jsonUtils';
import type { RepoSignals, StructurePlanItem } from './types';
import { getRepoRelPosix } from './docUtils';

const computeAvailableTopics = (signals: RepoSignals): StructurePlanItem['topic'][] => {
  const topics: StructurePlanItem['topic'][] = [
    'requirements',
    'environment',
    'local-setup',
    'architecture',
    'security',
    'testing',
    'contributing',
    'changelog'
  ];

  const hasNative = signals.nativeBuild.kind !== 'none' || signals.nativeBuild.hasSources;
  if (signals.backend.detected || signals.hasPackageJson || hasNative) topics.push('api');

  if (signals.pipelineFiles.length) topics.push('pipelines');
  if (signals.dockerfilePath || signals.dockerComposeFiles.length) topics.push('docker');
  if (signals.nginxFiles.length) topics.push('nginx');
  if (signals.k8sFiles.length) topics.push('kubernetes');
  if (signals.helmFiles.length) topics.push('helm');
  if (signals.terraformFiles.length) topics.push('terraform');
  if (signals.openApiSpecFiles.length || signals.backend.detected || signals.apiEndpoints.length > 0) topics.push('openapi');
  if (hasNative) topics.push('build');

  const hasDeploymentSignals =
    (signals.dockerfilePath || signals.dockerComposeFiles.length) ||
    signals.k8sFiles.length > 0 ||
    signals.terraformFiles.length > 0 ||
    signals.nginxFiles.length > 0;
  if (hasDeploymentSignals) topics.push('deployment');

  return Array.from(new Set(topics));
};

const sanitizeDesiredDocPath = (desired: string): string => {
  const raw = String(desired || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (!raw.toLowerCase().endsWith('.md')) return '';
  if (raw.startsWith('../') || raw.includes('/../')) return '';
  if (!raw.startsWith('docs/')) return '';
  return raw;
};

export const proposeStructurePlanWithAi = async (
  repoRoot: string,
  allDocs: string[],
  signals: RepoSignals
): Promise<StructurePlanItem[]> => {
  const allDocsRel = allDocs.map(p => `- ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '(none)';
  const availableTopics = computeAvailableTopics(signals);

  const task = [
    'Create a documentation update plan for this repository.',
    '',
    'Goal:',
    '- Keep repository documentation alive and accurate as the code changes.',
    '- Focus ONLY on documenting the repository itself (API, build/run/test, pipelines, deployment).',
    '- Do NOT document the documentation tool itself.',
    '',
    'Rules:',
    '- Output strict JSON only: {"docs":[{"topic":"...","title":"...","desiredPath":"docs/NAME.md"}]}',
    `- Choose topics only from: ${availableTopics.join(', ')}`,
    '- Only include topics that are directly supported by the signals.',
    '- Prefer reusing existing docs (don’t create new docs if an existing one covers the topic).',
    '- Keep docs list to 3-8 items.',
    '',
    'Signals:',
    `- available topics: ${availableTopics.join(', ')}`,
    `- changed files: ${signals.changedFiles.length}`,
    `- app type: ${signals.appType}`,
    `- languages: ${signals.languages.join(', ') || '(unknown)'}`,
    `- frontend: ${signals.frontend.detected ? signals.frontend.kinds.join(', ') : '(none)'}`,
    `- backend: ${signals.backend.detected ? signals.backend.kinds.join(', ') : '(none)'}`,
    `- embedded: ${signals.embedded.detected ? signals.embedded.kinds.join(', ') : '(none)'}`,
    `- has package.json: ${signals.hasPackageJson ? 'yes' : 'no'}`,
    `- node api hints: ${
      signals.nodeApiHints
        ? `bin(${signals.nodeApiHints.bin.length}), exports(${signals.nodeApiHints.exports.length}), scripts(${signals.nodeApiHints.scripts.length})`
        : '(none)'
    }`,
    `- api endpoints (heuristic): ${signals.apiEndpoints.length}`,
    `- dockerfile: ${signals.dockerfilePath ? getRepoRelPosix(repoRoot, signals.dockerfilePath) : '(none)'}`,
    `- docker-compose files:\n${signals.dockerComposeFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- nginx files:\n${signals.nginxFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- pipeline files:\n${signals.pipelineFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- kubernetes files:\n${signals.k8sFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- helm files:\n${signals.helmFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- terraform files:\n${signals.terraformFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- openapi spec files:\n${signals.openApiSpecFiles.map(p => `  - ${getRepoRelPosix(repoRoot, p)}`).join('\n') || '  - (none)'}`,
    `- native build: ${signals.nativeBuild.kind} (has sources: ${signals.nativeBuild.hasSources ? 'yes' : 'no'})`,
    '',
    'Existing docs:',
    allDocsRel
  ].join('\n');

  const raw = await consultAgentRouted(AgentRole.ARCHITECT, task, '');
  const parsed = extractJsonObjectFromText(raw) as { docs?: unknown } | null;
  const docs = parsed && Array.isArray((parsed as any).docs) ? ((parsed as any).docs as any[]) : [];

  const items: StructurePlanItem[] = [];
  const allowedTopics = new Set<StructurePlanItem['topic']>(availableTopics);
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    const topic = String((d as any).topic || '').trim().toLowerCase();
    const title = String((d as any).title || '').trim();
    const desiredPathRaw = String((d as any).desiredPath || '').trim();
    const desiredPath = sanitizeDesiredDocPath(desiredPathRaw);

    if (!allowedTopics.has(topic as StructurePlanItem['topic'])) continue;
    if (!title) continue;

    items.push({ topic: topic as StructurePlanItem['topic'], title, desiredPath: desiredPath || undefined });
  }

  if (items.length) {
    if (availableTopics.includes('openapi') && !items.some(i => i.topic === 'openapi')) {
      items.push({ topic: 'openapi', title: 'OpenAPI', desiredPath: path.join('docs', 'OPENAPI.md') });
    }
    return items.slice(0, 8);
  }

  const fallback: StructurePlanItem[] = [
    { topic: 'requirements', title: 'Install Requirements', desiredPath: path.join('docs', 'INSTALL_REQUIREMENTS.md') },
    { topic: 'environment', title: 'Environment', desiredPath: path.join('docs', 'ENVIRONMENT.md') },
    { topic: 'local-setup', title: 'Local Setup', desiredPath: path.join('docs', 'LOCAL_SETUP.md') },
    { topic: 'architecture', title: 'Architecture', desiredPath: path.join('docs', 'ARCHITECTURE.md') },
    { topic: 'testing', title: 'Testing', desiredPath: path.join('docs', 'TESTING.md') },
    { topic: 'security', title: 'Security', desiredPath: path.join('docs', 'SECURITY.md') }
  ];

  if (availableTopics.includes('api')) fallback.push({ topic: 'api', title: 'API', desiredPath: path.join('docs', 'API.md') });
  if (availableTopics.includes('pipelines')) fallback.push({ topic: 'pipelines', title: 'Pipelines', desiredPath: path.join('docs', 'PIPELINES.md') });
  if (availableTopics.includes('docker')) fallback.push({ topic: 'docker', title: 'Docker', desiredPath: path.join('docs', 'DOCKER.md') });
  if (availableTopics.includes('deployment')) fallback.push({ topic: 'deployment', title: 'Deployment', desiredPath: path.join('docs', 'DEPLOYMENT.md') });
  if (availableTopics.includes('openapi')) fallback.push({ topic: 'openapi', title: 'OpenAPI', desiredPath: path.join('docs', 'OPENAPI.md') });
  if (availableTopics.includes('build')) fallback.push({ topic: 'build', title: 'Build', desiredPath: path.join('docs', 'BUILD.md') });
  if (availableTopics.includes('nginx')) fallback.push({ topic: 'nginx', title: 'Nginx', desiredPath: path.join('docs', 'NGINX.md') });
  if (availableTopics.includes('kubernetes')) fallback.push({ topic: 'kubernetes', title: 'Kubernetes', desiredPath: path.join('docs', 'KUBERNETES.md') });
  if (availableTopics.includes('helm')) fallback.push({ topic: 'helm', title: 'Helm', desiredPath: path.join('docs', 'HELM.md') });
  if (availableTopics.includes('terraform')) fallback.push({ topic: 'terraform', title: 'Terraform', desiredPath: path.join('docs', 'TERRAFORM.md') });

  return fallback;
};
