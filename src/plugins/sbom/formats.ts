import crypto from 'crypto';
import { SbomComponent, SbomDocument } from './types';
import type { OpengrepResultFinding, TestArtifact } from '../../utils/pluginArtifacts';
import { findingsGroupedByModule, severityScore } from '../../utils/pluginArtifacts';
import type { LicensePolicyViolation, LicensePolicyReport } from '../../services/licensePolicy';

const sha1Hex = (s: string): string => crypto.createHash('sha1').update(s).digest('hex');
const nowUtc = (iso: string) => iso.replace(/\.\d+Z$/, 'Z');

export const toSpdx = (doc: SbomDocument): unknown => {
  const names = new Map<string, number>();
  const verdictFor = buildVerdictMap(doc.licensePolicy);
  const spdxComponents: any[] = doc.components.map((c, idx) => {
    const purl = c.purl;
    const key = c.name;
    const count = names.get(key) || 0;
    names.set(key, count + 1);
    const id = `SPDXRef-${count === 0 ? c.name.replace(/[^A-Za-z0-9.-]+/g, '-') : `${c.name.replace(/[^A-Za-z0-9.-]+/g, '-')}-${count}`}-${idx}`;
    const spdxId = id.length <= 255 ? id : `SPDXRef-${sha1Hex(purl + idx).slice(0, 24)}`;
    const v = verdictFor.get(`${c.ecosystem}|${c.name}|${c.version || ''}|${c.sourceFileRel}|${c.scope}`);
    const concluded = v?.match?.spdxId || c.license || 'NOASSERTION';
    const declared = v?.match?.spdxId || c.license || 'NOASSERTION';
    const attributions: string[] = [];
    if (v?.verdict) attributions.push(`orchestra:license:verdict=${v.verdict}`);
    if (v?.match?.isCopyleft) attributions.push(`orchestra:license:copyleft=${v.match.isWeakCopyleft ? 'weak' : v.match.isNetworkProtective ? 'network' : 'strong'}`);
    if (v?.match?.isProprietary) attributions.push('orchestra:license:proprietary=true');
    return {
      SPDXID: spdxId,
      name: c.name,
      versionInfo: c.version || undefined,
      packageFileName: c.sourceFileRel || undefined,
      supplier: c.authors && c.authors.length ? `Organization: ${c.authors.join(', ')}` : undefined,
      downloadLocation: c.homepage || 'NOASSERTION',
      licenseConcluded: concluded,
      licenseDeclared: declared,
      licenseInfoFromFiles: c.license ? [c.license] : undefined,
      copyrightText: 'NOASSERTION',
      description: c.description || undefined,
      homepage: c.homepage || undefined,
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: purl
        },
        ...(c.cpe ? [{
          referenceCategory: 'SECURITY',
          referenceType: 'cpe23Type',
          referenceLocator: c.cpe
        }] : []),
        ...(attributions.length ? [{
          referenceCategory: 'OTHER',
          referenceType: 'http://spdx.org/rdf/terms#artifactOf',
          referenceLocator: attributions.join(',')
        }] : [])
      ],
      checksums: c.version ? [
        { algorithm: 'SHA1', checksumValue: sha1Hex(`${c.ecosystem}|${c.name}|${c.version}`) }
      ] : undefined
    };
  });

  const rootSpdxId = `SPDXRef-DOCUMENT`;
  const rootName = `${doc.rootName}${doc.rootVersion ? `-${doc.rootVersion}` : ''}`;

  const relationships = [];
  for (const spdxComp of spdxComponents) relationships.push({
    spdxElementId: rootSpdxId,
    relatedSpdxElement: spdxComp.SPDXID,
    relationshipType: 'DESCRIBES'
  });
  for (let i = 0; i < doc.components.length; i++) {
    const c = doc.components[i];
    if (!c.declaredDependencies || !c.declaredDependencies.length) continue;
    const parent = spdxComponents[i];
    for (const dep of c.declaredDependencies) {
      const childIdx = doc.components.findIndex(x => x.name === dep.name);
      if (childIdx < 0) continue;
      const child = spdxComponents[childIdx];
      relationships.push({
        spdxElementId: parent.SPDXID,
        relatedSpdxElement: child.SPDXID,
        relationshipType: 'DEPENDS_ON'
      });
    }
  }

  return {
    SPDXVersion: 'SPDX-2.3',
    SPDXID: rootSpdxId,
    spdxVersion: 'SPDX-2.3',
    name: rootName,
    documentName: rootName,
    documentNamespace: `https://orchestra.local/spdxdocs/${sha1Hex(rootName + doc.generatedAt).slice(0, 16)}`,
    dataLicense: 'CC0-1.0',
    creationInfo: {
      created: nowUtc(doc.generatedAt),
      creators: [`Tool: ${doc.tool.name}-${doc.tool.version}`]
    },
    packages: spdxComponents,
    relationships,
    documentDescribes: spdxComponents.map(p => p.SPDXID)
  };
};

export const toCycloneDx = (doc: SbomDocument, sastFindings?: OpengrepResultFinding[] | null): unknown => {
  const findings = sastFindings || [];
  const serialNumber = `urn:uuid:${sha1Hex(doc.rootName + doc.generatedAt).slice(0, 8)}-${sha1Hex('a').slice(0, 4)}-${sha1Hex('b').slice(0, 4)}-${sha1Hex('c').slice(0, 4)}-${sha1Hex(doc.rootName).slice(0, 12)}`;
  const verdictFor = buildVerdictMap(doc.licensePolicy);
  const components = doc.components.map((c, idx) => {
    const extraProps: any[] = [];
    const v = verdictFor.get(`${c.ecosystem}|${c.name}|${c.version || ''}|${c.sourceFileRel}|${c.scope}`);
    if (v?.verdict) {
      extraProps.push({ name: 'orchestra:license:verdict', value: v.verdict });
      if (v.reason) extraProps.push({ name: 'orchestra:license:reason', value: v.reason });
      if (v.match?.spdxId) extraProps.push({ name: 'orchestra:license:normalized', value: v.match.spdxId });
      if (v.match?.isCopyleft) extraProps.push({ name: 'orchestra:license:copyleft', value: v.match.isWeakCopyleft ? 'weak' : v.match.isNetworkProtective ? 'network' : 'strong' });
      if (v.match?.isProprietary) extraProps.push({ name: 'orchestra:license:proprietary', value: 'true' });
      if (v.verdict === 'DENIED') extraProps.push({ name: 'orchestra:license:denied', value: 'true' });
      else if (v.verdict.startsWith('WARN_')) extraProps.push({ name: 'orchestra:license:warning', value: v.verdict });
    }
    if (findings.length > 0) {
      const nameHit = findings.filter(f => {
        if (!f.path) return false;
        const lower = f.path.toLowerCase();
        const nameToken = c.name.toLowerCase();
        if (lower.includes(nameToken)) return true;
        const srcHead = (c.sourceFileRel || '').split(/[/\\]/).slice(0, 3).join('/').toLowerCase();
        return srcHead && lower.includes(srcHead);
      });
      let componentHitCount = 0;
      let componentMaxSev = 0;
      for (const f of nameHit) {
        componentHitCount += 1;
        componentMaxSev = Math.max(componentMaxSev, severityScore(f));
      }
      if (componentHitCount > 0) {
        extraProps.push({ name: 'orchestra:sast:hits', value: String(componentHitCount) });
        if (componentMaxSev > 0) extraProps.push({ name: 'orchestra:sast:maxSeverity', value: componentMaxSev === 3 ? 'HIGH' : componentMaxSev === 2 ? 'MEDIUM' : componentMaxSev === 1 ? 'LOW' : 'INFO' });
      }
    }
    const licenseRaw = v?.match?.spdxId || c.license;
    return {
      type: 'library',
      'bom-ref': c.purl || `c-${idx}`,
      name: c.name,
      version: c.version || undefined,
      purl: c.purl || undefined,
      cpe: c.cpe || undefined,
      description: c.description || undefined,
      scope: c.scope === 'development' ? 'optional' : c.scope === 'optional' ? 'optional' : 'required',
      author: c.authors && c.authors.length ? c.authors.join(', ') : undefined,
      licenses: licenseRaw ? [{
        license: {
          id: /^[A-Za-z0-9.+-]+$/.test(licenseRaw) ? licenseRaw : undefined,
          name: !/^[A-Za-z0-9.+-]+$/.test(licenseRaw) ? licenseRaw : undefined,
          url: undefined
        }
      }] : undefined,
      externalReferences: [
        ...(c.homepage ? [{ type: 'website', url: c.homepage }] : []),
        ...(c.cpe ? [{ type: 'advisory', url: c.cpe }] : [])
      ],
      properties: [
        { name: 'orchestra:sourceFile', value: c.sourceFileRel },
        { name: 'orchestra:direct', value: c.direct ? 'true' : 'false' },
        { name: 'orchestra:ecosystem', value: c.ecosystem },
        ...extraProps
      ],
      evidence: {
        identities: [{
          field: 'purl',
          confidence: 1.0,
          methods: [{ technique: 'manifest-parser', value: c.sourceFileRel, confidence: 1.0 }]
        }]
      } as any
    };
  });

  const deps = doc.components.map((c, idx) => {
    const ref = c.purl || `c-${idx}`;
    const dependsOn: string[] = [];
    if (c.declaredDependencies) {
      for (const dep of c.declaredDependencies) {
        const childIdx = doc.components.findIndex(x => x.name === dep.name);
        if (childIdx >= 0) dependsOn.push(doc.components[childIdx].purl || `c-${childIdx}`);
      }
    }
    return { ref, dependsOn };
  });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber,
    version: 1,
    metadata: {
      timestamp: nowUtc(doc.generatedAt),
      tools: [{ vendor: doc.tool.vendor, name: doc.tool.name, version: doc.tool.version }],
      component: {
        type: 'application',
        'bom-ref': doc.rootName,
        name: doc.rootName,
        version: doc.rootVersion || undefined
      }
    },
    components,
    dependencies: deps
  };
};

type VerdictMapEntry = { verdict: LicensePolicyViolation['verdict']; match: LicensePolicyViolation['match']; reason?: string };
const buildVerdictMap = (licensePolicy?: LicensePolicyReport): Map<string, VerdictMapEntry> => {
  const out = new Map<string, VerdictMapEntry>();
  if (!licensePolicy) return out;
  const push = (arr: LicensePolicyViolation[]) => {
    for (const v of arr) {
      const c = v.component;
      const k = `${c.ecosystem}|${c.name}|${c.version || ''}|${c.sourceFileRel}|${c.scope}`;
      out.set(k, { verdict: v.verdict, match: v.match, reason: v.reason });
    }
  };
  push(licensePolicy.denied);
  push(licensePolicy.warnings);
  push(licensePolicy.allowed);
  return out;
};

export const toMarkdownReport = (doc: SbomDocument, sastFindings?: OpengrepResultFinding[] | null, testArtifact?: TestArtifact | null): string => {
  const lines: string[] = [];
  lines.push('# Software Bill of Materials (SBOM)');
  lines.push('');
  lines.push(`- **Generated at:** ${doc.generatedAt}`);
  lines.push(`- **Tool:** ${doc.tool.name} v${doc.tool.version} (${doc.tool.vendor})`);
  lines.push(`- **Root component:** ${doc.rootName}${doc.rootVersion ? ` v${doc.rootVersion}` : ''}`);
  lines.push(`- **Total components:** ${doc.stats.totalComponents} (${doc.stats.uniqueComponents} unique by ecosystem+name+version)`);
  lines.push(`- **Components with declared licenses:** ${doc.stats.withLicenses} (${doc.stats.totalComponents ? Math.round((doc.stats.withLicenses / doc.stats.totalComponents) * 100) : 0}%)`);
  lines.push(`- **Unknown/missing versions:** ${doc.stats.unknownVersionCount}`);
  lines.push(`- **Manifest sources (counts):** ${doc.stats.sources.length}`);
  const findings = sastFindings || [];
  if (findings.length > 0) {
    const sevC: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of findings) {
      const sc = severityScore(f);
      const k = sc === 3 ? 'HIGH' : sc === 2 ? 'MEDIUM' : sc === 1 ? 'LOW' : 'INFO';
      sevC[k] += 1;
    }
    lines.push(`- **SAST (Opengrep) findings available:** ${findings.length} (🔴 HIGH=${sevC.HIGH}, 🟠 MEDIUM=${sevC.MEDIUM}, 🟡 LOW=${sevC.LOW}, ⚪ INFO=${sevC.INFO})`);
  }
  if (testArtifact && (testArtifact.testsDiscovered > 0 || testArtifact.findings.length > 0)) {
    lines.push(`- **Test results:** framework \`${testArtifact.framework}\`, discovered ${testArtifact.testsDiscovered}, passed ${testArtifact.testsPassed}, failed ${testArtifact.testsFailed}, skipped ${testArtifact.testsSkipped}, errored ${testArtifact.testsErrored} (${(testArtifact.totalDurationMs / 1000).toFixed(2)}s).`);
  }
  lines.push('');

  lines.push('## Ecosystem breakdown');
  lines.push('');
  lines.push('| Ecosystem | Components |');
  lines.push('|---|---:|');
  for (const eco of Object.keys(doc.stats.byEcosystem).sort()) {
    lines.push(`| \`${eco}\` | ${doc.stats.byEcosystem[eco as keyof SbomDocument['stats']['byEcosystem']]} |`);
  }
  lines.push('');

  lines.push('## Scope breakdown');
  lines.push('');
  lines.push('| Scope | Components |');
  lines.push('|---|---:|');
  for (const s of ['runtime', 'development', 'optional', 'unknown']) {
    lines.push(`| ${s} | ${doc.stats.byScope[s as keyof SbomDocument['stats']['byScope']] || 0} |`);
  }
  lines.push('');

  lines.push('## Manifest sources');
  lines.push('');
  lines.push('| Source file | Ecosystem | Components found |');
  lines.push('|---|---|---:|');
  for (const s of doc.stats.sources) lines.push(`| \`${s.fileRel}\` | \`${s.ecosystem}\` | ${s.count} |`);
  lines.push('');

  const ecoOrder = Array.from(new Set(doc.components.map(c => c.ecosystem)));
  for (const eco of ecoOrder) {
    const items = doc.components.filter(c => c.ecosystem === eco);
    lines.push(`## ${ecosystemPrettyName(eco)} (\`${eco}\`) — ${items.length} components`);
    lines.push('');
    lines.push('| # | Name | Version | Scope | Direct dep | License | Source | PURL |');
    lines.push('|---:|---|---|---|---|---|---|---|');
    // Sort by name then version, dedupe to unique name+version for readability
    const uniqs = deduplicateComponents(items);
    for (let i = 0; i < uniqs.length; i++) {
      const c = uniqs[i];
      lines.push(`| ${i + 1} | \`${escapeMd(c.name)}\` | ${c.version ? `\`${c.version}\`` : '_(unknown)_'} | ${c.scope} | ${c.direct ? '✅' : '➖'} | ${c.license ? `\`${escapeMd(c.license)}\`` : '_(unset)_'} | \`${escapeMd(c.sourceFileRel)}\` | \`${escapeMd(c.purl)}\` |`);
    }
    lines.push('');
  }

  if (doc.errors.length > 0) {
    lines.push('## ⚠️ Aggregation warnings');
    lines.push('');
    for (const err of doc.errors) lines.push(`- \`${err.sourceRel}\`: ${err.message}`);
    lines.push('');
  }

  if (findings.length > 0) {
    lines.push('## 🔍 Opengrep static-analysis findings');
    lines.push('');
    lines.push('Correlated findings from the most recent Orchestra `static-analysis` run, grouped by module:');
    lines.push('');
    lines.push('| # | Module | Findings | HIGH | MEDIUM | LOW | INFO |');
    lines.push('|---:|---|---:|---:|---:|---:|---:|');
    const groups = findingsGroupedByModule(findings, { moduleDepth: 3 });
    let i = 0;
    for (const g of groups.slice(0, 50)) {
      i += 1;
      lines.push(`| ${i} | \`${escapeMd(g.module)}\` | ${g.findings.length} | ${g.bySeverity['HIGH'] || g.bySeverity['ERROR'] || 0} | ${g.bySeverity['MEDIUM'] || g.bySeverity['WARNING'] || 0} | ${g.bySeverity['LOW'] || g.bySeverity['INFO'] || 0} | ${g.bySeverity['INFO'] || g.bySeverity['UNKNOWN'] || 0} |`);
    }
    if (groups.length > 50) lines.push(`\n_Showing top 50 of ${groups.length} modules. See STATIC_ANALYSIS_REPORT.md for the full list._`);
    lines.push('');
    lines.push('> For per-finding detail, open the **Static Analysis Issues** opened by Orchestra in the VCS, or read `STATIC_ANALYSIS_REPORT.md`. Components with correlated findings have `orchestra:sast:hits` + `orchestra:sast:maxSeverity` set in `sbom.cyclonedx.json` for downstream consumers.');
    lines.push('');
  }

  if (doc.licensePolicy) {
    lines.push('## ⚖️ License Policy');
    lines.push('');
    const lp = doc.licensePolicy;
    const src = lp.policy.loadedFrom;
    lines.push(`Policy loaded from: ${src ? `\`${src.replace(/\\/g, '/')}\`` : '_(defaults, no policy file found)_'}`);
    lines.push(`Components scanned: **${lp.componentsScanned}** (with license: **${lp.licensedComponents}**, no declared license: **${lp.unlicensedComponents}**)`);
    lines.push(`Summary: ✅ allowed=${lp.summary.allowed} · ❌ denied=${lp.summary.denied} · ⚠️ copyleft=${lp.summary.copyleftWarnings} · ❓ unknown=${lp.summary.unknownWarnings} · 🏢 proprietary=${lp.summary.proprietaryWarnings} · ⏭️ skipped(no license)=${lp.summary.skipped}`);
    if (lp.policy.allow.length > 0) lines.push(`\`allow-list:\` ${lp.policy.allow.map(x => `\`${x}\``).join(', ')}`);
    if (lp.policy.deny.length > 0) lines.push(`\`deny-list:\` ${lp.policy.deny.map(x => `\`${x}\``).join(', ')}`);
    const flags: string[] = [];
    if (lp.policy.copyleftWarn) flags.push('copyleftWarn');
    if (lp.policy.copyleftAllow) flags.push('copyleftAllow');
    if (lp.policy.unknownDeny) flags.push('unknownDeny');
    if (lp.policy.unknownWarn) flags.push('unknownWarn');
    if (lp.policy.proprietaryDeny) flags.push('proprietaryDeny');
    if (lp.policy.proprietaryWarn) flags.push('proprietaryWarn');
    if (lp.policy.requireLicenseForAll) flags.push('requireLicenseForAll');
    if (flags.length) lines.push(`Flags: ${flags.map(f => `\`${f}\``).join(', ')}`);
    lines.push('');

    if (lp.denied.length > 0) {
      lines.push('### ❌ Denied / blocking components');
      lines.push('');
      lines.push('| # | Ecosystem | Name | Version | Scope | Detected license | Verdict | Reason | Remediation |');
      lines.push('|---:|---|---|---|---|---|---|---|---|');
      for (let i = 0; i < lp.denied.length; i++) {
        const v = lp.denied[i];
        lines.push(`| ${i + 1} | \`${v.component.ecosystem}\` | \`${escapeMd(v.component.name)}\` | ${v.component.version ? `\`${v.component.version}\`` : '—'} | ${v.component.scope} | ${v.match?.normalized || v.component.license || '_(unset)_'} | ❌ \`${v.verdict}\` | ${escapeMd(v.reason)} | ${v.remediation ? escapeMd(v.remediation) : '—'} |`);
      }
      lines.push('');
    }
    if (lp.warnings.length > 0) {
      lines.push('### ⚠️ License warnings');
      lines.push('');
      lines.push('| # | Ecosystem | Name | Version | Scope | Detected license | Verdict | Reason |');
      lines.push('|---:|---|---|---|---|---|---|---|');
      for (let i = 0; i < Math.min(100, lp.warnings.length); i++) {
        const v = lp.warnings[i];
        lines.push(`| ${i + 1} | \`${v.component.ecosystem}\` | \`${escapeMd(v.component.name)}\` | ${v.component.version ? `\`${v.component.version}\`` : '—'} | ${v.component.scope} | ${v.match?.normalized || v.component.license || '_(unset)_'} | ⚠️ \`${v.verdict}\` | ${escapeMd(v.reason)} |`);
      }
      if (lp.warnings.length > 100) lines.push(`\n_Showing top 100 of ${lp.warnings.length} warnings._`);
      lines.push('');
    }

    // License count breakdown (raw manifest expressions, then normalized policy verdicts)
    const rawCounts = new Map<string, number>();
    for (const comp of doc.components) {
      const key = comp.license && String(comp.license).trim() ? comp.license : '(unset)';
      rawCounts.set(key, (rawCounts.get(key) || 0) + 1);
    }
    const total = lp.componentsScanned || 1;
    const raws = Array.from(rawCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (raws.length > 0) {
      lines.push('### License counts (as declared in manifests)');
      lines.push('');
      lines.push(`Unique license expressions: **${raws.length}** across **${lp.componentsScanned}** components.`);
      lines.push('');
      lines.push('| # | License expression | Components | % of tree | Sample components |');
      lines.push('|---:|---|---:|---:|---|');
      // Build sample-per-key for readability
      const samplesPerKey = new Map<string, string[]>();
      for (const comp of doc.components) {
        const key = comp.license && String(comp.license).trim() ? comp.license : '(unset)';
        const arr = samplesPerKey.get(key) || [];
        if (arr.length < 4) { arr.push(comp.name); samplesPerKey.set(key, arr); }
      }
      for (let i = 0; i < Math.min(40, raws.length); i++) {
        const [k, n] = raws[i];
        const pct = ((n / total) * 100);
        const pctStr = pct >= 10 ? `${Math.round(pct)}%` : pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
        const samples = (samplesPerKey.get(k) || []).map(s => `\`${s.replace(/\|/g, '\\|')}\``).join(', ');
        lines.push(`| ${i + 1} | ${escSingle(k)} | ${n} | ${pctStr} | ${samples || '—'} |`);
      }
      if (raws.length > 40) lines.push(`\n_Showing top 40 of ${raws.length} unique expressions._`);
      lines.push('');
    }

    // License distribution across entire repo (normalized SPDX-id + verdict buckets)
    const counts = new Map<string, { allowed: number; denied: number; warn: number; total: number }>();
    const tick = (v: LicensePolicyViolation) => {
      const key = v.match?.normalized || v.component.license || '(unset)';
      const s = counts.get(key) || { allowed: 0, denied: 0, warn: 0, total: 0 };
      s.total += 1;
      if (v.verdict === 'ALLOWED' || v.verdict === 'SKIP_UNLICENSED') s.allowed += 1;
      else if (v.verdict === 'DENIED') s.denied += 1;
      else s.warn += 1;
      counts.set(key, s);
    };
    for (const v of lp.allowed) tick(v);
    for (const v of lp.denied) tick(v);
    for (const v of lp.warnings) tick(v);
    const dist = Array.from(counts.entries()).sort((a, b) => b[1].total - a[1].total);
    if (dist.length > 0) {
      lines.push('### License distribution (normalized + policy buckets)');
      lines.push('');
      lines.push('| License | Components | Allowed | Denied | Warnings |');
      lines.push('|---|---:|---:|---:|---:|');
      for (const [lic, s] of dist) lines.push(`| ${escSingle(lic)} | ${s.total} | ${s.allowed} | ${s.denied} | ${s.warn} |`);
      lines.push('');
    }
    lines.push('> Per-component verdicts are persisted on each CycloneDX component as `orchestra:license:*` properties, and on each SPDX package as an OTHER externalRef. The SBOM plugin will flip `hasIssues = true` whenever DENIED components exist so VCS `issue`/`comment`/`issues-per-component` modes open tracking issues automatically.');
    lines.push('');
  }

  if (testArtifact && (testArtifact.testsDiscovered > 0 || testArtifact.findings.length > 0)) {
    lines.push('## 🧪 Orchestra test-gen results');
    lines.push('');
    lines.push(`- Framework: \`${testArtifact.framework}\` (confidence ${Math.round(testArtifact.frameworkConfidence * 100)}%)`);
    lines.push(`- Generated: **${testArtifact.testsGenerated}** new test cases; Discovered: **${testArtifact.testsDiscovered}**; Passed: ✅ ${testArtifact.testsPassed}; Failed: ❌ ${testArtifact.testsFailed}; Errored/Timeout: 💥 ${testArtifact.testsErrored}; Skipped: ⏭️ ${testArtifact.testsSkipped}; Other: ⚪ ${testArtifact.unknown}.`);
    lines.push(`- Elapsed: ${(testArtifact.totalDurationMs / 1000).toFixed(2)}s`);
    if (testArtifact.invocations && testArtifact.invocations.length > 0) {
      lines.push('- Invocations:');
      for (const inv of testArtifact.invocations.slice(0, 3)) lines.push(`  - \`${inv.command} ${inv.args.join(' ')}\` exit=${inv.exitCode} ${inv.durationMs}ms`);
    }
    if (testArtifact.findings.filter(f => f.outcome === 'failed' || f.outcome === 'error' || f.outcome === 'timeout').length > 0) {
      lines.push('');
      lines.push('### Failing test cases (first 20)');
      lines.push('');
      lines.push('| # | Framework | Test file | Suite / Test | Outcome | Duration |');
      lines.push('|---:|---|---|---|---|---:|');
      const fails = testArtifact.findings.filter(f => f.outcome === 'failed' || f.outcome === 'error' || f.outcome === 'timeout').slice(0, 20);
      for (let i = 0; i < fails.length; i++) {
        const f = fails[i];
        const q = f.suite ? `**${f.suite}** › ${f.testName}` : f.testName;
        lines.push(`| ${i + 1} | \`${f.framework}\` | \`${escapeMd(f.testFilePath)}\` | ${escapeMd(q)} | ${f.outcome === 'failed' ? '❌' : '💥'} ${f.outcome} | ${f.durationMs ?? '—'} |`);
      }
      lines.push('');
    }
    lines.push('> See TEST_REPORT.md for the complete output, including per-test VCS issues if you ran `issue` / `issues-per-test` modes.');
    lines.push('');
  }

  lines.push('## SBOM artifacts produced');
  lines.push('');
  lines.push('- `sbom.spdx.json` — SPDX 2.3 JSON (compatible with SBOM generators, GitHub dependency submission, etc.)');
  lines.push('- `sbom.cyclonedx.json` — CycloneDX 1.5 JSON (OWASP standard, compatible with Dependency-Track / Trivy / grype)');
  lines.push('- `sbom.md` — this human-readable report');

  return lines.join('\n');
};

const deduplicateComponents = (arr: SbomComponent[]): SbomComponent[] => {
  const seen = new Map<string, SbomComponent>();
  for (const c of arr) {
    const k = `${c.name}|${c.version ?? ''}|${c.scope}`;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, c); continue; }
    if (!prev.license && c.license) prev.license = c.license;
    if (!prev.version && c.version) prev.version = c.version;
    if (!prev.direct && c.direct) prev.direct = true;
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name) || (a.version || '').localeCompare(b.version || ''));
};

const ecosystemPrettyName = (eco: string): string => {
  const map: Record<string, string> = {
    npm: 'Node.js / npm',
    pnpm: 'Node.js / pnpm',
    yarn: 'Node.js / Yarn',
    pip: 'Python / pip',
    poetry: 'Python / Poetry',
    pipenv: 'Python / Pipenv',
    conda: 'Python / Conda',
    go: 'Go Modules',
    cargo: 'Rust / Cargo',
    gem: 'Ruby / RubyGems',
    composer: 'PHP / Composer',
    maven: 'Java / Maven',
    gradle: 'Java / Gradle',
    nuget: '.NET / NuGet',
    unknown: 'Unknown'
  };
  return map[eco] || eco;
};

const escapeMd = (s: string | null | undefined): string => {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|');
};

const escSingle = (s: string | null | undefined): string => {
  const v = escapeMd(s);
  if (!v) return '_(unset)_';
  if (/^[A-Za-z0-9._+()/#<>{}[\]-]+$/.test(v)) return `\`${v}\``;
  return v;
};

export const fingerprintComponentsForIssue = (c: SbomComponent): string =>
  sha1Hex(`${c.ecosystem}|${c.name}|${c.version || ''}|${c.scope}|${c.sourceFileRel}`).slice(0, 16);
