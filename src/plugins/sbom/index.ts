import fs from 'fs';
import path from 'path';
import { OrchestraPlugin } from '../../types';
import { VcsFactory } from '../../services/vcs/VcsFactory';
import { readCiPrContext } from '../../services/ciContext';
import { aggregateSbom } from './aggregator';
import type { SbomComponent, SbomDocument, SbomMode } from './types';
import { toCycloneDx, fingerprintComponentsForIssue, toMarkdownReport, toSpdx } from './formats';
import { DEFAULT_AGGREGATE_OPTS } from './types';
import { readOpengrepArtifact, readTestArtifact } from '../../utils/pluginArtifacts';

const ECOSYSTEM_BADGE: Record<string, string> = {
  npm: '🟩', pnpm: '🟩', yarn: '🟩',
  pip: '🐍', poetry: '🐍', pipenv: '🐍', conda: '🐍',
  go: '🐹', cargo: '🦀', gem: '💎',
  composer: '🐘', maven: '☕', gradle: '☕',
  nuget: '🟦', unknown: '❔'
};

const SCOPE_LABEL: Record<string, string> = {
  runtime: 'prod', development: 'dev', optional: 'opt', unknown: 'unk'
};

const dedupeEcoComponents = (arr: SbomComponent[]): SbomComponent[] => {
  const seen = new Map<string, SbomComponent>();
  for (const c of arr) {
    const k = `${c.ecosystem}|${c.name}|${c.version ?? ''}`;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, c); continue; }
    if (!prev.license && c.license) prev.license = c.license;
    if (!prev.direct && c.direct) prev.direct = true;
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const perComponentTitle = (c: SbomComponent): string => {
  const badge = ECOSYSTEM_BADGE[c.ecosystem] || '';
  const scope = SCOPE_LABEL[c.scope] || 'unk';
  const fp = fingerprintComponentsForIssue(c).slice(0, 10);
  return `[SBOM]${badge}[${c.ecosystem.toUpperCase()}:${scope}] ${c.name} ${c.version ? `v${c.version}` : ''} (${fp})`;
};

const perComponentBody = (doc: SbomDocument, c: SbomComponent): string => {
  const same = doc.components.filter(x => x.ecosystem === c.ecosystem && x.name === c.name && (!x.version || x.version === c.version || !c.version));
  const sources = Array.from(new Set(same.map(x => x.sourceFileRel))).sort();
  const lines: string[] = [];
  lines.push(`# SBOM component: \`${c.name}\`${c.version ? ` (v${c.version})` : ''}`);
  lines.push('');
  lines.push(`- Ecosystem: \`${c.ecosystem}\``);
  lines.push(`- Scope: \`${c.scope}\` (${SCOPE_LABEL[c.scope] || c.scope})`);
  lines.push(`- PURL: \`${c.purl}\``);
  lines.push(`- Declared version: ${c.version ? `\`${c.version}\`` : '_(no version pin)_\n'}`);
  lines.push(`- Direct dependency: ${c.direct ? '✅ yes' : 'no (transitive)'}${c.license ? `\n- Declared license(s): \`${c.license}\`` : '\n- License: not declared'}
- Source manifest(s) (${sources.length}):
${sources.map(s => `  - \`${s}\``).join('\n')}
${c.declaredDependencies && c.declaredDependencies.length ? `- Transitive dependency links (${c.declaredDependencies.length}):
${c.declaredDependencies.slice(0, 24).map(d => `  - \`${d.name}\`${d.versionSpec ? ` \`${d.versionSpec}\`` : ''}`).join('\n')}` : ''}

> ⚠️ **Do not remove this fingerprint suffix.** Orchestra uses it to auto-close stale component issues when the component is upgraded or removed.
>
> Fingerprint: \`${fingerprintComponentsForIssue(c)}\`
`);
  return lines.join('\n');
};

const buildSummaryTitle = (doc: SbomDocument): string =>
  `SBOM Report — ${doc.rootName}${doc.rootVersion ? ` v${doc.rootVersion}` : ''} — ${doc.stats.uniqueComponents} unique components across ${Object.keys(doc.stats.byEcosystem).length} ecosystems`;

const buildSummaryBody = (report: string, doc: SbomDocument): string => {
  const lines: string[] = [];
  lines.push(buildSummaryTitle(doc));
  lines.push('');
  lines.push(`Scan: \`${doc.generatedAt}\`  ·  Root: \`${doc.rootName}${doc.rootVersion ? ` v${doc.rootVersion}` : ''}\`  ·  Sources: \`${doc.stats.sources.length} manifests\``);
  lines.push('');
  lines.push(report.split('\n').slice(0, 60).join('\n'));
  lines.push('');
  lines.push('_(this umbrella issue contains the full human-readable report; individual component issues are opened per finding if `issues-per-component` mode is used)_');
  return lines.join('\n');
};

const MANAGED_ISSUE_MATCH = (title: string) => title.startsWith('[SBOM]') || title.startsWith('SBOM Report —');

const handleComponentIssues = async (params: {
  dirPath: string;
  doc: SbomDocument;
  createPerComponent: boolean;
  createSummary: boolean;
  issueLabels: string[];
}): Promise<{ created: number; updated: number; closed: number; perFinding: { created: number; closed: number; updated: number }; summary: { reusedComment: boolean; createdIssue: boolean } }> => {
  const vcs = VcsFactory.getProvider();
  const perFinding = { created: 0, closed: 0, updated: 0 };
  const summary = { reusedComment: false, createdIssue: false };

  if (!vcs) return { created: 0, updated: 0, closed: 0, perFinding, summary };

  const report = toMarkdownReport(params.doc);

  // 1) Per-component issues
  if (params.createPerComponent) {
    const components = dedupeEcoComponents(params.doc.components);
    const liveTitles = new Map<string, SbomComponent>();
    for (const c of components) {
      const title = perComponentTitle(c);
      liveTitles.set(title, c);
    }
    try {
      const openIssues = await vcs.listIssues('open');
      const managedOpen = (openIssues || []).filter(i => i && typeof i.title === 'string' && MANAGED_ISSUE_MATCH(i.title));
      for (const [title, comp] of liveTitles.entries()) {
        const body = perComponentBody(params.doc, comp);
        const existing = managedOpen.find(i => i.title === title);
        if (existing) {
          const existingNum = typeof existing.number === 'number' ? existing.number : -1;
          if (existingNum >= 0) {
            try {
              await vcs.addComment(existingNum, `Rescanned component still present in SBOM on ${params.doc.generatedAt}.\n${body.split('\n').slice(0, 12).join('\n')}`);
              perFinding.updated += 1;
            } catch {}
          }
          continue;
        }
        const labels = Array.from(new Set([
          ...params.issueLabels,
          'sbom',
          `sbom:${comp.ecosystem}`,
          `sbom:${comp.scope}`,
          comp.direct ? 'sbom:direct' : 'sbom:transitive'
        ]));
        try {
          await vcs.createIssue(title, body, labels);
          perFinding.created += 1;
        } catch {}
      }
      // Close stale managed component issues
      for (const i of managedOpen) {
        if (i.title === buildSummaryTitle(params.doc)) continue;
        if (!liveTitles.has(i.title) && i.title.startsWith('[SBOM]')) {
          const num = typeof i.number === 'number' ? i.number : -1;
          if (num < 0) continue;
          try {
            await vcs.closeIssue(num, 'Component no longer present in latest SBOM (upgraded, removed, or ecosystem changed).');
            perFinding.closed += 1;
          } catch {}
        }
      }
    } catch {}
  }

  // 2) Summary issue
  if (params.createSummary) {
    const summaryTitle = buildSummaryTitle(params.doc);
    const summaryBody = buildSummaryBody(report, params.doc);
    try {
      const existing = await vcs.findIssueByTitle(summaryTitle);
      if (existing) {
        try {
          await vcs.addComment(existing, `Rescanned SBOM regenerated on ${params.doc.generatedAt}\n\n${report.split('\n').slice(0, 40).join('\n')}`);
          summary.reusedComment = true;
        } catch {}
      } else {
        const labels = Array.from(new Set([...params.issueLabels, 'sbom', 'sbom:summary']));
        await vcs.createIssue(summaryTitle, summaryBody, labels);
        summary.createdIssue = true;
      }
    } catch {}
  }

  return {
    created: perFinding.created + (summary.createdIssue ? 1 : 0),
    updated: perFinding.updated + (summary.reusedComment ? 1 : 0),
    closed: perFinding.closed,
    perFinding,
    summary
  };
};

const writeSbomArtifacts = (dirPath: string, doc: SbomDocument, report: string, sastFindings: any[] | null = null): { spdxPath: string; cdxPath: string; reportPath: string } => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const spdx = path.join(dirPath, 'sbom.spdx.json');
  const cdx = path.join(dirPath, 'sbom.cyclonedx.json');
  const rp = path.join(dirPath, 'sbom.md');
  fs.writeFileSync(spdx, JSON.stringify(toSpdx(doc), null, 2) + '\n');
  fs.writeFileSync(cdx, JSON.stringify(toCycloneDx(doc, sastFindings), null, 2) + '\n');
  fs.writeFileSync(rp, report + '\n');
  return { spdxPath: spdx, cdxPath: cdx, reportPath: rp };
};

export const command: OrchestraPlugin['command'] = 'sbom';
export const args: OrchestraPlugin['args'] = [
  { name: 'path', description: 'Directory to scan (default: cwd)', required: false },
  { name: 'mode', description: 'report | issue | issues-per-component | comment (default: report)', required: false },
  { name: 'options', description: '--include-nested-node-modules --include-test=false', required: false }
];

export const action: OrchestraPlugin['action'] = async (rawArgs: string[] = []) => {
  const [maybePath, maybeMode] = rawArgs;
  const mode: SbomMode = (() => {
    const m = (maybeMode || '').toLowerCase();
    if (m === 'issue' || m === 'issues-per-component' || m === 'comment') return m;
    return 'report';
  })();
  const scanDir = maybePath && fs.existsSync(maybePath) && fs.statSync(maybePath).isDirectory()
    ? path.resolve(maybePath)
    : process.cwd();

  const includeNested = rawArgs.some(a => a === '--include-nested-node-modules');
  const includeTest = !rawArgs.some(a => a === '--include-test=false');

  const doc = aggregateSbom(scanDir, {
    ...DEFAULT_AGGREGATE_OPTS,
    includeNestedNodeModules: includeNested,
    includeTestDependencies: includeTest
  });
  const sastArtifact = readOpengrepArtifact(scanDir);
  const testArtifact = readTestArtifact(scanDir);
  const sastFindings = (sastArtifact && Array.isArray(sastArtifact.results)) ? sastArtifact.results : null;
  if (sastFindings) console.log(`  🔍 Opengrep SAST findings loaded: ${sastFindings.length} (auto-matched into CycloneDX components + SBOM report section).`);
  if (testArtifact) console.log(`  🧪 Test results loaded: framework ${testArtifact.framework}, discovered ${testArtifact.testsDiscovered}, passed ${testArtifact.testsPassed}, failed ${testArtifact.testsFailed}.`);
  const report = toMarkdownReport(doc, sastFindings, testArtifact);
  const artifacts = writeSbomArtifacts(scanDir, doc, report, sastFindings);

  const prContext = readCiPrContext();
  const vcs = VcsFactory.getProvider();
  const baseLabels = ['orchestra', 'auto-scan'];

  console.log(`\n📦 SBOM scan of ${scanDir} complete.`);
  console.log(`  Components: total ${doc.stats.totalComponents}, unique ${doc.stats.uniqueComponents} (${Object.keys(doc.stats.byEcosystem).length} ecosystems, ${doc.stats.sources.length} manifests).`);
  console.log(`  Artifacts: spdx=${path.relative(scanDir, artifacts.spdxPath)} · cyclonedx=${path.relative(scanDir, artifacts.cdxPath)} · report=${path.relative(scanDir, artifacts.reportPath)}`);
  if (doc.errors.length > 0) {
    console.log(`  ⚠️  Parse warnings: ${doc.errors.length}`);
    for (const e of doc.errors.slice(0, 5)) console.log(`    - ${e.sourceRel}: ${e.message}`);
  }

  if (mode === 'report') {
    console.log(`✅ Written. Mode "report": no network ops.\n`);
    return;
  }

  if (!vcs) {
    console.log('ℹ️ No VCS provider configured. Mode skipped; report written to disk.\n');
    return;
  }

  const createPerComponent = mode === 'issues-per-component';
  const createSummary = mode === 'issue' || mode === 'issues-per-component';

  if (mode === 'comment') {
    if (!prContext) {
      console.log('ℹ️  No PR context available. Comment not posted; report still written to disk.\n');
      return;
    }
    const header = `### 📦 Orchestra SBOM Impact Comment\n\n*Generated at ${doc.generatedAt}* · **${doc.stats.totalComponents}** components / **${doc.stats.uniqueComponents}** unique\n\n`;
    const clipped = report.length <= 6000 ? report : report.slice(0, 6000) + `\n\n… (truncated, full report in \`sbom.md\`).`;
    try {
      await vcs.addComment(prContext.prNumber, header + clipped);
      console.log(`✅ SBOM comment posted to PR #${prContext.prNumber}.\n`);
    } catch (e) {
      console.error('Failed to post SBOM PR comment:', e);
    }
    return;
  }

  const out = await handleComponentIssues({
    dirPath: scanDir,
    doc,
    createPerComponent,
    createSummary,
    issueLabels: baseLabels
  });

  console.log(`✅ SBOM issue pipeline complete.`);
  console.log(`  Per-component: created=${out.perFinding.created} · updated=${out.perFinding.updated} · closed=${out.perFinding.closed} stale-managed issues.`);
  if (createSummary) console.log(`  Summary umbrella: ${out.summary.createdIssue ? 'created new issue' : out.summary.reusedComment ? 'reused existing via addComment' : 'skipped'}.`);
};

export default { command, args, action };
