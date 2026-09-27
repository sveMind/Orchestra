import fs from 'fs';
import path from 'path';
import { OrchestraPlugin } from '../../types';
import { scanRepoSignals, RepoSignals, ApiEndpointHint } from '../../services/repoScan';
import { generateTests } from '../test-gen';

export type TestScope = 'all' | 'frontend' | 'backend' | 'fullstack' | 'embedded';

export type SourceTarget = {
  area: Exclude<TestScope, 'fullstack' | 'all'> | 'library' | 'cli' | 'native';
  absPath: string;
  relPath: string;
  ext: string;
};

export type RunOptions = {
  scope: TestScope;
  maxFiles: number;
  concurrency: number;
  skipWithTests: boolean;
  dryRun: boolean;
  frameworkHint?: string;
};

export type RunSummary = {
  scope: TestScope;
  signals: RepoSignals;
  selected: SourceTarget[];
  skippedExistingTests: number;
  skippedLargeFiles: number;
  generated: SourceTarget[];
  failed: { target: SourceTarget; error: string }[];
  durationMs: number;
  targetTestFiles: Record<string, string>;
};

export const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  'bin',
  'obj',
  '__pycache__',
  'venv',
  '.venv',
  'vendor',
  '.turbo',
  '.cache',
]);

export const DEFAULT_SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.py',
  '.go',
  '.java',
  '.cs',
  '.c', '.cc', '.cpp', '.cxx',
  '.h', '.hpp', '.hh', '.hxx',
  '.rs',
]);

const LARGE_FILE_BYTES = 600 * 1024;

const isBoringVendorGenerated = (repoRel: string, ext: string): boolean => {
  if (repoRel.includes('.min.')) return true;
  if (repoRel.includes('/vendor/') || repoRel.startsWith('vendor/')) return true;
  if (repoRel.includes('/third_party/') || repoRel.startsWith('third_party/')) return true;
  if (repoRel.includes('/generated/')) return true;
  if (repoRel.includes('/migrations/') && ext === '.py') return true;
  if (repoRel.endsWith('.d.ts')) return true;
  return false;
};

const listSourceFiles = (
  repoRoot: string,
  subDirHint: string | null,
  ignoredDirs: Set<string>,
  exts: Set<string>,
  limit: number,
): string[] => {
  const startRoot = subDirHint && fs.existsSync(path.join(repoRoot, subDirHint))
    ? path.join(repoRoot, subDirHint)
    : repoRoot;
  const results: string[] = [];
  const stack = [startRoot];
  let visited = 0;
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visited += 1;
    if (visited > 5000) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) {
          if (entry.name === '.git') continue;
        }
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts.has(ext)) continue;
      results.push(fullPath);
      if (results.length >= limit) return results;
    }
  }
  return results;
};

export const expectedTestFilePath = (sourceAbs: string, ext: string): string => {
  const lower = ext.toLowerCase();
  if (lower === '.py') {
    return path.join(path.dirname(sourceAbs), `test_${path.basename(sourceAbs)}`);
  }
  if (['.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hh', '.hxx'].includes(lower)) {
    const base = path.basename(sourceAbs, ext);
    return path.join(path.dirname(sourceAbs), `${base}_test${ext}`);
  }
  return sourceAbs.replace(new RegExp(`${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), `.test${ext}`);
};

export const pickSubDirHints = (
  signals: RepoSignals,
  scope: TestScope,
): { label: SourceTarget['area']; hint: string | null }[] => {
  const results: { label: SourceTarget['area']; hint: string | null }[] = [];

  const wantFrontend = scope === 'all' || scope === 'fullstack' || scope === 'frontend';
  const wantBackend = scope === 'all' || scope === 'fullstack' || scope === 'backend';
  const wantEmbedded = scope === 'all' || scope === 'embedded';

  const hasDir = (n: string) => signals.topLevelDirs.includes(n);

  if (wantFrontend) {
    if (hasDir('frontend')) results.push({ label: 'frontend', hint: 'frontend' });
    else if (hasDir('client')) results.push({ label: 'frontend', hint: 'client' });
    else if (hasDir('web')) results.push({ label: 'frontend', hint: 'web' });
    else if (hasDir('ui')) results.push({ label: 'frontend', hint: 'ui' });
    else if (signals.frontend.detected) results.push({ label: 'frontend', hint: null });
  }

  if (wantBackend) {
    if (hasDir('backend')) results.push({ label: 'backend', hint: 'backend' });
    else if (hasDir('server')) results.push({ label: 'backend', hint: 'server' });
    else if (hasDir('api')) results.push({ label: 'backend', hint: 'api' });
    else if (signals.backend.detected) results.push({ label: 'backend', hint: null });
  }

  if (wantEmbedded && signals.embedded.detected) {
    results.push({ label: 'embedded', hint: null });
  }

  if (scope === 'all' || scope === 'fullstack' || scope === 'backend') {
    if (signals.appType === 'library') results.push({ label: 'library', hint: null });
    if (signals.appType === 'cli') results.push({ label: 'cli', hint: null });
    if (signals.appType === 'native') results.push({ label: 'native', hint: null });
  }

  if (results.length === 0 && scope === 'all') {
    results.push({ label: 'backend', hint: null });
    results.push({ label: 'frontend', hint: null });
  }

  return results;
};

export const rankEndpoints = (endpoints: ApiEndpointHint[], repoRoot: string): Map<string, number> => {
  const score = new Map<string, number>();
  for (const ep of endpoints) {
    const abs = path.resolve(repoRoot, ep.source);
    score.set(abs, (score.get(abs) || 0) + 5);
  }
  return score;
};

export const selectSourceTargets = (
  repoRoot: string,
  signals: RepoSignals,
  options: RunOptions,
): { selected: SourceTarget[]; skippedExistingTests: number; skippedLargeFiles: number; targetTestFiles: Record<string, string> } => {
  const hints = pickSubDirHints(signals, options.scope);
  const endpointScores = rankEndpoints(signals.apiEndpoints, repoRoot);

  const extByLabel = new Map<SourceTarget['area'] | 'frontend' | 'backend', Set<string>>([
    ['frontend', new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'])],
    ['backend', new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.cs', '.rs', '.c', '.h', '.cpp', '.hpp'])],
    ['embedded', new Set(['.c', '.h', '.cc', '.cpp', '.hpp'])],
    ['library', DEFAULT_SOURCE_EXTS],
    ['cli', DEFAULT_SOURCE_EXTS],
    ['native', new Set(['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.rs'])],
  ]);

  const visited = new Set<string>();
  const scored: { target: SourceTarget; score: number }[] = [];
  let skippedExistingTests = 0;
  let skippedLargeFiles = 0;
  const targetTestFiles: Record<string, string> = {};

  for (const { label, hint } of hints) {
    const allowedExts = extByLabel.get(label) || DEFAULT_SOURCE_EXTS;
    const files = listSourceFiles(repoRoot, hint, DEFAULT_IGNORED_DIRS, allowedExts, 800);
    for (const abs of files) {
      if (visited.has(abs)) continue;
      visited.add(abs);
      const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
      const ext = path.extname(abs).toLowerCase();

      if (isBoringVendorGenerated(rel, ext)) continue;

      if (/\.(test|spec)\.[a-z]+$/i.test(path.basename(abs))) continue;
      if (ext === '.py' && path.basename(abs).startsWith('test_')) continue;
      if (ext === '.py' && path.basename(abs).startsWith('conftest')) continue;
      if (/_test\.[ch]$/i.test(path.basename(abs))) continue;

      try {
        const stat = fs.statSync(abs);
        if (stat.size > LARGE_FILE_BYTES) {
          skippedLargeFiles += 1;
          continue;
        }
      } catch {
        continue;
      }

      const testPath = expectedTestFilePath(abs, ext);
      targetTestFiles[abs] = testPath;

      if (options.skipWithTests && fs.existsSync(testPath)) {
        skippedExistingTests += 1;
        continue;
      }

      let score = endpointScores.get(abs) || 0;
      if (rel.includes('src/')) score += 2;
      if (rel.includes('lib/')) score += 2;
      if (!hint && !signals.frontend.detected && !signals.backend.detected && signals.appType === 'library') score += 1;

      scored.push({ target: { area: label, absPath: abs, relPath: rel, ext }, score });
    }
  }

  const selectedSorted = scored
    .sort((a, b) => b.score - a.score || a.target.relPath.localeCompare(b.target.relPath))
    .map(s => s.target)
    .slice(0, Math.max(1, options.maxFiles));

  return { selected: selectedSorted, skippedExistingTests, skippedLargeFiles, targetTestFiles };
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(concurrency, items.length));
  const pool = Array.from({ length: workers }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(pool);
  return results;
};

export const runTestSuite = async (repoRoot: string, options: Partial<RunOptions> & { maxFiles?: number } = {}): Promise<RunSummary> => {
  const started = Date.now();
  const opts: RunOptions = {
    scope: (options.scope as TestScope) || 'all',
    maxFiles: typeof options.maxFiles === 'number' && options.maxFiles > 0 ? options.maxFiles : 30,
    concurrency: typeof options.concurrency === 'number' && options.concurrency > 0 ? options.concurrency : 2,
    skipWithTests: options.skipWithTests !== false,
    dryRun: options.dryRun === true,
    frameworkHint: options.frameworkHint,
  };

  const signals = scanRepoSignals(repoRoot, []);
  const { selected, skippedExistingTests, skippedLargeFiles, targetTestFiles } = selectSourceTargets(repoRoot, signals, opts);

  console.log(`📋 Orchestra Tests — scope: ${opts.scope} | maxFiles: ${opts.maxFiles} | concurrency: ${opts.concurrency} | skipExisting: ${opts.skipWithTests}`);
  console.log(`   App type: ${signals.appType}`);
  console.log(`   Frontend: ${signals.frontend.detected ? `yes (${signals.frontend.kinds.join(', ')})` : 'no'}  Backend: ${signals.backend.detected ? `yes (${signals.backend.kinds.join(', ')})` : 'no'}  Embedded: ${signals.embedded.detected ? `yes (${signals.embedded.kinds.join(', ')})` : 'no'}`);
  console.log(`   Selected ${selected.length} source file(s) for testing (skipped ${skippedExistingTests} with tests already, ${skippedLargeFiles} too-large).`);

  if (selected.length === 0) {
    console.log('ℹ️  No source targets found. Skipping generation.');
    return {
      scope: opts.scope,
      signals,
      selected: [],
      skippedExistingTests,
      skippedLargeFiles,
      generated: [],
      failed: [],
      durationMs: Date.now() - started,
      targetTestFiles: {},
    };
  }

  if (opts.dryRun) {
    console.log('\n🗂️  Dry run — would generate tests for:');
    for (const t of selected) {
      console.log(`   [${t.area}] ${t.relPath}  ->  ${path.relative(repoRoot, targetTestFiles[t.absPath])}`);
    }
    return {
      scope: opts.scope,
      signals,
      selected,
      skippedExistingTests,
      skippedLargeFiles,
      generated: [],
      failed: [],
      durationMs: Date.now() - started,
      targetTestFiles,
    };
  }

  const generated: SourceTarget[] = [];
  const failed: { target: SourceTarget; error: string }[] = [];

  await mapWithConcurrency(selected, opts.concurrency, async (target) => {
    try {
      const args: any[] = opts.frameworkHint ? [opts.frameworkHint] : [];
      const before = Date.now();
      await generateTests(target.absPath, ...args);
      console.log(`   ✅ [${target.area}] ${target.relPath} (${Date.now() - before}ms)`);
      generated.push(target);
    } catch (e: any) {
      const msg = e && e.message ? String(e.message) : String(e);
      console.log(`   ❌ [${target.area}] ${target.relPath}: ${msg}`);
      failed.push({ target, error: msg });
    }
  });

  const durationMs = Date.now() - started;
  console.log(`\n🏁 Finished in ${(durationMs / 1000).toFixed(1)}s. Generated: ${generated.length} | Failed: ${failed.length} | Skipped existing: ${skippedExistingTests} | Skipped large: ${skippedLargeFiles}`);

  return {
    scope: opts.scope,
    signals,
    selected,
    skippedExistingTests,
    skippedLargeFiles,
    generated,
    failed,
    durationMs,
    targetTestFiles,
  };
};

const parseArgsToOptions = (rawArgs: any[]): { repoRoot: string; opts: Partial<RunOptions> } => {
  const argsArr: string[] = rawArgs.filter(a => a !== undefined && a !== null).map(a => String(a));
  const scopes: Set<string> = new Set(['all', 'frontend', 'backend', 'fullstack', 'embedded']);

  let repoRoot = process.cwd();
  let scope: TestScope = 'all';
  let maxFiles = 30;
  let concurrency = 2;
  let frameworkHint: string | undefined;
  let skipWithTests = true;
  let dryRun = false;

  const tokens: string[] = [];
  for (let i = 0; i < argsArr.length; i += 1) {
    const s = argsArr[i];
    const eqMatch = s.match(/^--(max|concurrency|framework)=(.+)$/);
    if (eqMatch) {
      const key = eqMatch[1];
      const val = eqMatch[2];
      if (key === 'max') maxFiles = parseInt(val, 10) || maxFiles;
      else if (key === 'concurrency') concurrency = parseInt(val, 10) || concurrency;
      else if (key === 'framework') frameworkHint = val;
      continue;
    }

    if (s === '--dry-run') { dryRun = true; continue; }
    if (s === '--no-tests') { skipWithTests = false; continue; }

    if (s === '--max' && i + 1 < argsArr.length) { maxFiles = parseInt(argsArr[i + 1], 10) || maxFiles; i += 1; continue; }
    if (s === '--concurrency' && i + 1 < argsArr.length) { concurrency = parseInt(argsArr[i + 1], 10) || concurrency; i += 1; continue; }
    if (s === '--framework' && i + 1 < argsArr.length) { frameworkHint = argsArr[i + 1]; i += 1; continue; }

    tokens.push(s);
  }

  for (const t of tokens) {
    if (scopes.has(t)) scope = t as TestScope;
    else if (t && !/^--/.test(t)) {
      const abs = path.isAbsolute(t) ? t : path.resolve(process.cwd(), t);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) repoRoot = abs;
    }
  }

  if (tokens[0] && /^\d+$/.test(tokens[0])) maxFiles = parseInt(tokens[0], 10) || maxFiles;

  return {
    repoRoot,
    opts: { scope, maxFiles, concurrency, frameworkHint, skipWithTests, dryRun },
  };
};

const plugin: OrchestraPlugin = {
  name: 'Test Suite Generator',
  description: 'Scan project to detect frontend / backend / embedded components, then batch-generate Jest / pytest / C tests for the top source files.',
  command: 'tests',
  args: [
    { name: 'scope', description: 'Scope: all | fullstack | frontend | backend | embedded. Default: all', required: false },
    { name: 'repo', description: 'Repository root directory. Default: cwd', required: false },
  ],
  action: async (...args: any[]) => {
    const { repoRoot, opts } = parseArgsToOptions(args);
    await runTestSuite(repoRoot, opts);
  },
};

export default plugin;
export { plugin as testsPlugin };
