import fs from 'fs';
import path from 'path';
import { sha1 } from './docUtils';

export type DocGenStateEntry = {
  lastWrittenAt: string;
  lastFingerprint: string; // sha1 of the file's markdown after last successful write
  repoSignalsFingerprint: string; // sha1 over the snapshot of repo signals used to produce this doc
  lastImpactScore: number;
  lastRerunReason: string | null;
  changedFilesHash: string | null; // sha1 over changedFiles+diff when this doc was regenerated
  updatedByMode: string | null;
};

export type DocGenState = {
  version: 1;
  docs: Record<string, DocGenStateEntry>;
  lastRunSummary: {
    at: string | null;
    mode: string | null;
    touchedDocPaths: string[];
    skippedAsFresh: string[];
    totalChangedFilesInScope: number | null;
  };
};

export const STATE_FILE_NAME = 'doc-gen-state.json';

export const stateFilePath = (repoRoot: string): string =>
  path.join(repoRoot, '.orchestra', STATE_FILE_NAME);

export const readDocGenState = (repoRoot: string): DocGenState => {
  const fp = stateFilePath(repoRoot);
  try {
    if (!fs.existsSync(fp)) return makeEmptyState();
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return makeEmptyState();
    if (typeof parsed.docs !== 'object') parsed.docs = {};
    if (!parsed.lastRunSummary) parsed.lastRunSummary = emptySummary();
    return parsed as DocGenState;
  } catch {
    return makeEmptyState();
  }
};

export const writeDocGenState = (repoRoot: string, state: DocGenState): void => {
  const fp = stateFilePath(repoRoot);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2) + '\n', 'utf8');
};

const emptySummary = (): DocGenState['lastRunSummary'] => ({
  at: null,
  mode: null,
  touchedDocPaths: [],
  skippedAsFresh: [],
  totalChangedFilesInScope: null
});

export const makeEmptyState = (): DocGenState => ({
  version: 1,
  docs: {},
  lastRunSummary: emptySummary()
});

export const computeRepoSignalsFingerprint = (inputs: {
  appType: string;
  languages: string[];
  changedFiles: string[];
  totalSignalsSnapshot?: Record<string, unknown>;
}): string => {
  const canonical = JSON.stringify({
    appType: inputs.appType || '',
    languages: [...(inputs.languages || [])].sort(),
    changedFiles: [...(inputs.changedFiles || [])].sort(),
    snap: inputs.totalSignalsSnapshot || null
  });
  return sha1(canonical);
};

export const computeChangedFilesHash = (changedFilesRel: string[], diffsByFile: Map<string, string>): string => {
  const parts: string[] = [];
  for (const rel of [...changedFilesRel].sort()) {
    parts.push(`${rel}\t${sha1(diffsByFile.get(rel) || '')}`);
  }
  return sha1(parts.join('\n') || 'none');
};

export type FreshnessCheck = {
  stale: boolean;
  reason: string | null;
  prevState: DocGenStateEntry | null;
};

export const checkDocFreshness = (params: {
  repoRoot: string;
  docAbsPath: string;
  currentImpactScore: number;
  repoSignalsFingerprint: string;
  changedFilesHash: string | null;
  mode: string;
  minImpactScoreDeltaToForce?: number;
}): FreshnessCheck => {
  const state = readDocGenState(params.repoRoot);
  const key = docKeyForPath(params.repoRoot, params.docAbsPath);
  const prev = state.docs[key] || null;

  if (!prev) return { stale: true, reason: 'no-prior-state', prevState: null };

  if (params.mode === 'all') return { stale: true, reason: 'mode=all', prevState: prev };

  if (!fs.existsSync(params.docAbsPath)) return { stale: true, reason: 'doc-missing', prevState: prev };
  let currentContent = '';
  try { currentContent = fs.readFileSync(params.docAbsPath, 'utf8'); } catch { currentContent = ''; }
  const currentFinger = sha1(currentContent || '');
  if (prev.lastFingerprint !== currentFinger) {
    return { stale: true, reason: 'doc-modified-outside-doc-gen', prevState: prev };
  }

  if (params.changedFilesHash && prev.changedFilesHash !== params.changedFilesHash) {
    const delta = params.currentImpactScore - (prev.lastImpactScore || 0);
    const minDelta = params.minImpactScoreDeltaToForce ?? 1;
    if (params.currentImpactScore > 0 && delta >= minDelta) {
      return { stale: true, reason: `impact-score-rose-by-${delta}`, prevState: prev };
    }
    if (params.currentImpactScore > 0 && prev.lastImpactScore === 0) {
      return { stale: true, reason: 'new-positive-impact-score', prevState: prev };
    }
  }

  if (prev.repoSignalsFingerprint !== params.repoSignalsFingerprint && params.currentImpactScore > 0) {
    return { stale: true, reason: 'repo-signals-shifted', prevState: prev };
  }

  return { stale: false, reason: null, prevState: prev };
};

export const recordDocWritten = (params: {
  repoRoot: string;
  docAbsPath: string;
  docContentAfter: string;
  repoSignalsFingerprint: string;
  changedFilesHash: string | null;
  impactScore: number;
  mode: string;
  rerunReason: string | null;
}): DocGenState => {
  const state = readDocGenState(params.repoRoot);
  const key = docKeyForPath(params.repoRoot, params.docAbsPath);
  state.docs[key] = {
    lastWrittenAt: new Date().toISOString(),
    lastFingerprint: sha1(params.docContentAfter || ''),
    repoSignalsFingerprint: params.repoSignalsFingerprint,
    lastImpactScore: params.impactScore,
    lastRerunReason: params.rerunReason,
    changedFilesHash: params.changedFilesHash,
    updatedByMode: params.mode
  };
  return state;
};

export const setRunSummary = (params: {
  state: DocGenState;
  mode: string;
  touched: string[];
  skippedAsFresh: string[];
  totalChangedFiles: number | null;
}): DocGenState => {
  params.state.lastRunSummary = {
    at: new Date().toISOString(),
    mode: params.mode,
    touchedDocPaths: [...params.touched],
    skippedAsFresh: [...params.skippedAsFresh],
    totalChangedFilesInScope: params.totalChangedFiles
  };
  return params.state;
};

const docKeyForPath = (repoRoot: string, abs: string): string => {
  const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
  return rel || path.basename(abs);
};
