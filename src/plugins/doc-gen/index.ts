import { OrchestraPlugin } from '../../types';
import { AgentRole, consultAgentRouted } from '../../services/agentService';
import { readCiPrContext } from '../../services/ciContext';
import {
  buildBranchName,
  checkoutBranch,
  ensureCommitIdentity,
  commitChanges,
  createBranchFrom,
  fetchOrigin,
  getChangedFiles,
  getDiff,
  getHeadSha,
  getCurrentBranch,
  getMergeBase,
  remoteBranchExists,
  pushChanges,
  pushChangesForceWithLease,
  setWorkingDirectory
} from '../../services/gitService';
import { scanRepoSignals } from '../../services/repoScan';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { parseUnifiedDiffByFile } from '../../utils/diffUtils';
import { extractJsonObjectFromText } from '../../utils/jsonUtils';
import fs from 'fs';
import path from 'path';
import type { DocGenMode, NativeBuildKind, RepoSignals, StructurePlanItem } from './types';
import {
  getRepoRelPosix,
  isMarkdownFile,
  isMeaningfulDocUpdate,
  isTruthyEnv,
  normalizeAiMarkdown,
  normalizeForDuplicateHash,
  readTextFile,
  readTextFileTruncated,
  sha1,
  writeFileIfChanged,
  buildOpenApiYaml
} from './docUtils';
import {
  buildArchitectureDoc,
  buildApiDoc,
  buildDockerDoc,
  buildEnvironmentDoc,
  buildHelmDoc,
  buildKubernetesDoc,
  buildLocalSetupDoc,
  buildNativeBuildDoc,
  buildNginxDoc,
  buildOpenApiDoc,
  buildPipelinesDoc,
  buildRequirementsDoc,
  buildTerraformDoc
} from './drafts';
import { proposeStructurePlanWithAi } from './structurePlan';
import { pickBestDocPathForTopic } from './docSelection';
import { buildDocsTitleWithAi, collapseDuplicateDocsToPointer } from './docsPr';

const TOP_LEVEL_DOCS = ['README.md', 'GUIDE.md', 'PLUGINS.md'];
const DOCS_DIR_NAME = 'docs';
const DOCS_BRANCH_PREFIX = 'orchestra/docs';
const DOC_IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const DOC_IGNORED_FILE_SUFFIXES = ['.test.md', '.spec.md'];
const CANONICAL_DOCS_DIR = 'docs';
const CANONICAL_REQUIREMENTS_DOC = path.join(CANONICAL_DOCS_DIR, 'INSTALL_REQUIREMENTS.md');
const CANONICAL_ENVIRONMENT_DOC = path.join(CANONICAL_DOCS_DIR, 'ENVIRONMENT.md');
const CANONICAL_DOCKER_DOC = path.join(CANONICAL_DOCS_DIR, 'DOCKER.md');
const CANONICAL_ARCHITECTURE_DOC = path.join(CANONICAL_DOCS_DIR, 'ARCHITECTURE.md');

const isDocArtifactRel = (repoRelOrPath: string): boolean => {
  const rel = String(repoRelOrPath || '').replace(/\\/g, '/');
  const lower = rel.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return true;
  if (lower.startsWith('docs/') && (lower.endsWith('.yml') || lower.endsWith('.yaml') || lower.endsWith('.json'))) {
    const base = path.posix.basename(lower);
    if (base.includes('openapi') || base.includes('swagger')) return true;
  }
  return false;
};

const isRepoDocArtifactFile = (repoRoot: string, absPath: string): boolean => {
  const rel = getRepoRelPosix(repoRoot, absPath);
  return isDocArtifactRel(rel);
};
const tryResolveRepoRoot = (inputPath: string): string => {
  if (!inputPath || inputPath === 'repo') return process.cwd();
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) return process.cwd();
  const stat = fs.statSync(resolved);
  return stat.isDirectory() ? resolved : path.dirname(resolved);
};

const isIgnoredDocFile = (filePath: string): boolean => {
  const base = path.basename(filePath).toLowerCase();
  return DOC_IGNORED_FILE_SUFFIXES.some(s => base.endsWith(s));
};

const isIgnoredDocDir = (dirPath: string): boolean => {
  const base = path.basename(dirPath);
  return DOC_IGNORED_DIRS.has(base);
};

const listRepoDocumentationFiles = (repoRoot: string): string[] => {
  const results: string[] = [];

  const stack = [repoRoot];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    if (dir !== repoRoot && isIgnoredDocDir(dir)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.github') {
          continue;
        }
        if (entry.name === '.git') {
          continue;
        }
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isIgnoredDocDir(fullPath)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isMarkdownFile(fullPath)) continue;
      if (isIgnoredDocFile(fullPath)) continue;
      results.push(fullPath);
    }
  }

  return Array.from(new Set(results)).sort();
};

const isRepoDocumentationFile = (repoRoot: string, filePath: string): boolean => {
  const normalized = path.resolve(filePath);
  const rel = path.relative(repoRoot, normalized);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) && rel.includes('..')) return false;
  if (!isMarkdownFile(normalized)) return false;
  if (isIgnoredDocFile(normalized)) return false;

  const parts = rel.split(path.sep);
  if (parts.some(p => DOC_IGNORED_DIRS.has(p))) return false;
  if (parts.includes('.github') || parts.includes('.git')) return false;
  return true;
};

const pickDocsToUpdate = (repoRoot: string, changedFiles: string[], mode: DocGenMode): string[] => {
  const allDocs = listRepoDocumentationFiles(repoRoot);
  if (mode === 'all') return allDocs;

  const picks = new Set<string>();
  const absChanged = changedFiles
    .map(f => path.resolve(repoRoot, f))
    .filter(p => fs.existsSync(p));

  for (const abs of absChanged) {
    if (isRepoDocumentationFile(repoRoot, abs)) picks.add(abs);
  }

  const hasNonDocChanges = absChanged.some(f => !isRepoDocumentationFile(repoRoot, f));
  if (!hasNonDocChanges) return Array.from(picks);

  const changedRel = changedFiles.map(f => f.replace(/\\/g, '/'));

  const maybeAdd = (rel: string) => {
    const p = path.join(repoRoot, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) picks.add(p);
  };

  const addDocsMatching = (regex: RegExp) => {
    for (const doc of allDocs) {
      const rel = path.relative(repoRoot, doc).replace(/\\/g, '/');
      const base = path.basename(doc);
      if (regex.test(rel) || regex.test(base)) picks.add(doc);
    }
  };

  addDocsMatching(/^README\.md$/i);
  addDocsMatching(/^GUIDE\.md$/i);

  if (changedRel.some(f => f.startsWith('src/plugins/'))) {
    addDocsMatching(/^PLUGINS\.md$/i);
  }

  if (changedRel.some(f => f.startsWith('.github/workflows/') || f === 'action.yml')) {
    addDocsMatching(/github_actions/i);
    addDocsMatching(/github.*actions/i);
  }

  if (changedRel.some(f => f.startsWith('templates/') || f.toLowerCase().includes('gitlab'))) {
    addDocsMatching(/gitlab/i);
  }

  if (changedRel.some(f => f.startsWith('src/services/vcs/'))) {
    addDocsMatching(/integrations/i);
  }

  if (changedRel.some(f => f.startsWith('src/services/') || f.startsWith('src/server') || f.startsWith('src/index'))) {
    addDocsMatching(/pipelines/i);
    addDocsMatching(/ci/i);
  }

  if (changedRel.some(f => f === 'Dockerfile' || f.endsWith('/Dockerfile') || f.toLowerCase().includes('docker'))) {
    addDocsMatching(/docker/i);
    addDocsMatching(/deploy/i);
  }

  if (changedRel.some(f => f.includes('.env') || f.toLowerCase().includes('env') || f === 'action.yml')) {
    addDocsMatching(/environment/i);
    addDocsMatching(/\benv\b/i);
  }

  for (const doc of allDocs) {
    if (TOP_LEVEL_DOCS.includes(path.basename(doc))) picks.add(doc);
  }

  return Array.from(picks).filter(p => allDocs.includes(p));
};

const buildDocUpdateTask = (docFileName: string, mode: DocGenMode): string => {
  const modeNote =
    mode === 'all'
      ? 'Update documentation to reflect the current repository behavior and keep it accurate.'
      : 'Update documentation ONLY if the recent code changes require it.';

  return [
    'You are maintaining repository documentation.',
    modeNote,
    '',
    'Rules:',
    '- Output ONLY the FULL, COMPLETE updated markdown file content (no explanations, no surrounding code fences).',
    '- DO NOT output a diff, patch, or partial snippet. You must output the entire file from top to bottom.',
    '- Do not invent features or behavior that are not evidenced by the provided diffs/context.',
    '- Preserve existing meaning unless it is clearly outdated.',
    '- Make the minimum necessary updates to reflect the code changes. Do not rewrite the whole document unnecessarily.',
    '- If the documentation is already accurate, output exactly: NO_CHANGE',
    '',
    `Target File: ${docFileName}`
  ].join('\n');
};

const buildChangeContext = (params: {
  repoRoot: string;
  changedFiles: string[];
  diffsByFile: Map<string, string>;
  originalDocContent: string;
}): string => {
  const maxDiffChars = 9000;
  const maxFilesWithDiffs = 12;

  const changedList = params.changedFiles.length
    ? params.changedFiles.map(f => `- ${f}`).join('\n')
    : '(none)';

  const parts: string[] = [];
  parts.push('Recent Changes (git status):');
  parts.push(changedList);
  parts.push('');
  parts.push('Relevant Diffs (truncated):');

  let used = 0;
  let count = 0;

  for (const f of params.changedFiles) {
    const diff = params.diffsByFile.get(f);
    if (!diff) continue;
    const remaining = maxDiffChars - used;
    if (remaining <= 0) break;
    if (count >= maxFilesWithDiffs) break;

    const slice = diff.length > remaining ? diff.slice(0, remaining) : diff;
    used += slice.length;
    count += 1;
    parts.push(`File: ${f}`);
    parts.push('```diff');
    parts.push(slice);
    parts.push('```');
    parts.push('');
  }

  parts.push('Current Documentation Content:');
  parts.push(params.originalDocContent);

  return parts.join('\n');
};

export const generateDocumentation = async (inputPath: string, mode?: string): Promise<void> => {
  await plugin.action(inputPath, mode);
};

const plugin: OrchestraPlugin = {
  name: 'Documentation Generator',
  description:
    'Refine repository documentation. Updates markdown files only when changes are needed.',
  command: 'doc-gen',
  args: [
    { name: 'path', description: 'File or directory path (use "." for repo root)', required: true },
    { name: 'mode', description: 'changed | all | structure (optional, default: changed)', required: false }
  ],
  action: async (...args: any[]): Promise<void> => {
    const inputPath = String(args[0] ?? '').trim();
    const rawMode = String(args[1] ?? '').trim().toLowerCase();
    const mode: DocGenMode =
      rawMode === 'all'
        ? 'all'
        : rawMode === 'structure' || rawMode === 'organize' || rawMode === 'struct'
          ? 'structure'
          : 'changed';

    if (!inputPath) {
      console.error('Missing path argument.');
      return;
    }

    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      console.error(`Path not found: ${resolved}`);
      return;
    }

    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      if (!isMarkdownFile(resolved)) {
        const fileName = path.basename(resolved);
        const content = fs.readFileSync(resolved, 'utf-8');
        const task = [
          'Add JSDoc/TSDoc or native inline code comments to the provided source code file.',
          'Rules:',
          '- Add comments explaining non-obvious logic, public functions, and classes.',
          '- Output ONLY the fully updated source code (no explanations, no surrounding markdown code fences).',
          '- Do not change the logic or behavior of the code.',
          '- If the file is already well documented, output exactly: NO_CHANGE',
          '',
          `File Name: ${fileName}`
        ].join('\n');
        
        const aiResponse = await consultAgentRouted(AgentRole.SOFTWARE_ENGINEER, task, content);
        const next = aiResponse.replace(/^```[a-zA-Z0-9_-]*\n/, '').replace(/```$/, '').trim();
        
        if (next === 'NO_CHANGE' || !next || next === content.trim()) {
          console.log(`ℹ️ Code already well-documented: ${resolved}`);
          return;
        }
        
        fs.writeFileSync(resolved, next);
        console.log(`✅ Updated inline code documentation: ${resolved}`);
        return;
      }

      const original = fs.readFileSync(resolved, 'utf-8');
      const task = buildDocUpdateTask(path.basename(resolved), mode);
      const aiResponse = await consultAgentRouted(AgentRole.TECHNICAL_WRITER, task, original);
      const normalized = normalizeAiMarkdown(aiResponse);

      if (normalized.noChange) {
        console.log(`ℹ️ No documentation updates needed: ${resolved}`);
        return;
      }

      const next = normalized.content;
      if (!next.trim() || next.trim() === original.trim()) {
        console.log(`ℹ️ No documentation updates needed: ${resolved}`);
        return;
      }

      if (!isMeaningfulDocUpdate(original, next)) {
        console.log(`ℹ️ Documentation already accurate (no meaningful change): ${resolved}`);
        return;
      }

      fs.writeFileSync(resolved, next);
      console.log(`✅ Updated documentation: ${resolved}`);
      return;
    }

    const repoRoot = tryResolveRepoRoot(resolved);
    setWorkingDirectory(repoRoot);

    const prContext = readCiPrContext();
    const docsPrEnv = String(process.env.ORCHESTRA_DOCS_PR || '').trim().toLowerCase();
    const docsPrDisabled = docsPrEnv === '0' || docsPrEnv === 'false' || docsPrEnv === 'off' || docsPrEnv === 'no';
    const docsPrEnabled = !docsPrDisabled && (isTruthyEnv(process.env.ORCHESTRA_DOCS_PR) || !!prContext);

    // If we have a PR context, try to get a VCS provider (auto-detects GitHub, GitLab, Azure, etc.)
    const vcs = prContext ? VcsFactory.getProvider() : null;

    let changedFiles: string[] = [];
    let diffsByFile = new Map<string, string>();

    if (mode === 'changed' || mode === 'structure') {
      if (prContext && vcs) {
        const prDiff = await vcs.getPullRequestDiff(prContext.prNumber);
        if (!prDiff && mode === 'changed') {
          console.log('ℹ️ Unable to fetch PR diff. Documentation update skipped.');
          return;
        }
        if (prDiff) {
          const parsed = parseUnifiedDiffByFile(prDiff);
          changedFiles = parsed.changedFiles;
          diffsByFile = parsed.diffsByFile;
        }
      } else {
        changedFiles = await getChangedFiles();
        if ((!changedFiles || changedFiles.length === 0) && mode === 'changed') {
          console.log('ℹ️ No repository changes detected. Documentation update skipped.');
          return;
        }

        if (changedFiles.length) {
          const maxDiffPerFile = 2500;
          for (const f of changedFiles.slice(0, 25)) {
            const diff = await getDiff(f);
            const trimmed = diff ? diff.trim() : '';
            if (!trimmed) continue;
            diffsByFile.set(
              f,
              trimmed.length > maxDiffPerFile ? trimmed.slice(0, maxDiffPerFile) : trimmed
            );
          }
        }
      }

      if ((!changedFiles || changedFiles.length === 0) && mode === 'changed') {
        console.log('ℹ️ No repository changes detected. Documentation update skipped.');
        return;
      }

      const nonDocChangedFiles = (changedFiles || []).filter(f => !isDocArtifactRel(f));
      if (changedFiles.length > 0 && nonDocChangedFiles.length === 0 && mode !== 'structure') {
        console.log('ℹ️ Only documentation files changed. Documentation update skipped.');
        return;
      }

      if (nonDocChangedFiles.length !== changedFiles.length && mode !== 'structure') {
        changedFiles = nonDocChangedFiles;
        const nextDiffs = new Map<string, string>();
        for (const f of nonDocChangedFiles) {
          const d = diffsByFile.get(f);
          if (d) nextDiffs.set(f, d);
        }
        diffsByFile = nextDiffs;
      }

      if ((!changedFiles || changedFiles.length === 0) && mode === 'changed') {
        console.log('ℹ️ No non-documentation changes detected. Documentation update skipped.');
        return;
      }

      if (prContext && docsPrEnabled && vcs && !prContext.isFork) {
        const current = await getCurrentBranch();
        const isDocsContext =
          prContext.headRef.startsWith(DOCS_BRANCH_PREFIX) || current.startsWith(DOCS_BRANCH_PREFIX);
        if (!isDocsContext) {
          const stableDocsBranchName = `${DOCS_BRANCH_PREFIX}/pr-${prContext.prNumber}`;
          try {
            await fetchOrigin();
            const exists = await remoteBranchExists(stableDocsBranchName);
            if (exists) {
              const headSha = await getHeadSha();
              const base = headSha ? await getMergeBase(`origin/${stableDocsBranchName}`, headSha) : '';
              if (headSha && base === headSha) {
                console.log(
                  `ℹ️ Documentation already updated for current PR head via branch: ${stableDocsBranchName}. Skipping.`
                );
                return;
              }
            }
          } catch {
          }
        }
      }
    }

    const maybeBootstrapStructure =
      mode === 'changed' && (() => {
        const docs = listRepoDocumentationFiles(repoRoot);
        const nonReadmeDocs = docs.filter(d => path.basename(d).toLowerCase() !== 'readme.md');
        return changedFiles.length > 0 && nonReadmeDocs.length === 0;
      })();

    const runStructuredDocs = async (): Promise<void> => {
      const allDocs = listRepoDocumentationFiles(repoRoot);
      const signals: RepoSignals = scanRepoSignals(repoRoot, changedFiles);

      const dockerText = signals.dockerfilePath ? readTextFile(signals.dockerfilePath) : '';

      const plan = await proposeStructurePlanWithAi(repoRoot, allDocs, signals);

      const structureSignals = [
        `Changed files:\n${(signals.changedFiles || []).map(f => `- ${f}`).join('\n') || '(none)'}`,
        '',
        `App type:\n- ${signals.appType}`,
        '',
        `Languages:\n${signals.languages.length ? signals.languages.map(l => `- ${l}`).join('\n') : '- (unknown)'}`,
        '',
        `Frontend:\n- detected: ${signals.frontend.detected ? 'yes' : 'no'}\n- kinds: ${
          signals.frontend.kinds.join(', ') || '(none)'
        }`,
        '',
        `Backend:\n- detected: ${signals.backend.detected ? 'yes' : 'no'}\n- kinds: ${signals.backend.kinds.join(', ') || '(none)'}\n- endpoints (heuristic): ${
          signals.apiEndpoints.length
        }`,
        '',
        `Embedded:\n- detected: ${signals.embedded.detected ? 'yes' : 'no'}\n- kinds: ${signals.embedded.kinds.join(', ') || '(none)'}`,
        '',
        `Top-level dirs:\n${signals.topLevelDirs.map(d => `- ${d}/`).join('\n') || '(none)'}`,
        '',
        `Top-level files:\n${signals.topLevelFiles.slice(0, 30).map(f => `- ${f}`).join('\n') || '(none)'}`,
        '',
        signals.dockerfilePath
          ? `Dockerfile detected (${getRepoRelPosix(repoRoot, signals.dockerfilePath)}):\n- base image: ${signals.dockerfile.baseImage || '(unknown)'}\n- packages: ${signals.dockerfile.packages.join(', ') || '(none)'}`
          : 'Dockerfile: (not present)',
        '',
        `Docker compose files:\n${signals.dockerComposeFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `Nginx files:\n${signals.nginxFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `Kubernetes files:\n${signals.k8sFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `Helm files:\n${signals.helmFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `Terraform files:\n${signals.terraformFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `OpenAPI spec files:\n${signals.openApiSpecFiles.map(f => `- ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '(none)'}`,
        '',
        `Native build:\n- kind: ${signals.nativeBuild.kind}\n- build files:\n${signals.nativeBuild.files.map(f => `  - ${getRepoRelPosix(repoRoot, f)}`).join('\n') || '  - (none)'}\n- has C/C++ sources: ${signals.nativeBuild.hasSources ? 'yes' : 'no'}`
      ].join('\n');

      const buildOpenApiYaml = (endpoints: Array<{ method: string; path: string; source: string }>): string => {
        const sorted = endpoints
          .slice()
          .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
          .slice(0, 200);

        const lines: string[] = [];
        lines.push('openapi: 3.0.3');
        lines.push('info:');
        lines.push('  title: API');
        lines.push('  version: 0.1.0');
        lines.push('paths:');
        if (!sorted.length) {
          lines.push('  {}');
          return lines.join('\n') + '\n';
        }

        const byPath = new Map<string, typeof sorted>();
        for (const e of sorted) {
          const group = byPath.get(e.path) || [];
          group.push(e);
          byPath.set(e.path, group);
        }

        for (const p of Array.from(byPath.keys()).sort()) {
          lines.push(`  ${p}:`);
          const group = byPath.get(p) || [];
          const byMethod = new Map<string, typeof group>();
          for (const e of group) {
            const key = e.method.toLowerCase();
            const list = byMethod.get(key) || [];
            list.push(e);
            byMethod.set(key, list);
          }
          for (const method of Array.from(byMethod.keys()).sort()) {
            const src = byMethod.get(method)?.[0]?.source || '';
            lines.push(`    ${method}:`);
            lines.push(`      summary: ${method.toUpperCase()} ${p}`);
            if (src) lines.push(`      description: Source: ${src}`);
            lines.push('      responses:');
            lines.push("        '200':");
            lines.push('          description: OK');
          }
        }

        return lines.join('\n') + '\n';
      };

      const updateStructuredDoc = async (params: {
        title: string;
        absPath: string;
        draft: string;
        extraContext?: string;
      }): Promise<void> => {
        const exists = fs.existsSync(params.absPath);
        const existing = exists ? readTextFile(params.absPath) : '';

        const task = [
          `Standardize and maintain the "${params.title}" documentation for this repository.`,
          '',
          'Rules:',
          '- Output ONLY the FULL, COMPLETE markdown file content (no explanations, no surrounding code fences).',
          '- DO NOT output a diff, patch, or partial snippet. You must output the entire file from top to bottom.',
          '- Write HIGHLY DESCRIPTIVE and IN-DEPTH documentation based on the provided repository context.',
          '- Expand upon the provided draft: do not just leave short bullet points. Analyze the signals, app type, and files to write meaningful paragraphs.',
          '- AVOID meta-commentary: Do not use phrases like "heuristic analysis indicates", "is detected as", or "the signals suggest". Write as if you are the human architect explaining how the system works.',
          '- For Install Requirements, explicitly detail how to use language-specific package managers (e.g. pip, npm) vs system tools.',
          '- Make targeted updates to reflect the current state of the repository. Do not rewrite the entire document unnecessarily.',
          '- If no update is needed, output exactly: NO_CHANGE'
        ].join('\n');

        const context = [
          'Repository Signals:',
          structureSignals,
          '',
          params.extraContext ? `Additional Context:\n${params.extraContext}\n` : '',
          'Existing Content (if any):',
          existing || '(none)',
          '',
          'Draft (use as a starting point):',
          params.draft
        ].join('\n');

        const aiResponse = await consultAgentRouted(AgentRole.TECHNICAL_WRITER, task, context);
        const normalized = normalizeAiMarkdown(aiResponse);
        if (normalized.noChange) {
          if (!exists && params.draft.trim()) {
            writeFileIfChanged(params.absPath, params.draft);
          }
          return;
        }
        if (!normalized.content || !normalized.content.trim()) {
          if (!exists && params.draft.trim()) {
            writeFileIfChanged(params.absPath, params.draft);
          }
          return;
        }
        if (normalized.content && normalized.content.trim() !== existing.replace(/\r\n/g, '\n').trim()) {
          if (!isMeaningfulDocUpdate(existing, normalized.content)) return;
          writeFileIfChanged(params.absPath, normalized.content);
        }
      };

      const topicToDefaultRel: Record<StructurePlanItem['topic'], string> = {
        requirements: CANONICAL_REQUIREMENTS_DOC,
        environment: CANONICAL_ENVIRONMENT_DOC,
        'local-setup': path.join(CANONICAL_DOCS_DIR, 'LOCAL_SETUP.md'),
        architecture: CANONICAL_ARCHITECTURE_DOC,
        api: path.join(CANONICAL_DOCS_DIR, 'API.md'),
        pipelines: path.join(CANONICAL_DOCS_DIR, 'PIPELINES.md'),
        docker: CANONICAL_DOCKER_DOC,
        deployment: path.join(CANONICAL_DOCS_DIR, 'DEPLOYMENT.md'),
        nginx: path.join(CANONICAL_DOCS_DIR, 'NGINX.md'),
        kubernetes: path.join(CANONICAL_DOCS_DIR, 'KUBERNETES.md'),
        helm: path.join(CANONICAL_DOCS_DIR, 'HELM.md'),
        terraform: path.join(CANONICAL_DOCS_DIR, 'TERRAFORM.md'),
        openapi: path.join(CANONICAL_DOCS_DIR, 'OPENAPI.md'),
        build: path.join(CANONICAL_DOCS_DIR, 'BUILD.md'),
        security: path.join(CANONICAL_DOCS_DIR, 'SECURITY.md'),
        testing: path.join(CANONICAL_DOCS_DIR, 'TESTING.md'),
        contributing: path.join(CANONICAL_DOCS_DIR, 'CONTRIBUTING.md'),
        changelog: path.join(CANONICAL_DOCS_DIR, 'CHANGELOG.md')
      };

      const topicToMatch: Record<StructurePlanItem['topic'], RegExp> = {
        requirements: /requirements?|install[-_ ]?requirements?|system[-_ ]?requirements?|prerequisites?/i,
        environment: /environment|env(ironment)?|configuration/i,
        'local-setup': /local[-_ ]?setup|installation|install|getting[-_ ]started|dev[-_ ]setup/i,
        architecture: /architecture|overview|design|system|components?/i,
        api: /api|reference|sdk|library|cli|commands?/i,
        pipelines: /ci|pipelines?|workflows?|github[-_ ]actions?|gitlab[-_ ]ci|azure[-_ ]pipelines?/i,
        docker: /docker/i,
        deployment: /deploy|deployment|release/i,
        nginx: /nginx/i,
        kubernetes: /k8s|kubernetes/i,
        helm: /helm/i,
        terraform: /terraform/i,
        openapi: /openapi|swagger/i,
        build: /build|compile|cmake|makefile|meson|bazel/i,
        security: /security|auth|vuln/i,
        testing: /test|testing|qa|jest|cypress/i,
        contributing: /contributing|contrib/i,
        changelog: /changelog|history|releases?/i
      };

      const chosenTargets = new Map<StructurePlanItem['topic'], string>();

      for (const item of plan) {
        const desiredRel = item.desiredPath || topicToDefaultRel[item.topic];
        const abs = pickBestDocPathForTopic({
          repoRoot,
          allDocs,
          desiredRel,
          match: topicToMatch[item.topic]
        });
        chosenTargets.set(item.topic, abs);
      }

      for (const item of plan) {
        const absPath = chosenTargets.get(item.topic);
        if (!absPath) continue;

        let draft = '';
        let extraContext = '';
        if (item.topic === 'requirements') {
          draft = buildRequirementsDoc({
            docker: signals.dockerfile,
            hasPackageJson: signals.hasPackageJson,
            nativeBuild: signals.nativeBuild,
            languages: signals.languages
          });
        } else if (item.topic === 'environment') {
          draft = buildEnvironmentDoc();
        } else if (item.topic === 'local-setup') {
          draft = buildLocalSetupDoc(signals);
        } else if (item.topic === 'architecture') {
          draft = buildArchitectureDoc(signals);
          const parts: string[] = [];
          const addFile = (abs: string, max: number) => {
            if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return;
            parts.push(`${getRepoRelPosix(repoRoot, abs)}:\n${readTextFileTruncated(abs, max)}`);
          };
          for (const f of signals.frontend.files.slice(0, 4)) addFile(f, 2500);
          for (const f of signals.backend.files.slice(0, 4)) addFile(f, 2500);
          for (const f of signals.nativeBuild.files.slice(0, 3)) addFile(f, 2500);
          extraContext = parts.join('\n\n');
        } else if (item.topic === 'api') {
          draft = buildApiDoc(signals);
          const parts: string[] = [];
          const pkgPath = path.join(repoRoot, 'package.json');
          if (fs.existsSync(pkgPath)) {
            parts.push(`package.json:\n${readTextFileTruncated(pkgPath, 4000)}`);
          }
          const candidateEntrypoints = [
            path.join(repoRoot, 'src', 'index.ts'),
            path.join(repoRoot, 'src', 'index.js'),
            path.join(repoRoot, 'index.ts'),
            path.join(repoRoot, 'index.js')
          ].filter(p => fs.existsSync(p));
          for (const ep of candidateEntrypoints.slice(0, 2)) {
            parts.push(`${getRepoRelPosix(repoRoot, ep)}:\n${readTextFileTruncated(ep, 3000)}`);
          }
          extraContext = parts.join('\n\n');
        } else if (item.topic === 'pipelines') {
          draft = buildPipelinesDoc(repoRoot, signals.pipelineFiles);
          const parts: string[] = [];
          let budget = 12000;
          for (const p of signals.pipelineFiles) {
            if (budget <= 0) break;
            const text = readTextFileTruncated(p, Math.min(4000, budget));
            budget -= text.length;
            if (!text) continue;
            parts.push(`${getRepoRelPosix(repoRoot, p)}:\n${text}`);
          }
          extraContext = parts.join('\n\n');
        } else if (item.topic === 'docker' && (signals.dockerfilePath || signals.dockerComposeFiles.length)) {
          if (signals.dockerfilePath) {
            draft = buildDockerDoc({ dockerfilePath: signals.dockerfilePath, docker: signals.dockerfile });
          } else {
            draft = [
              '# Docker',
              '',
              '## Install',
              '- Docker Desktop / Engine: https://docs.docker.com/get-docker/',
              '- Docker Compose: https://docs.docker.com/compose/',
              '',
              '## Compose Files',
              signals.dockerComposeFiles.map(f => `- \`${getRepoRelPosix(repoRoot, f)}\``).join('\n'),
              '',
              '## Run',
              '```bash',
              'docker compose up',
              '```'
            ].join('\n');
          }
        } else if (item.topic === 'nginx') {
          draft = buildNginxDoc(repoRoot, signals.nginxFiles);
        } else if (item.topic === 'kubernetes') {
          draft = buildKubernetesDoc(repoRoot, signals.k8sFiles);
        } else if (item.topic === 'helm') {
          draft = buildHelmDoc(repoRoot, signals.helmFiles);
        } else if (item.topic === 'terraform') {
          draft = buildTerraformDoc(repoRoot, signals.terraformFiles);
        } else if (item.topic === 'openapi') {
          const existingSpecAbs = signals.openApiSpecFiles.length ? signals.openApiSpecFiles[0] : '';
          const specAbs = existingSpecAbs || path.join(repoRoot, CANONICAL_DOCS_DIR, 'openapi.yaml');
          const specRel = getRepoRelPosix(repoRoot, specAbs);
          const endpoints = signals.apiEndpoints || [];
          
          let safeToOverwriteSpec = !existingSpecAbs;
          if (existingSpecAbs) {
            const txt = readTextFile(existingSpecAbs);
            if (txt.includes('title: API') && txt.includes('version: 0.1.0')) {
              safeToOverwriteSpec = true;
            }
          }
          if (safeToOverwriteSpec) {
            writeFileIfChanged(specAbs, buildOpenApiYaml(endpoints));
          }
          
          draft = buildOpenApiDoc(repoRoot, signals.openApiSpecFiles, specRel, endpoints);
          if (endpoints.length) {
            extraContext = [
              `OpenAPI spec path: ${specRel}`,
              '',
              'Detected endpoints (heuristic):',
              endpoints
                .slice(0, 60)
                .map(e => `- ${e.method} ${e.path} (${e.source})`)
                .join('\n')
            ].join('\n');
          } else {
            extraContext = `OpenAPI spec path: ${specRel}`;
          }
        } else if (item.topic === 'build') {
          draft = buildNativeBuildDoc(repoRoot, { kind: signals.nativeBuild.kind, files: signals.nativeBuild.files });
        } else if (item.topic === 'testing') {
          draft = [
            '# Testing',
            '',
            '## Overview',
            '- Describe the testing strategy, tools, and frameworks used in this repository.',
            '',
            '## Running Tests',
            '- Provide commands to run unit, integration, and end-to-end tests locally.'
          ].join('\n');
        } else if (item.topic === 'security') {
          draft = [
            '# Security',
            '',
            '## Overview',
            '- Document authentication, authorization, and data protection strategies used.',
            '',
            '## Vulnerability Management',
            '- Document how dependencies are scanned and how to report vulnerabilities.'
          ].join('\n');
        } else if (item.topic === 'contributing') {
          draft = [
            '# Contributing',
            '',
            '## Guidelines',
            '- Provide guidelines for submitting pull requests, coding standards, and branch naming conventions.'
          ].join('\n');
        } else if (item.topic === 'changelog') {
          draft = [
            '# Changelog',
            '',
            '## Unreleased',
            '- Document upcoming features and fixes here.'
          ].join('\n');
        } else if (item.topic === 'deployment') {
          const lines: string[] = ['# Deployment', ''];
          if (dockerText) lines.push('- Docker is available. See Docker docs.');
          if (signals.k8sFiles.length) lines.push('- Kubernetes manifests are present. See Kubernetes docs.');
          if (signals.terraformFiles.length) lines.push('- Terraform is present. See Terraform docs.');
          draft = lines.join('\n');
        }

        if (!draft) continue;

        await updateStructuredDoc({
          title: item.title,
          absPath,
          draft,
          extraContext: extraContext || undefined
        });
      }

      const docsAfter = listRepoDocumentationFiles(repoRoot);
      const hashToDocs = new Map<string, string[]>();
      for (const doc of docsAfter) {
        const content = normalizeForDuplicateHash(readTextFile(doc));
        if (!content) continue;
        const key = sha1(content);
        const group = hashToDocs.get(key) || [];
        group.push(doc);
        hashToDocs.set(key, group);
      }

      const preferredCanonical = new Set<string>(Array.from(chosenTargets.values()).filter(Boolean));

      for (const group of hashToDocs.values()) {
        if (group.length < 2) continue;
        const sorted = group
          .slice()
          .sort((a, b) => {
            const relA = getRepoRelPosix(repoRoot, a);
            const relB = getRepoRelPosix(repoRoot, b);
            const prefA = preferredCanonical.has(a) ? 0 : 1;
            const prefB = preferredCanonical.has(b) ? 0 : 1;
            const inDocsA = relA.startsWith(`${CANONICAL_DOCS_DIR}/`) ? 0 : 1;
            const inDocsB = relB.startsWith(`${CANONICAL_DOCS_DIR}/`) ? 0 : 1;
            const depthA = relA.split('/').length;
            const depthB = relB.split('/').length;
            return prefA - prefB || inDocsA - inDocsB || depthA - depthB || relA.length - relB.length;
          });

        const canonicalAbs = sorted[0];
        const duplicatesAbs = sorted.slice(1);
        collapseDuplicateDocsToPointer({ repoRoot, canonicalAbs, duplicatesAbs });
      }

      const readmeAbs = path.join(repoRoot, 'README.md');
      if (fs.existsSync(readmeAbs) && fs.statSync(readmeAbs).isFile()) {
        const docLinks = plan
          .map(i => {
            const abs = chosenTargets.get(i.topic);
            if (!abs) return null;
            const rel = getRepoRelPosix(repoRoot, abs);
            if (!rel.toLowerCase().endsWith('.md')) return null;
            return { title: i.title, rel };
          })
          .filter(Boolean) as Array<{ title: string; rel: string }>;

        const unique = new Map<string, string>();
        for (const l of docLinks) unique.set(l.rel, l.title);
        const bulletList = Array.from(unique.entries())
          .map(([rel, title]) => `- [${title}](${rel})`)
          .join('\n');

        const section = ['## Documentation', '', bulletList || '- (none)', ''].join('\n');
        const existing = readTextFile(readmeAbs).replace(/\r\n/g, '\n');
        const lines = existing.split('\n');
        const idx = lines.findIndex(l => l.trim().toLowerCase() === '## documentation');
        let next = '';
        if (idx >= 0) {
          let end = idx + 1;
          while (end < lines.length) {
            const t = lines[end].trim();
            if (t.startsWith('## ')) break;
            end += 1;
          }

          // Merge existing links with the new links so we don't destroy manual edits
          const existingBlock = lines.slice(idx + 1, end).join('\n');
          const existingLinksRe = /- \[(.*?)\]\(([^)]+)\)/g;
          let m;
          while ((m = existingLinksRe.exec(existingBlock))) {
            const title = m[1];
            const rel = m[2];
            // If the link wasn't generated by the structure pass, keep it!
            // If it was, prefer the existing title so we don't overwrite manual renames
            unique.set(rel, title);
          }

          const updatedBulletList = Array.from(unique.entries())
            .map(([rel, title]) => `- [${title}](${rel})`)
            .join('\n');

          const updatedSection = ['## Documentation', '', updatedBulletList || '- (none)', ''].join('\n');
          next = [...lines.slice(0, idx), ...updatedSection.trimEnd().split('\n'), ...lines.slice(end)].join('\n').trimEnd() + '\n';
        } else {
          next = existing.trimEnd() + '\n\n' + section.trimEnd() + '\n';
        }
        writeFileIfChanged(readmeAbs, next);
      }
    };

    if (mode === 'structure' || maybeBootstrapStructure) {
      await runStructuredDocs();
    } else if (mode === 'changed' || mode === 'all') {
      const signals: RepoSignals = scanRepoSignals(repoRoot, changedFiles);
      if (signals.apiEndpoints && signals.apiEndpoints.length > 0) {
        const existingSpecAbs = signals.openApiSpecFiles.length ? signals.openApiSpecFiles[0] : '';
        const specAbs = existingSpecAbs || path.join(repoRoot, CANONICAL_DOCS_DIR, 'openapi.yaml');
        let safeToOverwriteSpec = !existingSpecAbs;
        if (existingSpecAbs && fs.existsSync(existingSpecAbs)) {
          const txt = readTextFile(existingSpecAbs);
          if (txt.includes('title: API') && txt.includes('version: 0.1.0')) {
            safeToOverwriteSpec = true;
          }
        }
        if (safeToOverwriteSpec) {
          writeFileIfChanged(specAbs, buildOpenApiYaml(signals.apiEndpoints));
        }
      }
    }

    const docsToUpdate = pickDocsToUpdate(repoRoot, changedFiles, mode === 'structure' ? 'changed' : mode);
    if (docsToUpdate.length === 0 && mode !== 'structure') {
      console.log('ℹ️ No documentation files selected for update. Documentation update skipped.');
      return;
    }

    const preExistingChanged = await getChangedFiles();
    const preExistingChangedDocs = (preExistingChanged || []).filter(f => {
      const abs = path.resolve(repoRoot, f);
      return fs.existsSync(abs) && isRepoDocArtifactFile(repoRoot, abs);
    });

    let docsBranchName = '';
    let docsBranchExistedRemote = false;
    if (prContext && docsPrEnabled && vcs) {
      const current = await getCurrentBranch();
      if (!prContext.isFork && !prContext.headRef.startsWith(DOCS_BRANCH_PREFIX) && !current.startsWith(DOCS_BRANCH_PREFIX)) {
        docsBranchName = `${DOCS_BRANCH_PREFIX}/pr-${prContext.prNumber}`;
        try {
          await fetchOrigin();
          docsBranchExistedRemote = await remoteBranchExists(docsBranchName);
          try {
            await checkoutBranch(prContext.headRef);
          } catch {
            await createBranchFrom(prContext.headRef, `origin/${prContext.headRef}`);
          }
          await createBranchFrom(docsBranchName, prContext.headRef);
        } catch (error) {
          console.error('Failed to prepare docs branch:', error);
          docsBranchName = '';
          docsBranchExistedRemote = false;
        }
      }
    }

    let updatedCount = preExistingChangedDocs.length;
    let skippedCount = 0;

    const docsAfterStructure = listRepoDocumentationFiles(repoRoot);
    const hashToCanonical = new Map<string, string>();
    const uniqueDocsToUpdate: string[] = [];

    const chooseCanonical = (pathsAbs: string[]): string => {
      const sorted = pathsAbs
        .slice()
        .sort((a, b) => {
          const relA = getRepoRelPosix(repoRoot, a);
          const relB = getRepoRelPosix(repoRoot, b);
          const inDocsA = relA.startsWith(`${CANONICAL_DOCS_DIR}/`) ? 0 : 1;
          const inDocsB = relB.startsWith(`${CANONICAL_DOCS_DIR}/`) ? 0 : 1;
          const depthA = relA.split('/').length;
          const depthB = relB.split('/').length;
          return inDocsA - inDocsB || depthA - depthB || relA.length - relB.length;
        });
      return sorted[0];
    };

    const contentHashGroups = new Map<string, string[]>();
    for (const doc of docsAfterStructure) {
      const content = normalizeForDuplicateHash(readTextFile(doc));
      if (!content) continue;
      const key = sha1(content);
      const group = contentHashGroups.get(key) || [];
      group.push(doc);
      contentHashGroups.set(key, group);
    }

    for (const [key, group] of contentHashGroups.entries()) {
      if (group.length < 2) continue;
      hashToCanonical.set(key, chooseCanonical(group));
    }

    for (const abs of docsToUpdate) {
      if (!fs.existsSync(abs)) continue;
      const content = normalizeForDuplicateHash(readTextFile(abs));
      if (!content) continue;
      const key = sha1(content);
      const canonical = hashToCanonical.get(key);
      if (canonical && canonical !== abs) {
        skippedCount += 1;
        continue;
      }
      uniqueDocsToUpdate.push(abs);
    }

    const docsToUpdateViaAi = uniqueDocsToUpdate;

    for (const docPath of docsToUpdateViaAi) {
      const originalDoc = fs.readFileSync(docPath, 'utf-8');
      const task = buildDocUpdateTask(path.basename(docPath), mode);
      const context =
        mode === 'all'
          ? originalDoc
          : buildChangeContext({
              repoRoot,
              changedFiles,
              diffsByFile,
              originalDocContent: originalDoc
            });

      const aiResponse = await consultAgentRouted(AgentRole.TECHNICAL_WRITER, task, context);
      const normalized = normalizeAiMarkdown(aiResponse);

      if (normalized.noChange) {
        skippedCount += 1;
        continue;
      }

      const next = normalized.content;
      if (!next.trim() || next.trim() === originalDoc.trim()) {
        skippedCount += 1;
        continue;
      }

      if (!isMeaningfulDocUpdate(originalDoc, next)) {
        skippedCount += 1;
        continue;
      }

      fs.writeFileSync(docPath, next);
      updatedCount += 1;
    }

    if (updatedCount === 0 && mode !== 'structure') {
      console.log('ℹ️ No documentation updates were necessary.');
      return;
    }

    if (mode === 'structure') {
        console.log(`✅ Structure generated. Documentation updated: ${updatedCount} file(s). Skipped: ${skippedCount} file(s).`);
    } else {
        console.log(`✅ Documentation updated: ${updatedCount} file(s). Skipped: ${skippedCount} file(s).`);
    }

    const postUpdateChanged = await getChangedFiles();
    const changedDocs = (postUpdateChanged || []).filter(f => {
      const abs = path.resolve(repoRoot, f);
      return fs.existsSync(abs) && isRepoDocArtifactFile(repoRoot, abs);
    });

    if (!prContext || !vcs) return;

    if (changedDocs.length === 0) return;

    if (!docsBranchName) {
      try {
        await vcs.addComment(
          prContext.prNumber,
          `### 📝 Documentation updated by Orchestra\n\nDocumentation changes were generated, but no docs PR branch was created.\n\nChanged files:\n${changedDocs
            .map(f => `- \`${f}\``)
            .join('\n')}`
        );
      } catch {
      }
      return;
    }

    try {
      const titleInfo = await buildDocsTitleWithAi({
        prNumber: prContext.prNumber,
        changedDocs,
        changedFiles
      });
      const commitName = process.env.ORCHESTRA_GIT_NAME || 'Orchestra';
      const commitEmail =
        process.env.ORCHESTRA_GIT_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com';
      await ensureCommitIdentity(commitName, commitEmail);
      await commitChanges(titleInfo.commit, changedDocs);
      if (docsBranchExistedRemote) {
        await pushChangesForceWithLease(docsBranchName);
      } else {
        await pushChanges(docsBranchName);
      }

      const prUrl = await vcs.createPullRequest(
        titleInfo.title,
        docsBranchName,
        prContext.headRef,
        `This PR contains documentation updates generated by Orchestra for #${prContext.prNumber}.`
      );

      const linkLine = prUrl ? `\n\nDocs PR: ${prUrl}` : '';

      await vcs.addComment(
        prContext.prNumber,
        `### 📝 Documentation update\n\nOrchestra generated documentation updates on branch \`${docsBranchName}\` and opened a PR against \`${prContext.headRef}\`.\n\nChanged files:\n${changedDocs
          .map(f => `- \`${f}\``)
          .join('\n')}${linkLine}`
      );
    } catch (error) {
      console.error('Failed to create docs PR:', error);
      try {
        await vcs.addComment(
          prContext.prNumber,
          `### 📝 Documentation update\n\nOrchestra generated documentation updates, but failed to open a docs PR.\n\nChanged files:\n${changedDocs
            .map(f => `- \`${f}\``)
            .join('\n')}`
        );
      } catch {
      }
    }
  }
};

export default plugin;
