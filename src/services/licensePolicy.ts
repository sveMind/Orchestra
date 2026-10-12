import fs from 'fs';
import path from 'path';
import type { SbomComponent } from '../plugins/sbom/types';

export type LicenseVerdict =
  | 'ALLOWED'
  | 'DENIED'
  | 'WARN_COPYLEFT'
  | 'WARN_UNKNOWN'
  | 'WARN_LICENSE_EXPRESSION_NOT_PARSED'
  | 'SKIP_UNLICENSED'
  | 'SKIP_NO_POLICY';

export type LicenseMatch = {
  normalized: string;
  spdxId: string | null;
  isCopyleft: boolean;
  isPermissive: boolean;
  isWeakCopyleft: boolean;
  isNetworkProtective: boolean;
  isPublicDomain: boolean;
  isProprietary: boolean;
};

export type LicensePolicy = {
  loadedFrom: string | null;
  allow: string[];
  deny: string[];
  copyleftWarn: boolean;
  copyleftAllow: boolean;
  unknownDeny: boolean;
  unknownWarn: boolean;
  proprietaryWarn: boolean;
  proprietaryDeny: boolean;
  requireLicenseForAll: boolean;
  overrides: Record<string, LicenseVerdict | 'ALLOWED' | 'DENIED' | 'WARN_COPYLEFT' | 'WARN_UNKNOWN'>;
  reportLabels: { allow?: string[]; deny?: string[]; warning?: string[] };
};

export type LicensePolicyViolation = {
  component: SbomComponent;
  match: LicenseMatch | null;
  verdict: LicenseVerdict;
  reason: string;
  remediation?: string;
};

export type LicensePolicyReport = {
  policy: LicensePolicy;
  componentsScanned: number;
  licensedComponents: number;
  unlicensedComponents: number;
  denied: LicensePolicyViolation[];
  warnings: LicensePolicyViolation[];
  allowed: LicensePolicyViolation[];
  summary: {
    allowed: number;
    denied: number;
    copyleftWarnings: number;
    unknownWarnings: number;
    proprietaryWarnings: number;
    skipped: number;
  };
};

// ----- SPDX identifier knowledge base (OSI/FSF/industry common; unknowns fall through as-is) -----
const PERMISSIVE = new Set<string>([
  // Core academic / industry workhorse permissive
  'MIT',
  'MIT-0',
  'X11',
  'MIT-CMU',
  'MIT-advertising',
  'MIT-enna',
  'MIT-feh',
  'MIT-Modern-Variant',
  'MIT-open-group',
  'MITNFA',
  '0BSD',
  'BSD-1-Clause',
  'BSD-2-Clause',
  'BSD-2-Clause-Darwin',
  'BSD-2-Clause-FreeBSD',
  'BSD-2-Clause-NetBSD',
  'BSD-2-Clause-Patent',
  'BSD-2-Clause-Views',
  'BSD-3-Clause',
  'BSD-3-Clause-Attribution',
  'BSD-3-Clause-Clear',
  'BSD-3-Clause-LBNL',
  'BSD-3-Clause-Modification',
  'BSD-3-Clause-No-Military-License',
  'BSD-3-Clause-No-Nuclear-License',
  'BSD-3-Clause-No-Nuclear-License-2014',
  'BSD-3-Clause-No-Nuclear-Warranty',
  'BSD-3-Clause-Open-MPI',
  'BSD-4-Clause',
  'BSD-4-Clause-Shortened',
  'BSD-4-Clause-UC',
  'BSD-Protection',
  'BSD-Source-Code',
  'ISC',
  'Apache-1.0',
  'Apache-1.1',
  'Apache-2.0',
  'Apache-2.0-LLVM-exception',
  'BSL-1.0',
  'Zlib',
  'ZPL-2.0',
  'ZPL-2.1',
  'Python-2.0',
  'Python-2.1.1',
  'PSF-2.0',
  'WTFPL',
  'OpenSSL',
  'SSLeay',
  'Artistic-1.0',
  'Artistic-1.0-Perl',
  'Artistic-1.0-cl8',
  'Artistic-2.0',
  // Public domain / effectively public domain
  'Unlicense',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-2.5',
  'CC-BY-2.0',
  'CC-BY-SA-4.0',
  'CC-BY-SA-3.0',
  // Blue Oak / industry modern
  'BlueOak-1.0.0',
  // Mozilla permissive subset
  'ICU',
  'Unicode-DFS-2015',
  'Unicode-DFS-2016',
  'Unicode-TOU',
  'UPL-1.0',
  'NCSA',
  'HPND',
  'HPND-sell-variant',
  'HPND-Markus-Kuhn',
  'NTP',
  'NTP-0',
  'OFL-1.1',
  'OFL-1.1-no-RFN',
  'OFL-1.1-RFN',
  'Libpng',
  'libpng-2.0',
  'IJG',
  'JasPer-2.0',
  'Info-ZIP',
  'ImageMagick',
  'curl',
  'MITRE',
  'Sendmail',
  'SGI-B-2.0',
  'SGI-B-1.1',
  'SGI-B-1.0',
  'RSA-MD',
  'ANTLR-PD-fallback',
  'ANTLR-PD',
  'AFL-3.0',
  'AFL-2.1',
  'AFL-2.0',
  'AFL-1.2',
  'AFL-1.1',
  'AFL-1.0',
  'Bahyph',
  'Barr',
  'Beerware',
  'BitTorrent-1.1',
  'BitTorrent-1.0',
  'Borceux',
  'CERN-OHL-W-2.0',
  'ClArtistic',
  'CNRI-Python',
  'CNRI-Jython',
  'CPAL-1.0',
  'CPL-1.0',
  'DOC',
  'DSDP',
  'Dotseqn',
  'ECL-2.0',
  'ECL-1.0',
  'Entessa',
  'EUDatagrid',
  'EUPL-1.2',
  'EUPL-1.1',
  'EUPL-1.0',
  'Fair',
  'Frameworx-1.0',
  'GSOAP-1.3B',
  'HaskellReport',
  'Historical-Permissive',
  'IPL-1.0',
  'LPPL-1.3c',
  'LPPL-1.2',
  'LPPL-1.0',
  'LAL-1.2',
  'LAL-1.3',
  'LiLiQ-P-1.1',
  'LiLiQ-Rplus-1.1',
  'LiLiQ-R-1.1',
  'MS-PL',
  'MS-RL',
  'MirOS',
  'Motosoto',
  'Multics',
  'Mup',
  'NASA-1.3',
  'Naumen',
  'NCSA',
  'NGPL',
  'Nokia',
  'NPOSL-3.0',
  'NRL',
  'OCLC-2.0',
  'ODbL-1.0',
  'OGTSL',
  'OLDAP-2.8',
  'OML',
  'OpenSSL-standalone',
  'OSL-3.0',
  'OSET-PL-2.1',
  'Plexus',
  'PostgreSQL',
  'Python-2.1',
  'QPL-1.0',
  'RPL-1.5',
  'RPSL-1.0',
  'SISSL',
  'SISSL-1.2',
  'Sleepycat',
  'SugarCRM-1.1.3',
  'TCL',
  'TPDL',
  'TMate',
  'TORQUE-1.1',
  'TOSL',
  'VSL-1.0',
  'W3C',
  'W3C-19980720',
  'Watcom-1.0',
  'Wsuipa',
  'Xnet',
  'YPL-1.1',
  'Zend-2.0',
  'Zimbra-1.3',
  'Zimbra-1.4',
  'blessing',
  'bzip2-1.0.6',
  'bzip2-1.0.5',
  'checkmk',
  'copyleft-next-0.3.0',
  'copyleft-next-0.3.1',
  'curl-standalone',
  'diffmark',
  'dvipdfm',
  'eCos-2.0',
  'eGenix',
  'etalab-2.0',
  'eurosym',
  'fwlw',
  'gSOAP-1.3b',
  'gnuplot',
  'iMatix',
  'libpng',
  'libtiff',
  'mpich2',
  'psfrag',
  'psutils',
  'snprintf',
  'wxWindows',
  'xinetd',
  'xpp',
  'zlib-acknowledgement',
  // npm-specific variants used in the wild
  'SEE LICENSE IN LICENSE',
  'SEE LICENSE IN LICENSE.md',
  'UNLICENSED',
  'Custom'
]);

const WEAK_COPYLEFT = new Set<string>([
  'LGPL-2.0-only', 'LGPL-2.1-only', 'LGPL-3.0-only',
  'LGPL-2.0-or-later', 'LGPL-2.1-or-later', 'LGPL-3.0-or-later',
  'LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0',
  'LGPL-2.0+', 'LGPL-2.1+', 'LGPL-3.0+',
  'MPL-1.0', 'MPL-1.1', 'MPL-2.0',
  'MPL-2.0-no-copyleft-exception',
  'CDDL-1.0', 'CDDL-1.1',
  'EPL-1.0', 'EPL-2.0',
  'CPL-1.0',
  'FDL-1.1-no-invariants-or-later',
  'GFDL-1.1-no-invariants-only',
  'GFDL-1.2-no-invariants-only',
  'GFDL-1.2-no-invariants-or-later',
  'GFDL-1.3-no-invariants-only',
  'GFDL-1.3-no-invariants-or-later',
  'LPL-1.02',
  'LPL-1.0',
  'FreeImage',
  'freeimage',
  'FTL',
  'TCL-standalone'
]);

const STRONG_COPYLEFT = new Set<string>([
  'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-2.0',
  'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-3.0',
  'GPL-2.0+', 'GPL-3.0+',
  'AGPL-3.0-only', 'AGPL-3.0-or-later', 'AGPL-3.0',
  'AGPL-1.0-only', 'AGPL-1.0-or-later',
  'OSL-1.0', 'OSL-2.0', 'OSL-2.1', 'OSL-3.0',
  'OSL-1.1',
  'QPL-1.0-INRIA-2004',
  'CC-BY-ND-4.0',
  'CC-BY-ND-3.0',
  'CC-BY-ND-2.5',
  'CC-BY-ND-2.0',
  'GPL-1.0-only', 'GPL-1.0-or-later',
  'GPL-1.0+',
  'CC-BY-NC-ND-4.0',
  'CC-BY-NC-ND-3.0',
  'CC-BY-NC-ND-2.5',
  'CC-BY-NC-ND-2.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-SA-3.0',
  'CC-BY-NC-SA-2.5',
  'CC-BY-NC-SA-2.0'
]);

const NETWORK_PROTECTIVE = new Set<string>([
  'AGPL-1.0-only', 'AGPL-1.0-or-later',
  'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'AGPL-3.0'
]);

const PUBLIC_DOMAIN = new Set<string>([
  'Unlicense', 'CC0-1.0', '0BSD', 'MIT-0', 'WTFPL',
  'ANTLR-PD', 'ANTLR-PD-fallback',
  'CC-PDDC',
  'PDDL-1.0',
  'SAX-PD',
  'FSFUL',
  'FSFULLR'
]);

const PROPRIETARY_HINTS = new Set<string>([
  'PROPRIETARY', 'PROPRIETARY-LICENSE', 'UNLICENSED', 'CONFIDENTIAL', 'CLOSED-SOURCE',
  'COMMERCIAL', 'RESTRICTED', 'SEE-LICENSE', 'SEE-LICENSE-FILE', 'ALL-RIGHTS-RESERVED'
]);

const DEPRECATED_ALIASES: Record<string, string> = {
  'GPL-2.0': 'GPL-2.0-only',
  'GPL-2.0+': 'GPL-2.0-or-later',
  'GPL-3.0': 'GPL-3.0-only',
  'GPL-3.0+': 'GPL-3.0-or-later',
  'LGPL-2.0': 'LGPL-2.0-only',
  'LGPL-2.0+': 'LGPL-2.0-or-later',
  'LGPL-2.1': 'LGPL-2.1-only',
  'LGPL-2.1+': 'LGPL-2.1-or-later',
  'LGPL-3.0': 'LGPL-3.0-only',
  'LGPL-3.0+': 'LGPL-3.0-or-later',
  'AGPL-3.0': 'AGPL-3.0-only',
  'AGPL-3.0+': 'AGPL-3.0-or-later',
  'APACHE-2': 'Apache-2.0',
  'APACHE': 'Apache-2.0',
  'BSD': 'BSD-3-Clause',
  'BSD-3': 'BSD-3-Clause',
  'BSD-2': 'BSD-2-Clause'
};

const normalizeToken = (t: string): string => {
  let s = t.trim();
  s = s.replace(/\s+License$/i, '').replace(/\s+licence$/i, '').trim();
  s = s.replace(/^["'(]+|["')]+$/g, '').trim();
  return s;
};

export const normalizeLicenseExpression = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];
  // Split SPDX expression operators (no full parser)
  const parts = text
    .replace(/\s+(?:OR|AND|WITH)\s+/gi, '|')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .split(/\|/g)
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length === 0 && text.length > 0) parts.push(text);
  // Second pass: split on common " / " separators, comma, semicolons
  const final: string[] = [];
  for (const part of parts) {
    const bits = part.split(/\s*[,;/]\s*/g).map(s => s.trim()).filter(Boolean);
    for (const b of bits) {
      const n = normalizeToken(b);
      if (n) final.push(n);
    }
  }
  return Array.from(new Set(final));
};

export const matchLicense = (raw: string | null | undefined): LicenseMatch | null => {
  const parts = normalizeLicenseExpression(raw);
  if (parts.length === 0) return null;
  // Short-circuit OR semantics: if any token in an OR expression matches a known SPDX ID, return the best one (first SPDX-id hit > first permissive hit > first hit).
  let best: LicenseMatch | null = null;
  let score = -1;
  for (const part of parts) {
    const headUp = part.toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
    const alias: string = DEPRECATED_ALIASES[headUp] ? DEPRECATED_ALIASES[headUp] : part;
    const aliasUp = alias.toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
    const find = (set: Set<string>): boolean => {
      for (const v of set.values()) {
        const vu = String(v).toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
        if (vu === aliasUp) return true;
      }
      return false;
    };
    const publicDomain = find(PUBLIC_DOMAIN);
    const permissive = publicDomain || find(PERMISSIVE);
    const weakCopyleft = find(WEAK_COPYLEFT);
    const copyleft = weakCopyleft || find(STRONG_COPYLEFT);
    const networkProtective = find(NETWORK_PROTECTIVE);
    const proprietary = PROPRIETARY_HINTS.has(headUp);
    const spdxHit = (permissive || copyleft || weakCopyleft || publicDomain || networkProtective);
    const spdxId = spdxHit ? alias : null;
    const normalized = spdxId || alias || part;
    let s = 0;
    if (spdxId) s |= 0x10;
    if (permissive) s |= 0x08;
    if (publicDomain) s |= 0x04;
    if (weakCopyleft) s |= 0x02;
    if (copyleft) s |= 0x01;
    if (s <= score && best) continue;
    score = s;
    best = {
      normalized,
      spdxId,
      isCopyleft: copyleft,
      isPermissive: permissive,
      isWeakCopyleft: weakCopyleft,
      isNetworkProtective: networkProtective,
      isPublicDomain: publicDomain,
      isProprietary: proprietary
    };
  }
  // Fallback: no part matched any SPDX set; return first part as-is with no flags
  if (!best) {
    return {
      normalized: parts[0],
      spdxId: null,
      isCopyleft: false,
      isPermissive: false,
      isWeakCopyleft: false,
      isNetworkProtective: false,
      isPublicDomain: false,
      isProprietary: PROPRIETARY_HINTS.has(parts[0].toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-'))
    };
  }
  return best;
};

const DEFAULT_POLICY: LicensePolicy = {
  loadedFrom: null,
  allow: [],
  deny: [],
  copyleftWarn: true,
  copyleftAllow: false,
  unknownDeny: false,
  unknownWarn: true,
  proprietaryWarn: true,
  proprietaryDeny: false,
  requireLicenseForAll: false,
  overrides: {},
  reportLabels: {}
};

export const loadLicensePolicy = (repoRoot: string, policyFileOverride?: string | null): LicensePolicy => {
  const candidates: string[] = [];
  if (policyFileOverride) {
    const p = path.isAbsolute(policyFileOverride) ? policyFileOverride : path.join(repoRoot, policyFileOverride);
    candidates.push(p);
  }
  candidates.push(
    path.join(repoRoot, '.licenserc.json'),
    path.join(repoRoot, '.licenserc'),
    path.join(repoRoot, 'license-policy.json'),
    path.join(repoRoot, '.github', 'license-policy.json'),
    path.join(repoRoot, 'package.json')
  );
  let lastError: unknown = null;
  for (const c of candidates) {
    try {
      if (!fs.existsSync(c)) continue;
      const raw = fs.readFileSync(c, 'utf8');
      let obj: any;
      if (path.basename(c) === 'package.json') {
        const pkg = JSON.parse(raw);
        if (!pkg.licensePolicy) continue; // no policy declared
        obj = pkg.licensePolicy;
      } else {
        obj = JSON.parse(raw);
      }
      return policyFromObject(obj, c);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    // swallow: fall through to default
  }
  return { ...DEFAULT_POLICY };
};

const policyFromObject = (obj: any, sourcePath: string): LicensePolicy => {
  const base = { ...DEFAULT_POLICY, loadedFrom: sourcePath };
  const pickArr = (k: string): string[] => {
    const v = obj?.[k];
    if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean);
    return [];
  };
  const pickBool = (k: string, fallback: boolean): boolean => {
    const v = obj?.[k];
    return typeof v === 'boolean' ? v : fallback;
  };
  base.allow = pickArr('allow');
  base.deny = pickArr('deny');
  base.copyleftWarn = pickBool('copyleftWarn', base.copyleftWarn);
  base.copyleftAllow = pickBool('copyleftAllow', base.copyleftAllow);
  base.unknownDeny = pickBool('unknownDeny', base.unknownDeny);
  base.unknownWarn = pickBool('unknownWarn', base.unknownWarn);
  base.proprietaryWarn = pickBool('proprietaryWarn', base.proprietaryWarn);
  base.proprietaryDeny = pickBool('proprietaryDeny', base.proprietaryDeny);
  base.requireLicenseForAll = pickBool('requireLicenseForAll', base.requireLicenseForAll);
  if (obj && typeof obj.overrides === 'object' && obj.overrides !== null) {
    const out: LicensePolicy['overrides'] = {};
    for (const [k, v] of Object.entries(obj.overrides)) {
      if (typeof v === 'string') {
        const upper = String(v).toUpperCase();
        if (upper === 'ALLOWED' || upper === 'ALLOW') out[k] = 'ALLOWED';
        else if (upper === 'DENIED' || upper === 'DENY') out[k] = 'DENIED';
        else if (upper.includes('COPYLEFT')) out[k] = 'WARN_COPYLEFT';
        else if (upper.includes('UNKNOWN')) out[k] = 'WARN_UNKNOWN';
      }
    }
    base.overrides = out;
  }
  if (obj && typeof obj.reportLabels === 'object' && obj.reportLabels !== null) base.reportLabels = obj.reportLabels;
  return base;
};

const tokenMatchesList = (match: LicenseMatch, list: string[], rawLicenseExpr?: string | null): boolean => {
  // Include every token from the raw OR expression (e.g. "MIT OR CC0-1.0") so a list with MIT matches the whole expression.
  const expressionTokens = normalizeLicenseExpression(rawLicenseExpr);
  const tokens = new Set<string>();
  for (const tok of expressionTokens) {
    const t = tok.toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
    if (t) tokens.add(t);
  }
  for (const s of [match.normalized, match.spdxId || '']) {
    const t = s.toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
    if (t) tokens.add(t);
  }
  // Also accept glob matches of the raw expression string like "MIT OR CC0*"
  if (rawLicenseExpr) {
    const raw = String(rawLicenseExpr).toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
    if (raw) tokens.add(raw);
  }
  for (const item of list) {
    const up = String(item).toUpperCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
    if (!up) continue;
    if (tokens.has(up)) return true;
    // glob-like: "*GPL*", "MIT OR *"
    const isGlob = up.includes('*');
    if (isGlob) {
      const pattern = new RegExp('^' + up.replace(/\*/g, '.*') + '$');
      for (const t of tokens) if (pattern.test(t)) return true;
      if (rawLicenseExpr) {
        const rawCompact = String(rawLicenseExpr).toUpperCase().replace(/\s+/g, ' ').trim();
        const rawHyphen = rawCompact.replace(/\s+/g, '-').replace(/-+/g, '-');
        if (pattern.test(rawCompact) || pattern.test(rawHyphen)) return true;
      }
    }
  }
  return false;
};

export const evaluateLicensePolicy = (
  policy: LicensePolicy,
  components: SbomComponent[]
): LicensePolicyReport => {
  const denied: LicensePolicyViolation[] = [];
  const warnings: LicensePolicyViolation[] = [];
  const allowed: LicensePolicyViolation[] = [];
  let unlicensed = 0;
  for (const c of components) {
    const license = c.license || null;
    const match = matchLicense(license);
    // override lookup: support both plain "package-name" and "ecosystem:name@version" keys
    const overrideKeys = [
      `${c.ecosystem}:${c.name}`,
      `${c.ecosystem}:${c.name}@${c.version || ''}`,
      c.name
    ];
    let override: LicenseVerdict | 'ALLOWED' | 'DENIED' | 'WARN_COPYLEFT' | 'WARN_UNKNOWN' | null = null;
    for (const k of overrideKeys) {
      if (policy.overrides[k]) { override = policy.overrides[k]; break; }
    }
    if (override) {
      const v = override as LicenseVerdict;
      const reason = `Policy override for key ${overrideKeys.find(k => policy.overrides[k])} = ${v}`;
      if (v === 'DENIED') denied.push({ component: c, match, verdict: v, reason });
      else if (v === 'ALLOWED') allowed.push({ component: c, match, verdict: v, reason });
      else warnings.push({ component: c, match, verdict: v, reason });
      continue;
    }
    if (!license || !match) {
      if (!license) unlicensed += 1;
      if (policy.requireLicenseForAll && !license) {
        denied.push({ component: c, match, verdict: 'DENIED', reason: 'requireLicenseForAll: component has no declared license.', remediation: 'Ask maintainer to add an SPDX license ID, OR add an entry to policy.overrides for this package.' });
        continue;
      }
      if (!match && license && policy.unknownDeny) {
        denied.push({ component: c, match, verdict: 'DENIED', reason: `Unknown license expression: "${license}". Set unknownDeny=false or add a policy allow entry.`, remediation: 'Add the license identifier to policy.allow or set unknownDeny: false in the policy file.' });
        continue;
      }
      if (!match && license && policy.unknownWarn) {
        warnings.push({ component: c, match, verdict: 'WARN_UNKNOWN', reason: `Unknown license expression: "${license}".` });
        continue;
      }
      if (!license) {
        allowed.push({ component: c, match: null, verdict: 'SKIP_UNLICENSED', reason: 'Component has no declared license.' });
        continue;
      }
    }
    // evaluate deny/allow lists
    if (match && policy.deny.length > 0 && tokenMatchesList(match, policy.deny, c.license)) {
      denied.push({ component: c, match, verdict: 'DENIED', reason: `License ${match.normalized} matches deny-list (policy.deny).`, remediation: 'Upgrade the dependency to a version with a different license, or add an override.' });
      continue;
    }
    if (match && policy.allow.length > 0 && !tokenMatchesList(match, policy.allow, c.license)) {
      denied.push({ component: c, match, verdict: 'DENIED', reason: `License ${match.normalized} not listed in allow-list (policy.allow is non-empty).`, remediation: 'Add the license identifier to policy.allow or add a per-package override.' });
      continue;
    }
    if (match && match.isProprietary) {
      if (policy.proprietaryDeny) {
        denied.push({ component: c, match, verdict: 'DENIED', reason: `Detected proprietary license: ${match.normalized}. Set proprietaryDeny=false to allow.` });
        continue;
      }
      if (policy.proprietaryWarn) { warnings.push({ component: c, match, verdict: 'WARN_UNKNOWN', reason: `Proprietary license detected: ${match.normalized}.` }); continue; }
    }
    if (match && match.isCopyleft) {
      if (match.isNetworkProtective || !match.isWeakCopyleft) {
        if (!policy.copyleftAllow && policy.copyleftWarn) {
          warnings.push({ component: c, match, verdict: 'WARN_COPYLEFT', reason: `${match.normalized} is a ${match.isNetworkProtective ? 'network-protective (AGPL-family)' : 'strong copyleft'} license. Set copyleftAllow=true to silence warnings.` });
          continue;
        }
      } else if (match.isWeakCopyleft && policy.copyleftWarn) {
        warnings.push({ component: c, match, verdict: 'WARN_COPYLEFT', reason: `${match.normalized} is a weak copyleft license. Set copyleftWarn=false to silence warnings.` });
        continue;
      }
    }
    allowed.push({ component: c, match, verdict: 'ALLOWED', reason: `License ${match?.normalized || '(unset)'} passes policy.` });
  }
  const licensed = components.length - unlicensed;
  return {
    policy,
    componentsScanned: components.length,
    licensedComponents: licensed,
    unlicensedComponents: unlicensed,
    denied,
    warnings,
    allowed,
    summary: {
      allowed: allowed.length,
      denied: denied.length,
      copyleftWarnings: warnings.filter(w => w.verdict === 'WARN_COPYLEFT').length,
      unknownWarnings: warnings.filter(w => w.verdict === 'WARN_UNKNOWN').length,
      proprietaryWarnings: warnings.filter(w => /proprietary/i.test(w.reason)).length,
      skipped: warnings.filter(w => w.verdict === 'SKIP_UNLICENSED').length + allowed.filter(a => a.verdict === 'SKIP_UNLICENSED').length
    }
  };
};
