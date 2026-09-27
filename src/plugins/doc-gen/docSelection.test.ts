import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildDocPrCommentSummary,
  computeCodeDocCoverage,
  computeDownstreamImpact,
  extractDiffMentions,
  extractExportsFromFile,
  findStaleSections,
  ManifestChanges,
  parseManifestChanges,
  pickBestDocPathForTopic,
  scoreDocByRelevance,
  splitMarkdownSections,
  StaleSectionHit,
} from './docSelection';
import {
  checkDocFreshness,
  computeChangedFilesHash,
  computeRepoSignalsFingerprint,
  makeEmptyState,
  readDocGenState,
  recordDocWritten,
  setRunSummary,
  stateFilePath,
  writeDocGenState,
} from './docState';

const withTmpRepo = (fn: (repoRoot: string) => void | Promise<void>) => async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-gen-test-'));
  try { await fn(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
};

const write = (abs: string, content: string) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

describe('docSelection.splitMarkdownSections', () => {
  it('splits h2/h3 sections with exact line numbers', () => {
    const md = [
      '# Title',
      '',
      'Intro text.',
      '',
      '## Architecture',
      '',
      'Body of arch.',
      '',
      '### Subsystem A',
      '',
      '- one',
      '- two',
      '',
      '### Subsystem B',
      '',
      'some details here',
      '',
      '## Testing',
      '',
      'How to run tests.'
    ].join('\n');
    const secs = splitMarkdownSections(md);
    expect(secs.length).toBe(5);
    expect(secs.map(s => s.heading)).toEqual(['Title', 'Architecture', 'Subsystem A', 'Subsystem B', 'Testing']);
    expect(secs.map(s => s.level)).toEqual([1, 2, 3, 3, 2]);
    expect(secs[1].contentStart).toBe(6);
    expect(secs[1].contentEnd).toBe(8);
    expect(secs[4].text).toContain('How to run tests.');
  });

  it('falls back to a single preamble section when there are no headings', () => {
    const md = 'hello\nworld\n';
    const secs = splitMarkdownSections(md);
    expect(secs.length).toBe(1);
    expect(secs[0].heading).toBe('__preamble__');
    expect(secs[0].text).toContain('world');
  });
});

describe('docSelection.scoreDocByRelevance + findStaleSections', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    write(path.join(repoRoot, 'docs', 'VCS.md'), [
      '# VCS Integrations',
      '',
      'The Orchestra repo ships multiple VCS backends (GitHub, GitLab, Azure).',
      '',
      '## Issue lifecycle',
      '',
      'Use `closeIssue` to close managed issues when findings go stale.',
      'Use `addComment` when findings recur. See `VcsFactory` for provider selection.',
      '',
      '## Docker docs (nothing here)',
      '',
      'Docker is mentioned only incidentally.'
    ].join('\n'));

    const docAbs = path.join(repoRoot, 'docs', 'VCS.md');
    const changedFiles = [
      'src/services/vcs/VcsProvider.ts',
      'src/services/vcs/GitHubProvider.ts'
    ];
    const diffs = new Map<string, string>();
    diffs.set('src/services/vcs/VcsProvider.ts', [
      'diff --git a/src/services/vcs/VcsProvider.ts b/src/services/vcs/VcsProvider.ts',
      '--- a/src/services/vcs/VcsProvider.ts',
      '+++ b/src/services/vcs/VcsProvider.ts',
      '@@ -1,1 +1,9 @@',
      '+export interface IssueProvider {',
      '+  closeIssue(issueNumber:number,closeReason?:string):Promise<boolean>;',
      '+}'
    ].join('\n'));
    diffs.set('src/services/vcs/GitHubProvider.ts', [
      'diff --git a/src/services/vcs/GitHubProvider.ts b/src/services/vcs/GitHubProvider.ts',
      '--- a/src/services/vcs/GitHubProvider.ts',
      '+++ b/src/services/vcs/GitHubProvider.ts',
      '@@ -1,1 +1,5 @@',
      '+class GitHubProvider {',
      '+  async closeIssue(n: number) { return true; }',
      '+}'
    ].join('\n'));

    const mentions = extractDiffMentions(changedFiles, diffs);

    const score = scoreDocByRelevance({
      repoRoot,
      docAbsPath: docAbs,
      mentions,
      mode: 'changed',
      topLevelHits: new Set()
    });
    expect(score).toBeGreaterThan(0);

    const stales = findStaleSections({
      repoRoot,
      docAbsPath: docAbs,
      mentions,
      minScore: 2
    });
    expect(stales.length).toBeGreaterThanOrEqual(1);
    const headings = stales.map(s => s.section.heading);
    expect(headings).toContain('Issue lifecycle');
    const top: StaleSectionHit = stales.sort((a, b) => b.score - a.score)[0];
    expect(top.matchedSymbols).toContainEqual(expect.stringMatching(/closeIssue|VcsFactory|addComment/));
  }));
});

describe('docSelection.extractExportsFromFile', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    const ts = path.join(repoRoot, 'src', 'types.ts');
    write(ts, [
      'export type Foo = { a: number };',
      'export interface Bar { name: string }',
      'export const MY_CONST = 3;',
      'export function run(options?: any) { return 1; }',
      'export class Runner { go() {} }',
      '',
      'export { pickBestDocPathForTopic, splitMarkdownSections } from "./docSelection";',
      'const internal = 1;',
      'function internalFn() { return internal; }'
    ].join('\n'));

    const exports = extractExportsFromFile(ts);
    const names = exports.map(e => e.name).sort();
    expect(names).toEqual(['Bar', 'Foo', 'MY_CONST', 'Runner', 'run', 'splitMarkdownSections', 'pickBestDocPathForTopic'].sort());
  }));

  it(withTmpRepo.name + ' python', withTmpRepo(repoRoot => {
    const py = path.join(repoRoot, 'app', 'util', 'security.py');
    write(py, [
      '__all__ = ["verify", "User", "hash_pw"]',
      '',
      'def verify(token):',
      '    return True',
      '',
      'class User:',
      '    def __init__(self, name): self.name = name',
      '',
      'def _private_helper():',
      '    return 0',
      '',
      'def hash_pw(pw):',
      '    return pw + "_not_secure"'
    ].join('\n'));
    const exports = extractExportsFromFile(py);
    const names = exports.map(e => e.name);
    expect(names).toEqual(expect.arrayContaining(['verify', 'User', 'hash_pw']));
    expect(names).not.toContain('_private_helper');
  }));

  it(withTmpRepo.name + ' go', withTmpRepo(repoRoot => {
    const go = path.join(repoRoot, 'cmd', 'tool', 'main.go');
    write(go, [
      'package main',
      '',
      'type User struct { Name string }',
      'func (u *User) Greet() string { return u.Name }',
      'func Run() {}',
      'const Version = "1.0.0"',
      'var Config = map[string]string{}',
      '',
      'func helper() {}'
    ].join('\n'));
    const names = extractExportsFromFile(go).map(e => e.name).sort();
    expect(names).toEqual(['Config', 'Greet', 'Run', 'User', 'Version'].sort());
    expect(names).not.toContain('helper');
  }));

  it(withTmpRepo.name + ' rust', withTmpRepo(repoRoot => {
    const rs = path.join(repoRoot, 'crates', 'util', 'src', 'lib.rs');
    write(rs, [
      'pub struct Rectangle { pub w: u32, pub h: u32 }',
      'pub enum Color { Rgb(u8,u8,u8) }',
      'pub fn area(r: &Rectangle) -> u32 { r.w * r.h }',
      'fn internal() {}'
    ].join('\n'));
    const names = extractExportsFromFile(rs).map(e => e.name).sort();
    expect(names).toEqual(['Color', 'Rectangle', 'area'].sort());
    expect(names).not.toContain('internal');
  }));
});

describe('docSelection.computeDownstreamImpact', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    const iface = path.join(repoRoot, 'src', 'services', 'vcs', 'VcsProvider.ts');
    write(iface, [
      'export interface IssueProvider {',
      '  closeIssue(issueNumber:number, closeReason?:string): Promise<boolean>;',
      '}'
    ].join('\n'));

    const factory = path.join(repoRoot, 'src', 'services', 'vcs', 'VcsFactory.ts');
    write(factory, [
      'import type { IssueProvider } from "./VcsProvider";',
      'export class VcsFactory { static getProvider(): IssueProvider { return null as any; } }'
    ].join('\n'));

    const gh = path.join(repoRoot, 'src', 'services', 'vcs', 'GitHubProvider.ts');
    write(gh, [
      'import type { IssueProvider } from "./VcsProvider";',
      'export class GitHubProvider implements IssueProvider {',
      '  async closeIssue(n: number): Promise<boolean> { return true; }',
      '}'
    ].join('\n'));

    // unrelated file that doesn't reference the interface
    write(path.join(repoRoot, 'src', 'unrelated.ts'), 'console.log("hi");\n');

    const changed = ['src/services/vcs/VcsProvider.ts'];
    const diffs = new Map<string, string>();
    diffs.set(changed[0], [
      '+++ b/src/services/vcs/VcsProvider.ts',
      '+export interface IssueProvider {',
      '+  closeIssue(issueNumber:number);',
      '+}'
    ].join('\n'));

    const impact = computeDownstreamImpact({ repoRoot, changedFilesRel: changed, diffsByFile: diffs, maxDepth: 1 });
    const names = impact.map(i => i.exported.name);
    // Both `IssueProvider` and `closeIssue` exist in the interface; impact should include downstream files referencing them.
    expect(names).toEqual(expect.arrayContaining(['IssueProvider']));
    const ifaceImpact = impact.find(i => i.exported.name === 'IssueProvider');
    expect(ifaceImpact).toBeTruthy();
    const downs = ifaceImpact!.downstreamFiles.join('|');
    expect(downs).toContain('VcsFactory.ts');
    expect(downs).toContain('GitHubProvider.ts');
    expect(downs).not.toContain('unrelated.ts');
  }));
});

describe('docSelection.parseManifestChanges', () => {
  it(withTmpRepo.name + ' package.json', withTmpRepo(repoRoot => {
    write(path.join(repoRoot, 'package.json'), JSON.stringify({
      name: 'x',
      engines: { node: '>=20.0.0' },
      dependencies: { '@auth0/auth0-spa-js': '^2.0.0', 'semgrep': '1.0.0' },
      devDependencies: { jest: '29.7.0' },
      scripts: { test: 'jest', 'test:coverage': 'jest --coverage' }
    }, null, 2));

    const changed = ['package.json'];
    const diffs = new Map<string, string>();
    diffs.set(changed[0], [
      'diff --git a/package.json b/package.json',
      '+++ b/package.json',
      '+    "engines": {',
      '+      "node": ">=20.10.0"',
      '+    },',
      '+    "dependencies": {',
      '+      "@auth0/auth0-spa-js": "^2.1.0",',
      '+      "express": "^4.19.0"',
      '+    },',
      '+    "devDependencies": {',
      '+      "vitest": "^1.0.0"',
      '+    },',
      '+    "scripts": {',
      '+      "test:unit": "vitest run"',
      '+    }'
    ].join('\n'));

    const m: ManifestChanges = parseManifestChanges({ repoRoot, changedFilesRel: changed, diffsByFile: diffs });
    expect(m.packageJson).toBeTruthy();
    const pj = m.packageJson!;
    expect(pj.enginesChanged).toBe(true);
    expect(pj.added).toEqual(expect.arrayContaining(['express', '@auth0/auth0-spa-js', 'vitest']));
    expect(pj.scriptsAdded).toEqual(expect.arrayContaining(['test:unit']));
    expect(m.triggers.forceDocRelPaths).toEqual(expect.arrayContaining(
      expect.stringMatching(/environment|security|testing|requirements|local-setup/i)
    ));
    expect(m.triggers.summaryLines.some(l => /ENGINES CHANGED/.test(l))).toBe(true);
    expect(m.triggers.summaryLines.some(l => /SECURITY\.md/.test(l))).toBe(true);
    expect(m.triggers.summaryLines.some(l => /TESTING\.md/.test(l))).toBe(true);
  }));

  it(withTmpRepo.name + ' go.mod', withTmpRepo(repoRoot => {
    write(path.join(repoRoot, 'go.mod'), 'module github.com/example/x\n\ngo 1.22\n\nrequire golang.org/x/crypto v0.20.0\n');
    const diffs = new Map<string, string>();
    diffs.set('go.mod', [
      '+++ b/go.mod',
      '+go 1.23',
      '+require github.com/new/pkg v1.0.0'
    ].join('\n'));
    const m = parseManifestChanges({ repoRoot, changedFilesRel: ['go.mod'], diffsByFile: diffs });
    expect(m.go).toBeTruthy();
    expect(m.go!.goVersionChanged).toBe(true);
    expect(m.go!.added).toContain('github.com/new/pkg');
    expect(m.triggers.forceDocRelPaths).toEqual(expect.arrayContaining(
      expect.stringMatching(/requirements|local-setup/i)
    ));
  }));

  it(withTmpRepo.name + ' action.yml', withTmpRepo(repoRoot => {
    write(path.join(repoRoot, 'action.yml'), 'name: x\ninputs:\n  repo-token:\n    required: true\nruns:\n  using: composite\n  steps:\n    - run: echo hi\n');
    const diffs = new Map<string, string>();
    diffs.set('action.yml', [
      '+++ b/action.yml',
      '+inputs:',
      '+  api-key:',
      '+    required: true',
      '+runs:',
      '+  steps:',
      '+    - uses: actions/checkout@v4'
    ].join('\n'));
    const m = parseManifestChanges({ repoRoot, changedFilesRel: ['action.yml'], diffsByFile: diffs });
    expect(m.githubAction).toBeTruthy();
    expect(m.githubAction!.inputsAdded).toContain('api-key');
    expect(m.triggers.forceDocRelPaths).toEqual(expect.arrayContaining(
      expect.stringMatching(/environment|pipelines|ci/i)
    ));
  }));
});

describe('docSelection.pickBestDocPathForTopic', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    const a = path.join(repoRoot, 'docs', 'README.md');
    const b = path.join(repoRoot, 'docs', 'environments.md');
    const c = path.join(repoRoot, 'docs', 'architecture', 'vcs.md');
    write(a, 'top-level'); write(b, 'env'); write(c, 'vcs doc');

    const exact = pickBestDocPathForTopic({
      repoRoot,
      allDocs: [a, b, c],
      desiredRel: 'docs/environments.md',
      match: /environment/i
    });
    expect(exact).toBe(b);

    // no exact, fall back to regex score
    const pick = pickBestDocPathForTopic({
      repoRoot,
      allDocs: [a, c],
      desiredRel: 'docs/vcs.md',
      match: /vcs|integration/i
    });
    expect(pick).toBe(c);
  }));
});

describe('docState.read/write/freshness', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    // Initially empty
    const empty = readDocGenState(repoRoot);
    expect(empty).toEqual(makeEmptyState());

    // Check freshness for a newly-written doc
    const docAbs = path.join(repoRoot, 'docs', 'DOCKER.md');
    write(docAbs, '# Docker\n\nRun `docker compose up`.\n');
    const signalsFp = computeRepoSignalsFingerprint({
      appType: 'web',
      languages: ['typescript'],
      changedFiles: ['Dockerfile']
    });
    const diffs = new Map<string, string>();
    diffs.set('Dockerfile', '+FROM node:20\n');
    const changedHash = computeChangedFilesHash(['Dockerfile'], diffs);

    const initialFresh = checkDocFreshness({
      repoRoot, docAbsPath: docAbs,
      currentImpactScore: 12,
      repoSignalsFingerprint: signalsFp,
      changedFilesHash: changedHash,
      mode: 'changed'
    });
    // No prior state → stale, reason=no-prior-state
    expect(initialFresh.stale).toBe(true);
    expect(initialFresh.reason).toBe('no-prior-state');

    // After recording a write
    const after = fs.readFileSync(docAbs, 'utf8') + '\n<!-- doc-gen updated -->\n';
    fs.writeFileSync(docAbs, after);
    const state1 = recordDocWritten({
      repoRoot, docAbsPath: docAbs, docContentAfter: after,
      repoSignalsFingerprint: signalsFp,
      changedFilesHash: changedHash,
      impactScore: 12,
      mode: 'changed',
      rerunReason: initialFresh.reason
    });
    writeDocGenState(repoRoot, state1);

    // Same signals/hash + same file content → fresh
    const same = checkDocFreshness({
      repoRoot, docAbsPath: docAbs,
      currentImpactScore: 12,
      repoSignalsFingerprint: signalsFp,
      changedFilesHash: changedHash,
      mode: 'changed'
    });
    expect(same.stale).toBe(false);

    // Score jumps by ≥1 → stale
    const rose = checkDocFreshness({
      repoRoot, docAbsPath: docAbs,
      currentImpactScore: 20,
      repoSignalsFingerprint: signalsFp,
      changedFilesHash: computeChangedFilesHash(['Dockerfile', 'docker-compose.yml'], diffs),
      mode: 'changed'
    });
    expect(rose.stale).toBe(true);
    expect(rose.reason).toMatch(/impact-score-rose-by-/);

    // mode=all always regenerates
    const allMode = checkDocFreshness({
      repoRoot, docAbsPath: docAbs,
      currentImpactScore: 0,
      repoSignalsFingerprint: signalsFp,
      changedFilesHash: null,
      mode: 'all'
    });
    expect(allMode.stale).toBe(true);
    expect(allMode.reason).toBe('mode=all');

    // Run summary round-tripped
    const st = setRunSummary({
      state: state1,
      mode: 'changed',
      touched: ['docs/DOCKER.md'],
      skippedAsFresh: ['README.md'],
      totalChangedFiles: 2
    });
    writeDocGenState(repoRoot, st);
    const reread = readDocGenState(repoRoot);
    expect(reread.lastRunSummary.mode).toBe('changed');
    expect(reread.lastRunSummary.touchedDocPaths).toEqual(['docs/DOCKER.md']);
    expect(reread.lastRunSummary.totalChangedFilesInScope).toBe(2);
    expect(fs.existsSync(stateFilePath(repoRoot))).toBe(true);
  }));
});

describe('docSelection.computeCodeDocCoverage + buildDocPrCommentSummary', () => {
  it(withTmpRepo.name, withTmpRepo(repoRoot => {
    write(path.join(repoRoot, 'src', 'services', 'vcs', 'VcsProvider.ts'), [
      'export interface IssueProvider {',
      '  closeIssue(issueNumber:number): Promise<boolean>;',
      '  addComment(issueNumber:number, body:string): Promise<void>;',
      '}'
    ].join('\n'));
    write(path.join(repoRoot, 'docs', 'INTEGRATIONS.md'), [
      '# Integrations',
      '',
      'Call `addComment` to post a comment on a managed issue.',
      'The `closeIssue` function is used when a managed finding is no longer present.',
      'You do this via the `IssueProvider` interface in `src/services/vcs/VcsProvider.ts`.',
    ].join('\n'));
    write(path.join(repoRoot, 'docs', 'README.md'), '# Hello\n');

    const docAbs = [
      path.join(repoRoot, 'docs', 'INTEGRATIONS.md'),
      path.join(repoRoot, 'docs', 'README.md')
    ];
    const changed = ['src/services/vcs/VcsProvider.ts'];
    const diffs = new Map<string, string>();
    diffs.set(changed[0], [
      '+++ b/src/services/vcs/VcsProvider.ts',
      '+export interface IssueProvider {',
      '+  closeIssue(n: number);',
      '+  addComment(n, body);',
      '+}'
    ].join('\n'));
    const mentions = extractDiffMentions(changed, diffs);
    const downstream = computeDownstreamImpact({ repoRoot, changedFilesRel: changed, diffsByFile: diffs });

    const cov = computeCodeDocCoverage({ repoRoot, changedFilesRel: changed, allDocsAbs: docAbs, downstreamImpact: downstream, mentions });
    expect(cov.overallPct).toBeGreaterThan(66);
    const mods = cov.byModule.find(m => m.module === 'src/services');
    expect(mods).toBeTruthy();
    expect(mods!.totalExports).toBeGreaterThanOrEqual(3);
    expect(mods!.coveredExports).toBeGreaterThanOrEqual(2);

    const comment = buildDocPrCommentSummary({
      repoRoot,
      mode: 'pr-comment',
      changedFilesRel: changed,
      touchedDocRels: ['docs/INTEGRATIONS.md'],
      skippedFreshRels: ['docs/README.md'],
      perDocImpactScores: new Map([['docs/INTEGRATIONS.md', 24]]),
      coverage: cov,
      manifest: null,
      staleSectionsByDoc: new Map(),
      prNumber: 123,
      totalChangedFiles: changed.length
    });

    expect(comment.summaryMarkdown).toContain('Orchestra Documentation Impact Report');
    expect(comment.summaryMarkdown).toContain('Changed code file → documentation file cross-reference');
    expect(comment.summaryMarkdown).toContain('src/services/vcs/VcsProvider.ts');
    expect(comment.summaryMarkdown).toContain('PR #123');
    expect(comment.summaryMarkdown).toContain('Skipped as fresh');
    expect(comment.codeToDocTableRows.length).toBeGreaterThan(0);
  }));
});
