import path from 'path';
import { consultAgentRouted, AgentRole } from '../../services/agentService';
import { extractJsonObjectFromText } from '../../utils/jsonUtils';
import { getRepoRelPosix, writeFileIfChanged } from './docUtils';

const buildPointerDoc = (params: { repoRoot: string; fromAbs: string; toRel: string; title: string }): string => {
  const relLink = path.relative(path.dirname(params.fromAbs), path.join(params.repoRoot, params.toRel)).replace(/\\/g, '/');
  return [`# ${params.title}`, '', `This documentation is maintained at [${params.toRel}](${relLink}).`].join('\n');
};

export const collapseDuplicateDocsToPointer = (params: {
  repoRoot: string;
  canonicalAbs: string;
  duplicatesAbs: string[];
}): number => {
  const canonicalRel = getRepoRelPosix(params.repoRoot, params.canonicalAbs);
  let changed = 0;
  for (const dupAbs of params.duplicatesAbs) {
    const title = path.basename(dupAbs, path.extname(dupAbs)) || 'Documentation';
    const pointer = buildPointerDoc({
      repoRoot: params.repoRoot,
      fromAbs: dupAbs,
      toRel: canonicalRel,
      title
    });
    if (writeFileIfChanged(dupAbs, pointer)) changed += 1;
  }
  return changed;
};

const buildDocsTitleFallback = (params: { prNumber: number; changedDocs: string[] }): { title: string; commit: string } => {
  const names = params.changedDocs.map(f => path.basename(f).toLowerCase());
  const topics: string[] = [];
  const add = (t: string) => {
    if (!topics.includes(t)) topics.push(t);
  };

  if (names.some(n => n === 'readme.md')) add('readme');
  if (names.some(n => n.includes('requirements'))) add('install requirements');
  if (names.some(n => n.includes('environment') || n.includes('env'))) add('environment');
  if (names.some(n => n.includes('docker'))) add('docker');
  if (names.some(n => n.includes('openapi') || n.includes('swagger'))) add('openapi');
  if (names.some(n => n.includes('build'))) add('build');

  const topicPart = topics.length ? topics.join(' & ') : 'documentation';
  const title = `docs: update ${topicPart} (PR #${params.prNumber})`;
  const commit = `docs: update ${topicPart} for PR #${params.prNumber}`;
  return { title, commit };
};

export const buildDocsTitleWithAi = async (params: {
  prNumber: number;
  changedDocs: string[];
  changedFiles: string[];
}): Promise<{ title: string; commit: string }> => {
  const fallback = buildDocsTitleFallback({ prNumber: params.prNumber, changedDocs: params.changedDocs });

  const task = [
    'Generate a short, descriptive git commit subject and PR title for documentation updates.',
    '',
    'Rules:',
    '- Output strict JSON only: {"title":"...","commit":"..."}',
    '- Keep both <= 72 characters if possible.',
    '- Do not invent features; use only the file names provided.',
    '- Use a "docs:" prefix for both fields.',
    '',
    `PR Number: ${params.prNumber}`,
    '',
    'Changed documentation files:',
    params.changedDocs.map(f => `- ${f}`).join('\n') || '(none)',
    '',
    'Non-doc changed files (context):',
    params.changedFiles.map(f => `- ${f}`).join('\n') || '(none)'
  ].join('\n');

  const raw = await consultAgentRouted(AgentRole.TECHNICAL_WRITER, task, '');
  const parsed = extractJsonObjectFromText(raw) as { title?: unknown; commit?: unknown } | null;

  const title = parsed && typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const commit = parsed && typeof parsed.commit === 'string' ? parsed.commit.trim() : '';

  if (!title || !commit) return fallback;

  const safeTitle = title.length > 120 ? title.slice(0, 120) : title;
  const safeCommit = commit.length > 120 ? commit.slice(0, 120) : commit;

  if (!safeTitle.toLowerCase().startsWith('docs:') || !safeCommit.toLowerCase().startsWith('docs:')) {
    return fallback;
  }

  return { title: safeTitle, commit: safeCommit };
};

