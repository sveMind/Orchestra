import crypto from 'crypto';
import { SbomComponent, SbomDocument } from './types';
import type { OpengrepResultFinding } from '../../utils/pluginArtifacts';
import { findingsGroupedByModule, severityScore } from '../../utils/pluginArtifacts';

const sha1Hex = (s: string): string => crypto.createHash('sha1').update(s).digest('hex');
const nowUtc = (iso: string) => iso.replace(/\.\d+Z$/, 'Z');

export const toSpdx = (doc: SbomDocument): unknown => {
  const names = new Map<string, number>();
  const spdxComponents: any[] = doc.components.map((c, idx) => {
    const purl = c.purl;
    const key = c.name;
    const count = names.get(key) || 0;
    names.set(key, count + 1);
    const id = `SPDXRef-${count === 0 ? c.name.replace(/[^A-Za-z0-9.-]+/g, '-') : `${c.name.replace(/[^A-Za-z0-9.-]+/g, '-')}-${count}`}-${idx}`;
    return {
      SPDXID: id.length <= 255 ? id : `SPDXRef-${sha1Hex(purl + idx).slice(0, 24)}`,
      name: c.name,
      versionInfo: c.version || undefined,
      packageFileName: c.sourceFileRel || undefined,
      supplier: c.authors && c.authors.length ? `Organization: ${c.authors.join(', ')}` : undefined,
      downloadLocation: c.homepage || 'NOASSERTION',
      licenseConcluded: c.license || 'NOASSERTION',
      licenseDeclared: c.license || 'NOASSERTION',
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
  const components = doc.components.map((c, idx) => {
    const extraProps: any[] = [];
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
      licenses: c.license ? [{
        license: {
          id: /^[A-Za-z0-9.+-]+$/.test(c.license) ? c.license : undefined,
          name: !/^[A-Za-z0-9.+-]+$/.test(c.license) ? c.license : undefined,
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

export const toMarkdownReport = (doc: SbomDocument, sastFindings?: OpengrepResultFinding[] | null): string => {
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

export const fingerprintComponentsForIssue = (c: SbomComponent): string =>
  sha1Hex(`${c.ecosystem}|${c.name}|${c.version || ''}|${c.scope}|${c.sourceFileRel}`).slice(0, 16);
